import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import {
  dirname, isAbsolute, join, relative,
} from 'node:path'

import yaml from 'js-yaml'

import { auditSilentSkips } from './scripts/audit-silent-skips.mjs'

// VALIDATE_PLUGIN_ROOT lets the fixture harness (scripts/check-validator-plugin-fixtures.mjs) point
// the validator at a throwaway plugin tree without touching module resolution — the script still runs
// from its real on-disk location, so its own imports resolve; only join(ROOT, …) file lookups redirect.
// Unset in every real run — the default is unchanged.
// Destructured rather than accessed as `process.env.VALIDATE_PLUGIN_ROOT`: `ProcessEnv` is a genuine
// index signature (arbitrary env vars), so there is no shape to declare — and destructuring reads the
// same property without the dot-on-index-signature that `noPropertyAccessFromIndexSignature` rejects.
const { VALIDATE_PLUGIN_ROOT } = process.env
const ROOT = (VALIDATE_PLUGIN_ROOT ?? new URL('.', import.meta.url).pathname).replace(/\/$/, '')

/** @type {string[]} */
const errors = []

/** @type {string[]} */
const warnings = []

/**
 * @param {string} file
 * @param {string} message
 */
function error (file, message) {
  errors.push(`${relative(ROOT, file)}: ${message}`)
}

/**
 * @param {string} file
 * @param {string} message
 */
function warn (file, message) {
  warnings.push(`${relative(ROOT, file)}: ${message}`)
}

/**
 * @param {string} filePath
 * @returns {Promise<unknown>}
 */
async function readJson (filePath) {
  const raw = await readFile(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch {
    error(filePath, 'Invalid JSON')
  }
}

// --- Plugin workspaces (plugins/* carrying a .claude-plugin/plugin.json) ---
// gtd-core: the validators discover per-plugin skills/agents/manifests alongside
// the root reads, so a skill moved under plugins/<name>/ stays visible. A workspace
// without a plugin manifest (e.g. _placeholder) is a workspace, not a plugin, and is
// skipped here — it carries no skills/agents to audit.
const PLUGINS_DIR = join(ROOT, 'plugins')

/**
 * Every plugins/* directory, split by whether it carries a manifest. Skill/agent DISCOVERY must not
 * be gated on the manifest: a plugin dir with skills but a MISSING/misnamed `.claude-plugin/plugin.json`
 * would otherwise be invisible to every frontmatter/tool-ref audit and pass green — this repo's
 * signature "green over nothing" bug. So `all` drives discovery, `withManifest` drives manifest-field
 * validation, and a dir that has `skills/` or `agents/` content but NO manifest is a positive error,
 * never a silent skip. A content-less dir without a manifest (e.g. a placeholder) is a workspace, not
 * a plugin — left alone.
 *
 * @returns {Promise<{ all: string[], withManifest: string[] }>}
 */
async function pluginDirs () {
  if (!existsSync(PLUGINS_DIR)) return { all: [], withManifest: [] }
  const entries = await readdir(PLUGINS_DIR, { withFileTypes: true })
  /** @type {string[]} */
  const all = []
  /** @type {string[]} */
  const withManifest = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(PLUGINS_DIR, entry.name)
    all.push(dir)
    if (existsSync(join(dir, '.claude-plugin', 'plugin.json'))) {
      withManifest.push(dir)
    } else if (existsSync(join(dir, 'skills')) || existsSync(join(dir, 'agents'))) {
      error(
        join(dir, '.claude-plugin', 'plugin.json'),
        'plugins/* dir has skills/ or agents/ content but no .claude-plugin/plugin.json manifest — its skills/agents would go silently unvalidated'
      )
    }
  }
  return { all, withManifest }
}

const { all: PLUGIN_ALL_DIRS, withManifest: PLUGIN_DIRS } = await pluginDirs()

/**
 * The keys this validator reads out of a SKILL.md or an agent `.md` frontmatter block. ONE typedef
 * covers both formats because one parser feeds both consumers; a key missing from this list is simply
 * a key no check below reads.
 *
 * Every value is `unknown` deliberately: deciding whether `paths` is really an array or `color`
 * really a string IS the work below, so this names the KEYS the two formats define and asserts
 * nothing whatsoever about their types.
 *
 * @typedef {{
 *   name?: unknown,
 *   description?: unknown,
 *   'user-invocable'?: unknown,
 *   'allowed-tools'?: unknown,
 *   paths?: unknown,
 *   effort?: unknown,
 *   model?: unknown,
 *   color?: unknown,
 *   tools?: unknown,
 *   maxTurns?: unknown,
 *   disallowedTools?: unknown,
 *   skills?: unknown
 * }} Frontmatter
 */

/**
 * @param {string} content
 * @returns {Frontmatter | undefined}
 */
function extractFrontmatter (content) {
  // Destructured so the capture group carries its own `string | undefined` — a no-match yields `[]`
  // and returns exactly where `if (!match) return` used to, with no unreachable branch invented.
  const [, body] = content.match(/^---\n([\s\S]*?)\n---/) ?? []
  if (body === undefined) return
  try {
    const parsed = yaml.load(body)
    return isRecord(parsed) ? parsed : undefined
  } catch {}
}

/**
 * A non-null, non-array object — the shape a `field in x` membership test needs. `x in null` and
 * `x in 42` THROW; guarding with this turns a malformed manifest into a clean `error()` instead of an
 * uncaught crash (the "represent a malformed input, never let it explode" rule).
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord (value) {
  return typeof value === 'object' && value !== null
}

const KNOWN_MCP_PREFIXES = [
  'mcp__basic-memory__',
  'mcp__deepwiki__',
  'mcp__plugin_context7_context7__',
  'mcp__tavily__',
  'mcp__raindrop__',
  'mcp__readwise__',
]

const VALID_AGENT_COLORS = new Set(['blue', 'cyan', 'green', 'yellow', 'magenta', 'red'])

const VALID_AGENT_MODELS = new Set(['inherit', 'sonnet', 'opus', 'haiku'])

const VALID_HOOK_TYPES = new Set(['command', 'prompt', 'agent', 'http'])

const VALID_EFFORT_VALUES = new Set(['low', 'medium', 'high', 'max'])

/**
 * @param {string} file
 * @param {string[]} tools
 */
function validateMcpPrefixes (file, tools) {
  for (const tool of tools) {
    if (tool.startsWith('mcp__') && !KNOWN_MCP_PREFIXES.some((p) => tool.startsWith(p))) {
      error(file, `Unknown MCP prefix in tool: ${tool}`)
    }
  }
}

/**
 * Audit tool references in prose against declared tools list.
 *
 * @param {string} file
 * @param {string} content
 * @param {string[]} declaredTools
 * @param {string} fieldName
 */
function auditToolReferences (file, content, declaredTools, fieldName) {
  // Strip YAML frontmatter to avoid matching the allowlist itself
  const prose = content.replace(/^---\n[\s\S]*?\n---/, '')
  const toolSet = new Set(declaredTools)
  // Match mcp__<server>__<tool> patterns in prose
  const refs = prose.matchAll(/mcp__[\w-]+__[\w-]+/g)
  const seen = new Set()
  for (const match of refs) {
    const tool = match[0]
    if (!seen.has(tool) && !toolSet.has(tool)) {
      seen.add(tool)
      error(file, `Tool "${tool}" referenced in prose but missing from ${fieldName}`)
    }
  }
}

/**
 * Replace each character of `slice` with a space, preserving newlines.
 * Used to mask out regions (frontmatter, code fences, headings, quoted strings)
 * while keeping byte/line offsets stable so match positions still map back to
 * the original file line/column.
 *
 * @param {string} slice
 * @returns {string}
 */
function blankPreservingNewlines (slice) {
  return slice.replaceAll(/[^\n]/g, ' ')
}

/**
 * Audit naked `workflow N` cross-references missing the `(Name)` parenthetical.
 *
 * Convention (CLAUDE.md "Workflow cross-references"): every cross-reference of
 * `workflow N` MUST include the workflow name parenthetically — e.g.,
 * `workflow 3 (Post-wave gate)`. Bare references like `workflow 6` or
 * `workflow 1 step 3` break silently if workflows are renumbered.
 *
 * Stripping (positions preserved by replacing with spaces):
 *   1. YAML frontmatter at file top.
 *   2. Fenced code blocks (triple-backtick).
 *   3. Headings (lines starting with `#`).
 *   4. Single- and double-quoted string literals (the convention discusses
 *      `"workflow 6"` and `'workflow 6'` as meta-examples — and skill
 *      descriptions contain quoted trigger phrases).
 *
 * Match: /workflow\s+\d+/i not followed by `\s*\(`. Whitespace-tolerant on the
 * lookahead so line-wrapped `workflow 3\n   (Name)` is treated as well-formed.
 *
 * @param {string} file
 * @param {string} content
 */
function auditWorkflowReferences (file, content) {
  let masked = content

  // 1. Strip YAML frontmatter (file top only).
  masked = masked.replace(/^---\n[\s\S]*?\n---/, blankPreservingNewlines)

  // 2. Strip fenced code blocks (``` ... ```).
  masked = masked.replaceAll(/```[\s\S]*?```/g, blankPreservingNewlines)

  // 3. Strip headings (lines starting with #).
  masked = masked.replaceAll(/^#.*$/gm, blankPreservingNewlines)

  // 4. Strip single- and double-quoted string literals (no embedded newlines).
  masked = masked.replaceAll(/'[^'\n]*'/g, blankPreservingNewlines)
  masked = masked.replaceAll(/"[^"\n]*"/g, blankPreservingNewlines)

  // 5. Strip backtick inline code (defensive — meta-discussion of the
  // convention may use forms like `workflow 6`; without this strip those
  // would emit false-positive violations).
  masked = masked.replaceAll(/`[^`\n]*`/g, blankPreservingNewlines)

  // Find naked `workflow N` references — case-insensitive (capitalized at
  // sentence start is fine), digits+, not followed by `\s*\(`.
  const pattern = /\bworkflow\s+\d+\b(?!\s*\()/gi

  for (const match of masked.matchAll(pattern)) {
    const offset = /** @type {number} */ (match.index)
    const before = content.slice(0, offset)
    const line = before.split('\n').length
    const lastNewline = before.lastIndexOf('\n')
    const column = offset - (lastNewline + 1) + 1
    // Pull the original line for context.
    const lineStart = lastNewline + 1
    const lineEndRel = content.slice(lineStart).indexOf('\n')
    const lineEnd = lineEndRel === -1 ? content.length : lineStart + lineEndRel
    const contextLine = content.slice(lineStart, lineEnd)
    error(
      file,
      `${line}:${column} — naked workflow reference: "${match[0]}". Convention: workflow N (Name). Context: ${contextLine.trim()}`
    )
  }
}

// --- plugin.json ---

/**
 * A `.claude-plugin/plugin.json` manifest — the root's and every `plugins/*` one share this shape.
 * Values stay `unknown`; the checks below assert only that the KEYS are present.
 *
 * @typedef {{
 *   name?: unknown,
 *   version?: unknown,
 *   description?: unknown
 * }} PluginManifest
 */

/**
 * Name a value's kind for an error message.
 *
 * `typeof null` is `'object'` and `typeof []` is `'object'` — which is precisely the confusion the
 * messages using this exist to clear up, since "must be an object, got object" helps nobody. The
 * one `null` literal in the file lives here rather than at each call site.
 *
 * @param {unknown} value
 * @returns {string}
 */
function kindOf (value) {
  if (value === null) return 'null'
  return Array.isArray(value) ? 'array' : typeof value
}

/**
 * The three fields every plugin manifest must carry, root and `plugins/*` alike.
 *
 * PRESENCE IS NOT THE CHECK. `field in manifest` passed a manifest with `name: ""` and
 * `description: ""` — measured, exit 0, "Plugin validation passed" — and a YAML-null `name:`
 * behaved the same. An empty name is not a manifest that has a name; it is one that will fail at
 * install time instead of here, which is the only place it is cheap to fail.
 *
 * @param {string} manifestPath
 * @param {Record<string, unknown>} manifest
 */
function checkManifestFields (manifestPath, manifest) {
  for (const field of ['name', 'version', 'description']) {
    const value = manifest[field]
    if (value === undefined) {
      error(manifestPath, `Missing required field: ${field}`)
    } else if (typeof value !== 'string' || value.trim() === '') {
      error(manifestPath, `Required field "${field}" must be a non-empty string, got ${kindOf(value)}`)
    }
  }
}

const pluginPath = join(ROOT, '.claude-plugin', 'plugin.json')
const plugin = await readJson(pluginPath)
if (plugin !== undefined) {
  if (!isRecord(plugin)) {
    error(pluginPath, 'plugin.json must be a JSON object')
  } else {
    checkManifestFields(pluginPath, plugin)
  }
}

// --- Per-plugin manifests (plugins/*/.claude-plugin/plugin.json) ---
// Proves the wsk two-manifest pattern: each plugin carries a .claude-plugin/plugin.json
// with the same name/version/description fields the root manifest requires.
for (const dir of PLUGIN_DIRS) {
  const manifestPath = join(dir, '.claude-plugin', 'plugin.json')
  const manifest = await readJson(manifestPath)
  if (manifest !== undefined) {
    if (!isRecord(manifest)) {
      error(manifestPath, 'plugin.json must be a JSON object')
    } else {
      checkManifestFields(manifestPath, manifest)
    }
  }
}

// --- marketplace.json (optional) ---

/**
 * A `marketplace.json` file and one of its `plugins[]` entries. `source` is the entry's origin
 * (`'./'` for the local one); `version` is what the marketplace advertises.
 *
 * @typedef {{ plugins?: unknown }} MarketplaceFile
 * @typedef {{ source?: unknown, version?: unknown }} MarketplaceEntry
 */

const marketplacePath = join(ROOT, '.claude-plugin', 'marketplace.json')
if (existsSync(marketplacePath)) {
  const marketplace = await readJson(marketplacePath)

  // Version consistency: local ./ entry must match plugin.json version
  if (marketplace !== undefined && plugin !== undefined) {
    const m = /** @type {MarketplaceFile} */ (marketplace)
    const pluginVersion = /** @type {PluginManifest} */ (plugin).version
    const entries = Array.isArray(m.plugins) ? m.plugins : []
    for (const entry of entries) {
      // Same crash class as the hooks arrays: a `null` element threw on `.source` and took the
      // whole run with it, losing every finding gathered before it.
      if (!isRecord(entry)) {
        error(marketplacePath, `plugins[] entry must be an object, got ${kindOf(entry)}`)
        continue
      }
      const e = /** @type {MarketplaceEntry} */ (entry)
      if (e.source === './' && e.version !== pluginVersion) {
        error(
          marketplacePath,
            `Local "./" entry version "${String(e.version)}" does not match plugin.json version "${String(pluginVersion)}"`
        )
      }
    }
  }
}

// --- hooks.json (optional) ---

/**
 * `hooks/hooks.json`: a top-level `hooks` map of event name → matcher entries, each carrying a
 * `matcher` and its own list of hook definitions. The event-name map itself stays a `Record` below
 * (Claude Code keeps adding events, so its keys are genuinely open-ended); the entries under it do
 * have a fixed shape, and that is what these name.
 *
 * @typedef {{ hooks?: unknown }} HooksFile
 * @typedef {{ matcher?: unknown, hooks?: unknown }} HookMatcherEntry
 * @typedef {{ type?: unknown, timeout?: unknown, command?: unknown }} HookDefinition
 */

/**
 * Claude Code's hook events. Open-ended by nature — new ones get added — so an unrecognised name
 * is a WARNING, not an error. But a NEAR-MISS of a known name is a typo, and a typo'd event
 * registers cleanly and then never fires: silent, permanent, and invisible to every other gate.
 * Those get an error, which is the whole point of keeping the list.
 */
const KNOWN_HOOK_EVENTS = new Set([
  'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification',
  'Stop', 'SubagentStop', 'PreCompact', 'PostCompact',
  'SessionStart', 'SessionEnd',
])

/** Interpreters whose NEXT argument is the script. Matched on the basename, so `/bin/bash` counts. */
const HOOK_INTERPRETERS = new Set(['bash', 'sh', 'zsh', 'dash', 'node', 'python', 'python3', 'deno', 'bun'])

/**
 * Levenshtein distance, capped in practice by the short strings it compares.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function editDistance (a, b) {
  /** @type {number[]} */
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
    }
    prev = curr
  }
  return prev[b.length] ?? 0
}

/**
 * Strip one layer of matching surrounding quotes.
 *
 * Quoting a path is CORRECT practice when it may contain spaces, so a guard that only recognises
 * bare tokens skips exactly the commands written most carefully.
 *
 * @param {string} token
 * @returns {string}
 */
function stripQuotes (token) {
  const m = /^(["'])(.*)\1$/.exec(token)
  return m?.[2] ?? token
}

/**
 * Validate one `hooks.json`.
 *
 * Extracted from a single hardcoded root path so `plugins/*\/hooks/hooks.json` is reached too —
 * `vp-beads-sss` creates exactly those files, and until this existed they would have landed
 * completely unvalidated while the validator reported success.
 *
 * `baseDir` is what `${CLAUDE_PLUGIN_ROOT}` resolves to for this file — and equally, the directory
 * a relative command path would have had to be relative to.
 *
 * @param {string} hooksPath - The hooks.json to read
 * @param {string} baseDir - The owning plugin's directory
 * @returns {Promise<void>}
 */
async function validateHooksFile (hooksPath, baseDir) {
  const hooksData = await readJson(hooksPath)
  if (hooksData === undefined) return

  const h = /** @type {HooksFile} */ (hooksData)
  if (!isRecord(h.hooks)) {
    error(hooksPath, 'Missing top-level "hooks" object')
    return
  }

  for (const [event, entries] of Object.entries(h.hooks)) {
    if (!KNOWN_HOOK_EVENTS.has(event)) {
      const near = [...KNOWN_HOOK_EVENTS].find((k) =>
        k.toLowerCase() === event.toLowerCase() || editDistance(k, event) <= 2)
      if (near) {
        error(hooksPath, `hooks.${event}: unknown hook event — did you mean "${near}"? A misspelled event registers cleanly and then never fires`)
      } else {
        warn(hooksPath, `hooks.${event}: not a known hook event. If Claude Code added it, extend KNOWN_HOOK_EVENTS; otherwise this hook never fires`)
      }
    }

    if (!Array.isArray(entries)) {
      error(hooksPath, `hooks.${event} must be an array`)
      continue
    }

    for (const entry of entries) {
      // A `null` element used to throw on `.matcher` and take the whole run with it. A crash is
      // not a validation failure: it exits before the summary and LOSES every finding gathered so
      // far, so CI reads "the validator is broken" rather than "your plugin is".
      if (!isRecord(entry)) {
        error(hooksPath, `hooks.${event}: entry must be an object, got ${kindOf(entry)}`)
        continue
      }
      const e = /** @type {HookMatcherEntry} */ (entry)
      if (typeof e.matcher !== 'string') {
        error(hooksPath, `hooks.${event}: entry missing "matcher" (string)`)
      }
      if (!Array.isArray(e.hooks)) {
        error(hooksPath, `hooks.${event}: entry missing "hooks" (array)`)
        continue
      }

      for (const hook of e.hooks) {
        if (!isRecord(hook)) {
          error(hooksPath, `hooks.${event}: hook definition must be an object, got ${kindOf(hook)}`)
          continue
        }
        const hk = /** @type {HookDefinition} */ (hook)
        if (!VALID_HOOK_TYPES.has(String(hk.type))) {
          error(hooksPath, `hooks.${event}: hook type must be one of: ${[...VALID_HOOK_TYPES].join(', ')}, got "${String(hk.type)}"`)
        }
        if (hk.type === 'prompt') {
          warn(hooksPath, `hooks.${event}: prompt hooks spawn a separate Haiku instance with no MCP tool access — use type: "command" emitting {"hookSpecificOutput": {"hookEventName": "${event}", "additionalContext": …}} unless this hook intentionally requires no MCP tools`)
        }
        if (typeof hk.timeout !== 'number') {
          error(hooksPath, `hooks.${event}: hook missing "timeout" (number)`)
        }

        if (hk.type === 'command' && typeof hk.command === 'string') {
          // eslint-disable-next-line no-template-curly-in-string -- literal placeholder token Claude Code substitutes at runtime, not a JS template
          const resolved = hk.command.replaceAll('${CLAUDE_PLUGIN_ROOT}', baseDir)

          // ASK WHICH TOKEN IS THE SCRIPT, don't pattern-match for one. The old
          // `parts.find(p => p.startsWith('/') || p.startsWith('./'))` missed the two forms that
          // need checking most: a QUOTED path (correct practice, and the leading char is then a
          // quote) and a RELATIVE path (broken at runtime regardless of existence, because hooks
          // run with the USER'S project as cwd, not the plugin's).
          const tokens = resolved.split(/\s+/).filter(Boolean).map((t) => stripQuotes(t))
          const interp = tokens.findIndex((t) => HOOK_INTERPRETERS.has(t.split('/').pop() ?? t))
          const script = tokens[interp === -1 ? 0 : interp + 1]

          if (script !== undefined && (script.includes('/') || /\.(?:sh|mjs|cjs|js|ts|py)$/.test(script))) {
            if (isAbsolute(script)) {
              if (!existsSync(script)) {
                error(hooksPath, `hooks.${event}: referenced file does not exist: ${hk.command}`)
              }
            } else {
              const wouldBe = join(baseDir, script)
              error(hooksPath, `hooks.${event}: command path is RELATIVE (${script}) — hooks run with the user's project as cwd, not the plugin's, so this resolves somewhere unpredictable and usually fails. Use \${CLAUDE_PLUGIN_ROOT}/${relative(baseDir, wouldBe)}`)
            }
          }
        }
      }
    }
  }
}

// DISCOVERY, not one hardcoded path. Root plus every plugin workspace; `${CLAUDE_PLUGIN_ROOT}`
// resolves to the owning plugin's directory, which is `dirname(dirname(hooks.json))` in both cases.
const hooksFiles = [
  join(ROOT, 'hooks', 'hooks.json'),
  ...PLUGIN_ALL_DIRS.map((dir) => join(dir, 'hooks', 'hooks.json')),
].filter((p) => existsSync(p))

for (const p of hooksFiles) {
  await validateHooksFile(p, dirname(dirname(p)))
}

// --- .claude/synergy-registry.json (optional) ---

// Advisory (a warn, not an error) — an unknown value passes validation with a nudge, because this
// vocabulary describes real relationships between real repos and will keep growing.
//
// `template-ancestor` was requested by TWO sibling projects independently — liggare-mcp and
// brewfile-curate, each in their own `UPSTREAM-vp-beads.md`. Both had settled on `fork` as the
// closest fit and both said the same thing about it: a fork is a divergent copy tracked for
// cherry-picks, whereas being SCAFFOLDED FROM a template is a one-time ancestry that never
// implies ongoing sync. Calling that `fork` overstates the coupling.
const KNOWN_RELATIONSHIPS = new Set([
  'sibling-plugin',
  'shared-tooling',
  'fork',
  'template-ancestor',
  'consumer',
  'coordinated-release',
  'dependency',
])

/**
 * A `.claude/synergy-registry.json` entry. The committed base registry and the gitignored
 * `.local.json` override share this shape, which is why one typedef serves both blocks below.
 * `bm-entity` is hyphenated in the file format itself, so it is read with a bracket for that
 * reason — not to dodge a type error.
 *
 * @typedef {{
 *   name?: unknown,
 *   file?: unknown,
 *   'bm-entity'?: unknown,
 *   relationship?: unknown
 * }} SynergyRegistryEntry
 */

const synergyRegistryPath = join(ROOT, '.claude', 'synergy-registry.json')
if (existsSync(synergyRegistryPath)) {
  const synergyData = await readJson(synergyRegistryPath)
  if (synergyData !== undefined) {
    if (!Array.isArray(synergyData)) {
      error(synergyRegistryPath, 'Registry must be an array')
    } else {
      for (const [i, entry] of synergyData.entries()) {
        if (typeof entry !== 'object' || entry === null) {
          error(synergyRegistryPath, `Entry [${i}] must be an object`)
          continue
        }
        const e = /** @type {SynergyRegistryEntry} */ (entry)
        if (typeof e.name !== 'string') {
          error(synergyRegistryPath, `Entry [${i}] missing required string field: name`)
        } else if (e.name === '') {
          error(synergyRegistryPath, `Entry [${i}] name must be a non-empty string`)
        }
        if (typeof e.file !== 'string') {
          error(synergyRegistryPath, `Entry [${i}] missing required string field: file`)
        }
        // No-commit-leak guard: a PRIVATE-SYNERGY-* file in the COMMITTED base
        // registry commits a private sibling's name. Private siblings must live
        // ONLY in the gitignored .claude/synergy-registry.local.json.
        if (typeof e.file === 'string' && e.file.startsWith('PRIVATE-SYNERGY-')) {
          error(
            synergyRegistryPath,
            `Entry [${i}] file "${e.file}" is PRIVATE-SYNERGY-prefixed in the committed base registry — this commits a private sibling's name. Register private siblings only in the gitignored .claude/synergy-registry.local.json (see references/synergy-entry-format.md "Private sibling entries").`
          )
        } else if (typeof e.name === 'string' && typeof e.file === 'string') {
          // Apply canonical normalization from
          // plugins/ledger/skills/ledger/references/synergy-entry-format.md
          // "Naming convention": replace '/' with '--', drop leading '@'.
          const normalizedName = e.name.replace(/^@/, '').replaceAll('/', '--')
          const expectedFile = `SYNERGY-${normalizedName}.md`
          if (e.file !== expectedFile) {
            error(
              synergyRegistryPath,
              `Entry [${i}] file "${e.file}" does not match expected "${expectedFile}" (derived from name "${e.name}")`
            )
          }
        }
        if (typeof e['bm-entity'] === 'string' && e['bm-entity'].startsWith('npm/')) {
          warn(
            synergyRegistryPath,
            `Entry [${i}] bm-entity "${e['bm-entity']}" starts with "npm/" — sibling-relationship notes belong under "engineering/agents/vp-plugins-...", not under "npm/"`
          )
        }
        if (typeof e.relationship === 'string' && !KNOWN_RELATIONSHIPS.has(e.relationship)) {
          warn(
            synergyRegistryPath,
            `Entry [${i}] relationship "${e.relationship}" is not in the known set (${[...KNOWN_RELATIONSHIPS].join(', ')})`
          )
        }
      }
    }
  }
}

// --- .claude/synergy-registry.local.json (optional, gitignored) ---
// Validates private-sibling (local-only) entries. This file is gitignored, so
// this block runs only in development checkouts — that is where private-sibling
// misconfiguration must be caught, before a skill misreads an entry.

const synergyLocalRegistryPath = join(ROOT, '.claude', 'synergy-registry.local.json')
if (existsSync(synergyLocalRegistryPath)) {
  const localData = await readJson(synergyLocalRegistryPath)
  const baseData = existsSync(synergyRegistryPath) ? await readJson(synergyRegistryPath) : []
  const baseNames = new Set(
    Array.isArray(baseData)
      ? baseData.map((b) => (typeof b === 'object' && b !== null ? /** @type {SynergyRegistryEntry} */ (b).name : undefined)).filter((n) => typeof n === 'string')
      : []
  )
  if (localData !== undefined) {
    if (!Array.isArray(localData)) {
      error(synergyLocalRegistryPath, 'Registry must be an array')
    } else {
      for (const [i, entry] of localData.entries()) {
        if (typeof entry !== 'object' || entry === null) {
          error(synergyLocalRegistryPath, `Entry [${i}] must be an object`)
          continue
        }
        const e = /** @type {SynergyRegistryEntry} */ (entry)
        if (typeof e.name !== 'string' || e.name === '') {
          error(synergyLocalRegistryPath, `Entry [${i}] missing required non-empty string field: name`)
          continue
        }
        const isBaseEntry = baseNames.has(e.name)
        const isPrivate = typeof e.file === 'string' && e.file.startsWith('PRIVATE-SYNERGY-')
        if (!isBaseEntry && !isPrivate) {
          warn(
            synergyLocalRegistryPath,
            `Entry [${i}] name "${e.name}" is not in the base registry and its file is not PRIVATE-SYNERGY-prefixed — skills will IGNORE it. To register a private sibling, set "file" to "PRIVATE-SYNERGY-<name>.md"; to register a public one, add it to synergy-registry.json.`
          )
        }
        if (isPrivate) {
          // Private-add entry: file must derive as PRIVATE-SYNERGY-<normalized>.md.
          const normalizedName = e.name.replace(/^@/, '').replaceAll('/', '--')
          const expectedFile = `PRIVATE-SYNERGY-${normalizedName}.md`
          if (e.file !== expectedFile) {
            error(synergyLocalRegistryPath, `Entry [${i}] private file "${String(e.file)}" does not match expected "${expectedFile}" (derived from name "${e.name}")`)
          }
          if (typeof e['bm-entity'] === 'string') {
            warn(synergyLocalRegistryPath, `Entry [${i}] is a private sibling but sets "bm-entity" — promotion to Basic Memory is blocked for private siblings (the name would leak); this field is ignored. Remove it.`)
          }
        }
        if (typeof e.relationship === 'string' && !KNOWN_RELATIONSHIPS.has(e.relationship)) {
          warn(synergyLocalRegistryPath, `Entry [${i}] relationship "${e.relationship}" is not in the known set (${[...KNOWN_RELATIONSHIPS].join(', ')})`)
        }
      }
    }
  }
}

// --- .gitignore no-commit-leak guard for PRIVATE-SYNERGY ---
// A literal per-name `PRIVATE-SYNERGY-<name>.md` line in the committed
// .gitignore would itself commit the private name. Only the wildcard form is
// allowed; private files are covered by `PRIVATE-SYNERGY-*.md`.

const gitignorePath = join(ROOT, '.gitignore')
if (existsSync(gitignorePath)) {
  const gitignoreRaw = await readFile(gitignorePath, 'utf8')
  const gitignoreLines = gitignoreRaw.split('\n')
  for (const raw of gitignoreLines) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    if (line.includes('PRIVATE-SYNERGY-') && line !== 'PRIVATE-SYNERGY-*.md' && line !== '/PRIVATE-SYNERGY-*.md') {
      error(
        gitignorePath,
        `.gitignore line "${line}" names a specific PRIVATE-SYNERGY file — this commits a private sibling's name. Use only the wildcard "PRIVATE-SYNERGY-*.md".`
      )
    }
  }
}

// --- .claude/vendor-registry.json (optional) ---

const vendorRegistryPath = join(ROOT, '.claude', 'vendor-registry.json')
if (existsSync(vendorRegistryPath)) {
  const vendorData = await readJson(vendorRegistryPath)
  if (vendorData !== undefined) {
    if (!Array.isArray(vendorData)) {
      error(vendorRegistryPath, 'Registry must be an array')
    } else {
      for (const [i, entry] of vendorData.entries()) {
        if (typeof entry !== 'object' || entry === null) {
          error(vendorRegistryPath, `Entry [${i}] must be an object`)
          continue
        }
        const e = /** @type {Record<string, unknown>} */ (entry)
        for (const field of ['prefix', 'remote', 'branch', 'package']) {
          if (typeof e[field] !== 'string') {
            error(vendorRegistryPath, `Entry [${i}] missing required string field: ${field}`)
          }
        }
        if ('local-path' in e && typeof e['local-path'] !== 'string') {
          error(vendorRegistryPath, `Entry [${i}] optional field "local-path" must be a string`)
        }
      }
    }
  }
}

// --- Skills ---

// gtd-core: discover skills in both root skills/ and plugins/*/skills/ so a skill
// moved under plugins/<name>/ stays visible to the validator.
const rootSkillEntries = existsSync(join(ROOT, 'skills'))
  ? await readdir(join(ROOT, 'skills'), { recursive: true })
  : []
/** @type {string[]} */
const pluginSkillEntries = []
for (const dir of PLUGIN_ALL_DIRS) {
  const pluginSkillsDir = join(dir, 'skills')
  if (existsSync(pluginSkillsDir)) {
    const entries = await readdir(pluginSkillsDir, { recursive: true })
    for (const e of entries) pluginSkillEntries.push(join(dir, 'skills', e))
  }
}
const skillFiles = [
  ...rootSkillEntries.filter((f) => f.endsWith('SKILL.md')).map((f) => join(ROOT, 'skills', f)),
  ...pluginSkillEntries.filter((f) => f.endsWith('SKILL.md')),
]

const SKILL_REQUIRED = ['name', 'description', 'user-invocable', 'allowed-tools']

for (const file of skillFiles) {
  const content = await readFile(file, 'utf8')
  const fm = extractFrontmatter(content)
  if (!fm) {
    error(file, 'Missing or invalid YAML frontmatter')
    continue
  }
  for (const field of SKILL_REQUIRED) {
    if (!(field in fm)) {
      error(file, `Missing required frontmatter field: ${field}`)
    }
  }
  // The DIRECTORY is what Claude Code invokes; the frontmatter `name` is what the skill calls
  // itself. Nothing compared them, so `skills/wrongname/` declaring `name: other` passed — and the
  // two disagreeing is not cosmetic: a cross-skill reference or a `/slash` invocation written
  // against one of them silently addresses nothing.
  const declaredName = fm['name']
  const dirName = dirname(file).split('/').pop()
  if (typeof declaredName === 'string' && dirName !== undefined && declaredName !== dirName) {
    error(file, `frontmatter name "${declaredName}" does not match its directory "${dirName}" — the directory is what gets invoked`)
  }

  if ('allowed-tools' in fm && !Array.isArray(fm['allowed-tools'])) {
    error(file, 'allowed-tools must be an array')
  }
  if (Array.isArray(fm['allowed-tools'])) {
    validateMcpPrefixes(file, /** @type {string[]} */ (fm['allowed-tools']))
    auditToolReferences(file, content, /** @type {string[]} */ (fm['allowed-tools']), 'allowed-tools')
  }
  auditWorkflowReferences(file, content)
  for (const f of auditSilentSkips(content)) {
    warn(file, `${f.line} — un-announced silent skip of a tracker step (CLAUDE.md "### Files-availability convention" requires announce/Tier): ${f.snippet}`)
  }
  if ('user-invocable' in fm && typeof fm['user-invocable'] !== 'boolean') {
    error(file, `user-invocable must be a boolean, got ${typeof fm['user-invocable']}`)
  }
  if ('paths' in fm && !Array.isArray(fm.paths)) {
    error(file, 'paths must be an array of glob strings')
  }
  if ('effort' in fm && !VALID_EFFORT_VALUES.has(String(fm.effort))) {
    warn(file, `effort "${String(fm.effort)}" is not a recognized value (${[...VALID_EFFORT_VALUES].join(', ')})`)
  }
}

// --- Skill reference files (audit-only pass for naked workflow refs) ---
// Reference files in skills/*/references/ are authoritative spec text — bare
// 'workflow N' references there cause the same silent-renumbering risk as in
// SKILL.md. They have no SKILL.md frontmatter, so we only run the workflow-ref
// audit, not the frontmatter / tool-reference checks.

// gtd-core: discover reference files in both root skills/ and plugins/*/skills/.
const rootTreeEntries = existsSync(join(ROOT, 'skills'))
  ? await readdir(join(ROOT, 'skills'), { recursive: true })
  : []
const referenceFiles = [
  ...rootTreeEntries.filter((f) => f.includes('/references/') && f.endsWith('.md')).map((f) => join(ROOT, 'skills', f)),
  ...pluginSkillEntries.filter((f) => f.includes('/references/') && f.endsWith('.md')),
]

for (const file of referenceFiles) {
  const content = await readFile(file, 'utf8')
  auditWorkflowReferences(file, content)
}

// --- Agents (optional) ---

// gtd-core: discover agents in both root agents/ and plugins/*/agents/.
const agentFiles = []
const rootAgentsDir = join(ROOT, 'agents')
if (existsSync(rootAgentsDir)) {
  const rootAgentEntries = await readdir(rootAgentsDir, { recursive: true })
  for (const f of rootAgentEntries) if (f.endsWith('.md')) agentFiles.push(join(rootAgentsDir, f))
}
for (const dir of PLUGIN_ALL_DIRS) {
  const pluginAgentsDir = join(dir, 'agents')
  if (existsSync(pluginAgentsDir)) {
    const entries = await readdir(pluginAgentsDir, { recursive: true })
    for (const f of entries) if (f.endsWith('.md')) agentFiles.push(join(pluginAgentsDir, f))
  }
}

const AGENT_REQUIRED = ['name', 'description', 'model', 'color', 'tools']

for (const file of agentFiles) {
  const content = await readFile(file, 'utf8')
  const fm = extractFrontmatter(content)
  if (!fm) {
    error(file, 'Missing or invalid YAML frontmatter')
    continue
  }
  for (const field of AGENT_REQUIRED) {
    if (!(field in fm)) {
      error(file, `Missing required frontmatter field: ${field}`)
    }
  }
  // The `typeof … !== 'string'` arms are narrowing, not new policy: both sets hold only strings, so a
  // non-string `color`/`model` already missed on `.has()` and already reached this same `error()`.
  // Note they must NOT become `has(String(…))` — that would coerce a one-element list like
  // `color: [blue]` into a passing `"blue"` and silently stop rejecting it.
  if ('color' in fm && (typeof fm.color !== 'string' || !VALID_AGENT_COLORS.has(fm.color))) {
    error(file, `Invalid agent color "${String(fm.color)}", must be one of: ${[...VALID_AGENT_COLORS].join(', ')}`)
  }
  if ('model' in fm && (typeof fm.model !== 'string' || !VALID_AGENT_MODELS.has(fm.model))) {
    error(file, `Invalid agent model "${String(fm.model)}", must be one of: ${[...VALID_AGENT_MODELS].join(', ')}`)
  }
  if ('tools' in fm && !Array.isArray(fm.tools)) {
    error(file, 'tools must be an array')
  }
  if (Array.isArray(fm.tools)) {
    validateMcpPrefixes(file, /** @type {string[]} */ (fm.tools))
    auditToolReferences(file, content, /** @type {string[]} */ (fm.tools), 'tools')
  }
  auditWorkflowReferences(file, content)
  for (const f of auditSilentSkips(content)) {
    warn(file, `${f.line} — un-announced silent skip of a tracker step (CLAUDE.md "### Files-availability convention" requires announce/Tier): ${f.snippet}`)
  }

  if ('effort' in fm && !VALID_EFFORT_VALUES.has(String(fm.effort))) {
    warn(file, `effort "${String(fm.effort)}" is not a recognized value (${[...VALID_EFFORT_VALUES].join(', ')})`)
  }
  if ('maxTurns' in fm && (typeof fm.maxTurns !== 'number' || fm.maxTurns < 1)) {
    error(file, 'maxTurns must be a positive integer')
  }
  if ('disallowedTools' in fm && !Array.isArray(fm.disallowedTools)) {
    error(file, 'disallowedTools must be an array')
  }
  if ('skills' in fm && !Array.isArray(fm.skills)) {
    error(file, 'skills must be an array')
  }
  if ('skills' in fm && Array.isArray(fm.skills)) {
    for (const skillName of /** @type {string[]} */ (fm.skills)) {
      // gtd-core: resolve phantom skill refs against root skills/ AND plugins/*/skills/.
      const rootSkillPath = join(ROOT, 'skills', skillName, 'SKILL.md')
      const inRoot = existsSync(rootSkillPath)
      const inPlugin = PLUGIN_ALL_DIRS.some((dir) => existsSync(join(dir, 'skills', skillName, 'SKILL.md')))
      if (!inRoot && !inPlugin) {
        error(file, `Phantom skill reference: "${skillName}" — no SKILL.md at skills/${skillName}/ or plugins/*/skills/${skillName}/`)
      }
    }
  }

  // (Removed: a `knowledge-gardener.md` read-only invariant. That agent lives in the vp-knowledge
  // repo, never this one — the check could never fire here. Dead code, not coverage; do not re-add.)
}

// --- CLAUDE.md (workflow-reference audit only) ---

const claudeMdPath = join(ROOT, 'CLAUDE.md')
if (existsSync(claudeMdPath)) {
  const claudeContent = await readFile(claudeMdPath, 'utf8')
  auditWorkflowReferences(claudeMdPath, claudeContent)
}

// --- Report ---

if (warnings.length > 0) {
  console.warn('Plugin validation warnings:\n')
  for (const w of warnings) {
    console.warn(`  ~ ${w}`)
  }
  console.warn('')
}

if (errors.length > 0) {
  console.error('Plugin validation failed:\n')
  for (const e of errors) {
    console.error(`  - ${e}`)
  }
  console.error(`\n${errors.length} error(s) found.`)
  process.exit(1)
} else {
  // The bare `Plugin validation passed.` was BYTE-IDENTICAL over a real run and over a
  // directory holding nothing but a manifest — measured. Every check here is `existsSync`-
  // gated or a `for` over a discovered list, so an empty tree satisfies all of them
  // vacuously, and the output gave a reader no way to tell the two apart.
  //
  // Print the NAMES, not a count. A count survives a shrink to zero but not a SWAP: drop
  // one real skill and add one stub and the count is unchanged while the guard has gone
  // quiet. Names make a swap visible on read. This is the same reasoning as
  // `check-prose-commands`'s per-surface floors and `check-tracked-ignored`'s refusal to
  // pass over zero tracked files ("a green here would mean nothing").
  //
  // Deliberately NOT floored on a hardcoded minimum: skills are relocating between
  // `skills/` and `plugins/*/skills/` for the dissolution, so any threshold would false-red
  // mid-move. Report what was inspected; let the reader judge.
  const skillNames = skillFiles.map((f) => relative(ROOT, f).replace(/\/SKILL\.md$/, '')).toSorted()
  const inventory = [
    `${skillNames.length} skill(s)`,
    `${referenceFiles.length} reference file(s)`,
    `${agentFiles.length} agent(s)`,
    `${hooksFiles.length} hooks.json`,
  ].join(', ')
  console.log(`Plugin validation passed — audited ${inventory}.`)
  if (skillNames.length > 0) {
    console.log(`  skills: ${skillNames.join(', ')}`)
  } else {
    console.log('  skills: NONE FOUND — every skill check above was vacuously satisfied.')
  }
}

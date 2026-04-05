import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'

import yaml from 'js-yaml'

const ROOT = new URL('.', import.meta.url).pathname.replace(/\/$/, '')

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
    return undefined
  }
}

/**
 * @param {string} content
 * @returns {Record<string, unknown> | undefined}
 */
function extractFrontmatter (content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return undefined
  try {
    const parsed = yaml.load(match[1])
    return typeof parsed === 'object' && parsed !== null
      ? /** @type {Record<string, unknown>} */ (parsed)
      : undefined
  } catch {
    return undefined
  }
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
  const refs = prose.matchAll(/mcp__[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+/g)
  const seen = new Set()
  for (const match of refs) {
    const tool = match[0]
    if (!seen.has(tool) && !toolSet.has(tool)) {
      seen.add(tool)
      error(file, `Tool "${tool}" referenced in prose but missing from ${fieldName}`)
    }
  }
}

// --- plugin.json ---

const pluginPath = join(ROOT, '.claude-plugin', 'plugin.json')
const plugin = await readJson(pluginPath)
if (plugin !== undefined) {
  const p = /** @type {Record<string, unknown>} */ (plugin)
  for (const field of ['name', 'version', 'description']) {
    if (!(field in p)) {
      error(pluginPath, `Missing required field: ${field}`)
    }
  }
}

// --- marketplace.json (optional) ---

const marketplacePath = join(ROOT, '.claude-plugin', 'marketplace.json')
if (existsSync(marketplacePath)) {
  const marketplace = await readJson(marketplacePath)

  // Version consistency: local ./ entry must match plugin.json version
  if (marketplace !== undefined && plugin !== undefined) {
    const m = /** @type {Record<string, unknown>} */ (marketplace)
    const pluginVersion = /** @type {Record<string, unknown>} */ (plugin).version
    const entries = Array.isArray(m.plugins) ? m.plugins : []
    for (const entry of entries) {
      const e = /** @type {Record<string, unknown>} */ (entry)
      if (e.source === './') {
        if (e.version !== pluginVersion) {
          error(
            marketplacePath,
            `Local "./" entry version "${String(e.version)}" does not match plugin.json version "${String(pluginVersion)}"`,
          )
        }
      }
    }
  }
}

// --- hooks.json (optional) ---

const hooksPath = join(ROOT, 'hooks', 'hooks.json')
if (existsSync(hooksPath)) {
  const hooksData = await readJson(hooksPath)
  if (hooksData !== undefined) {
    const h = /** @type {Record<string, unknown>} */ (hooksData)
    if (!h.hooks || typeof h.hooks !== 'object') {
      error(hooksPath, 'Missing top-level "hooks" object')
    } else {
      const hooks = /** @type {Record<string, unknown>} */ (h.hooks)
      for (const [event, entries] of Object.entries(hooks)) {
        if (!Array.isArray(entries)) {
          error(hooksPath, `hooks.${event} must be an array`)
          continue
        }
        for (const entry of entries) {
          const e = /** @type {Record<string, unknown>} */ (entry)
          if (typeof e.matcher !== 'string') {
            error(hooksPath, `hooks.${event}: entry missing "matcher" (string)`)
          }
          if (!Array.isArray(e.hooks)) {
            error(hooksPath, `hooks.${event}: entry missing "hooks" (array)`)
            continue
          }
          for (const hook of e.hooks) {
            const hk = /** @type {Record<string, unknown>} */ (hook)
            if (!VALID_HOOK_TYPES.has(String(hk.type))) {
              error(hooksPath, `hooks.${event}: hook type must be one of: ${[...VALID_HOOK_TYPES].join(', ')}, got "${String(hk.type)}"`)
            }
            if (hk.type === 'prompt') {
              warn(hooksPath, `hooks.${event}: prompt hooks spawn a separate Haiku instance with no MCP tool access — use type: "command" with additionalContext unless this hook intentionally requires no MCP tools`)
            }
            if (typeof hk.timeout !== 'number') {
              error(hooksPath, `hooks.${event}: hook missing "timeout" (number)`)
            }
            // Validate command hook paths
            if (hk.type === 'command' && typeof hk.command === 'string') {
              const resolved = hk.command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, ROOT)
              // Extract the file path from the command (after "bash " or similar)
              const parts = resolved.split(/\s+/)
              const scriptPath = parts.find((p) => p.startsWith('/') || p.startsWith('./'))
              if (scriptPath && !existsSync(scriptPath)) {
                error(hooksPath, `hooks.${event}: referenced file does not exist: ${hk.command}`)
              }
            }
          }
        }
      }
    }
  }
}

// --- Skills ---

const skillFiles = (await readdir(join(ROOT, 'skills'), { recursive: true }))
  .filter((f) => f.endsWith('SKILL.md'))
  .map((f) => join(ROOT, 'skills', f))

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
  if ('allowed-tools' in fm && !Array.isArray(fm['allowed-tools'])) {
    error(file, 'allowed-tools must be an array')
  }
  if (Array.isArray(fm['allowed-tools'])) {
    validateMcpPrefixes(file, /** @type {string[]} */ (fm['allowed-tools']))
    auditToolReferences(file, content, /** @type {string[]} */ (fm['allowed-tools']), 'allowed-tools')
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

// --- Agents (optional) ---

const agentsDir = join(ROOT, 'agents')
if (existsSync(agentsDir)) {
  const agentFiles = (await readdir(agentsDir, { recursive: true }))
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(agentsDir, f))

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
    if ('color' in fm && !VALID_AGENT_COLORS.has(fm.color)) {
      error(file, `Invalid agent color "${String(fm.color)}", must be one of: ${[...VALID_AGENT_COLORS].join(', ')}`)
    }
    if ('model' in fm && !VALID_AGENT_MODELS.has(fm.model)) {
      error(file, `Invalid agent model "${String(fm.model)}", must be one of: ${[...VALID_AGENT_MODELS].join(', ')}`)
    }
    if ('tools' in fm && !Array.isArray(fm.tools)) {
      error(file, 'tools must be an array')
    }
    if (Array.isArray(fm.tools)) {
      validateMcpPrefixes(file, /** @type {string[]} */ (fm.tools))
      auditToolReferences(file, content, /** @type {string[]} */ (fm.tools), 'tools')
    }

    if ('effort' in fm && !VALID_EFFORT_VALUES.has(String(fm.effort))) {
      warn(file, `effort "${String(fm.effort)}" is not a recognized value (${[...VALID_EFFORT_VALUES].join(', ')})`)
    }
    if ('maxTurns' in fm) {
      if (typeof fm.maxTurns !== 'number' || fm.maxTurns < 1) {
        error(file, 'maxTurns must be a positive integer')
      }
    }
    if ('disallowedTools' in fm && !Array.isArray(fm.disallowedTools)) {
      error(file, 'disallowedTools must be an array')
    }
    if ('skills' in fm && !Array.isArray(fm.skills)) {
      error(file, 'skills must be an array')
    }
    if ('skills' in fm && Array.isArray(fm.skills)) {
      for (const skillName of /** @type {string[]} */ (fm.skills)) {
        const skillPath = join(ROOT, 'skills', skillName, 'SKILL.md')
        if (!existsSync(skillPath)) {
          error(file, `Phantom skill reference: "${skillName}" — no file at skills/${skillName}/SKILL.md`)
        }
      }
    }

    // Gardener read-only invariant
    if (file.endsWith('knowledge-gardener.md') && Array.isArray(fm.tools)) {
      const forbidden = ['write_note', 'edit_note', 'delete_note']
      for (const tool of /** @type {string[]} */ (fm.tools)) {
        if (forbidden.some((f) => tool.includes(f))) {
          error(file, `Read-only agent must not have write tool: ${tool}`)
        }
      }
    }
  }
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
  console.log('Plugin validation passed.')
}

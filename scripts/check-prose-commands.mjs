/**
 * check:prose-commands — verify every command the plugin's PROSE tells agents to run actually exists.
 *
 * This plugin is mostly prose, and its prose is executable instructions. `npm run check` proves the
 * CODE works; nothing proved the prose tells the truth about the code — so Sprint 16 shipped a dead
 * command into every session (`node scripts/ready-walker.mjs`, a file deleted two commits earlier),
 * green the whole way. This closes that gap for the two things prose invokes: the `diarie` CLI and
 * `node <path>` scripts, plus the retired readers whose names still linger.
 *
 * THE ORACLE IS THE REAL BINARY. Subcommands come from `diarie --help`; a subcommand's flags come
 * from `diarie <sub> --help` (peowly GENERATES that help from the same object it parses with, so the
 * two cannot drift). There is deliberately no hardcoded flag table — a second model of the CLI is
 * this repo's signature failure installed inside the check meant to prevent it. `migrate`'s help is
 * hand-written (it is not peowly), so `vp-beads-mig`'s USAGE⇔parser test guards ITS truthfulness;
 * here it is read the same way as any other subcommand.
 *
 * IMPERATIVE vs MENTION — the hard part, and why a naive grep fails. A command is only an invocation
 * when its executable sits in COMMAND POSITION with arguments. Three rules do all the work:
 *   1. Span-atomicity: each inline `code span` and each fenced/heredoc command line is ONE atomic
 *      candidate. `(`ready-walker`, `--format json`)` is TWO spans — the `ready-walker` span is bare,
 *      so it is a noun, not `ready-walker --format`.
 *   2. First-token executable: `git grep ready-walker` has executable `git`; `ready-walker` is grep's
 *      ARGUMENT, never invoked.
 *   3. Exact-token match for retired names: `check-ready-walker` is not `ready-walker`.
 * A bare executable (span of one token) is a noun-mention and is skipped. That is what keeps the
 * ~dozen descriptive `ready-walker` / `validate-tasks` mentions across the docs green.
 *
 * ESCAPE HATCH. A lesson sometimes must quote a literal broken invocation ("we ran `diarie ready
 * --stats` for weeks; neither flag exists"). A line carrying the marker `prose-cmd-ignore` has its
 * candidates skipped — the same pressure valve eslint-disable is, so a real teaching example never
 * forces the check to be weakened. Every use is greppable.
 *
 * SELF-TEST FIRST. A prose-check that silently classifies everything as a mention would scan the
 * corpus, find nothing, and pass — inert, and green. So before it is trusted on the live tree it must
 * reproduce a frozen ground-truth of synthetic reds AND greens (below). If the classifier cannot go
 * red on a planted fossil, the check fails BEFORE it ever looks at the corpus.
 */

import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  existsSync, readdirSync, readFileSync, statSync,
} from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// diarie is an EXTERNAL dependency now (file:../diarie), not an in-repo workspace. Invoke it by its
// declared BIN (node_modules/.bin/diarie) — the package's public interface — not by reaching into its
// internal cli.js path. This is the exact binary a consumer runs, so the oracle stays honest, and it
// survives diarie relocating cli.js internally.
const DIARIE_BIN = join(ROOT, 'node_modules', '.bin', 'diarie')

/** Deleted `.mjs` readers whose names still appear in prose. An imperative use of any is a fossil. */
const RETIRED = new Set(['ready-walker', 'validate-tasks', 'task-schema'])

/**
 * Fenced-block languages whose lines are runnable commands. Data/prose langs are skipped — a `markdown`
 * fence (a shown template) still has its inline code spans read, just not its lines-as-commands.
 */
const COMMAND_LANGS = new Set(['bash', 'sh', 'shell', 'console', 'shellsession'])

/**
 * A line carrying this marker has its candidates skipped (the documented escape hatch). Detection is
 * a bare substring `line.includes(IGNORE_MARKER)` — DELIBERATELY: a line that merely mentions the
 * string exempts itself, which is harmless here (the corpus excludes `scripts/`, and a prose mention
 * of the marker carries no real invocation). Do not "tighten" it into a footgun.
 */
const IGNORE_MARKER = 'prose-cmd-ignore'

// --- The oracle: the real CLI, read once ------------------------------------------------------

/**
 * @param {string[]} args
 * @returns {string} stdout + stderr of `node cli.js <args>`
 */
function help (args) {
  const r = spawnSync(DIARIE_BIN, args, { encoding: 'utf8' })
  return (r.stdout ?? '') + (r.stderr ?? '')
}

/**
 * Build the oracle: subcommand set, and the flag set of each subcommand.
 *
 * @returns {{ subs: Set<string>, flags: Map<string, Set<string>> }}
 */
function buildOracle () {
  const top = help(['--help'])
  // The `Commands` block lists `    <name>   <description>`; stop at the next section header.
  const commandsBlock = /\n {2}Commands\n([\s\S]*?)\n {2}[A-Z]/.exec(top)
  if (!commandsBlock) throw new Error('prose-commands: could not read the Commands block from `diarie --help`')
  const subs = new Set(
    [...commandsBlock[1].matchAll(/^ {4}([a-z][a-z-]*)\b/gm)].map(m => m[1])
  )
  if (subs.size === 0) throw new Error('prose-commands: parsed zero subcommands from `diarie --help`')

  const flags = new Map()
  for (const sub of subs) {
    const h = help([sub, '--help'])
    // Every flag TOKEN the help lists — long (`--json`) and short (`-j`) — from flag-definition lines.
    const set = new Set([...h.matchAll(/^\s+(--[a-z][a-z-]*|-[a-z])\b/gm)].map(m => m[1]))
    // `--help` / `--version` are universal; migrate's hand-written USAGE omits them.
    set.add('--help').add('--version')
    flags.set(sub, set)
  }
  return { subs, flags }
}

// --- The classifier ---------------------------------------------------------------------------

/** @typedef {{ subs: Set<string>, flags: Map<string, Set<string>> }} Oracle */

/**
 * Tokenize a candidate the ONE way the classifier and the coverage counter must agree on.
 *
 * @param {string} raw
 * @returns {string[]}
 */
function tokenize (raw) {
  return raw
    .trim()
    .replace(/^\$\s+/, '') // a shell prompt in a fenced example
    .replace(/\s+#.*$/, '') // a trailing shell comment / doc annotation
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * True when a candidate's executable is one this check actually resolves (diarie / node / a retired
 * reader). Used only to COUNT coverage — if this ever falls near zero, the extractor has gone inert.
 *
 * @param {string} raw
 * @returns {boolean}
 */
function isInvocation (raw) {
  const tokens = tokenize(raw)
  return tokens.length >= 2 && (tokens[0] === 'diarie' || tokens[0] === 'node' || RETIRED.has(tokens[0]))
}

/**
 * Classify one candidate (an inline code span, or one fenced/heredoc command line).
 * Returns a human-readable problem string, or undefined when it is fine (or a mention).
 *
 * @param {string} raw
 * @param {Oracle} oracle
 * @returns {string | undefined}
 */
function classify (raw, oracle) {
  const tokens = tokenize(raw)
  if (tokens.length < 2) return // a bare executable is a noun-mention, not an invocation

  const [exe, ...rest] = tokens

  if (exe === 'diarie') {
    const sub = rest[0]
    if (sub.startsWith('-')) return // `diarie --help` / `--version` — a top-level flag, not a subcommand
    if (/[<>]/.test(sub)) return // `diarie <sub>` — a doc placeholder, not a real subcommand
    if (!oracle.subs.has(sub)) return `unknown diarie subcommand '${sub}'`
    const valid = oracle.flags.get(sub)
    for (const tok of rest.slice(1)) {
      if (!/^--?[a-z]/.test(tok)) continue // a value or positional, not a flag
      const flag = tok.split('=')[0]
      if (valid && !valid.has(flag)) return `'${flag}' is not a flag of 'diarie ${sub}'`
    }
    return
  }

  if (exe === 'node') {
    const target = rest.find(t => !t.startsWith('-'))
    if (!target) return // `node --test` etc — no script path
    if (/[$*{}<>]/.test(target)) return // a variable, glob, or `<placeholder>` — not statically checkable
    const looksLikePath = target.includes('/') || /\.(?:mjs|cjs|js)$/.test(target)
    if (!looksLikePath) return
    return existsSync(resolve(ROOT, target)) ? undefined : `node target does not exist: ${target}`
  }

  if (RETIRED.has(exe)) return `retired command '${exe}' no longer exists — use the diarie CLI`

  // git, npm, bd, gh, … — not ours to check
}

// --- Extraction -------------------------------------------------------------------------------

/**
 * Pull candidate command strings out of one file, each tagged with its 1-based line.
 * Markdown: inline code spans + fenced command-blocks. Shell: inline code spans only (the prose
 * in message strings and heredocs — never bare shell lines, which use `$vars` and are real code).
 *
 * @param {string} text
 * @param {boolean} isMarkdown
 * @returns {Array<{ candidate: string, line: number }>}
 */
function extract (text, isMarkdown) {
  const out = []
  // Shell message strings escape their markdown backticks (`\``) so the shell does not run command
  // substitution. Unescape them so a span reads `diarie validate`, not `diarie validate\`.
  const lines = (isMarkdown ? text : text.replaceAll('\\`', '`')).split('\n')
  let fenceLang // a lang string while inside a ``` fence (markdown only), else undefined

  for (const [i, line] of lines.entries()) {
    const lineNo = i + 1

    if (line.includes(IGNORE_MARKER)) continue

    if (isMarkdown) {
      const fence = /^\s*`{3,}(\w*)/.exec(line)
      if (fence) {
        fenceLang = fenceLang === undefined ? fence[1].toLowerCase() : undefined
        continue // a fence marker is never itself a candidate
      }
    }

    // Inline code spans, on EVERY line — prose, and inside a shown `markdown` template alike. This is
    // what catches a fossil quoted in a RETRO template; a bash line / fence marker has no backticks,
    // so it yields nothing here and is handled below.
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      out.push({ candidate: m[1], line: lineNo })
    }

    // A line inside a command-language fence is itself a runnable command.
    //
    // KNOWN LIMITATION (surfaced by review, deliberately NOT fixed): a command LINE inside a
    // NO-LANGUAGE (bare ```) fence — fenceLang === '' — is not extracted; only inline spans on it
    // are. Bare fences are span-only ON PURPOSE, so shown/aspirational templates, tree listings and
    // flow diagrams stay green. Revival trigger: when the count of bare-fence lines whose FIRST token
    // is `diarie`/`node`/a retired reader exceeds ~2 (it is 1 today — a green `diarie ready → …`
    // diagram line), the convention has shifted and the hole goes live. Fix it THEN with
    // first-token-gated extraction of bare-fence lines, NOT COMMAND_LANGS.add('') — which would turn
    // all ~131 bare fences into candidates and false-positive on template/output content.
    if (fenceLang !== undefined && COMMAND_LANGS.has(fenceLang) && line.trim()) {
      out.push({ candidate: line, line: lineNo })
    }
  }
  return out
}

/**
 * Recursively collect the corpus file paths: the five named surfaces, never `scripts/`.
 *
 * @param {string} dir
 * @param {RegExp} match
 * @returns {string[]}
 */
function walk (dir, match) {
  /** @type {string[]} */
  const found = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) found.push(...walk(full, match))
    else if (match.test(name)) found.push(full)
  }
  return found
}

/**
 * Scan the live corpus. Returns every problem found, plus coverage numbers so an inert extractor is
 * visible rather than silently green.
 *
 * @param {Oracle} oracle
 * @returns {{ findings: Array<{ file: string, line: number, problem: string }>, examined: number, fileCount: number }}
 */
function scanCorpus (oracle) {
  // gtd-core: discover prose surfaces in both root and plugins/* so commands in
  // a skill moved under plugins/<name>/ stay checked. Root reads stay so the
  // still-root skills/agents/hooks keep scanning.
  const files = [
    join(ROOT, 'CLAUDE.md'),
    join(ROOT, 'README.md'),
    ...walk(join(ROOT, 'skills'), /\.md$/),
    ...walk(join(ROOT, 'hooks'), /\.sh$/),
    // agents/ might not exist (retired vp-beads no longer has one)
    ...(existsSync(join(ROOT, 'agents')) ? walk(join(ROOT, 'agents'), /\.md$/) : []),
  ]

  // plugins/* — scan skills/, agents/, hooks/ where they exist
  const pluginsDir = join(ROOT, 'plugins')
  if (existsSync(pluginsDir)) {
    for (const name of readdirSync(pluginsDir)) {
      const pluginDir = join(pluginsDir, name)
      if (!statSync(pluginDir).isDirectory()) continue
      for (const sub of ['skills', 'agents']) {
        const subDir = join(pluginDir, sub)
        files.push(...(existsSync(subDir) ? walk(subDir, /\.md$/) : []))
      }
      const hooksDir = join(pluginDir, 'hooks')
      files.push(...(existsSync(hooksDir) ? walk(hooksDir, /\.sh$/) : []))
    }
  }
  /** @type {Array<{ file: string, line: number, problem: string }>} */
  const findings = []
  let examined = 0
  for (const file of files) {
    const isMarkdown = file.endsWith('.md')
    for (const { candidate, line } of extract(readFileSync(file, 'utf8'), isMarkdown)) {
      if (isInvocation(candidate)) examined++
      const problem = classify(candidate, oracle)
      if (problem) findings.push({ file: file.slice(ROOT.length + 1), line, problem })
    }
  }
  return { findings, examined, fileCount: files.length }
}

// --- Self-test: the frozen ground-truth -------------------------------------------------------

/**
 * Prove the classifier reproduces the known verdicts before it is trusted on the corpus. The reds
 * are the live fossils this check was written to catch (README:69, retrospective:279/281, and the
 * synthetic node-missing case the corpus no longer exercises); the greens are the mentions that must
 * NOT be flagged, each a case a naive extractor gets wrong.
 *
 * @param {Oracle} oracle
 * @returns {number} count of failed expectations
 */
function selfTest (oracle) {
  /** @type {Array<[string, string, boolean]>} name, candidate, expectRed */
  const cases = [
    // RED — real fossils, and the node branch the live corpus cannot exercise
    ['diarie ready --stats is a bad flag', 'diarie ready --stats', true],
    ['diarie ready --stale is a bad flag', 'diarie ready --stale', true],
    ['retired ready-walker with flags', 'ready-walker --stale --days 30', true],
    ['retired ready-walker --blocked', 'ready-walker --blocked', true],
    ['node at a missing path', 'node scripts/does-not-exist.mjs', true],
    ['unknown subcommand', 'diarie doctor', true],
    // GREEN — valid invocations
    ['bare diarie ready', 'diarie ready', false],
    ['valid ready --blocked', 'diarie ready --blocked', false],
    ['valid stats --stale --days', 'diarie stats --stale --days 30', false],
    ['valid ready --filter with value', 'diarie ready --filter pending', false],
    ['valid node target', 'node validate-plugin.mjs', false],
    ['top-level diarie --help', 'diarie --help', false],
    ['diarie <sub> is a doc placeholder', 'diarie <sub> --help', false],
    // GREEN — mentions a naive grep would mis-flag
    ['bare ready-walker is a noun', 'ready-walker', false],
    ['git grep <token> — token is an argument', 'git grep ready-walker', false],
    ['check-ready-walker is an exact-token miss', 'check-ready-walker --json', false],
    ['bare --format json is not an executable', '--format json', false],
    ['node --test has no script path', 'node --test', false],
    ['node at a variable path', 'node "$DIARIE"', false],
  ]

  let failed = 0
  for (const [name, candidate, expectRed] of cases) {
    const isRed = classify(candidate, oracle) !== undefined
    if (isRed !== expectRed) {
      failed++
      console.error(`  ✗ self-test: ${name} — expected ${expectRed ? 'RED' : 'green'}, got ${isRed ? 'RED' : 'green'}`)
    }
  }

  // The ignore marker is exercised at the extraction layer, not the classifier: a marked line yields
  // no candidates even though it contains a fossil.
  const marked = extract('we ran `diarie ready --stats` for weeks. <!-- ' + IGNORE_MARKER + ' -->\n', true)
  if (marked.length !== 0) {
    failed++
    console.error(`  ✗ self-test: ${IGNORE_MARKER} did not suppress a marked line (got ${marked.length} candidate(s))`)
  }

  return failed
}

// --- Main -------------------------------------------------------------------------------------

const oracle = buildOracle()

const selfTestFailures = selfTest(oracle)
if (selfTestFailures > 0) {
  console.error(`\ncheck:prose-commands — the classifier failed ${selfTestFailures} of its own ground-truth checks; not scanning the corpus.`)
  process.exit(1)
}

const { examined, fileCount, findings } = scanCorpus(oracle)
if (findings.length > 0) {
  console.error('check:prose-commands — the docs tell agents to run commands that do not exist:\n')
  for (const { file, line, problem } of findings) {
    console.error(`  ${file}:${line}  ${problem}`)
  }
  console.error(`\n${findings.length} problem(s). Fix the command, or mark a deliberate teaching example with \`${IGNORE_MARKER}\`.`)
  process.exit(1)
}

// Coverage floor — the flr lesson one layer over: do not trust that the scan RAN, assert how much it
// SAW. A future regex or fence-logic edit that makes extract() pull nothing yields zero findings and
// a false green; this makes an inert extractor fail loud instead. ~105 diarie invocations live in the
// corpus today (measured); the floor sits well below that, and a surprising drop is the signal.
const EXAMINED_FLOOR = 80
if (examined < EXAMINED_FLOOR) {
  console.error(`check:prose-commands — only ${examined} invocations examined (floor ${EXAMINED_FLOOR}); the extractor has likely gone inert. A green here would mean nothing.`)
  process.exit(1)
}

console.log(`check:prose-commands: ${examined} invocations across ${fileCount} files, ${oracle.subs.size} subcommands, corpus clean.`)

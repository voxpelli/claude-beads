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
import { tmpdir } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import {
  dirname, join, relative, resolve,
} from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// diarie is an EXTERNAL, published npm dependency now (diarie@^0.2.0), not an in-repo workspace. Invoke it by its
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

// --- Mandatory capture groups -----------------------------------------------------------------

/**
 * Read a capture group the pattern makes MANDATORY, as a `string`.
 *
 * Every call site below captures with a NON-optional group, so a successful match always defines it —
 * but an index read is `string | undefined` to the type checker, and both easy ways to silence that
 * are wrong here. A non-null assertion hides a later edit that makes the group optional; `?? ''` turns
 * a could-not-read into an EMPTY candidate, which this check then classifies as "nothing to see" — the
 * inert green it exists to prevent. So the impossible case throws and names itself, per CLAUDE.md
 * `### Reader conventions — a guard that DROPS must also REPORT`.
 *
 * @param {RegExpExecArray} m
 * @param {number} n
 * @returns {string}
 */
function capture (m, n) {
  const value = m[n]
  if (value === undefined) {
    throw new Error(`prose-commands: capture group ${n} of the match '${m[0]}' is undefined — that group is not optional, so a pattern edit has broken an invariant`)
  }
  return value
}

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
    [...capture(commandsBlock, 1).matchAll(/^ {4}([a-z][a-z-]*)\b/gm)].map(m => capture(m, 1))
  )
  if (subs.size === 0) throw new Error('prose-commands: parsed zero subcommands from `diarie --help`')

  /** @type {Map<string, Set<string>>} */
  const flags = new Map()
  for (const sub of subs) {
    const h = help([sub, '--help'])
    // Every flag TOKEN the help lists — long (`--json`) and short (`-j`) — from flag-definition lines.
    const set = new Set([...h.matchAll(/^\s+(--[a-z][a-z-]*|-[a-z])\b/gm)].map(m => capture(m, 1)))
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
  // Same two-token gate as classify, written as a destructure: `tokenize` drops empty tokens, so an
  // undefined `exe` IS the zero-token case and a non-empty `rest` IS `tokens.length >= 2`.
  const [exe, ...rest] = tokenize(raw)
  if (exe === undefined || rest.length === 0) return false
  return exe === 'diarie' || exe === 'node' || RETIRED.has(exe)
}

/**
 * Normalize the two ways prose reaches the diarie binary INDIRECTLY, so the classifier checks them like
 * a literal `diarie …`: migrate-tracker's `$DIARIE` alias (`DIARIE="npx -y diarie"`), and an explicit
 * `npx [-y|--no-install] diarie …`. In both, the tokens AFTER the wrapper ARE the diarie subcommand +
 * flags, so the whole job is to strip the wrapper down to `diarie`. Deliberately NARROW: the one alias
 * name this repo uses (`DIARIE`) is hardcoded, NOT parsed from assignment lines — a second, stateful
 * model of the prose is exactly the complexity this check exists to avoid. A candidate that is neither
 * form is returned unchanged (so `node "$DIARIE"` and the `DIARIE=…` definition line stay mentions).
 *
 * @param {string} raw
 * @returns {string}
 */
function unwrapDiarie (raw) {
  const t = tokenize(raw)
  const exe = t[0]
  if (exe === undefined) return raw // the old `t.length === 0` — `tokenize` drops empties, so the two agree
  if (/^\$\{?DIARIE\}?$/.test(exe)) return ['diarie', ...t.slice(1)].join(' ')
  if (exe === 'npx') {
    let i = 1
    while (t[i]?.startsWith('-')) i++ // skip npx's own flags: -y, --no-install, …
    if (t[i] === 'diarie') return ['diarie', ...t.slice(i + 1)].join(' ')
  }
  return raw
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
  // A bare executable is a noun-mention, not an invocation. `tokenize` drops empty tokens, so these two
  // tests are exactly the old `tokens.length < 2` — and they are what lets tsc read `exe` as a string.
  const [exe, ...rest] = tokenize(raw)
  if (exe === undefined || rest.length === 0) return

  if (exe === 'diarie') {
    const [sub, ...args] = rest
    // `rest` is non-empty here, so the undefined arm is a bare `diarie` that cannot reach this line; it
    // shares the exit with `diarie --help` because both mean "no subcommand to resolve".
    if (sub === undefined || sub.startsWith('-')) return // `diarie --help` / `--version` — a top-level flag, not a subcommand
    if (/[<>]/.test(sub)) return // `diarie <sub>` — a doc placeholder, not a real subcommand
    if (!oracle.subs.has(sub)) return `unknown diarie subcommand '${sub}'`
    const valid = oracle.flags.get(sub)
    for (const tok of args) {
      if (!/^--?[a-z]/.test(tok)) continue // a value or positional, not a flag
      // Everything before the first `=`. `split('=')[0]` is always defined but reads as
      // maybe-undefined to tsc, hence the replace. The `s` flag is load-bearing: without it `.`
      // stops at a newline, so `a=b\nc` would yield `a\nc` instead of `a`. That cannot happen
      // today only because `tokenize` splits on `/\s+/` — an invariant three functions away, which
      // is too far to rely on for a silent divergence. With `s` this matches `split('=')[0]`
      // unconditionally.
      const flag = tok.replace(/=.*/s, '')
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
        fenceLang = fenceLang === undefined ? capture(fence, 1).toLowerCase() : undefined
        continue // a fence marker is never itself a candidate
      }
    }

    // Inline code spans, on EVERY line — prose, and inside a shown `markdown` template alike. This is
    // what catches a fossil quoted in a RETRO template; a bash line / fence marker has no backticks,
    // so it yields nothing here and is handled below.
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      out.push({ candidate: capture(m, 1), line: lineNo })
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
 * The prose surfaces, tracked SEPARATELY. A surface is the two root docs (each a literal path) or one
 * glob. Per-surface counts are the `flr` lesson one notch finer than the global floor: a single
 * surface's glob silently matching nothing (a regressed pattern) shows as a per-surface zero instead of
 * hiding inside a healthy total. Every entry — INCLUDING the three empty-today surfaces (`agents`, and
 * the two plugins-nested `agents` / `hooks` globs) — is proven to EXTRACT by the fixture self-test, so
 * their empty LIVE result is real emptiness, not a broken glob.
 *
 * @type {ReadonlyArray<{ label: string, files?: string[], glob?: string }>}
 */
const SURFACES = [
  { label: 'CLAUDE.md', files: ['CLAUDE.md'] },
  { label: 'README.md', files: ['README.md'] },
  { label: 'skills/**', glob: 'skills/**/*.md' },
  { label: 'hooks/**', glob: 'hooks/**/*.sh' },
  { label: 'agents/**', glob: 'agents/**/*.md' },
  { label: 'plugins/*/skills/**', glob: 'plugins/*/skills/**/*.md' },
  { label: 'plugins/*/agents/**', glob: 'plugins/*/agents/**/*.md' },
  { label: 'plugins/*/hooks/**', glob: 'plugins/*/hooks/**/*.sh' },
]

/**
 * Scan a corpus. Returns every problem found, plus coverage numbers (total AND per-surface) so an
 * inert extractor is visible rather than silently green. `root` defaults to the real repo; the fixture
 * self-test points it at a throwaway tree to prove file-path handling and every surface glob without
 * ever touching the live corpus. globSync returns paths relative to `cwd`; every entry is normalized to
 * ABSOLUTE (`join(root, p)`) so the one place a relative path is produced is `relative(root, file)` at
 * DISPLAY time — the mixed-convention slice that mangled nested findings is gone.
 *
 * @param {Oracle} oracle
 * @param {string} [root]
 * @returns {{ findings: Array<{ file: string, line: number, problem: string }>, examined: number, fileCount: number, bySurface: Map<string, number> }}
 */
function scanCorpus (oracle, root = ROOT) {
  /** @type {Array<{ file: string, line: number, problem: string }>} */
  const findings = []
  /** @type {Map<string, number>} */
  const bySurface = new Map()
  let examined = 0
  let fileCount = 0

  for (const surface of SURFACES) {
    const rel = surface.files ?? globSync(surface.glob ?? '', { cwd: root })
    let surfaceExamined = 0
    for (const p of rel) {
      const file = join(root, p)
      if (!existsSync(file)) continue // a root doc may be absent (e.g. in a fixture tree)
      fileCount++
      const text = readFileSync(file, 'utf8')
      const isMarkdown = file.endsWith('.md')
      for (const { candidate, line } of extract(text, isMarkdown)) {
        // migrate-tracker reaches diarie via `$DIARIE` / `npx … diarie`; unwrap to `diarie …` so its
        // primary command surface is checked, not skipped as an unknown executable.
        const resolved = unwrapDiarie(candidate)
        if (isInvocation(resolved)) { examined++; surfaceExamined++ }
        const problem = classify(resolved, oracle)
        if (problem) findings.push({ file: relative(root, file), line, problem })
      }
    }
    bySurface.set(surface.label, surfaceExamined)
  }
  return { bySurface, examined, fileCount, findings }
}

/**
 * Prove scanCorpus's path handling against a THROWAWAY fixture — never the live corpus. What the live
 * corpus cannot prove: a NESTED finding's reported `file` is its TRUE path relative to root, not a
 * slice-mangled fragment (`plugins/x/skills/y/SKILL.md` → `-y/SKILL.md`, or `''` for short paths, was
 * the bug). Runs the SAME production scanCorpus, pointed at the fixture.
 *
 * @param {Oracle} oracle
 * @returns {number}
 */
function selfTestScanCorpus (oracle) {
  let failed = 0
  const dir = mkdtempSync(join(tmpdir(), 'prose-commands-fixture-'))
  try {
    writeFileSync(join(dir, 'CLAUDE.md'), '')
    writeFileSync(join(dir, 'README.md'), '')

    // (1) PATH-HANDLING proof: a NESTED finding must report its TRUE path relative to root, not a
    // slice-mangled fragment (`plugins/x/skills/y/SKILL.md` → `-y/SKILL.md`, or `''`, was the bug).
    const nested = join('skills', 'nested', 'SKILL.md')
    mkdirSync(dirname(join(dir, nested)), { recursive: true })
    writeFileSync(join(dir, nested), 'Run `ready-walker --stale` — a retired reader.\n')

    // (2) PER-SURFACE GLOB proof: plant one invocation-bearing file at EVERY glob surface — including
    // the three empty in the real repo today — so a regressed glob (one that matches nothing) is caught
    // HERE, before the live corpus, rather than hiding as a plausible live zero. One inline span each
    // (`.sh` and `.md` both read inline spans), a retired reader so it also counts as an invocation.
    const surfaceFiles = {
      'skills/**': join('skills', 's', 'SKILL.md'),
      'hooks/**': join('hooks', 'h.sh'),
      'agents/**': join('agents', 'a.md'),
      'plugins/*/skills/**': join('plugins', 'p', 'skills', 's', 'SKILL.md'),
      'plugins/*/agents/**': join('plugins', 'p', 'agents', 'a.md'),
      'plugins/*/hooks/**': join('plugins', 'p', 'hooks', 'h.sh'),
    }
    for (const p of Object.values(surfaceFiles)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true })
      writeFileSync(join(dir, p), 'x `ready-walker --stale` y\n')
    }

    const { bySurface, findings } = scanCorpus(oracle, dir)
    if (!findings.some((x) => x.file === nested)) {
      failed++
      console.error(`  ✗ self-test: scanCorpus fixture — no finding reported the nested path '${nested}' (path handling regressed)`)
    }
    for (const [label, p] of Object.entries(surfaceFiles)) {
      if ((bySurface.get(label) ?? 0) < 1) {
        failed++
        console.error(`  ✗ self-test: surface '${label}' extracted 0 from a planted invocation (${p}); its glob is broken`)
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return failed
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
    // RED/GREEN — `$DIARIE` alias + `npx … diarie` unwrapping (migrate-tracker's primary surface).
    // These prove unwrapDiarie hands the classifier a real `diarie …` so a bad flag/sub is still caught.
    ['$DIARIE unknown subcommand', '$DIARIE doctor', true],
    ['$DIARIE bad flag', '$DIARIE ready --stats', true],
    ['${DIARIE} braces bad flag', '${DIARIE} ready --stale', true], // eslint-disable-line no-template-curly-in-string -- literal `${DIARIE}` prose, not a template
    ['npx -y diarie bad flag', 'npx -y diarie ready --stats', true],
    ['$DIARIE valid migrate --root', '$DIARIE migrate x.jsonl --root /t', false],
    ['$DIARIE valid validate --root <target>', '$DIARIE validate --root <target>', false],
    ['npx diarie valid ready', 'npx diarie ready --blocked', false],
    ['bare $DIARIE is a mention', '$DIARIE', false],
  ]

  let failed = 0
  for (const [name, candidate, expectRed] of cases) {
    const isRed = classify(unwrapDiarie(candidate), oracle) !== undefined
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

const selfTestFailures = selfTest(oracle) + selfTestScanCorpus(oracle)
if (selfTestFailures > 0) {
  console.error(`\ncheck:prose-commands — the classifier failed ${selfTestFailures} of its own ground-truth checks; not scanning the corpus.`)
  process.exit(1)
}

const { bySurface, examined, fileCount, findings } = scanCorpus(oracle)
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
// a false green; this makes an inert extractor fail loud instead. ~95 diarie invocations live in the
// corpus today (measured 95, incl. the `$DIARIE`/`npx … diarie` surface); the floor sits well below.
const EXAMINED_FLOOR = 80
if (examined < EXAMINED_FLOOR) {
  console.error(`check:prose-commands — only ${examined} invocations examined (floor ${EXAMINED_FLOOR}); the extractor has likely gone inert. A green here would mean nothing.`)
  process.exit(1)
}

// Per-surface CONDITIONAL floor — the flr lesson one notch finer. The global floor catches TOTAL
// inertness; this catches ONE surface's glob regressing to zero while a big surface masks it in the
// total. Only the surfaces that carry invocations today are floored (each ≥1); the three empty-today
// surfaces are deliberately absent — their globs are proven to EXTRACT by selfTestScanCorpus, so an
// empty LIVE result is real emptiness, not a broken pattern. When a populated surface legitimately
// empties (e.g. migrate-tracker moves out of `plugins/*/skills`), update this set — the forced edit IS
// the signal that coverage shifted.
// `hooks/**` is deliberately absent: the root plugin's hooks are moving out to the
// plugins that own them, so that surface is expected to empty. `plugins/*/hooks/**`
// is where they land, and it carries real `diarie` invocations — floor it there, or
// the shard could silently un-scan itself the same way.
const POPULATED_SURFACES = ['CLAUDE.md', 'README.md', 'skills/**', 'plugins/*/skills/**', 'plugins/*/hooks/**']
for (const label of POPULATED_SURFACES) {
  if ((bySurface.get(label) ?? 0) < 1) {
    console.error(`check:prose-commands — surface '${label}' examined 0 invocations (expected ≥1); its glob has likely regressed while the total stayed healthy.`)
    process.exit(1)
  }
}

console.log(`check:prose-commands: ${examined} invocations across ${fileCount} files, ${oracle.subs.size} subcommands, corpus clean.`)

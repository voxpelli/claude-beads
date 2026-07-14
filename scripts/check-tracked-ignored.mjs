// No TRACKED file may match .gitignore.
//
// A file that git tracks but .gitignore matches is a file that ships, is reviewed, and is invisible to
// every tool that takes `.gitignore` as its bound. That is most of them: `remark --ignore-path
// .gitignore` (our `check:md`), `ast-grep scan` (the `ignore` crate, same as ripgrep), `eslint`, `rg`.
// The file is in the repo and in the release, and no gate has ever looked at it.
//
// THIS GUARD WAS BORN RED, which is the only reason to trust it. On the day it was written it found:
//
//   skills/swarm-wave/references/agent-concurrency-limits.md
//
// — a TRACKED, SHIPPED plugin document, listed in CLAUDE.md's own layout tree, swallowed by the
// unanchored `AGENT-*.md` on line 4 of `.gitignore` (intended for root-level scratch files like
// `AGENT-03.md`; it matches at ANY depth, and `core.ignorecase=true` on macOS makes it match
// `agent-concurrency-limits.md` too). `check:md` runs remark with `--frail`, so warnings are errors —
// and that file has warnings. **`check:md` had been green over a file that would fail it, for as long
// as the file has existed.** A gate, running, reporting success, inspecting nothing.
//
// WHY `--no-index` IS THE WHOLE TRICK. `git check-ignore` **does not report tracked paths** by default
// — it consults the index and stays silent, which is precisely the case we are hunting. Only
// `--no-index` asks the question we mean: *does .gitignore match this path, never mind that git already
// tracks it.* Measured both ways; the default reports nothing.
//
// 🚨 READ THIS BEFORE TRUSTING IT — IT IS A NO-OP IN CI. `vp-beads-tig`.
//
// This guard asks GIT whether a path is ignored. The tool it protects (remark) asks the `ignore`
// npm package. They disagree, and the disagreement runs the wrong way:
//
//   - **Case.** git delegates to `core.ignorecase` — `true` on macOS, **`false` on ubuntu-latest**.
//     remark's matcher is hardcoded case-insensitive on every platform. So the very bug this file was
//     written for — `AGENT-*.md` swallowing `agent-concurrency-limits.md` — is caught on a Mac and
//     **MISSED IN CI**, which is the only place that gates a merge. Measured: `core.ignorecase=false`
//     → this guard exits 0 while remark still refuses to lint the file. **It was born red only because
//     it was born on a Mac.**
//   - **Nested `.gitignore` files.** git reads all of them (deeper wins); `remark --ignore-path
//     .gitignore` reads ONLY the root file. A negation in a subdirectory un-ignores a file for git and
//     not for the linter — guard green, gate blind.
//   - **`.git/info/exclude` and `core.excludesFile`.** git honours both; remark has never heard of
//     them. So this guard can go RED over a machine-local file the repo does not contain, and blame
//     `.gitignore`, which is innocent.
//
// THE FIX is to stop asking git: match the tracked paths against the root `.gitignore` with the same
// `ignore` package remark itself uses. Then the oracle IS the tool being protected — same file, same
// matcher, same case semantics — instead of a third party that disagrees on three axes.
//
// AND IT IS THE WRONG PROPERTY ANYWAY. `check:md` also excludes tracked files with
// `--ignore-pattern .diarie/ --ignore-pattern 'RESEARCH-*.md'` — a CLI flag, not `.gitignore`, so this
// guard is structurally blind to it. Measured: that hides **21 tracked, shipped files carrying 172
// warnings**, which `--frail` makes errors. The claim worth enforcing is not *"no tracked file matches
// .gitignore"* — it is *"no tracked file is invisible to the gates"*, and those are different sets.
//
// It still earns its place: it found a real bug, and it is red-by-construction rather than
// green-by-assumption. But it is a floor, not a fence, and the comment above used to imply otherwise.

import { spawnSync } from 'node:child_process'
import process from 'node:process'

const tracked = spawnSync('git', ['ls-files', '-c', '-z'], { encoding: 'utf8' })
if (tracked.status !== 0) {
  console.error(`check-tracked-ignored: \`git ls-files\` failed: ${tracked.stderr}`)
  process.exit(1)
}

// `check-ignore` exits 1 when NOTHING matches — which is the healthy case here. So a non-zero status is
// not an error, and only a genuine failure (status 128) is.
const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin', '-z'], {
  input: tracked.stdout,
  encoding: 'utf8',
})
if (ignored.status !== 0 && ignored.status !== 1) {
  console.error(`check-tracked-ignored: \`git check-ignore\` failed: ${ignored.stderr}`)
  process.exit(1)
}

const offenders = ignored.stdout.split('\0').filter(Boolean)

if (offenders.length) {
  console.error(
    `check-tracked-ignored: ${offenders.length} TRACKED file(s) are matched by .gitignore:\n\n` +
    offenders.map(f => `  - ${f}`).join('\n') + '\n\n' +
    'Each one ships and is reviewed, yet is INVISIBLE to every tool bounded by .gitignore —\n' +
    '`check:md` (remark --ignore-path .gitignore), `ast-grep scan`, ripgrep. The gate is green\n' +
    'because it never looked.\n\n' +
    'Fix the .gitignore pattern (an unanchored `FOO-*.md` matches at ANY depth, and matching is\n' +
    'case-insensitive on macOS), or stop tracking the file. Do not add an exception here.'
  )
  process.exit(1)
}

console.log(`check-tracked-ignored: ${tracked.stdout.split('\0').filter(Boolean).length} tracked files, none matched by .gitignore`)

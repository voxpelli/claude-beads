// No TRACKED file may match the root .gitignore.
//
// A file that git tracks but .gitignore matches is a file that ships, is reviewed, and is invisible to
// every tool that takes `.gitignore` as its bound: `remark --ignore-path .gitignore` (our `check:md`),
// `ast-grep scan` (the `ignore` crate, same as ripgrep), `eslint`, `rg`. The file is in the repo and in
// the release, and no gate has ever looked at it.
//
// THIS GUARD WAS BORN RED, which is the only reason to trust it. On the day it was written it found:
//
//   skills/swarm-wave/references/agent-concurrency-limits.md
//
// — a TRACKED, SHIPPED plugin document, listed in CLAUDE.md's own layout tree, swallowed by an
// unanchored `AGENT-*.md` on `.gitignore` (intended for root-level scratch like `AGENT-03.md`; unanchored
// it matches at ANY depth, and case-insensitively it matches `agent-concurrency-limits.md` too).
// `check:md` runs remark with `--frail`, so warnings are errors — and that file has warnings. `check:md`
// had been green over a file that would fail it, for as long as the file existed. The `.gitignore`
// patterns are now anchored (`/AGENT-*.md`), so this guard is green; it exists to keep it that way.
//
// THE ORACLE IS THE PROTECTED TOOL (vp-beads-tig). This guard used to ask `git check-ignore`, but git
// answers a different question than the tool it protects, and the disagreement ran the wrong way in the
// one place that gates a merge:
//
//   - Case. git delegates to `core.ignorecase` — `true` on macOS, FALSE on ubuntu-latest. remark's
//     matcher (the `ignore` npm package) is case-insensitive on every platform. So the very bug this
//     file exists for was caught on a Mac and MISSED IN CI. It was born red only because it was born on
//     a Mac.
//   - Nested `.gitignore` files. git reads all of them (deeper wins); `remark --ignore-path .gitignore`
//     reads ONLY the root file. A nested negation un-ignores a file for git and not for the linter.
//   - `.git/info/exclude` and `core.excludesFile`. git honours both; remark has never heard of them —
//     so the git-based guard could go RED over a machine-local file the repo does not contain.
//
// So we now match the tracked paths against the ROOT `.gitignore` with the SAME `ignore` package remark
// uses: same file, same matcher, same (case-insensitive) semantics, on every platform. The oracle is the
// tool being protected instead of a third party that disagrees on three axes.
//
// IT IS A FLOOR, NOT A FENCE. `check:md` ALSO excludes tracked files with `--ignore-pattern .diarie/
// --ignore-pattern 'RESEARCH-*.md'` — a CLI flag, not `.gitignore`, so this guard is structurally blind
// to it (measured: that hides 21 tracked files carrying 172 `--frail` warnings). The claim worth
// enforcing is not "no tracked file matches .gitignore" but "no tracked file is invisible to the gates",
// and those are different sets. This guard enforces the first; the second is imd's territory.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import ignore from 'ignore'

/**
 * @returns {number} process exit code
 */
function main () {
  // Tracked files, NUL-separated. maxBuffer: Infinity — a repo with tens of thousands of tracked files
  // overflows spawnSync's default 1 MiB stdout cap, which surfaces as `status: null` + an EMPTY error
  // string and a mystifying red; the explicit `error` branch below turns any spawn/ENOBUFS failure into a
  // loud, named one instead.
  const tracked = spawnSync('git', ['ls-files', '-c', '-z'], { encoding: 'utf8', maxBuffer: Infinity })
  if (tracked.error) {
    console.error(`check-tracked-ignored: could not run \`git ls-files\`: ${tracked.error.message}`)
    return 1
  }
  if (tracked.status !== 0) {
    console.error(`check-tracked-ignored: \`git ls-files\` exited ${tracked.status}: ${tracked.stderr}`)
    return 1
  }

  const files = tracked.stdout.split('\0').filter(Boolean)

  // Floor — the sibling of check-prose-commands' coverage floor. `git ls-files -c` in a tree with nothing
  // tracked exits 0 with empty stdout, so "0 offenders" would be a GREEN over nothing. Assert the guard
  // actually saw tracked files before trusting a clean result.
  if (files.length === 0) {
    console.error('check-tracked-ignored: 0 tracked files — the guard scanned nothing (git ls-files empty). A green here would mean nothing.')
    return 1
  }

  let gitignore
  try {
    gitignore = readFileSync('.gitignore', 'utf8')
  } catch (err) {
    // `catch` receives whatever was thrown, including primitives — and a property TEST is not a safe
    // narrowing either (`'message' in 5` THROWS a TypeError), so ask `instanceof` first. `String(err)`
    // is what the non-Error path is FOR: the old `err.message` printed a bare `undefined` there, which
    // is a read failure reported as no reason at all.
    console.error(`check-tracked-ignored: could not read the root .gitignore: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }

  const ig = ignore().add(gitignore)
  const offenders = files.filter((f) => ig.ignores(f))

  if (offenders.length) {
    console.error(
      `check-tracked-ignored: ${offenders.length} TRACKED file(s) are matched by the root .gitignore:\n\n` +
      offenders.map((f) => `  - ${f}`).join('\n') + '\n\n' +
      'Each one ships and is reviewed, yet is INVISIBLE to every tool bounded by .gitignore —\n' +
      '`check:md` (remark --ignore-path .gitignore), `ast-grep scan`, ripgrep. The gate is green\n' +
      'because it never looked.\n\n' +
      'Fix the .gitignore pattern (an unanchored `FOO-*.md` matches at ANY depth, and matching is\n' +
      'case-insensitive), or stop tracking the file. Do not add an exception here.'
    )
    return 1
  }

  console.log(`check-tracked-ignored: ${files.length} tracked files, none matched by the root .gitignore`)
  return 0
}

// process.exitCode, NOT process.exit — a piped stderr is truncated at exactly 65536 bytes when the
// process is force-exited mid-write (this repo shipped that bug once, 62807aa). Returning a code and
// letting the event loop drain flushes the full offender list first.
process.exitCode = main()

// The outer bound of the PLUGIN's structural lint — the one list, with one home.
//
// It lives in its own module because two things need it and neither may own it:
//
//   - `check:ast-grep` SCANS these paths.
//   - `fix:ast-grep` REWRITES these paths.
//
// Those two used to be separate `ast-grep scan` invocations with separate hand-copied path lists,
// under a comment in the runner instructing that they be "kept in step". They drifted apart **in the
// very commit that added `hooks/`** — so the fixer silently stopped rewriting the one directory the
// newest rule was aimed at, while every check stayed green. A "keep these in step" comment is a manual
// invariant with no gate behind it. `fix:ast-grep` is now the same script with `--update-all`, and the
// list has one home.
//
// Importing a list from a script that also RUNS a scan would run the scan; hence a module with no side
// effects. That is the whole reason this file exists.
//
// THE PLUGIN'S OWN TREE, AND NOTHING ELSE. `diarie/` is deliberately absent: the workspace carries its
// own `sgconfig.yml` + `.ast-grep/` and runs them itself (`npm run check --workspace=diarie`), so
// scanning it from here would lint it twice under two rule sets that can drift — and would keep the
// extracted package's guards living in a repo it is about to leave.
//
// Note what diarie's config does NOT have: a path list. `ast-grep scan` with no path arguments walks
// the whole project, so over there a rule cannot be scoped outside what is scanned. This runner needs a
// list only because it lints a SUBSET of a larger repo — and that list is exactly what the
// existence-guard in `check-ast-grep.mjs` exists to police.
//
// `hooks/` is here because `no-jq-raw-interpolation` is `language: bash` and exists — in its own words
// — because "the hooks build jq programs". There are ZERO `.sh` files under `scripts/`, so until
// 2026-07-14 the rule had never once been pointed at a bash file. It passed `ast-grep test` 6/6 the
// whole time, on synthetic snippets: green, and guarding nothing. The existence-guard could not see it
// — it checks that a listed path EXISTS, not that a rule's language has anything to READ. That
// distinction is still unguarded (`vp-beads-agr`).

/** @type {readonly string[]} */
export const PATHS = ['scripts/', 'hooks/', 'validate-plugin.mjs']

_Issues and PRs for this package live on **Tangled**, not GitHub:
<https://tangled.org/voxpelli.com/ast-grep-rules/issues>. The GitHub repo is a mirror with issues
disabled, so `gh issue create` against it never reaches the maintainer. Note the manifest points
`bugs` at Tangled and `repository` at GitHub — tooling that picks one arbitrarily will disagree with
tooling that picks the other._

## Feature Requests

* **Ship `rule-tests/` in the tarball so consumers can prove the rules still fire** (2026-07-28,
  `@voxpelli/ast-grep-rules@0.1.0`) — `files` is
  `["rules/**/*.yml", "sgconfig.yml", "workflows/**/*.js"]`; the fixtures and `__snapshots__` exist
  on `main` but are never published. A consumer composing `ruleDirs` therefore gets three rules it
  has **no way to verify**. That matters more than it sounds, because every failure here is silent:
  neuter a consumed rule's pattern and `ast-grep test` exits 0 (an unpaired rule is invisible, not
  failing), `ast-grep scan` exits 0 (all three are `severity: warning`), and a parity check that
  counts rule _files_ never moves. Publishing the fixtures would let a consumer point a second
  `testConfigs` `testDir` at the package and get firing proof with zero duplication. Shares a fix
  with the `sgconfig.yml` bug below.
  Ownership: upstream · Workaround: partial — write local `rule-tests/` naming the same rule ids
  (fixtures bind by rule `id`, not file location, so a consumer-side test does pair with a
  package-supplied rule; verified here 2026-07-28).

## Bugs

* **Nothing constrains the ast-grep CLI version, and ≥0.45 silences every rule** (2026-07-28,
  `@voxpelli/ast-grep-rules@0.1.0`) \[degraded] — the package declares no `peerDependencies` (and no
  `dependencies`) on `@ast-grep/cli`, so npm will happily install a CLI that makes the rules do
  nothing. ast-grep 0.45.0 made `Smart` strictness skip comment/extra nodes, which breaks
  metavariable binding to a comment via `pattern: $C` + `kind: comment` — the mechanism all three
  rules use for `transform`-based message interpolation, and that `no-jsdoc-object-typedef` also
  needs for its `fix:`. Measured upstream against a planted-violation fixture: **3 findings under
  0.44.1, 0 under 0.45.0**. The rules do not degrade to static messages; they go **completely
  silent** — a green scan over an unguarded codebase. The `main`-branch repair (`eab25a6b`) landed
  ~5 hours _after_ 0.1.0 was published, so the fix is not in any release.
  Severity: degraded · Ownership: upstream · Workaround: full — pin the CLI below 0.45. This repo
  declares `@ast-grep/cli@^0.44.1` and has 0.44.1 installed; verified 2026-07-28 that all three
  rules still fire here. But `^0.44.1` resolves 0.45.x, so a fresh install or lockfile refresh
  re-arms this silently. A published `peerDependencies: {"@ast-grep/cli": "<0.45"}` would make it
  loud instead.

* **The shipped `sgconfig.yml` declares `testConfigs` pointing at directories the tarball omits**
  (2026-07-28, `@voxpelli/ast-grep-rules@0.1.0`) \[minor] — the bundled config declares
  `testConfigs: [{testDir: rule-tests, snapshotDir: __snapshots__}]`, but `files` excludes both, so
  the installed package is internally inconsistent: `ast-grep test` against it finds no fixtures and
  **still exits 0**. Either publish the fixtures (see the Feature Request above) or drop
  `testConfigs` from the shipped config — as it stands the config describes a layout that only
  _exists_ in the repo.
  Severity: minor · Ownership: upstream · Workaround: full — consumers write their own
  `sgconfig.yml` and reference only `ruleDirs`, which is the documented usage anyway.

## Upstream Opportunities

_No entries yet._

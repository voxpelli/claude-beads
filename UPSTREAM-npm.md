## Feature Requests

* **`--workspaces --if-present` skips a workspace in COMPLETE silence** (2026-07-29, npm 11.13.0)
  — `npm run <script> --workspaces --if-present` prints nothing at all for a workspace that has no
  such script, and nothing for a directory under the `workspaces` glob that has no `package.json`
  at all. Measured in a three-package fixture (one with `check`, one without, one with no
  manifest): only the first produced output, and the command exited 0. There is no summary line, no
  count of workspaces considered vs run, and no `--verbose` that surfaces the skip. The consumer
  impact is that a monorepo's root aggregate silently stops covering a package the moment its
  script key is renamed, deleted, or its manifest is missing — the gate stays green over strictly
  less than it did, which is indistinguishable from a clean run. `--if-present` is doing exactly
  what its name promises; the gap is that the SKIP is unobservable. A one-line summary
  (`ran N of M workspaces; skipped: a, b`) on stderr, or a `--report-skipped` flag, would make the
  loss detectable by CI.
  Ownership: upstream · Workaround: full — assert independently that every directory matched by the
  `workspaces` glob carries the expected script key, rather than trusting the aggregate's exit code.

## Bugs

_No entries yet._

## Upstream Opportunities

_No entries yet._

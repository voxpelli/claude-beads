## Feature Requests

* **No check for a no-match `grep` aborting a script under `set -e`** (2026-07-29,
  shellcheck 0.11.0) — `grep` exits 1 when it matches nothing, which is a normal result, not an
  error. Under `set -euo pipefail` a bare `count=$(grep -c pattern file)` therefore KILLS the script
  on the empty-result path — the path the author, who wrote the script against data that matched,
  never exercises. Measured: shellcheck 0.11.0 reports nothing on such a script by default, and
  even with every optional check enabled (`-o all`) it emits only an unrelated SC2250 style nit.
  Consumer impact here was concrete: a report-generating script died partway through, and because
  the already-printed prefix looks like a finished report and callers routinely discard the exit
  status, the truncated output read as a complete one. The same shape applies to any command whose
  "found nothing" answer is a non-zero exit. A check flagging an unguarded exit-status-bearing
  `grep`/`diff`/`cmp` substitution under an active `errexit` would catch a whole family of
  empty-input truncations that quoting and unset-variable checks structurally cannot see.
  Ownership: upstream · Workaround: full — `|| true` on the substitution, PLUS an explicit
  "none found" branch so the empty case is REPORTED rather than merely survived (a bare `|| true`
  converts the crash into a silent zero, which is the same defect wearing the fix's clothes).

## Bugs

_No entries yet._

## Upstream Opportunities

_No entries yet._

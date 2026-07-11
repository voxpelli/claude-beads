# UPSTREAM-basic-memory

Tracking friction with [Basic Memory](https://github.com/basicmachines-co/basic-memory) — the
local-first knowledge graph this plugin's skills read and write via `mcp__basic-memory__*`.

## Feature Requests

_No entries yet._

## Bugs

- **`schema_validate` double-counts every observation and invents a phantom `note` category**
  (2026-07-11) \[degraded\] — `schema_validate(identifier=…, output_format="json")` returns each
  observation **exactly twice** in its `field_results[].values` arrays, and reports an
  `unmatched_observations` category (`note`) that does not appear anywhere in the note.

  Reproduced against `main/npm/npm-markdown-or-chalk`, whose on-disk content was read back
  immediately before and is clean (each observation appears once):

  ```
  field "gotcha"     → 10 values, 5 unique   (each listed twice)
  field "api"        → 14 values, 7 unique
  field "limitation" →  4 values, 2 unique
  field "security"   →  2 values, 1 unique
  unmatched_observations: {"design":4,"deps":2,"upstream":4,"lesson":2,"note":2}
                                                                    ^^^^^^^^
                          no `[note]` observation exists in the note at all
  ```

  The true counts are exactly half of every reported number. **Scope: systemic, not
  note-specific** — a graph-wide sweep found the phantom `note` key on **37 of 434**
  `npm_package` notes, including ones never edited by this project (`npm-neostandard`,
  `npm-typescript`, `npm-undici`, `npm-type-fest`). It is not caused by a particular note's
  content or by `edit_note` history.

  **Why it matters beyond cosmetics:** `schema_validate` is the tool the retrospective's graph
  health audit relies on, and `schema_diff`'s evolution thresholds (e.g. "a category used in
  >25% of notes is an evolution candidate") are computed from category frequencies. If those
  frequencies are doubled and salted with a category nobody wrote, **every schema-evolution
  decision is being made on inflated numbers** — including "which fields should we add to the
  schema", which is a write. A counting bug in an advisory tool is a nuisance; a counting bug
  feeding a decision procedure is a defect.

  It also fails quietly: the validation still reports `passed: true`, `0 errors`, `0 warnings`.
  The note IS valid. The tool is simply lying about what is in it, confidently, in the field
  that looks most like ground truth.

  Severity: degraded · Ownership: upstream (basic-memory) · Workaround: partial — never trust
  `schema_validate`'s counts; recount against the note's actual content (`read_note`) before
  acting on any frequency-derived conclusion. The `passed`/`errors`/`warnings` verdict itself
  appears sound.

## Upstream Opportunities

_No entries yet._

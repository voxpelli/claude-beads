## Feature Requests

* **Decision-file frontmatter is validated by nothing — ALREADY TRACKED UPSTREAM as `diarie-dlm`**
  (2026-07-22) — _Recorded here as a cross-reference, deliberately NOT as a new request._
  `diarie validate` globs only `tasks-*.yml` (`lib/store.js`: `TASKS_FILE_RE = /^tasks-.+\.ya?ml$/`
  — decisions and docs are structurally outside it), so a malformed `.diarie/decisions/*.md`
  frontmatter block (`id`/`title`/`status`/`type`/`priority`/`updated`) ships unchecked.
  **Body** prose is covered — by this repo's root `check:md-decisions` stopgap and by diarie's own
  bare `remark .` — so **frontmatter is the load-bearing gap**, not markdown lint.
  Upstream owner: **`diarie-dlm`** ("diarie should lint decision files natively (frontmatter +
  markdown) so the gate travels"), filed 2026-07-18 in `8d9e470` and travelled with the extraction;
  still `pending`. Its ACs already cover this exactly, incl. retiring the `check:md-decisions`
  stopgap (a root bolt-on that does not survive `git subtree split`). It is blocked on `diarie-dsv`
  (settle the decision-status vocabulary before enforcing a status enum) and overlaps `diarie-xid`
  (id uniqueness across tasks + decisions). The `.diarie/docs/` half is **not** in `diarie-dlm`'s
  scope — it is gated on `diarie-typ`'s open prune-vs-build call for the vestigial `doc` type.
  Ownership: upstream ([diarie](https://github.com/voxpelli/diarie)) · Workaround: none needed on
  our side — vp-beads deliberately keeps `.diarie/` out of `check:md` (the store is diarie's
  substrate, not a consumer's to lint; `vp-beads-imd`).
  **Do not re-file — track via `diarie-dlm`.** This entry exists because the gap was independently
  re-discovered on 2026-07-22, four days after `diarie-dlm` was filed for it; a third rediscovery is
  the thing this cross-reference prevents.

* **Task-side validation gaps: unknown keys and label values — ALREADY TRACKED UPSTREAM**
  (2026-07-29) — _Cross-reference, deliberately NOT a new request. Same discipline as the entry
  above._ Measured against `diarie@0.2.2` on a store with four planted defects: an invalid `type`,
  `status` or `priority` is CAUGHT (exit 2, each named with its row), but a **misspelled key**
  (`descrption:`) and an **unrecognised label value** both report `clean: true` at exit 0. The
  loader drops an unknown key and validate never checks, which is silent data loss in a substrate
  whose write side is deliberately Edit/Write — the one place a typo is most likely.
  Upstream owners, both already filed: **"`diarie validate` should catch unknown/mistyped task keys
  (allowlist) — decide error-vs-warning + the --strict question"** (its own ACs note that task
  fields are a CLOSED schema, unlike open-vocabulary label VALUES, which argues for an error), and
  **"labels values are unvalidated — a typo'd `epic` re-arms the vp-beads-epc container bug"**.
  Ownership: upstream ([diarie](https://github.com/voxpelli/diarie)) · Workaround: none on our side
  — a consumer cannot detect a key its reader already dropped.
  **Do not re-file.** Recorded because the consumer-side consequence is ours to hold: a green
  `diarie validate` means the enum fields parse, not that the store is sound, and this repo's own
  CLAUDE.md called it "the integrity gate" until this measurement corrected it.

## Bugs

_No entries yet._

## Upstream Opportunities

_No entries yet._

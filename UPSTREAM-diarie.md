## Feature Requests

- **`diarie validate` should cover `.diarie/decisions/` (and `.diarie/docs/`), not only `tasks-*.yml`**
  (2026-07-22) — `diarie validate` globs only `tasks-*.yml` (the ready-walk's scope), so decision
  records (`.diarie/decisions/*.md`) — which carry schema'd frontmatter (`id`/`title`/`status`/`type`/
  `priority`/`updated`) plus prose — are validated by **nothing**. vp-beads deliberately excludes
  `.diarie/` from its own `check:md` remark gate on substrate-not-opinion grounds (the store is diarie's
  domain, not a consumer's to lint), which leaves decision-doc integrity uncovered on both sides.
  Request: `diarie validate` should also validate decision/doc frontmatter against the schema
  (`VALID_TYPES` / `VALID_STATUSES`, required fields) and — optionally — lint the markdown body, so the
  store owns the integrity of its own contents. Surfaced by `vp-beads-imd` (the check:md exclusion
  ownership call, 2026-07-22).
  Ownership: upstream ([diarie](https://github.com/voxpelli/diarie)) · Workaround: none — decision docs
  are currently un-gated; vp-beads authors them by hand. Related: diarie's own note that decisions are
  excluded from `loadTasks`'s glob (cf. `vp-beads-dlf`). diarie is also a sibling (`SYNERGY-diarie.md`),
  so `/sibling-sync` Mode B can surface this to diarie's side for reciprocation.

## Bugs

_No entries yet._

## Upstream Opportunities

_No entries yet._

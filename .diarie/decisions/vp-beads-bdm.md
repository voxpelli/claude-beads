---
id: vp-beads-bdm
title: Does the published `diarie` carry a bd migrator forever?
status: pending
type: decision
priority: low
parent: vp-beads-dia
updated: '2026-07-11'
---

## Decision

**Not yet made — deliberately.** Recorded so the choice happens on purpose rather than by
forgetting, and so nobody quietly deletes `diarie/lib/migrate/` because it looks like debt.

**Do not resolve this before the siblings have actually migrated.** The whole reason the
migrator is generalized is that vp-knowledge and vp-git still need it; deciding its fate
while they still depend on it would be deciding for them.

## Rationale

`diarie/lib/migrate/` (`bd-map.js` + `bootstrap.js`) reads a `bd export` JSONL snapshot and
writes the flat-YAML store. It is bd-specific, transitional — and it was **89% of the
tracker's type debt** (39 of 44 strict-tsc errors).

The tension is real in both directions:

- **It earns its place today.** It is the only reason `/migrate-tracker` can serve another
  repo, and beads 1.1.0 broke vp-knowledge and vp-git at the same moment it broke this one.
  Its failure mode is **silent data loss**, not a crash, which is why it keeps test coverage
  (31 assertions) rather than being retired after one run.
- **It is a smell in a published package.** A general-purpose tracker carrying a permanent
  import path for one dead competitor is odd. `diarie migrate <bd-export.jsonl>` puts bd's
  vocabulary in diarie's public surface forever.

## Alternatives Considered

- **Keep it.** It *is* the migration story, and a tracker with no way in is a tracker nobody
  adopts. Cost: bd's vocabulary is permanently in diarie's API.
- **Split it into `diarie-migrate-bd`.** Keeps the core clean; costs a second package, a
  second name, and a second release cadence — for a tool with a finite audience (three repos)
  and a finite life (bd's writes are already dead).
- **Retire it after the siblings migrate**, freezing it in `.diarie/_archive/`. Honest about
  its transitional nature. Costs: the next person off beads has nothing, and beads has other
  users than us.

## Affects

- `diarie/lib/migrate/**`, `scripts/check-bootstrap-tasks.mjs` (31 tests)
- `skills/migrate-tracker/SKILL.md` — the skill that exists to run it
- Blocks nothing. Blocked by nothing. **Revive when: the last sibling finishes its migration.**

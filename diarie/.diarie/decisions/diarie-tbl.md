---
id: diarie-tbl
title: Brand markdown tables are linted like every other doc; DESIGN.md's design.md warnings are accepted, not suppressed
status: pending
type: decision
priority: low
updated: '2026-07-18'
---

## Decision

The brand markdown files (`BRAND.md`'s contrast tables and the tables in `brand/DESIGN.md` /
`brand/HANDOFF.md`) are linted by the repository's ordinary remark config — GFM, padded table
cells — like every other tracked markdown file. They are NOT excluded from `check:md`.

`brand/DESIGN.md` additionally carries the google-labs design.md lint
(`npx @google/design.md lint`), whose 11 warnings are **accepted with a stated reason** in the
file's own header (palette members referenced by the page ground, halo, borders, and terminal
states rather than by a schema component), not suppressed and not "fixed" into silence.

## Rationale

- **No unlinted island.** Excluding the brand docs from remark would create files that ship and
  are reviewed yet are invisible to the gate — the exact "green over files nobody chose to
  exclude" hazard `vp-beads-imd` tracks. Linting them keeps them honest.
- **Reformatting was cosmetic.** When the brand files landed, remark reformatted the tables by
  cell-padding only (`diff -bw` clean), so bringing them under the linter cost nothing
  semantic.
- **Accept-with-reason beats suppress.** The 11 design.md warnings carry information; recording
  why they are acceptable in the header is more honest than a blanket ignore that a later reader
  cannot distinguish from an overlooked defect.

## Alternatives Considered

- **Exclude the brand docs from remark** — declined; creates an unlinted island.
- **Suppress the design.md warnings** — declined; they are legitimate palette references, and
  accept-with-reason preserves the signal a suppression would erase.

## Affects

- `diarie/BRAND.md`, `diarie/brand/DESIGN.md`, `diarie/brand/HANDOFF.md`
- the repository's remark config / `check:md` (and `vp-beads-imd`, which tracks a broader
  `check:md` exclusion hole through `--ignore-pattern`)
- at extraction, diarie's own `check:md` — if it adds one — inherits this posture.

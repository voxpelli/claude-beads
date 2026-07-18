# `plugins/_placeholder` — temporary workspace stub

This directory exists **only** to give the `plugins/*` npm-workspace glob at least one
member during the vp-beads → vp-skills monorepo conversion (decision `vp-beads-cst`, Phase 1).

## Why it's here

The vendored `diarie/` workspace was externalized to a `file:../diarie` dependency, which
left the repo with **zero** workspaces. `npm run check --workspaces --if-present` then errors
`No workspaces found!` (harmless — it still exits 0 — but noisy and easy to misread as a real
failure). A single placeholder workspace makes the glob non-empty and keeps the root's
`check-workspaces` delegation live and proven.

## When to delete it

Remove this directory the moment the **first real plugin** lands under `plugins/` (task
`vp-beads-ldg` / `vp-beads-swm` / `vp-beads-dad` in Phase 1.3). It carries no plugin payload
and must never ship.

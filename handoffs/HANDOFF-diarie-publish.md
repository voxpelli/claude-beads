# Handoff — diarie publishing (the `voxpelli/diarie` repo)

**Audience:** whoever drives publishing `diarie` to npm.

**Why this exists:** the `vp-beads` dissolution (see decision `vp-beads-cst`) makes two choices that
change what diarie must ship and what it must expose. Neither *blocks* publishing — they just need to
be true when it happens.

---

## 1. diarie ships CLI-only — the bd-adoption pair does NOT travel with it

`DESIGN-constellation-repackaging.md` §4 and `vp-beads-ski` originally said "bd IS diarie's framing →
ship migrate-tracker + deintegrate-beads *with diarie*." **`vp-beads-cst` overrides that:** the
adoption pair goes to the `vp-skills` monorepo (`plugins/diarie-adopt`), to decouple it from diarie's
publish timeline. So **diarie publishes as just `cli.js` + `lib/` + its own skills** — no bd-adoption
skills to carry.

## 2. Expose `bd-map` — a cross-repo dependency `diarie-adopt` now has

Because the adoption pair lives in vp-skills, `plugins/diarie-adopt` will need **both**:

- `scripts/bootstrap-tasks.mjs` — the generalized migrator (plugin side; travels with the plugin).
- `diarie/lib/migrate/bd-map.js` — the `TYPE_MAP` / bd-field mapping (currently in the diarie
  workspace).

**Action:** confirm the *published* `diarie` package **exposes `bd-map`** — either a public export or a
subpath export (`diarie/migrate` / `diarie/lib/migrate/bd-map.js`) that `diarie-adopt` can import. If
diarie's public API is intentionally CLI-only and won't export `bd-map`, say so — then `diarie-adopt`
must **vendor a copy** of the map instead of importing it, and that decision should be recorded. Do not
let this dependency go untraced: a `diarie-adopt` that silently loses its type map degrades quietly.

## 3. The name gate

`diarie.dev` is bought; `npm view diarie` still 404s. **Publishing `0.1.0` *satisfies* the gate — it
does not breach it.** The branch is unpushed by operator choice; publishing is the deliberate act that
lifts the gate. (`private: true` must be dropped at publish.)

## 4. Post-publish handshake back to vp-skills (the one genuinely publish-gated step)

Today vp-skills carries `diarie/` as a **vendored subtree snapshot** (rejoined) and consumes it as an
npm workspace. Once `diarie` resolves on npm:

- vp-skills **drops the `diarie/` workspace and depends on the published package** (`diarie: "^0.1.0"`),
  and its `diarie-adopt` / store-reading skills shell out to the installed `diarie` binary instead of
  `node diarie/cli.js`.
- Until then, vp-skills keeps the rejoined subtree — this is the ONLY step in the whole dissolution
  that truly waits on the npm publish. Signal vp-skills when `npm view diarie` resolves.

## 5. Keep these contracts stable across the publish

vp-skills' skills depend on them:

- The **`--root` / nearest-wins** store resolution and `--root <dir>` pin.
- The **`ENOSTORE`** contract: a missing store is a non-zero-exit error with
  `{"error": "...", "code": "ENOSTORE"}` on stdout under `--json` — *not* an empty backlog. This is
  load-bearing for every consumer that must tell "tracks its work elsewhere" from "no work left."
- `ready` / `stats` / `validate` output shapes (incl. `--json`).

## 6. Pre-publish-gated diarie-side decision (already recorded, owned by diarie)

`diarie-spa` (the store-path API decision, in diarie's own `.diarie/decisions/`) is pre-publish work
diarie owns: refuse-nested-init-unless-`--nested` (+ `EANCESTOR`), `TASKS_ROOT → DIARIE_ROOT`, and
`diarie where`. Settle it before or with the first publish per that decision; it does not involve
vp-skills.

---

**Governing decision + full staged plan** live in the vp-skills repo (`vp-beads-cst`,
`~/.claude/plans/eager-jingling-scone.md`).

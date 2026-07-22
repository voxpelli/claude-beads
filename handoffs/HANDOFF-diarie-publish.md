# Handoff — diarie publish residuals (the `voxpelli/diarie` repo)

**Status: the publish is DONE.** `diarie` is on npm (`0.1.0` + `0.2.0`, latest `0.2.0`,
2026-07-18) — the name gate is satisfied, and the `file:../diarie` → published `^0.2.0`
dependency flip has landed in vp-skills (`vp-beads-swd`). This doc no longer briefs a
publish-driver; it keeps only the **one genuinely-open cross-repo item** and the
**consumer-side contract note** that outlived the publish. The historical sections that
framed the name gate, the CLI-only shipping decision, and the post-publish handshake are
retired — they are satisfied, and leaving them here would be the stale-scaffolding this
repo hunts.

---

## 1. Expose `bd-map` — a cross-repo dependency `diarie-adopt` now has

**DELIVERED to `../diarie` and handled there at least LOCALLY (2026-07-22, per user).** The diarie side
has addressed the `exports`-subpath gap in its own working tree; what remains is for the fix to land in a
PUBLISHED diarie release before the vp-skills consumer can import against it. So: **diarie-side
done-locally; vp-skills-side (`vp-beads-dad`) stays open** until the fix publishes and `diarie-adopt`
is wired to it. The original open-item text is kept below for the contract detail.

Because the bd-adoption pair lives in vp-skills (`plugins/diarie-adopt`,
decision `vp-beads-cst` — the pair was decoupled from diarie's publish timeline),
`diarie-adopt` will need **both**:

- `scripts/bootstrap-tasks.mjs` — the generalized migrator (plugin side; travels with the plugin).
- `diarie/lib/migrate/bd-map.js` — the `TYPE_MAP` / bd-field mapping (in the diarie package).

**The problem:** diarie's `exports` map exposes only `.` and `./schema` — **not** a
`./migrate` subpath. `bd-map.js` ships in the tarball (`files` includes `lib/**/*.js`) but
Node's exports resolution **blocks deep imports not listed in `exports`**, so
`diarie-adopt` cannot `import 'diarie/lib/migrate/bd-map.js'` against the published
package.

**Action (when `vp-beads-dad` lands):** either add `./migrate` (or a `bd-map` subpath) to
diarie's `exports`, **or** decide `diarie-adopt` vendors a copy of the map — and record
that decision. Do not let this dependency go untraced: a `diarie-adopt` that silently loses
its type map degrades quietly. Tracked by the `vp-beads-dad` row.

## 2. Contracts vp-skills depends on staying stable

vp-skills' skills consume diarie's CLI. diarie's own repo is the source of truth for
these; this is the consumer-side list of what must **not** break under us:

- The **`--root` / nearest-wins** store resolution and `--root <dir>` pin.
- The **`ENOSTORE`** contract: a missing store is a non-zero-exit error with
  `{"error": "...", "code": "ENOSTORE"}` on stdout under `--json` — *not* an empty
  backlog. Load-bearing for every consumer that must tell "tracks its work elsewhere"
  from "no work left".
- `ready` / `stats` / `validate` output shapes (incl. `--json`).

> Note: the pre-publish `diarie-spa` decision (store-path API — refuse-nested-init-unless
> `--nested` + `EANCESTOR`, `TASKS_ROOT → DIARIE_ROOT`, `diarie where`) was gated "before
> or with the first publish" but slipped to post-publish debt when `0.1.0` went out without
> it. It is diarie's own (`voxpelli/diarie/.diarie/decisions/diarie-spa.md`) and **does not
> involve vp-skills** — its scope is `init` nesting + an env rename, not the contracts
> above. Tracked there, not here.

---

**Governing decision + full staged plan** live in the vp-skills repo (`vp-beads-cst`,
`~/.claude/plans/eager-jingling-scone.md`).

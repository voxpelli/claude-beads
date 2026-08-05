# Handoff — vp-knowledge side (the `vp-claude` repo)

**Audience:** whoever works on `voxpelli/vp-claude` (the repo that will become `voxpelli/vp-knowledge`),
including the agent driving PR #8 (`0.33.0`).

**Why this exists:** `vp-beads` is dissolving into a two-repo constellation (see the governing
decision `vp-beads-cst` in the vp-skills/`claude-beads` repo). `vp-claude` becomes `vp-knowledge`, and
its `vp-plugins` marketplace becomes the light self-migration bridge for existing `vp-beads` installs.
Nothing here needs to _ride_ PR #8 — the point is to **not fight it** and to sequence the dissolution
edits **after** it merges.

There are no known external users; this migration only has to keep the operator's own machines working
with one `/plugin update`. Do not build bridge shims or version-gate hedging.

---

## Part 1 — For the PR #8 agent (do now; cheap; conflict-free)

**Do NOT bolt any dissolution scope onto the `0.33.0` draft.** #8 already touches `marketplace.json`
and the repo's identity surfaces; adding `renames`/cross-source there would (a) conflict with the draft
and (b) reference successor plugins in `voxpelli/vp-skills` that **do not exist yet**. Let #8 **ship
as-is on its own timeline.**

Two cheap, conflict-free things you _may_ do inside #8:

* Know that `vp-claude` is becoming **`vp-knowledge`**. If you're already rewriting identity strings,
  lean them toward `vp-knowledge` — but **do not** perform the GitHub repo rename or the marketplace
  surgery here; those are separate ops (Part 2).
* Don't cement `vp-claude` as a permanent identity (avoid new hard-coded `voxpelli/vp-claude` URLs
  where `vp-knowledge` is meant).

---

## Part 2 — Post-#8 vp-knowledge follow-ups (sequence AFTER #8 merges AND after `voxpelli/vp-skills` `main` is pushed)

Do these as their own commits/ops, in order. The two preconditions matter: the marketplace can only
cross-source successors once they exist on `vp-skills` `main`.

### 2a. Rename the repo (GitHub setting — no PR)

```
gh repo rename vp-knowledge --repo voxpelli/vp-claude
```

GitHub 301-redirects old clone URLs, `git remote` fetches, and
`/plugin marketplace add voxpelli/vp-claude`, so nothing breaks. Update internal identity strings
(`README`, `CLAUDE.md`, `plugin.json` name/repository/description, the marketplace `name`/description)
in a follow-up commit. Renaming away from `claude-*` also aligns with Anthropic's trademark guidance.

### 2b. Turn the `vp-plugins` marketplace into the light self-migration bridge

**Keep the marketplace record — never delete it** (deleting a marketplace uninstalls its plugins from
anyone who has it). Edit `.claude-plugin/marketplace.json`:

1. **Add a top-level `renames` map** (Claude Code v2.1.193+; it is **1:1 and intra-marketplace** — the
   successor must be listed in _this_ marketplace):

   ```json
   "renames": { "vp-beads": "ledger" }
   ```

   Only `ledger` auto-migrates; the other successors are manual installs (fine — one operator). Confirm
   the exact `renames` schema shape against the installed Claude Code version before relying on it.

2. **Cross-source the successor plugins from `voxpelli/vp-skills`** (they live in that repo's
   `plugins/<name>/`; use the `github` source with a `path`):

   ```json
   { "name": "ledger",       "source": { "source": "github", "repo": "voxpelli/vp-skills", "path": "plugins/ledger" },       "description": "Cross-project relationship tracking (formerly vp-beads: upstream, synergy, vendor, sibling)" },
   { "name": "swarm-wave",    "source": { "source": "github", "repo": "voxpelli/vp-skills", "path": "plugins/swarm-wave" },    "description": "Multi-agent wave orchestration" },
   { "name": "diarie-adopt",  "source": { "source": "github", "repo": "voxpelli/vp-skills", "path": "plugins/diarie-adopt" },  "description": "bd → diarie tracker adoption (migrate + de-integrate)" },
   { "name": "vp-git",        "source": { "source": "github", "repo": "voxpelli/vp-skills", "path": "plugins/vp-git" } },
   { "name": "vp-astgrep",    "source": { "source": "github", "repo": "voxpelli/vp-skills", "path": "plugins/vp-astgrep" } }
   ```

3. **Remove the old cross-source entries** that pointed at the now-retired/renamed repos: the `vp-beads`
   entry (→ `voxpelli/claude-beads`), and the `vp-git`/`vp-astgrep` entries pointing at
   `voxpelli/claude-git` / `voxpelli/claude-astgrep` (replaced by the `voxpelli/vp-skills` sources
   above). Keep `vp-knowledge` as the in-repo plugin (`source: "./"`).

Validate with `claude plugin validate . --strict` (checks the `renames` chain terminates at a plugin
listed in this marketplace, plus duplicate-name / path-traversal / version-mismatch). Do **not** set a
plugin's `version` in both its `plugin.json` and the marketplace entry (silent masking).

### 2c. Absorb `retrospective` → `session-reflect` (separate follow-up, unrelated to #8)

* Merge the `retrospective` skill's capability into vp-knowledge's `session-reflect`.
* **The RETRO trend-review cadence dissolves, it does not relocate.** `retrospective` output becomes a
  Basic Memory note, so the "every 4th sprint → trend review" counter — which was bound to the
  `RETRO-*.md` **file count** in vp-beads' `session-start.sh` — **cannot survive as a file-count**.
  Rebuild the trigger inside `session-reflect` as a session-scoped counter or a recorded trigger, and
  **verify the cadence fires once** after the change.
* This coordinates with the vp-skills side, which **drops `retrospective` only after** this absorption
  has landed (its Phase 2 ordering guard). Signal back when `session-reflect` covers it.

---

## Coordination summary

* PR #8: ships as-is, your timeline.
* Then, in order: (2a) `gh repo rename`, (2b) marketplace bridge — **needs vp-skills `main` pushed
  first**, (2c) retrospective absorption — **the vp-skills side waits on your "done" before dropping
  its copy.**
* Governing decision + full staged plan live in the vp-skills repo (`vp-beads-cst`,
  `~/.claude/plans/eager-jingling-scone.md`).

## Feature Requests

* _(Resolved 2026-04-05, vp-knowledge v0.21.0)_ **Knowledge agents should
  preload a note-quality skill** — v0.21.0 added `vp-note-quality` skill and
  agent `skills` frontmatter preloading. Agents now inject the Note Quality
  Checklist automatically on launch.

* **Agent effort defaults not overridable from parent** (2026-04-05) —
  v0.21.0 added `effort` frontmatter support and `skills` preloading, but
  `effort` is not overridable from the parent Agent tool call. A parent
  session wanting `effort: max` on a spawned knowledge-maintainer cannot
  request it — only the agent's own frontmatter value applies.
  Ownership: upstream (Claude Code platform) · Workaround: none — must set
  effort in agent frontmatter, cannot tune per-invocation.
  Note: The `model: sonnet` default in knowledge-gardener is a separate
  deliberate choice (SYNERGY accept-difference), not part of this FR.

* _(Resolved 2026-07-02, vp-knowledge v0.32.0 — commit `84bf760`
  "feat(tool-intel): dispatch third-party Homebrew taps (owner/tap/formula)";
  `ecosystem-brew.md` now carries a `## Third-Party Tap Formulae
  (<owner>/<tap>/<formula>)` section. Surfaced by `/sibling-sync` finding (g),
  2026-07-10. Detailed entry retained below for design context.)_
  **tool-intel `brew:` dispatch does not handle third-party taps**
  (2026-05-18) — `skills/tool-intel/references/ecosystem-brew.md` only knows
  the `formulae.brew.sh/api/formula/<name>.json` JSON path. Two-slash
  identifiers like `brew:dicklesworthstone/tap/br` (third-party tap, format
  `<owner>/<tap>/<formula>`) are not parsed, so the skill silently misroutes:
  it tries the core registry, gets a miss, and the user must hand-extend the
  workflow (fetch raw `.rb` via `gh api repos/<owner>/homebrew-<tap>/contents/Formula/<formula>.rb`,
  parse Ruby DSL fields `desc`/`homepage`/`version`/`license`/`url`/`depends_on`/`caveats`,
  pivot DeepWiki to the upstream `homepage` repo). Evidence that this is a
  recurring need, not a one-off: at least 6 existing third-party-tap notes
  in BM already follow the convention manually — `brew-ataraxy-labs-tap-inspect`,
  `brew-agent-ecosystem-tap-skill-validator`, `brew-clever-tools`,
  `brew-git-gtr`, `brew-mcp-netutils`, and the new `brew-dicklesworthstone-tap-br`.
  Proposal includes: (1) detect 2-slash form in Step 0; (2) new fetch branch
  using `gh api` + Ruby DSL parse; (3) auto-pivot DeepWiki to `homepage`;
  (4) cross-check formula `license` vs upstream `LICENSE` (mismatches happen
  — both `inspect` and `br` notes flagged this); (5) audit tap `.github/workflows`
  for SLSA/SHA-256 hygiene; (6) sibling-formula survey for org-level signal.
  Also codify BM note conventions: title `brew-<owner>-<tap>-<formula>`,
  mandatory tags `third-party-tap` + `trust-review`, mandatory
  `[installation]`/`[trust]`/`[security]` observation categories.
  Ownership: upstream (vp-knowledge) · Workaround: partial — convention is
  half-encoded in BM by 6 precedent notes; user can hand-extend the workflow
  per invocation, but the skill itself doesn't dispatch.

* _(Resolved 2026-04-05, vp-knowledge v0.21.0)_ **package-intel should fetch
  npm download stats from the registry API** — v0.21.0 added download stats
  to the package-intel pipeline.

## Bugs

_No entries yet._

## Upstream Opportunities

* _(Resolved 2026-04-05, vp-knowledge v0.21.0)_ **Note Quality Checklist —
  10-item anti-pattern prevention** — v0.21.0 packaged this as the
  `vp-note-quality` skill with agent `skills` preloading. The checklist is now
  automatically injected into knowledge-gardener and knowledge-maintainer.

* **Observation category audit pattern** (2026-04-05) — A systematic audit
  workflow for reviewing `[raindrop]`/`[readwise]` observation categories
  across notes. Identifies observations that should be recategorized to
  `[connection]`/`[source]`/`[quote]`, flags inventory-state `[gap]`
  observations for deletion, and strips "saved YYYY" bookmark dates. Could be
  formalized as a knowledge-gardener workflow mode.
  Source: gardener audit (this session) · Merge readiness: proof-of-concept
  Ownership: us · Workaround: full — run as ad-hoc gardener agent with
  explicit instructions

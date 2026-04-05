## Feature Requests

- _(Resolved 2026-04-05, vp-knowledge v0.21.0)_ **Knowledge agents should
  preload a note-quality skill** — v0.21.0 added `vp-note-quality` skill and
  agent `skills` frontmatter preloading. Agents now inject the Note Quality
  Checklist automatically on launch.

- **Agent effort defaults not overridable from parent** (2026-04-05) —
  v0.21.0 added `effort` frontmatter support and `skills` preloading, but
  `effort` is not overridable from the parent Agent tool call. A parent
  session wanting `effort: max` on a spawned knowledge-maintainer cannot
  request it — only the agent's own frontmatter value applies.
  Ownership: upstream (Claude Code platform) · Workaround: none — must set
  effort in agent frontmatter, cannot tune per-invocation.
  Note: The `model: sonnet` default in knowledge-gardener is a separate
  deliberate choice (SYNERGY accept-difference), not part of this FR.

- _(Resolved 2026-04-05, vp-knowledge v0.21.0)_ **package-intel should fetch
  npm download stats from the registry API** — v0.21.0 added download stats
  to the package-intel pipeline.

## Bugs

_No entries yet._

## Upstream Opportunities

- _(Resolved 2026-04-05, vp-knowledge v0.21.0)_ **Note Quality Checklist —
  10-item anti-pattern prevention** — v0.21.0 packaged this as the
  `vp-note-quality` skill with agent `skills` preloading. The checklist is now
  automatically injected into knowledge-gardener and knowledge-maintainer.

- **Observation category audit pattern** (2026-04-05) — A systematic audit
  workflow for reviewing `[raindrop]`/`[readwise]` observation categories
  across notes. Identifies observations that should be recategorized to
  `[connection]`/`[source]`/`[quote]`, flags inventory-state `[gap]`
  observations for deletion, and strips "saved YYYY" bookmark dates. Could be
  formalized as a knowledge-gardener workflow mode.
  Source: gardener audit (this session) · Merge readiness: proof-of-concept
  Ownership: us · Workaround: full — run as ad-hoc gardener agent with
  explicit instructions

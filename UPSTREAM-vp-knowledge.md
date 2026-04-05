## Feature Requests

- _(Resolved 2026-04-05, vp-knowledge v0.21.0)_ **Knowledge agents should
  preload a note-quality skill** — v0.21.0 added `vp-note-quality` skill and
  agent `skills` frontmatter preloading. Agents now inject the Note Quality
  Checklist automatically on launch.

- **Agent model/effort defaults for note-writing operations** (2026-04-05) —
  knowledge-gardener and knowledge-maintainer should default to `model: opus`
  and `effort: max` when performing note writes. Lower-capability models and
  effort levels correlate with higher rates of self-referential content and
  factual fabrication in generated notes. The current `model: sonnet` in
  knowledge-gardener is a deliberate choice for speed, but note quality
  suffers.
  Ownership: shared · Workaround: partial — parent can override model in
  Agent tool call, but effort is not overridable from the parent.
  Note: v0.21.0 added `effort`/`skills` preloading infrastructure, but the
  default model for gardener remains `sonnet`. Partially addressed.

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

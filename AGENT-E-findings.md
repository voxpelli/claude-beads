# Agent E — Substrate-vs-Advisory Deep Graph Mapping

## V1: Verify "no existing BM note covers this"

**Verdict: C's claim CONFIRMED with one nuance** — no existing note covers the substrate-vs-advisory two-surface decomposition. But the closest ancestor (`UNIX Philosophy`) exists and is *thinner* than C implied; it does NOT explicitly enumerate Raymond's Rule of Separation as its own concept — Raymond is cited once in observations only.

Surveyed BM neighborhoods:
- `engineering/patterns/` (119 notes) — most relevant candidates surveyed: `UNIX Philosophy`, `Worse Is Better`, `Worse Is Better vs Software Craftsmanship`, `DX as Trojan Horse`, `Dependency Injection`, `Three Implicit Design Patterns` (MVX/Platform Absorption/Protective Friction), `Choose Boring Technology`, `Small Module Philosophy`, `Manifestos and Principles Hub`. None cover substrate-vs-advisory two-layer split.
- `engineering/practices/` — only 5 notes (Boy Scout, Conservative Change, RDD, Single Responsibility Commits, Trunk-Based Dev). RDD has the partial precedent ("Opinionated tools — when the interface IS the opinion" bullet under "RDD works well for"). No substrate-vs-advisory framing.
- `engineering/principles/` — **does not exist as a directory**. The BM convention puts named principles inline in `engineering/patterns/` or under `engineering/<author>` notes. No `mechanism-policy-separation` note exists.
- Searches for "opinionated framework lock-in", "Unix philosophy mechanism policy", "substrate primitives anti-framework", "platform proximity abstraction" all surface adjacent notes but no direct hit.

The closest precedent is the single RDD bullet point, which neither names nor decomposes the concept.

## V2: The Tolerance Trap concept

**Definition (BM canonical):** A causal chain — Postel's Law (liberal acceptance) → Hyrum's Law (every observable behavior becomes a dependency) → Protocol Ossification (changing tolerated behavior breaks clients). Tolerance enables early adoption; the same tolerance becomes the rigidity that prevents evolution.

**BM coverage:** Major hub at `engineering/patterns/the-tolerance-trap-how-liberal-acceptance-creates-brittle-dependencies` with rich satellite notes: `Robustness Principle`, `Hyrum's Law`, `Conservative Change Philosophy`, `Schema as Social Contract`, `Standards Graveyard Lessons`, `Protocol Ossification Prevention`, `Boundary Strictness Pattern`, `Error Philosophy Spectrum`, `RFC 9413`, `TLS 1.3 Middlebox Ossification`, `HTML Quirks Mode`, `Supply Chain Trust as Tolerance Trap`, `TOML` (avoids the trap). Sources cited: RFC 761 (Postel), RFC 9413 (Thomson 2023), RFC 8701 (GREASE), Gaynor 2025, Fowler TolerantReader.

**Raindrop coverage:** 5 bookmarks tagged `tolerance-trap` (Gaynor 2025, TLS 1.3 illustrated, RFC 8701 GREASE, Fowler TolerantReader, RFC 9413).

**Relationship to substrate-vs-advisory:** C said "orthogonal sibling." **Confirmed orthogonal — different axis, shared ancestor.** Tolerance Trap is about *what input a system accepts*; substrate-vs-advisory is about *what workflow a tool dictates to its users*. Both are downstream of the same global tenet ("lock-in resistance over convenience" from CLAUDE.md). The structural analogy: in both, *unbounded permissiveness in one direction creates a lock-in in the opposite direction* (Tolerance: liberal input → ossified protocol; Substrate-vs-advisory: opinionated substrate → ossified workflow). But the mechanism differs — Tolerance creates lock-in via emergent dependent behavior; substrate-vs-advisory observes lock-in created by *design intent*. Cross-link as `sibling_axis` not `extends`.

## V3: Zero Framework Manifesto

**Source:** Joe Gregorio, BitWorking, 2014-05-14. URL: `http://bitworking.org/news/2014/05/zero_framework_manifesto`. Title: "No more JS frameworks." **Bookmarked in Raindrop** (id 831016347, tags `javascript`/`framework`/`tankar`, in collection 46694889 — user-curated, not AI-*). **NOT in BM** (no dedicated note; cited inline as `[raindrop]` in `Three Implicit Design Patterns`).

**Argument summary (verbatim excerpts from the bookmark):**
- "HTML+CSS+JS are my framework. The fundamental idea is that frameworks aren't needed, use the capabilities already built into HTML+CSS+JS."
- "Break apart the monoliths into orthogonal components that can be mixed in any combination."
- "Now you have two systems to learn, HTML+CSS+JS, and the framework. Sure, if the framework was a perfect abstraction of the web as a platform you would never have to go beyond the framework, but guess what, abstractions leak."
- "The longer term problem with frameworks is that they end up being silos, they segment the landscape, widgets built for framework A don't work in framework B. That's lost effort."

**Relation to substrate-vs-advisory:** **Stronger statement** — Zero Framework rejects the advisory layer entirely ("HTML+CSS+JS are my framework"). Substrate-vs-advisory is more nuanced: it accepts that advisory surfaces exist and are useful, and only rejects when opinion is *embedded in substrate*. Zero Framework is the maximalist position; substrate-vs-advisory is the calibrated position that allows opinion-shaped tools when their opinion lives in the advisory layer (escapable). The substrate note should cite Zero Framework as the direct philosophical ancestor — particularly the "abstractions leak" line, which echoes the global CLAUDE.md tenet "Every abstraction leaks; minimize them."

## V4: Raymond's Rule of Separation BM coverage

**Verdict: C's claim CONFIRMED** — no dedicated BM note exists for Raymond's Rule of Separation as a standalone concept.

- `UNIX Philosophy` note exists at `engineering/patterns/unix-philosophy` and lists McIlroy's principles + Rob Pike's "Extended Principles" (5 rules: Modularity, Composition, Simplicity, Transparency, Robustness). **It does NOT enumerate Raymond's 17 Rules from *The Art of UNIX Programming* (2003).** Raymond is cited once in `[history]` and `[source]` observations only.
- No `person:Eric Raymond` person note. But `Cathedral and the Bazaar` exists at `engineering/history/cathedral-and-the-bazaar` — Raymond's other major contribution. Cathedral-Bazaar is well-developed and has its own relations.
- No `references/the-art-of-unix-programming` reference note.
- Searches for "Raymond Art Unix Programming" surface only `UNIX Philosophy`'s incidental mention.

**Recommendation on Raymond ancestor note:** Don't file it preemptively. Cite Raymond's Rule of Separation **inline** in the substrate-vs-advisory note via observation `[heritage]` and link out to Wikipedia + lambdaisland blog as `external_evidence`. If a future trend-review surfaces 3+ notes needing Rule-of-Separation as parent, file a `person:Eric Raymond` note then. Premature `engineering/principles/mechanism-policy-separation` creation would be speculative — the *immediate* need is one downstream note (substrate-vs-advisory), and YAGNI applies.

## V5: Placement recommendation

**Chosen approach: A (Create new standalone note)** — with two minor adjustments to C's plan.

**Specific paths/sections:**
- New note: `engineering/patterns/substrate-vs-advisory-surface-classifying-tools-by-where-their-opinions-live`
  - Use `engineering/patterns/` (not `engineering/practices/`) — this is a pattern for *classifying* tools, not a development practice. Convention match: `Worse Is Better`, `DX as Trojan Horse`, `Three Implicit Design Patterns`, `Choose Boring Technology` all live in `patterns/`.
  - Title compresses C's longer title. The Raymond's-Rule-of-Separation parentage goes in the lede, not the title.
- Add **one observation** to `engineering/practices/readme-driven-development` Observations section linking to the new note, since the RDD bullet "Opinionated tools — when the interface IS the opinion" is the closest existing partial precedent. (This is the small "C" element of option C — minimal cross-link, not a full secondary note.)
- Add **one entry** to `engineering/patterns/manifestos-and-principles-hub` under "Simplicity & Composability" table — the new note belongs there as a 2026 entry alongside UNIX Philosophy and Worse Is Better.

**Suggested observation text + relations list:**

Lede sentence: "A two-layer refinement of the opinionated/unopinionated tool distinction: any tool exposes a *substrate surface* (what its data model and validation gates structurally enforce) and an *advisory surface* (what its docs, MCP resources, or prompts merely suggest); a tool's true opinionatedness is measured by what it puts in the substrate, not by the volume of advice it ships."

Key observations:
- `[heritage]` Direct ancestor: Raymond's Rule of Separation ("Separate policy from mechanism; separate interfaces from engines"), *The Art of UNIX Programming* (2003) Rule 5
- `[heritage]` Philosophical ancestor: Joe Gregorio's "Zero Framework Manifesto" (BitWorking, 2014) — substrate-vs-advisory is the calibrated version of Zero Framework's maximalist "HTML+CSS+JS are my framework"
- `[vernacular]` Industry shorthand is "opinionated vs unopinionated"; the two-surface decomposition is more precise because an opinion in the advisory surface is escapable while an opinion in the substrate is not
- `[test]` Operative test: can a downstream user ignore the opinion and still use the tool? If yes → advisory. If no (data model enforces it, validation gates it) → substrate.
- `[application]` Workflow-choreography test for AI-agent tool selection — solo-dev-with-Claude-Code-agent-swarms wanting to own the workflow layer prefer substrate-shaped tools and treat opinion-shaped tools as workflow lock-in candidates
- `[sibling-axis]` The Tolerance Trap is the input-side analogue: tolerance creates lock-in via emergent dependent behavior; substrate-opinion creates lock-in via design intent. Both are downstream of "lock-in resistance over convenience"

Relations:
- `inspired_by [[UNIX Philosophy]]` — Raymond's Rule of Separation lives in `UNIX Philosophy`'s ancestry
- `refines [[Worse Is Better]]` — substrate-shaped tools ship the simpler interface; the workflow opinion is NOT a precondition of use
- `relates_to [[Readme Driven Development]]` — the RDD "interface IS the opinion" bullet is the partial precedent
- `sibling_axis [[The Tolerance Trap - How Liberal Acceptance Creates Brittle Dependencies]]` — distinct axis (input vs workflow), shared lock-in-resistance ancestor
- `relates_to [[Small Module Philosophy - Unix Composability Applied to npm]]` — composable-primitives sibling
- `relates_to [[Dependency Injection]]` — library/framework discourse shares the substrate-vs-opinion intuition
- `relates_to [[DX as Trojan Horse - How Developer Experience Creates Lock-In]]` — advisory-surface DX is a Trojan Horse vector when it leaks substrate-shaped assumptions
- `relates_to [[Three Implicit Design Patterns — Minimum Viable, Platform Absorption, Protective Friction]]` — Minimum Viable X is the substrate-only sibling pattern; Joe Gregorio's manifesto is cited there
- `external_evidence` URLs: `https://en.wikipedia.org/wiki/Unix_philosophy` (Rule of Separation), `http://bitworking.org/news/2014/05/zero_framework_manifesto` (Zero Framework), `https://lambdaisland.com/blog/2022-03-10-mechanism-vs-policy` (lambdaisland)

**Why this beats the other 3 options:**

- **Beats B (Extend RDD only):** Substrate-vs-advisory is a *classification scheme* for tools (input: tool; output: classification + lock-in risk). RDD is a *development practice* (input: project; output: README). Folding one inside the other inverts the type-of-knowledge and would make the substrate concept harder to discover for tool-selection questions.
- **Beats C (New note + extend RDD + …):** The recommended approach is essentially C-lite — yes, add the one-line RDD observation and one Hub table entry, but resist the urge to also file 3 sibling notes. The pattern's productive surface area is small enough for one note.
- **Beats D (File ancestor first):** Filing `engineering/principles/mechanism-policy-separation-raymond` preemptively (before any downstream note actually needs it as a parent) violates YAGNI. Raymond's Rule of Separation is well-covered on Wikipedia and via the lambdaisland post; an `external_evidence` link suffices until a second downstream note appears. Filing the ancestor first also requires creating a new directory (`engineering/principles/` currently doesn't exist) which would set a precedent the rest of the graph doesn't follow.

**One-line summary:** Create the new substrate-vs-advisory note as a synthesis-pattern in `engineering/patterns/`, add minimal cross-links to RDD and the Manifestos Hub, and cite Raymond's Rule of Separation + Zero Framework Manifesto inline rather than as their own ancestor notes.

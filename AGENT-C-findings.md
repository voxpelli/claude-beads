# Agent C — Substrate vs Advisory Prior-Art Mapping

## Per-candidate findings

### Mechanism vs Policy separation (Unix philosophy)
- **Readwise**: 0 relevant highlights (top score 0.031, noise floor; CLI Guidelines hit is tangential).
- **BM**: no dedicated note. Concept appears as scattered observations (1 Raindrop bookmark surfaces a Node.js issue thread literally quoting "moving from mechanism into policy territory"). Adjacent BM notes exist (Unix Philosophy, Small Module Philosophy, person:Richard Gabriel).
- **Raindrop**: 1 strong hit — Wikipedia "UNIX Philosophy — Doug McIlroy" bookmarked April 2026 with `manifesto`/`ai-bookmarked` tags. Lambdaisland blog "Improve your code by separating mechanism from policy" surfaced via Tavily (not bookmarked) — explicitly traces to Raymond's *Art of UNIX Programming* "Rule of Separation."
- **Tavily**: Wikipedia confirms canonical formulation; Raymond's *The Art of UNIX Programming* Rule 5 ("Rule of Separation: Separate policy from mechanism; separate interfaces from engines").
- **Relevance: HIGH.** This is the closest established ancestor. "Substrate surface" maps almost exactly to "mechanism"; "advisory surface" maps approximately to "policy" *suggested but not enforced*. The novel twist is the **structural enforcement** axis (substrate ENFORCES; advisory SUGGESTS) — Raymond's framing is about *separating* the two layers within one tool, not classifying tools as substrate-shaped vs opinion-shaped.

### Worse Is Better (Richard Gabriel)
- **Readwise**: 0 relevant highlights.
- **BM**: dedicated note `engineering/patterns/worse-is-better` plus `worse-is-better-vs-software-craftsmanship-the-lifecycle-resolution` (lifecycle resolution) and `person:Richard Gabriel`. RDD note already links to Worse Is Better.
- **Raindrop**: none directly tagged.
- **Relevance: MEDIUM.** Worse Is Better is about *implementation* simplicity beating correctness; not about whether a tool dictates workflow. Adjacent but not the same axis.

### End-to-end principle (Saltzer, Reed, Clark)
- **Readwise**: 0 relevant highlights.
- **BM**: no note. No matches at meaningful similarity.
- **Raindrop**: none.
- **Relevance: LOW.** End-to-end is about WHERE to put functionality in a layered system. Different axis.

### Postel's law / Robustness principle / Tolerance trap
- **Readwise**: 0 directly relevant (low scores).
- **BM**: rich coverage — `the-tolerance-trap-how-liberal-acceptance-creates-brittle-dependencies` is a major hub note; companion notes `robustness-principle`, `hyrum's-law`, `protocol-ossification-prevention`, `error-philosophy-spectrum`, `standards-graveyard-lessons`, `schema-as-social-contract`.
- **Raindrop**: 7+ bookmarks with `tolerance-trap` tag (RFC 761, RFC 8701 GREASE, RFC 9413, Hyrum's Law, TolerantReader, Gaynor 2025, TLS 1.3 walkthrough).
- **Relevance: MEDIUM.** Tolerance Trap is about *what a tool/protocol accepts as input* causing downstream rigidity. Substrate-vs-advisory is about *what a tool dictates as workflow*. Distinct axes — but both are downstream of the same global tenet ("lock-in resistance"). The substrate-not-opinion feedback note already references the Tolerance Trap ecosystem implicitly via the global CLAUDE.md tag vocabulary.

### Simple vs Easy (Rich Hickey)
- **Readwise**: 0 relevant.
- **BM**: no dedicated note. Concept absent.
- **Raindrop**: none.
- **Relevance: LOW–MEDIUM.** Hickey's "simple" (un-braided) vs "easy" (familiar) is a *cognitive load* framing, not a tool-classification framing. Loosely related but not a renaming.

### Lampson's Hints ("leave it to the client", "don't hide power")
- **Readwise**: 0 relevant.
- **BM**: no note.
- **Raindrop**: none surfaced.
- **Relevance: LOW.** Closest hint ("Leave it to the client") supports the substrate posture but is one bullet in a 25-page paper, not a named pattern.

### Library vs Framework (inversion of control)
- **Readwise**: peripheral hits on Drupal services / Zig interfaces — no canonical "library vs framework" highlight.
- **BM**: `dependency-injection` note exists; `cross-framework-interface-standards`. No dedicated "library vs framework" hub.
- **Raindrop**: 500+ "opinionated" hits, including the seminal `bitworking.org/zero_framework_manifesto`, `ianstormtaylor/permit` ("an unopinionated authentication library"), `prettier` ("opinionated formatter"), Fedify integration page citing Express as "unopinionated, minimalist."
- **Tavily**: multiple recent posts (`fibery.io/blog/essays/opinionated-unopinionated-product-management-tool`, Substack "Opinionated vs Unopinionated Tools", dev.to "Opinionated vs. Non-Opinionated Frameworks") confirm "opinionated vs unopinionated" is the **established vernacular** for exactly this distinction in industry writing.
- **Relevance: HIGH.** This is the *common* framing for the same idea. The user's proposed distinction is more precise (separates the *substrate* layer from the *advisory* layer rather than treating "opinionatedness" as a single scalar), but the industry already uses "opinionated/unopinionated" as the dominant vocabulary.

### Tolerance trap (user's existing concept)
- See above — already a major hub in BM and Raindrop.
- **Relevance**: orthogonal axis (input tolerance, not workflow dictation).

### Bonus: "Substrate" as term-of-art
- **Tavily**: "substrate vs framework / primitives" is an active vocabulary in 2024–2025 writing — `businessengineer.ai` "AGaaS: Five Architectural Primitives" uses "substrate-vs-tooling" exactly. `blockeden.xyz` covers Commonware's "anti-framework / primitives" approach. `designsystemscollective.com` uses "Pattern Primitives." Polkadot's "Substrate" SDK has popularized the word in blockchain.
- **Relevance: HIGH for vocabulary.** "Substrate" is becoming a recognizable term for "composable primitives layer beneath an opinionated tooling layer." The user's framing is consistent with how the term is being used elsewhere.

## Verdict

**Classification: SYNTHESIS OF KNOWN CONCEPTS** (with one genuinely novel contribution).

**Reasoning:** The substrate-vs-advisory distinction synthesizes three established ideas: (1) Raymond's Rule of Separation (mechanism vs policy) — the closest single ancestor; (2) the industry-vernacular opinionated-vs-unopinionated distinction (library/framework discourse); (3) emerging "substrate / primitives / anti-framework" vocabulary from 2024–2025 platform-engineering writing. The genuinely **novel** contribution is the *two-surface decomposition with the structural-enforcement test*: instead of treating "opinionated" as a single scalar, the user splits it into (a) what the tool's substrate enforces and (b) what its advisory layer suggests, and applies the classifier ("opinion-shaped vs substrate-shaped") to a *third* property (workflow choreography fit for AI-agent tool selection). That third property — solo-dev-with-Claude-Code-agent-swarms wanting to own the workflow layer — is specific enough that no prior art covers it directly.

## Recommendation

**Keep the new note, but reframe as a synthesis** rather than a novel coinage. Recommended title:

> **"Substrate Surface vs Advisory Surface — A Two-Layer Refinement of the Opinionated/Unopinionated Distinction"**

Alternative shorter title (if a hub-note format is preferred):

> **"Substrate-Shaped vs Opinion-Shaped Tools — Classifying Tools by Where Their Opinions Live"**

The lede should explicitly position the note as: "Raymond's Rule of Separation (mechanism vs policy) applied to the question of tool *adoption* rather than tool *internals*, refined with the structural-enforcement test from the bd vs Backlog.md empirical comparison."

**Key context to add:**
- Cite Raymond's *Art of UNIX Programming* Rule 5 as the most direct ancestor.
- Cite the industry vernacular "opinionated/unopinionated" and explain why the two-surface decomposition is more useful than the one-scalar form.
- Connect to "substrate" as an emerging term in platform engineering (Commonware, Polkadot Substrate, AGaaS).
- Note the asymmetry: an opinion *embedded in advisory surface* is escapable; an opinion *embedded in substrate* is not. This is the operative insight.
- Bind the framing to the lead motif (`tracker-lead-motif`) — the substrate-not-opinion preference is *downstream of* the user's "lock-in resistance over convenience" tenet, not a free-floating preference.

## Suggested `## Relations` for the note (if created)

- `extends [[Rule of Separation - Mechanism vs Policy (Raymond)]]` — needs to be created first as the direct ancestor; currently only exists as scattered BM observations
- `refines [[Worse Is Better]]` — substrate-shaped tools embody Worse Is Better at the *interface* level (ship the simpler interface; don't ship a workflow opinion as a precondition of use)
- `relates_to [[Readme Driven Development]]` — RDD's "Opinionated tools — when the interface IS the opinion" bullet is the partial precedent; this note refines it by splitting "the interface" into substrate + advisory
- `relates_to [[The Tolerance Trap - How Liberal Acceptance Creates Brittle Dependencies]]` — sibling pattern on a different axis (input tolerance vs workflow dictation); both are children of "lock-in resistance" tenet
- `relates_to [[Small Module Philosophy - Unix Composability Applied to npm]]` — same parent (Unix philosophy of composable primitives)
- `relates_to [[Dependency Injection]]` — library/framework discourse shares the substrate-vs-opinion intuition
- `cited_by [[tracker-lead-motif]]` — operative test for the workflow-choreography-layer roadmap decisions
- `evidence [[substrate-not-opinion (feedback memory)]]` — the user-feedback form of the principle
- `companion [[no-claude-md-colonization (feedback memory)]]` — sibling anti-pattern about substrate-level workflow opinion injection

**Optional Raindrop relations** (cite as `external_evidence`):
- `https://lambdaisland.com/blog/2022-03-10-mechanism-vs-policy` — clearest non-Raymond restatement
- `https://bitworking.org/news/2014/05/zero_framework_manifesto` — manifesto in the opinionated/unopinionated tradition
- `https://en.wikipedia.org/wiki/Unix_philosophy` — canonical Rule of Separation reference (already bookmarked, `ai-bookmarked` + `manifesto` tags)

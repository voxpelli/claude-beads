# AI Issue Tracker: Ultimate Solution

**External research document, archived verbatim for future reference.**

| Field | Value |
|---|---|
| Source | Google Drive |
| Drive file ID | `1qVyyD56NAWwvnh9AevaPuOGQcjS07rkgWXpFAozyVFY` |
| Drive title | AI Issue Tracker: Ultimate Solution |
| Original document title | Orchestrating the Synthetic Workforce: A Comprehensive Analysis of Distributed State Management Architectures for Autonomous AI Agents |
| Created | 2026-02-12 |
| Author | Gemini Deep Research (commissioned by Pelle Wessman) |
| Word count | ~5,500 |
| Archived to repo | 2026-05-18 |
| Consumed by | [`DESIGN-tracker-exploration.md`](./DESIGN-tracker-exploration.md) |

## Provenance and scope

Commissioned via Gemini Deep Research as a survey of "agent-first" issue tracker architectures circa 2026-02. Analyzes three named candidates (Grite, Git-bug, Beads) and synthesizes a hybrid architecture called Git-Backed Context Lake (GBCL). Used as the target architecture spec for vp-beads-tracker design exploration in 2026-05.

The document's §1.3 (Decision Coherence Law), §7 (prompt-injection assessment), and §8 (4-layer GBCL architecture) are load-bearing inputs to subsequent vp-beads design work.

## Companion Drive documents (not archived here)

These were commissioned in the same research arc but are not yet archived to disk. Drive file IDs preserved so they can be fetched and archived later if needed:

- `1ir9HjeRghW6QtcOh0ERi9FrV1noU5FPKaJh6X0kfgLY` — "AI Local-First Memory Replacement Architecture" (2026-04-07). Introduces user codenames **Basis Nexus** and **Weft AI** alongside the real **ChunkHound** project. Basis Nexus has since been designed in detail; see BM `engineering/agents/basis-nexus-design-document`. Weft AI has since been implemented at `/Users/pelle/yikesable/weft-ai`.
- `1p1B5Rp3zak1ufhvwpc0PNlclcS7e8a5YN7jqLxas6Hg` — "The Federated Synthetic Workforce: A Pure Rust Crate Architecture" (2026-02-09)
- `1SjKsPuT6RRDHh29U4gDFw8GEAD81BbdGLsEDd67kK1s` — "The Federated Hybrid Workforce: Integrating Carbon Intelligence" (2026-02-09)

## Accuracy caveats — read before treating as authoritative

Subsequent multi-agent verification (2026-05-18) confirmed the document is **substantially accurate** on the named projects — Grite (`neul-labs/grite`), Brat (`neul-labs/brat`), Gas Town (`gastownhall/gastown`), Beads (`gastownhall/beads`), and Git-bug (`git-bug/git-bug`) all exist and were active at verification time. The Tree-sitter integration in Grite, the SQLite+JSONL "mullet" architecture in Beads, the role-taxonomy attribution to Brat — all verified.

However, **three specific claims should be treated with skepticism**:

1. **`arxiv.org/abs/2601.17019`** cited for "Context Lake: A System Class Defined by Decision Coherence" — future-dated arxiv ID at time of writing, unverified at time of archival. Treat the Decision Coherence Law as the document's own framing, not as a peer-reviewed concept with external grounding.
2. **"MCP Sampling"** usage in §8.3 — the specific use-case "ask the agent for clarification mid-tool-call when a task description is ambiguous" is closer to **MCP Elicitation** (which postdated the document by ~6 months). The document may be ahead of the spec it cites, or conflating two adjacent primitives.
3. **"Build Upon Grite"** — bottom-line recommendation rests on Grite being mature enough to fork. As of 2026-05-18 Grite has 6 stars and one effective contributor (Dipankar Sarkar / Neul Labs). The recommendation is a bet, not a derivation.

The cite-then-verify discipline applied during the 2026-05 verification round is captured in the BM territory map note `engineering/agents/agent-issue-tracker-and-mcp-server-territory-map-2026-05`. Future readers of this document should apply the same discipline before acting on any claim.

## Codename clarification (not visible in the original)

The 2026-04-07 companion document ("AI Local-First Memory Replacement Architecture") uses user-supplied codenames **Basis Nexus** (intended as a Basic Memory companion / possible successor) and **Weft AI** (the computation layer in a two-layer personal research stack) as if they were external research subjects. Gemini Deep Research extrapolated architectural detail around these names. The codenames are real concepts of the user's; the surrounding architectural prose is Gemini synthesis. This is relevant background when reading any portion of that 2026-04-07 doc.

This particular document (2026-02-12, archived here) does **not** appear to use such codenames — its named projects (Grite, Brat, Gas Town/Beads/Git-bug, the Brat role taxonomy) all verified as real external work.

---

[Original document content begins below — verbatim from Google Drive export 2026-05-18.]

---

# **Orchestrating the Synthetic Workforce: A Comprehensive Analysis of Distributed State Management Architectures for Autonomous AI Agents**

## **Executive Summary**

The software development lifecycle (SDLC) is currently undergoing its most significant transformation since the advent of continuous integration: the transition from human-centric workflows to agent-centric orchestration. As Large Language Models (LLMs) evolve from passive code completion tools into autonomous agents capable of multi-step reasoning, planning, and execution, the underlying infrastructure supporting software development must fundamentally adapt. Current state management tools—primarily centralized issue trackers like Jira, Linear, or GitHub Issues—were architected for human latency (seconds to minutes) and browser-based interaction. These legacy systems impose severe friction on AI agents, manifesting as high latency, context window saturation, and a lack of transactional consistency.

This research report provides an exhaustive technical analysis of the emerging class of **Git-Backed Issue Trackers**, designed to serve as the "long-term memory" and coordination layer for AI agents. Specifically, we examine three distinct architectures:

1.  **Grite (NeulLabs):** A repository-local system leveraging Write-Ahead Logs (WAL) and Conflict-Free Replicated Data Types (CRDTs) to serve as a substrate for multi-agent orchestration.
2.  **Git-bug:** A mature, distributed bug tracker storing state as Git objects, representing a bridge between traditional and distributed workflows.
3.  **Beads (Steve Yegge):** An agent-first, hierarchical task manager utilizing a hybrid SQLite/JSONL architecture to optimize for agent ergonomics and context window efficiency.

Our analysis reveals that while **Beads** offers the most immediate utility for single-agent "vibe coding" sessions through its pragmatic design and self-healing capabilities, **Grite** provides the mathematically rigorous foundation required for scalable, concurrent Multi-Agent Systems (MAS). The integration of Grite with the **Brat** harness introduces novel roles (Mayor, Witness, Refinery) that effectively operationalize the theoretical concept of the **Context Lake**—a system class defined by "Decision Coherence."

We conclude by proposing an **"Ultimate Solution" Architecture**: The **Git-Backed Context Lake (GBCL)**. This hybrid architecture fuses the cryptographic integrity and concurrency control of Grite's WAL with the hierarchical planning primitives of Beads and the standardized interface of the Model Context Protocol (MCP). We recommend building upon the **Grite** core to achieve the necessary isolation, auditability, and consistency required for enterprise-grade agent swarms.

## **1. The Paradigm Shift: From Human Latency to Agent Velocity**

### **1.1 The Crisis of "Agent Amnesia"**

The primary bottleneck in deploying autonomous coding agents is not model intelligence, but state persistence. Human developers maintain a complex, persistent mental model of a codebase—its history, architectural constraints, and active tasks. In contrast, current LLM-based agents are inherently stateless entities. Each execution cycle (or "turn") effectively resets the agent's cognition, forcing it to reconstruct its understanding of the world from the provided context window.

This phenomenon, termed **"Agent Amnesia,"** leads to severe operational inefficiencies:

  - **Redundant Computation:** Agents burn valuable inference tokens re-reading and re-analyzing the same project files to determine "what to do next."
  - **Loss of Strategic Intent:** While agents are proficient at tactical code generation, they struggle to maintain strategic alignment over long time horizons. Without a persistent external memory, the high-level goal (e.g., "Refactor the auth module") is often lost amidst the noise of low-level execution (e.g., "Fixing a typo in login.ts").
  - **Context Window Saturation:** As project complexity increases, the sheer volume of file history, diffs, and conversation logs exceeds the token limits of even state-of-the-art models (e.g., 200k–1M tokens). Furthermore, "stuffing" the context window with irrelevant data degrades reasoning performance due to the "Lost in the Middle" effect, where models fail to retrieve instructions buried in the center of a large prompt.

### **1.2 The Failure of Markdown Plans**

The current industry standard for mitigating amnesia is the usage of ad-hoc markdown files (e.g., TODO.md, PLAN.md). While human-readable, this approach is algorithmically flawed for autonomous systems.

  - **Unstructured Data:** Markdown is text, not data. Agents must perform probabilistic inference to parse a todo list, introducing a non-zero error rate in understanding task status.
  - **Concurrency Conflicts:** In a multi-agent environment—for instance, where a "Architect" agent plans work and a "Coder" agent executes it—simultaneous edits to a PLAN.md file result in standard Git merge conflicts. Agents lack the semantic understanding to resolve these conflicts, often resulting in corrupted plans or halted pipelines.
  - **Lack of Queryability:** An agent cannot efficiently execute a query such as "Find all high-priority tasks blocking the database migration." Instead, it must read the entire file and simulate a query engine, consuming excessive "GPU cycles" on administrative overhead rather than productive work.

### **1.3 The Need for "Decision Coherence"**

Recent theoretical advancements in agent system architecture have introduced the **Decision Coherence Law**. This law posits that for agents to take irreversible actions (such as deleting a production database or merging code), they must operate against a coherent representation of reality at the exact moment the decision is made.

Traditional centralized issue trackers fail this test because of the **Action-Observation Gap**. If an agent queries Jira, receives a task, and then spends 5 minutes generating code, the state of the world may have changed (e.g., the dependency was deprecated). A **Context Lake** system class is required to bridge this gap, ensuring:

1.  **Transactional Consistency:** All agents see a unified view of locks, tasks, and code state.
2.  **Semantic Operations:** The storage layer must support native operations to interpret intent (e.g., "Is this task semantically equivalent to that one?").
3.  **Operational Envelopes:** Strict bounds on data staleness to prevent "ghost" tasks from being executed.

The three tools analyzed in this report—Grite, git-bug, and Beads—represent the first generation of attempts to implement this Context Lake using Git as the distributed storage substrate.

## **2. Theoretical Foundations of Agent Memory Architectures**

Before dissecting the specific tools, we must establish the theoretical constraints governing distributed agent memory.

### **2.1 The CAP Theorem for Agent Swarms**

The CAP theorem states that a distributed data store can effectively provide only two of three guarantees: Consistency, Availability, and Partition Tolerance.

  - **Traditional Trackers (Jira):** Prioritize **Consistency** and **Availability** but sacrifice Partition Tolerance (they require a central server).
  - **Git-Backed Systems:** Inherently prioritize **Partition Tolerance** (offline work). The trade-off then becomes Consistency vs. Availability.

<!-- end list -->

  - **Availability-Biased (Git-bug, Beads):** Agents can always write to their local store (High Availability), but divergent states may occur, leading to merge conflicts (Low Consistency).
  - **Consistency-Biased (Grite):** Through the use of CRDTs, the system guarantees strong eventual consistency, ensuring that all agents converge on the same mathematical state without human intervention.

### **2.2 The Context Lake vs. Data Lake**

A **Data Lake** stores raw data for retrospective human analysis. A **Context Lake** stores structured context for real-time agent execution.

  - **Immutability:** Agent actions must be recorded in an immutable ledger (Write-Ahead Log) to allow for "time-travel debugging." If a swarm destroys a codebase, we must be able to replay the event log to identify the exact decision sequence that led to the failure.
  - **Semantic Indexing:** Simple text search is insufficient. A Context Lake must support vector embeddings to allow agents to retrieve context by *meaning* rather than *keyword* (e.g., retrieving "authentication logic" when working on "login bugs").

### **2.3 The "Agent-Ergonomic" Interface**

Software tools have historically been designed for human ergonomics (GUIs, drag-and-drop). Agent ergonomics prioritize:

  - **Structured I/O:** JSON or Protobuf interfaces over HTML/Text.
  - **Deterministic APIs:** Tools that behave predictably to reduce the "hallucination surface."
  - **Introspection:** The ability for the tool to describe its own capabilities (e.g., via GraphQL or MCP) so the agent can self-discover features without training.

## **3. Detailed Technical Analysis: Grite (NeulLabs)**

**Grite** represents the most architecturally ambitious attempt to solve the agent coordination problem. Developed by NeulLabs, it is not merely a tool but a "substrate" for the **Brat** multi-agent harness. Its design philosophy centers on rigorous correctness, isolation, and auditability.

### **3.1 Architecture: The Write-Ahead Log (WAL)**

Grite fundamentally reimagines Git usage. Instead of storing database files (like SQLite binaries or JSON dumps) in the working tree, Grite treats Git as a transport layer for an immutable event log.

  - **Storage Mechanism:** All state is stored in refs/grite/wal. This custom reference namespace is orthogonal to the standard refs/heads/\* used for code branches. This separation is critical: it means agent coordination data travels *with* the repo but does not *pollute* the code history.
  - **Event Sourcing:** The system does not store the "current state" of an issue. Instead, it stores a sequence of events (e.g., IssueCreated, TitleChanged, CommentAdded). The current state is a projection derived by replaying these events. This architecture ensures cryptographic auditability; every state change is signed and hashed.
  - **Clean Working Tree:** A core tenet of Grite is "No Working Tree Pollution." It never writes tracked files to the user's directory (except AGENTS.md). This prevents the "meta-data" of the project from interfering with build systems, linters, or file watchers.

### **3.2 Conflict Resolution: The Power of CRDTs**

In a swarm where 50 agents might be operating simultaneously, manual merge conflict resolution is impossible. Grite solves this using **Conflict-Free Replicated Data Types (CRDTs)**.

  - **Deterministic Convergence:** CRDTs allow multiple agents to modify the same state concurrently without locking. For example, if Agent A changes a task title and Agent B adds a dependency to that task, the CRDT ensures both changes are preserved and merged mathematically.
  - **Implementation:** Grite likely employs Operation-based CRDTs, broadcasting operations via the Git protocol. This ensures that the system satisfies the **Strong Eventual Consistency** model required for autonomous swarms.

### **3.3 The "Brat" Harness: Orchestration Roles**

Grite is the foundation for **Brat**, a harness that defines specific roles for agents to mimic a human engineering team.

  - **The Mayor:** The high-level orchestrator. The Mayor analyzes the codebase, breaks down strategic goals into tactical "Convoys" (groups of tasks), and assigns them. It maintains the "Big Picture" context.
  - **The Witness:** A supervisor process that spawns and monitors "Polecats" (worker agents). The Witness handles the "physical" execution of agents, ensuring they don't hang or exceed resource limits.
  - **The Refinery:** A crucial role for Decision Coherence. The Refinery manages the merge queue. When multiple agents submit code, the Refinery orchestrates the integration, running CI checks and resolving code conflicts before they reach the main branch.
  - **The Deacon:** A background "janitor" process that cleans locks, syncs state, and detects orphaned tasks.

### **3.4 Context Awareness: Tree-Sitter Integration**

A unique feature of Grite is its integrated **Context Store**. It utilizes **Tree-sitter**, an incremental parsing library, to extract symbols and call graphs across 10+ languages.

  - **Semantic Linking:** This allows Grite to link tasks not just to file paths, but to specific code symbols (e.g., "This task modifies the AuthService class").
  - **Distributed Sync:** This symbol context is synchronized between agents, ensuring that if Agent A refactors AuthService, Agent B is immediately aware of the semantic change, preventing logical conflicts.

### **3.5 Agent Discoverability: AGENTS.md**

Grite standardizes the "handshake" between the repository and the agent via AGENTS.md. This file acts as a protocol specification, informing any visiting agent:

1.  That this is a Grite-managed repository.
2.  How to invoke the grite CLI tools to query work.
3.  The specific "Constitutional" rules of the project (e.g., "Never modify legacy COBOL files").

## **4. Detailed Technical Analysis: Git-bug**

**Git-bug** is the incumbent distributed bug tracker. Created by Michael Muré, it was designed to decouple issue tracking from centralized forges like GitHub, embedding it directly into the git graph.

### **4.1 Architecture: The Object Graph**

Git-bug uses a graph-based data model stored directly in Git's object database.

  - **The Bug DAG:** Each bug is represented as a Directed Acyclic Graph (DAG) of immutable commits, stored under refs/bugs/\*. This means every bug effectively has its own branch history.
  - **Entities:** It models strict entities (Bugs, Comments, Identities) serialized as Git blobs. This structural rigor prevents the "schema drift" common in JSON-based approaches.
  - **Bridges:** Git-bug's defining feature is its **Bridge Architecture**. It supports bi-directional synchronization with GitHub, GitLab, and Jira. This makes it an ideal "Transitional Architecture" for hybrid teams where humans use the GitHub UI while agents use the git-bug CLI/API.

### **4.2 The GraphQL Interface**

For AI agents, structured data access is paramount. Git-bug exposes a comprehensive **GraphQL API**.

  - **Introspection:** Agents can use GraphQL introspection to "learn" the schema dynamically. This is a powerful capability for generalist agents that haven't been fine-tuned on specific tool APIs.
  - **Precision Fetching:** Agents can request exactly the data they need (e.g., query { bug(id: "123") { title, status, blocking } }), minimizing the payload size and preserving context window tokens.

### **4.3 Limitations for Autonomous Agents**

Despite its maturity, git-bug presents friction for high-velocity agent swarms:

  - **Identity Friction:** Git-bug enforces strict identity management (git bug user create). Ephemeral agents often lack stable identities, requiring complex setup scripts to provision "dummy" users for each session.
  - **Merge Complexity:** While it handles distributed offline work, resolving conflicts in the Bug DAG can be complex. Unlike Grite's CRDTs, git-bug relies on logical merge strategies that may fail in complex divergent scenarios.
  - **Lack of Hierarchy:** The data model is relatively flat (similar to GitHub Issues). It lacks the deep nesting (Epics -\> Stories -\> Tasks) required for complex agent planning.

## **5. Detailed Technical Analysis: Beads (Steve Yegge)**

**Beads** is a reaction to the complexity of distributed systems, prioritizing **Agent Ergonomics** and immediate usability. Created by Steve Yegge, it is designed to be the "shoes" for agents that have been walking barefoot on markdown files.

### **5.1 Architecture: The Hybrid "Mullet"**

Beads employs a pragmatic hybrid architecture: "Business in the front (SQLite), Party in the back (Git JSONL)".

  - **Local SQLite Cache:** For read/write performance and complex querying, Beads interacts with a local SQLite database (.beads/beads.db). This allows agents to write complex SQL queries to find tasks, utilizing their strong SQL generation capabilities.
  - **JSONL Persistence:** For synchronization, the database state is dumped to a .beads/issues.jsonl file. This file is tracked in the main git working tree.
  - **Rationale:** Git handles line-based text files exceptionally well. By storing one issue per line in JSONL, Beads minimizes the probability of merge conflicts compared to monolithic JSON or binary files.

### **5.2 Agent-First Features**

Beads introduces several features specifically designed for the cognitive limitations of LLMs:

  - **Compaction (Memory Decay):** The bd compact command summarizes old, completed tasks into a narrative history. This actively manages the "Token Budget," ensuring the agent retains the *lesson* of past tasks (e.g., "We switched to JWT auth") without retaining the *noise* of the specific steps.
  - **Hierarchical IDs:** Beads supports implicit hierarchy through IDs (e.g., bd-1 is the parent of bd-1.1). This aligns with the "Chain of Thought" prompting technique, allowing agents to decompose complex goals recursively.
  - **Self-Healing:** Recognizing that agents (and humans) make mistakes, Beads includes resilience mechanisms. If the SQLite DB is corrupted, it rebuilds from JSONL. If the JSONL is corrupted by a bad merge, it can traverse the Git history to reconstruct the last valid state.

### **5.3 Critique: The Pollution Trade-off**

The primary architectural drawback of Beads is **Working Tree Pollution**. It requires the .beads/ directory to exist and be tracked in the user's workspace.

  - **CI Triggers:** Changes to tasks are file changes. Without careful .gitignore or CI configuration, an agent updating a task status could trigger a full CI build pipeline, wasting compute resources.
  - **Merge Conflicts:** While JSONL reduces conflicts, it does not eliminate them. If two agents modify the same line (same issue) concurrently, the text merge will fail, requiring human intervention.

## **6. Comparative Analysis: The Trilemma of Agent State**

The following matrix synthesizes the architectural trade-offs, highlighting why no single tool currently offers a perfect solution.

| Feature Category | **Grite (NeulLabs)** | **Git-bug** | **Beads (Steve Yegge)** |
| :-: | :-: | :-: | :-: |
| **Primary Design Target** | **Multi-Agent Orchestration** | **Distributed Collaboration** | **Single-Agent Ergonomics** |
| **Storage Substrate** | Git Refs (refs/grite/wal) | Git Objects (refs/bugs/\*) | Working Tree (.beads/issues.jsonl) |
| **Consistency Model** | **Strong Eventual (CRDT)** | Eventual (Graph Merge) | Weak (Optimistic Text Merge) |
| **Local View** | Sled (Rust Key-Value) | Go Structs / Cache | **SQLite (Relational)** |
| **Query Capability** | Low (CLI filtering) | **High (GraphQL)** | **High (SQL)** |
| **Workspace Hygiene** | **Immaculate** (No pollution) | **Immaculate** | Polluted (.beads/ dir) |
| **Context Optimization** | Low (Raw Event Log) | Medium | **High (Compaction)** |
| **Orchestration** | **Native (Brat Harness)** | None | None |
| **Security** | **Ed25519 Signing** | Bridge Auth | Standard Git Auth |

### **6.1 Analysis of the Matrix**

  - **The Consensus Winner:** **Grite** wins on mathematical correctness. Its usage of CRDTs and an append-only WAL makes it the only viable candidate for large-scale, asynchronous agent swarms where conflict resolution must be automated.
  - **The Usability Winner:** **Beads** wins on agent ergonomics. Its hierarchical data model, Compaction feature, and SQL interface are perfectly tuned to the cognitive strengths and weaknesses of current LLMs.
  - **The Interoperability Winner:** **Git-bug** remains the best choice for mixed teams requiring sync with legacy systems like Jira, serving as a necessary bridge during the transition period.

## **7. The Security Vector: Prompt Injection in State**

A critical, often overlooked aspect of agentic state management is security. Our research identifies **Prompt Injection via Issue Trackers** as a significant emerging threat vector.

### **7.1 The Attack Mechanism**

Attackers can exploit the trust agents place in their "memory" (the issue tracker).

  - **Scenario:** An attacker submits a bug report titled: *"App crashes on startup."*.
  - **Execution:** When the autonomous agent reads this issue to triage it, the malicious instruction is ingested into its context window. Lacking a "Constitutional" filter, the agent executes the instruction.

### **7.2 Vulnerability Assessment**

  - **Beads:** Highly vulnerable. It relies on plain text JSONL. There is no built-in sanitization layer between the file and the agent.
  - **Git-bug:** Vulnerable. While the GraphQL API structures data, the text fields (title/body) are still passed raw to the agent.
  - **Grite:** Moderately secure. Its architecture supports **Signed Events** (Ed25519) , enabling an audit trail. However, it currently lacks a content filtering middleware.

### **7.3 Implication for Architecture**

The "Ultimate Solution" must include a **Input Sanitization Layer** or "Firewall" that sits between the storage and the agent, scanning for and neutralizing adversarial prompt patterns before they reach the agent's cognition.

## **8. Proposed "Ultimate Solution" Architecture: The Git-Backed Context Lake (GBCL)**

To solve the "Agent Amnesia" problem and enable robust "Decision Coherence" for enterprise-scale agent swarms, we propose a hybrid architecture. This solution builds upon the **Grite** substrate (for correctness) but incorporates the high-level planning features of **Beads** (for ergonomics) and the interface standardization of **MCP** (for connectivity).

### **8.1 Architecture Overview**

The GBCL is a layered system designed to be the single source of truth for a synthetic workforce.

#### **Layer 1: The Storage Substrate (Grite +)**

We select **Grite** as the foundation because of its **Write-Ahead Log (WAL)** and **CRDT** implementation.

  - **Justification:** Agents act asynchronously. We cannot rely on file-locking or optimistic text merging in a distributed repo. We need a mathematical guarantee of convergence.
  - **Enhancement:** The WAL must be extended to support **Cryptographic Provenance**. Every event must be signed by the agent's unique identity key, creating an immutable chain of custody for every code change and decision.

#### **Layer 2: The Semantic View (Beads-Style SQLite + Vector)**

While Grite uses Sled (Key-Value), agents think in relations and hierarchies.

  - **Projection:** A background daemon (The "Gardener") watches the Grite WAL and projects the state into a **local SQLite database**.
  - **Schema Enhancement:** This database must implement a schema supporting:

<!-- end list -->

  - **Hierarchical Tasks:** Epics → Stories → Tasks (borrowed from Beads).
  - **Dependency Graph:** A DAG enforcing blocked\_by relationships with cycle detection (from Grite).
  - **Semantic Embeddings:** A new embeddings table using sqlite-vss. Every issue title and description is vectorized upon creation. This allows agents to perform **Hybrid Search** ("Find unblocked tasks related to 'memory leaks'").

#### **Layer 3: The Interface (MCP Native)**

The system must expose a native **Model Context Protocol (MCP)** server, replacing the CLI as the primary interaction point.

  - **Tools:**

<!-- end list -->

  - plan\_epic(goal): Decomposes a high-level goal into a hierarchy of tasks.
  - query\_context(natural\_language\_query): Uses the vector embeddings to retrieve relevant tasks and historical context (RAG).
  - claim\_task(task\_id): Atomically locks a task using Grite's distributed locking mechanism.

<!-- end list -->

  - **Resources:** Exposes context://current\_sprint and context://active\_blockers as read-only resources for the agent.
  - **Sampling:** Implements the MCP **Sampling** capability , allowing the server to proactively ask the agent for clarification if a task description is ambiguous.

#### **Layer 4: The Security & Governance Layer**

A middleware layer—the "Constitutional Guardrail" —intercepts all I/O.

  - **Input Guard:** Scans incoming issue data for prompt injection signatures using a lightweight classifier.
  - **Output Guard:** Verifies that the agent is not creating tasks outside its authorized scope (e.g., a "Frontend Agent" creating tasks to modify the "Billing Database").

## **9. Implementation Recommendation & Roadmap**

### **The Verdict: Build Upon Grite.**

While **Beads** is the most user-friendly tool for individual "vibe coding" today, **Grite** is the correct *architectural* choice for building a robust, future-proof platform for multi-agent systems.

### **Justification:**

1.  **Correctness over Convenience:** It is nearly impossible to bolt CRDTs and transactional consistency onto a JSONL-based system like Beads after the fact. Grite starts with the hard distributed systems problems solved.
2.  **No Pollution:** Enterprise environments require strict separation of code and metadata. Grite's usage of refs/ respects this boundary, whereas Beads' reliance on working tree files is a significant barrier to adoption in regulated environments.
3.  **The "Brat" Ecosystem:** By adopting Grite, you inherit the **Brat** harness. The roles of **Mayor**, **Witness**, and **Refinery** are essential for scaling beyond a single agent. The **Refinery** role, specifically, solves the critical "Merge Queue Chaos" problem that plagues current autonomous workflows.

### **Implementation Roadmap:**

**Phase 1: The Foundation (Fork Grite)**

  - Start with the libgrite-core and libgrite-git Rust crates.
  - Validate the WAL and CRDT implementation. Ensure the AGENTS.md generator is robust and configurable.

**Phase 2: The Semantic Upgrade (Port Beads' Logic)**

  - Replace the Sled-based materialized view with **SQLite**.
  - Port the **Hierarchical Data Model** and **Compaction Logic** from Beads into this new SQL layer. This gives Grite the "brain" of Beads.
  - Implement sqlite-vss for vector search capabilities.

**Phase 3: The Interface Evolution (MCP)**

  - Develop a Rust-based **MCP Server** for Grite.
  - Implement the **"Sampling"** and **"Notifications"** capabilities of MCP to enable proactive agent coordination (e.g., notifying an agent when its blocker is resolved).

**Phase 4: The Safety Layer**

  - Integrate a "Constitutional" middleware to sanitize prompts and enforce role-based access control (RBAC) on the issue tracker.

### **Conclusion**

The transition to agentic development requires us to treat project management not as an administrative burden, but as a distributed systems engineering challenge. By moving state into a **Git-Backed Context Lake**, protected by cryptographic proofs and managed by CRDTs, we enable agents to reason coherently, act autonomously, and remember the "Big Picture." Grite provides the bedrock; Beads provides the blueprint for interaction; the Context Lake is the destination.

#### **Citerade texter**

1. Explore beads library and usage with AMP, https://ampcode.com/threads/T-adc03ba9-db60-49e6-bae9-e5f9749f4312
2. LLM Context Window Limit EXPOSED! Stop Your AI Coding Agent Getting "Lost in the Middle" - YouTube, https://www.youtube.com/watch?v=trwJSJlbEZc
3. Context Length Guide 2025: Master AI Context Windows for Optimal Performance & Results, https://local-ai-zone.github.io/guides/context-length-optimization-ultimate-guide-2025.html
4. Beads - Memory for your Agent and The Best Damn Issue Tracker Your're Not Using, https://ianbull.com/posts/beads/
5. Introducing Beads: A coding agent memory system | by Steve Yegge | Medium, https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a
6. Context Lake: A System Class Defined by Decision Coherence - arXiv, https://arxiv.org/abs/2601.17019 *(unverified future-dated ID — see accuracy caveats)*
7. neul-labs/brat: Multi-agent harness for AI coding tools. Crash-safe state, parallel execution, one CLI. - GitHub, https://github.com/neul-labs/brat
8. Grite — command-line utility in Rust // Lib.rs, https://lib.rs/crates/grite
9. libgrite-git - crates.io: Rust Package Registry, https://crates.io/crates/libgrite-git
10. libgrit-git - Lib.rs, https://lib.rs/crates/libgrit-git
11. libbrat-session - crates.io: Rust Package Registry, https://crates.io/crates/libbrat-session/0.1.0
12. Distributed, offline-first bug tracker embedded in git - GitHub, https://github.com/git-bug/git-bug
13. Open Source Bug Tracking Tools - Software Testing Magazine, https://www.softwaretestingmagazine.com/tools/open-source-bug-tracking-tools/
14. GraphQL API vulnerabilities | Web Security Academy - PortSwigger, https://portswigger.net/web-security/graphql
15. Intro to GraphQL using custom fields in GitHub Projects, https://some-natalie.dev/blog/graphql-intro/
16. Git-bug: Part 2 - Fresh/Brewed, https://freshbrewed.science/2022/12/14/gitbug-part2.html
17. Beads Blows Up - Steve Yegge, https://steve-yegge.medium.com/beads-blows-up-a0a61bb889b4
18. beads/docs/ARCHITECTURE.md at main · steveyegge/beads - GitHub, https://github.com/steveyegge/beads/blob/main/docs/ARCHITECTURE.md
19. steveyegge/beads - A memory upgrade for your coding agent - GitHub, https://github.com/steveyegge/beads
20. The Beads Revolution: How I Built The TODO System That AI Agents Actually Want to Use, https://steve-yegge.medium.com/the-beads-revolution-how-i-built-the-todo-system-that-ai-agents-actually-want-to-use-228a5f9be2a9
21. AI agent security risks: what every developer needs to know, https://www.mintmcp.com/blog/ai-agent-security-risks
22. When AI Remembers Too Much – Persistent Behaviors in Agents' Memory - Unit 42, https://unit42.paloaltonetworks.com/indirect-prompt-injection-poisons-ai-longterm-memory/
23. Sampling - Model Context Protocol (MCP), https://modelcontextprotocol.info/docs/concepts/sampling/ *(see accuracy caveats — may be conflated with Elicitation)*
24. 3 Architectural Principles for Building Reliable AI Agents : r/AI_Agents - Reddit, https://www.reddit.com/r/AI_Agents/comments/1opzt32/3_architectural_principles_for_building_reliable/

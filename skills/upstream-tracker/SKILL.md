---
name: upstream-tracker
description: "Manage upstream issue tracking for this project. Use when the user wants to log a bug or friction point in a vendor package or npm dependency, review open upstream items, resolve a tracked issue, run a trend review, or generate the upstream observations section of a sprint retrospective. Trigger phrases: 'upstream', 'track this', 'vendor issue', 'log this bug', 'review upstream', 'trend review', 'cross-vendor', 'this is a bug in X', or any mention of friction with an external package."
user-invocable: true
allowed-tools:
  - Read
  - Edit
  - Glob
  - Grep
  - Bash
---

# Upstream Tracker

Manage the `UPSTREAM-*.md` files that track bugs, feature requests, and friction
discovered in upstream packages while building this project.

## Tracking Files

### Vendor packages (permanent files)

Vendor packages are declared in `.claude/vendor-registry.json` (if it exists) as
an array of `{prefix, remote, branch}` objects, or as packages listed under
`workspaces` in `package.json`. Each vendor package gets a permanent
`UPSTREAM-<package-name>.md` tracking file that always exists, even when empty.

To discover which packages are vendors, read `.claude/vendor-registry.json` if
it exists, or inspect `package.json` workspaces. If neither is present, ask the
user which packages should be treated as permanent vendor fixtures.

### Non-vendor dependencies (ephemeral files)

Any npm dependency can get an `UPSTREAM-<package>.md` file when you encounter a
bug or limitation worth tracking (e.g., `UPSTREAM-umzeption.md`). Create the
file on first encounter. **Delete the file entirely once all its entries are
resolved** — there's no reason to keep an empty tracking file for a regular
dependency. To discover existing non-vendor files, glob for `UPSTREAM-*.md` and
exclude the known vendor files.

### Shared structure

All upstream files share the same structure:
**Feature Requests** | **Bugs** | **Cross-Vendor Inconsistencies** | **Trend Reviews**

Non-vendor files typically only use **Feature Requests** and **Bugs** sections
(cross-vendor inconsistencies only apply when multiple vendor packages share an
API surface).

## Workflows

Determine which workflow the user needs based on their request. If ambiguous,
default to the most likely workflow based on context.

### 1. Log a new entry

When the user encounters upstream friction — a bug, a missing feature, an
awkward API, or a cross-vendor inconsistency — add it to the correct file.
Infer the details from the current conversation context: what code was being
written, what error occurred, what workaround was needed. The user shouldn't
have to re-explain something that's already visible in the session.

**Steps:**

1. Identify which upstream package is involved from the conversation context
   (the code being discussed, the error encountered, or the workaround applied).
   This can be a vendor package OR a regular npm dependency.
2. If the package is a non-vendor dependency and no `UPSTREAM-<package>.md`
   file exists yet, create it with this template:

   ```markdown
   ## Feature Requests

   _No entries yet._

   ## Bugs

   _No entries yet._
   ```

   Non-vendor files typically omit Cross-Vendor Inconsistencies and Trend
   Reviews sections unless the project uses multiple vendor packages sharing
   an API surface.
3. Classify the entry:
   - **Bug** — unexpected behavior, something that doesn't work as documented
   - **Feature Request** — a missing capability the package should have
   - **Cross-Vendor Inconsistency** — a pattern, convention, or API that one
     vendor package supports but another doesn't, creating friction for the
     consumer. Relevant when multiple vendor packages share an API surface.
4. Read the target `UPSTREAM-*.md` file
5. Compose the entry from the consumer app's perspective (focus on impact, not internals)
6. Add the entry under the correct section heading, using today's date

**Entry format for Feature Requests:**

```
- **Short title** (YYYY-MM-DD) — Description of the desired behavior and why
  it matters for the consuming app. [upstream: <url>]
```

Upstream URL is optional — add if you've filed a feature request upstream.

**Entry format for Bugs:**

```
- **Short title** (YYYY-MM-DD) [blocking|degraded|minor] — What happens, how to
  reproduce, and the expected behavior. [upstream: <url>]
```

Severity tag is optional — use `blocking` (no workaround), `degraded` (workaround
exists but costly), or `minor` (edge case). Upstream URL is optional — add if you
file an issue or PR upstream.

**Entry format for Cross-Vendor Inconsistencies:**

```
- **Short title** (YYYY-MM-DD) — What the sibling package does, what this
  package lacks, and the consumer-side friction it causes.
```

When adding the first entry to a section, replace the `_No entries yet._`
placeholder. Keep entries concise — 1-3 sentences. The title should be
scannable (e.g., "Missing session type export", not "Issue with types").

### 2. Review open items

Summarize the current state of all upstream tracking files (vendor and non-vendor).

**Steps:**

1. Glob for all `UPSTREAM-*.md` files and read them
2. Present a summary grouped by file, showing counts and listing open items
3. Flag anything that looks stale (older than ~3 months with no activity)

**Output format:**

```markdown
## Upstream Status

### <package-name>

- Feature Requests: N open
- Bugs: N open
- [list each with title and date]

### Notes

- [any stale items or observations]
```

If all files are empty, say so and suggest checking whether any known friction
points should be captured.

### 3. Resolve an entry

When an issue has been fixed upstream, simply delete it from the tracking
file. There's no need to keep resolved entries — the version control history
preserves what was tracked and when it was removed.

**Steps:**

1. Read the relevant `UPSTREAM-*.md` file
2. Find the entry (by title or user description)
3. Delete the entry from its section
4. For vendor files: if the section is now empty, restore the `_No entries yet._`
   placeholder
5. For non-vendor files: if the file has no remaining entries, **delete the
   file entirely** (`git rm`)
6. Mention the resolution in your commit message so the git log captures it

### 4. Trend review (quarterly)

Every 4th sprint, perform a cross-cutting analysis of all tracking files.

**Steps:**

1. Glob for all `UPSTREAM-*.md` files and read them
2. Analyze open items for common themes (e.g., recurring type export issues,
   similar API gaps across packages)
3. Look for cross-vendor inconsistencies — patterns or APIs that one vendor
   package supports but its siblings don't yet
4. Evaluate continued validity — are any open items obsolete or already
   addressed? Delete resolved items (they're preserved in git history).
5. Identify items that should be escalated, using these empirical timelines as
   guidance:
   - **Bugs** typically resolve in 5–10 sprints; items beyond 10 sprints warrant
     escalation (upstream PR, issue, or workaround acceptance)
   - **Feature requests** typically take 10–20 sprints; items beyond 20 sprints
     may never land — consider permanent workarounds or forks
   - **Cross-vendor inconsistencies** often resolve only on a next major version;
     track with low urgency unless actively blocking development
6. Add a Trend Review entry to each file's **Trend Reviews** section
7. Delete non-vendor UPSTREAM files that have no remaining open entries
8. Present findings to the user

**Trend Review entry format:**

```
### Review — YYYY-MM-DD (Sprint N)

- **Themes:** [common patterns across open items]
- **Still valid:** [items confirmed as still relevant]
- **Recommend closing:** [items that are obsolete or low-priority]
- **Escalate:** [items past their expected resolution window — include upstream URL if filed]
```

### 5. Sprint retrospective support

Help generate the "Upstream observations" section of a sprint retrospective.

**Steps:**

1. Read all `UPSTREAM-*.md` files to understand current state
2. Review the conversation history for any vendor friction encountered during
   the session — workarounds, type issues, missing APIs, confusing behavior
3. Log any untracked items discovered from context (workflow 1)
4. Draft the upstream observations section for the retro

## Guidelines

- **File naming convention.** Use `UPSTREAM-<package-name>.md` with slashes
  replaced by `--`. Scoped packages drop the `@` prefix: `@voxpelli/typed-utils`
  becomes `UPSTREAM-voxpelli--typed-utils.md`, `umzeption` stays
  `UPSTREAM-umzeption.md`.
- **Infer from context.** When the user asks to log an issue, look at what
  just happened in the session. Extract the relevant details — the package
  involved, the nature of the problem, the workaround used — rather than
  asking the user to repeat themselves.
- **Consumer perspective.** Write entries from the consuming app's point of view.
  Focus on impact: "Can't type-check session objects in route handlers" rather
  than "Missing type export in index.d.ts".
- **Package identification.** When unsure which package an issue belongs to,
  check package documentation or README, or trace the code that triggered the
  friction back to its source. For non-vendor packages, check `package.json`
  dependencies.
- **Cross-vendor awareness.** When logging an entry, consider whether it's
  really a cross-vendor inconsistency. If the project uses multiple vendor
  packages that share an API surface, file the entry against the package that
  needs to change.
- **Keep files lean.** Delete resolved entries — they're preserved in git
  history. No duplicate entries, no stale placeholders mixed with real entries.
  For non-vendor files, delete the file itself when all entries are resolved.

# `resolve` — close a fixed upstream entry

When an issue has been fixed upstream, delete it from the tracking file. Resolved entries
are not kept — git history preserves what was tracked and when it was removed. (There is no
formal `resolve` for the sibling object — a synergy entry "resolves" by removal and
`_No entries yet._` placeholder-restore, done inline; it is not a mode.)

**Steps:**

1. Read the relevant `UPSTREAM-*.md` file.
2. Find the entry (by title or the user's description).
3. Delete the entry from its section.
4. **Vendor files** — if the section is now empty, restore the `_No entries yet._`
   placeholder.
5. **Non-vendor files** — if no entries remain, **delete the file entirely** (`git rm`).
6. Mention the resolution in the commit message so the git log captures it.
7. **Basic Memory annotation** (annotate, never delete). If BM MCP tools are available, call
   `mcp__basic-memory__search_notes` for the package name. If a matching note exists, call
   `mcp__basic-memory__read_note` for its exact content. If it has an `## Upstream Friction`
   section containing the resolved entry, call `mcp__basic-memory__edit_note` with
   `find_replace` to append an annotation to the entry's line — matching against the note's
   exact text (never construct match strings from memory). Entry-type-specific text:

   - **Bugs / Feature Requests:** `_(Resolved YYYY-MM-DD)_`
   - **Upstream Opportunities (merged):** `_(Contributed upstream: <url> merged YYYY-MM-DD)_`
   - **Upstream Opportunities (abandoned):** `_(Closed YYYY-MM-DD — not contributed)_`

   **Annotate, never delete** — only `promote`'s prune pass moves entries to the
   `### Resolved` subsection. If no matching BM entry exists (it was never promoted), or BM
   tools are unavailable, skip silently.

# Basic Memory Friction Integration Reference

Reference material for upstream-tracker workflows 6 and 7. See `SKILL.md` for
the workflow steps.

## Target Type Routing

Search Basic Memory for an existing entity note using the correct directory:

| UPSTREAM target | BM search pattern | BM directory |
|---|---|---|
| npm packages | `npm:<package>` | `npm/` |
| `brew:` tools | `brew:<name>` | `brew/` |
| `cask:` tools | `cask:<name>` | `casks/` |
| `action:` tools | `action:<owner>/<repo>` | `actions/` |
| `docker:` tools | `docker:<image>` | varies |
| `vscode:` tools | `vscode:<ext>` | `vscode/` |
| Non-package repos | search by name | varies — search first |

## Target Section Structure

The `## Upstream Friction` section in Basic Memory entity notes uses the same
structure for all target types:

```markdown
## Upstream Friction

### Bugs

- **Short title** — generalized description, mechanism, workaround. [upstream: <url>]

### Feature Requests

- **Short title** — what's missing and why it matters for consumers.

### Upstream Opportunities

- **Short title** — what was built downstream, merge readiness assessment.
  Source: <generic description> · Merge readiness: direct|needs-redesign|proof-of-concept

### Resolved

- **Short title** — fixed in vX.Y.Z. _(Resolved YYYY-MM-DD)_
```

## Generalization Transform Rules

When promoting UPSTREAM entries to Basic Memory, apply these transforms:

- Strip project-specific file paths; replace with generic descriptions
  ("route handler", "test setup", "migration script")
- Drop dates from active entries (UPSTREAM files track aging; Basic Memory
  notes are evergreen)
- Drop `Severity:` and `Workaround:` structured fields (these are project-local
  triage metadata, not cross-project knowledge)
- Keep: mechanism description, workaround pattern, upstream issue URL
- Keep: `Ownership: shared` if applicable (indicates both sides need changes)

**Additional rules for Upstream Opportunities:**

- Strip project-specific file paths from `Source:` — replace with generic
  descriptions ("middleware adapter", "test helper", "compatibility shim")
- Keep `Merge readiness:` — this is cross-project signal; other projects benefit
  from knowing whether the contribution is `direct` or `needs-redesign`
- Drop `Ownership:` and `Workaround:` (local triage metadata)
- Drop dates (BM notes are evergreen)

## edit\_note Gotchas

These are confirmed gotchas from Basic Memory's `edit_note` tool that the skill
must account for:

- **Never use `append` with `section`** — it appends to END OF FILE, not to the
  end of the named section. This is a confirmed bug/behavior.
- Use `insert_before_section` on `Relations` for initial `## Upstream Friction`
  section creation in notes that don't have one yet.
- Use `find_replace` anchored to include the next `###` heading for uniqueness
  when appending entries to a subsection. For `### Upstream Opportunities`,
  the anchor is `### Resolved` (which always follows). For initial creation of
  `### Upstream Opportunities` when it doesn't exist yet, `find_replace` the
  `### Resolved` heading to prepend
  `### Upstream Opportunities\n\n_No entries yet._\n\n### Resolved`.
- Always call `mcp__basic-memory__read_note` before `mcp__basic-memory__edit_note`
  — construct match text from the note's actual content, never from memory.
- Use `expected_replacements=1` on all `find_replace` calls to prevent accidental
  multi-replacements.
- `replace_section` auto-strips duplicate headers — useful for atomic section
  rewrites but be aware of this behavior.

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

## edit\_note Gotchas

These are confirmed gotchas from Basic Memory's `edit_note` tool that the skill
must account for:

- **Never use `append` with `section`** — it appends to END OF FILE, not to the
  end of the named section. This is a confirmed bug/behavior.
- Use `insert_before_section` on `Relations` for initial `## Upstream Friction`
  section creation in notes that don't have one yet.
- Use `find_replace` anchored to include the next `###` heading for uniqueness
  when appending entries to a subsection.
- Always call `mcp__basic-memory__read_note` before `mcp__basic-memory__edit_note`
  — construct match text from the note's actual content, never from memory.
- Use `expected_replacements=1` on all `find_replace` calls to prevent accidental
  multi-replacements.
- `replace_section` auto-strips duplicate headers — useful for atomic section
  rewrites but be aware of this behavior.

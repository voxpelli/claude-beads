#!/bin/bash
set -euo pipefail

# Emit additionalContext so the main Claude session receives reflection
# instructions with full MCP tool access (unlike prompt hooks which spawn
# a separate Haiku instance with no MCP tool access).
cat <<'EOF'
{"additionalContext": "Context is about to be compacted. Before losing conversation history, review the current conversation for sprint-relevant insights worth preserving:\n\n1. Were any friction points or bugs discovered in upstream packages (npm, brew, GitHub Actions, etc.)? → suggest /upstream-tracker log\n2. Were any technical decisions made that should survive the sprint? → write to Basic Memory\n3. Were any new vendor package issues discovered? → note for /retrospective\n\nFor each finding:\n\n- **Search first**: call `mcp__basic-memory__search_notes` to check if a relevant note already exists\n- **Existing note found**: call `mcp__basic-memory__edit_note` with `find_replace` or `replace_section` to append — never overwrite an existing note with `write_note` (it will fail without `overwrite=True` and risks data loss)\n- **No matching note**: call `mcp__basic-memory__write_note` to create a **new** note\n\nKeep it concise — capture the insight, not the conversation. Use `[decision]`, `[lesson]`, `[gotcha]`, or `[friction]` observation categories.\n\n4. Were any UPSTREAM entries resolved this session? → check if the corresponding Basic Memory note needs annotating (upstream-tracker workflow 3 handles this, or annotate directly via `mcp__basic-memory__edit_note`)\n\nIf nothing worth preserving was discussed, do nothing."}
EOF

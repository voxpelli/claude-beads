#!/bin/bash
set -euo pipefail

# PostToolUse hook for Edit|Write — auto-format this repo's shell scripts with shfmt.
#
# REPO DEV TOOLING, not a shipped plugin hook. It only ever fires when someone edits
# a `.sh` file inside this monorepo, which a consumer of any of these plugins never
# does; it was registered as a plugin hook by accident and so ran in every project
# that installed vp-beads. It is registered in the committed `.claude/settings.json`
# instead, where its scope matches its purpose.
#
# Receives hook input JSON on stdin. Emits nothing — `shfmt -w` rewrites the file in
# place and the agent sees the result on its next read. Advisory, never blocking.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)

[ -n "$FILE_PATH" ] || exit 0

# The repo root. Claude Code exports CLAUDE_PROJECT_DIR for hooks declared in
# settings.json; the positional argument is the override the tests use.
PROJECT_ROOT="${1:-${CLAUDE_PROJECT_DIR:-}}"

[ -n "$PROJECT_ROOT" ] || exit 0

# Any `.sh` under this repo. Deliberately NOT a directory allow-list: the shell
# scripts moved out of `hooks/` into four `plugins/*/hooks/` directories during the
# dissolution, and a list would have silently stopped matching them with nothing
# going red. The root bound is what keeps it off files outside this repo.
case "$FILE_PATH" in
"${PROJECT_ROOT}/"*.sh) ;;
*) exit 0 ;;
esac

if command -v shfmt >/dev/null 2>&1; then
	shfmt -w "$FILE_PATH" 2>/dev/null || true
fi

#!/bin/bash
set -euo pipefail

# PostToolUse hook for Edit|Write — auto-format shell scripts under hooks/.
# Receives hook input JSON on stdin.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" ]]; then
	exit 0
fi

PLUGIN_ROOT="${1:-${CLAUDE_PLUGIN_ROOT:-}}"

# Auto-format shell scripts under hooks/
if [[ -n "$PLUGIN_ROOT" ]] && [[ "$FILE_PATH" == "${PLUGIN_ROOT}/hooks/"*.sh ]]; then
	if command -v shfmt >/dev/null 2>&1; then
		shfmt -w "$FILE_PATH" 2>/dev/null || true
	fi
fi

#!/bin/bash
set -euo pipefail

# PostToolUseFailure hook for Basic Memory tools — classify the failure and
# emit additionalContext with recovery guidance.
#
# Converted from prompt hook (v0.9.2) to command hook (v0.10.0) because prompt
# hooks spawn Haiku without MCP access, making BM error recovery non-functional.

INPUT=$(cat)

# Error text may live in different fields depending on the failure type
ERROR=$(echo "$INPUT" | jq -r '.error // .tool_error // empty' 2>/dev/null || true)

if [[ -z "$ERROR" ]]; then
	exit 0
fi

if echo "$ERROR" | grep -qi "connection refused\|timeout\|unavailable\|ECONNREFUSED"; then
	MSG="[server-unavailable] Basic Memory MCP server is not responding. Check that it is running (\`claude mcp list\`). Upstream-tracker and vendor-sync skip BM operations silently when unavailable."
elif echo "$ERROR" | grep -qi "not found\|does not exist\|no note\|no such"; then
	MSG="[note-not-found] Note identifier was not found. The note may not exist yet — run \`/package-intel\` or \`/tool-intel\` first to create the entity note, then retry."
elif echo "$ERROR" | grep -qi "invalid\|missing.*field\|malformed\|validation error\|too long\|too short"; then
	MSG="[invalid-argument] A required field is missing or malformed. Common cause: note identifier mismatch between search results and edit target."
elif echo "$ERROR" | grep -qi "permission\|denied\|forbidden"; then
	MSG="[permission-error] Access was denied. Check Basic Memory MCP server configuration and file system permissions."
else
	MSG="[unknown-error] Basic Memory tool failed: ${ERROR:0:200}"
fi

jq -n --arg msg "$MSG" \
	'{additionalContext: ($msg + " Do not retry automatically.")}'

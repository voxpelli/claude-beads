#!/bin/bash
# diarie-adopt's SessionStart hook. Emits only on startup/resume/clear, and only
# when a beads credential key is actually committed — an irreversible leak this
# plugin's own subject matter (a repo still carrying `.beads/`) makes possible.
#
# Silent on `source == "compact"`: a leak warning is not sprint state, and repeating
# it mid-session adds nothing the startup emission did not already say.
#
# Emits exactly ONE JSON object, through `emit_context`. Claude Code reads only the
# first object on stdout and silently drops any others, so every collector appends
# to `parts` and the single emitter merges them.
#
# THREE RULES, all load-bearing under `set -euo pipefail` (measured, not assumed):
#
#   1. CALL EVERY COLLECTOR BARE. Bash suppresses errexit for the whole body of a
#      function invoked in a tested context (`f || true`, `if f`, `f && …`). Every
#      `|| fallback` guard below exists because errexit is ON; calling a collector
#      in a tested context turns them into dead ceremony and lets a failed command
#      continue with a garbage value.
#   2. END EVERY BODY WITH `return 0`. A function returns its last command's status,
#      so a body ending in a false test returns 1 — and a bare call to it kills the
#      hook on the nothing-to-report path.
#   3. NO `local` ON A COMMAND SUBSTITUTION. `local x=$(cmd)` makes `local` the
#      command whose status is seen, swallowing `cmd`'s.

set -euo pipefail

# --- The output contract. Every emit site goes through here. ---
#
# Claude Code reads `hookSpecificOutput.additionalContext`, and `hookEventName` is
# required and must name the event this hook is wired to in hooks.json. A BARE
# top-level `{"additionalContext": …}` is silently dropped: it is valid JSON, so it
# takes the JSON branch rather than the "any non-JSON text on stdout is added as
# context" branch, gets parsed as a hook payload, and the unrecognised top-level key
# is discarded. The hook exits 0 either way and nothing anywhere reports the loss.
#
# COPIED, never shared. Each plugin ships its own hook, and a shard that hand-rolls
# its own jq re-opens the same hole.
emit_context() {
	jq -n --arg msg "$1" \
		'{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $msg}}'
}

# Warn only if .beads/.beads-credential-key is committed to git. It is a per-machine
# encryption key (federation peer auth) and must never be pushed.
#
# .beads/interactions.jsonl is NOT flagged: it holds bd field_change events, not
# conversation logs or credentials.
#
# stdout is redirected too — `git ls-files --error-unmatch` prints the matched path
# on success, which would otherwise pollute the JSON emitted below.
check_beads_credential_key() {
	if git ls-files --error-unmatch .beads/.beads-credential-key >/dev/null 2>&1; then
		parts+=("WARNING: .beads/.beads-credential-key is tracked by git. It is a per-machine encryption key and must not be committed. To fix: git rm --cached .beads/.beads-credential-key 2>/dev/null; echo .beads-credential-key >> .beads/.gitignore; git commit --no-gpg-sign -m \"chore: untrack beads credential key\"")
	fi
	return 0
}

# ============================================================================
# Main
# ============================================================================

# SessionStart delivers a JSON event on stdin carrying `source`
# (startup|resume|clear|compact). Read it defensively — empty/absent stdin or parse
# failure falls through to the startup branch. The `cat` is a blocking read bounded
# only by the external hooks.json `timeout`; the hook runner (not a user) closes
# stdin once it has written the event, so `cat` returns immediately in normal
# operation.
input=$(cat 2>/dev/null || echo "")
source=$(printf '%s' "$input" | jq -r '.source // ""' 2>/dev/null || echo "")

[ "$source" != "compact" ] || exit 0

parts=()
check_beads_credential_key

# A repo with nothing committed that should not be gets silence. This hook exists
# for one irreversible mistake; anything else it said would be noise.
[ "${#parts[@]}" -gt 0 ] || exit 0

# Join with a blank line rather than reading `parts[0]`. There is one collector
# today, and a direct index read would silently drop the second one the day it is
# added — a loop over the array cannot.
message=""
for part in "${parts[@]}"; do
	if [ -n "$message" ]; then
		message="${message}

${part}"
	else
		message="$part"
	fi
done

emit_context "$message"

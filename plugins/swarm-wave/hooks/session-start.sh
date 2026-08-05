#!/bin/bash
# swarm-wave's SessionStart hook. Emits only on `source == "compact"`: a wave in
# flight leaves state in ephemeral SWARM-NN.md files, and a compacted session that
# forgets them resumes into a half-run wave.
#
# On startup/resume/clear it stays silent. There is nothing this plugin can say at
# session start that is worth a line in every session.
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

# Recently-touched SWARM/RETRO files (within last hour).
collect_recent_sprint_files() {
	recent_files=""
	while IFS= read -r f; do
		[ -z "$f" ] && continue
		base="${f##*/}"
		if [ -z "$recent_files" ]; then
			recent_files="$base"
		else
			recent_files="${recent_files}, ${base}"
		fi
	done < <(find . -maxdepth 1 \( -name "SWARM-*.md" -o -name "RETRO-*.md" \) -mmin -60 2>/dev/null | sort)

	if [ -n "$recent_files" ]; then
		parts+=("Recently-modified sprint files (last hour): ${recent_files}. Sprint context likely still in flight — review before resuming.")
	fi
	return 0
}

# ============================================================================
# Main
# ============================================================================

# SessionStart delivers a JSON event on stdin carrying `source`
# (startup|resume|clear|compact). Read it defensively — empty/absent stdin or parse
# failure falls through to silence. The `cat` is a blocking read bounded only by the
# external hooks.json `timeout`; the hook runner (not a user) closes stdin once it
# has written the event, so `cat` returns immediately in normal operation.
input=$(cat 2>/dev/null || echo "")
source=$(printf '%s' "$input" | jq -r '.source // ""' 2>/dev/null || echo "")

[ "$source" = "compact" ] || exit 0

parts=()
collect_recent_sprint_files

# Nothing in flight is the common case, and it deserves silence rather than a line
# saying so. Each plugin labels its OWN compaction output rather than one plugin
# owning a shared preamble — a user who installs only swarm-wave still gets framed
# output, and no cross-plugin coordination is needed for a string.
[ "${#parts[@]}" -gt 0 ] || exit 0

message="Context was just compacted — swarm-wave state:"
for part in "${parts[@]}"; do
	message="${message}

${part}"
done

emit_context "$message"

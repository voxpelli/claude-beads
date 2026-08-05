#!/bin/bash
# diarie's SessionStart hook. Branches on the SessionStart `source` field:
#
#   source == "compact"  → recover the in-progress claims a summarised conversation
#       would otherwise forget. This is the ONLY post-compaction slot that injects
#       additionalContext into the resumed, tool-capable agent: PreCompact's
#       additionalContext goes to the non-agentic summarizer and PostCompact is
#       observability-only (neither can inject). See decision vp-beads-48f.
#
#   otherwise (startup/resume/clear) → the TRACKER PRIME: what is ready, what is
#       blocked, what is still claimed. Without it a session begins blind to the
#       backlog.
#
# Emits exactly ONE JSON object, through `emit_context`. Claude Code reads only the
# first object on stdout and silently drops any others, so every collector appends
# to `parts` and the single emitter merges them.
#
# Silent when there is no tracker. Hooks are exempt from the silent-skip rule
# (CLAUDE.md `### Files-availability convention`) — this is orientation plumbing,
# not a user-facing workflow step.
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
#      command whose status is seen, swallowing `cmd`'s. The `|| rc=$?` idioms below
#      depend on that status.

set -euo pipefail

# --- The output contract. Both emit sites go through here. ---
#
# Claude Code reads `hookSpecificOutput.additionalContext`, and `hookEventName` is
# required and must name the event this hook is wired to in hooks.json. A BARE
# top-level `{"additionalContext": …}` is silently dropped: it is valid JSON, so it
# takes the JSON branch rather than the "any non-JSON text on stdout is added as
# context" branch, gets parsed as a hook payload, and the unrecognised top-level key
# is discarded. The hook exits 0 either way and nothing anywhere reports the loss.
#
# COPIED, never shared. This plugin ships two hooks under two different events, so
# the event name is the one field a copy gets wrong silently — `check-hooks.mjs`
# compares it against hooks.json for exactly that reason.
emit_context() {
	jq -n --arg msg "$1" \
		'{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $msg}}'
}

# --- Resolve the `diarie` tracker CLI. ---
#
# diarie is an external dependency: it resolves on PATH (a global install, or npm's
# node_modules/.bin under `npm run`) or from the consuming project's own
# node_modules/.bin. There is no vendored rung, so the hook needs no plugin root.
#
# Callers MUST pass --root "$PWD". `.diarie/` is COMMITTED, so a plugin release ships
# the plugin's own backlog inside the marketplace cache; a diarie invoked from the
# plugin that fell back to walking up from cwd would report OUR tasks as the user's.
# The CLI errors (ENOSTORE) rather than inventing an empty backlog, but the right
# root is still ours to supply.
#
# Emits the full `ready` invocation prefix, not just a binary name: the installed CLI
# takes `ready` as a SUBCOMMAND, and returning a bare binary name would leave each
# caller to append it — a place to get it wrong.
diarie_ready_cmd() {
	if command -v diarie >/dev/null 2>&1; then
		echo "diarie ready"
	elif [ -x "$PWD/node_modules/.bin/diarie" ]; then
		echo "$PWD/node_modules/.bin/diarie ready"
	fi
}

# ============================================================================
# Compaction-recovery collectors (source == "compact")
# ============================================================================

collect_in_progress_claims() {
	# `--strict`, and the STATUS CAPTURED SEPARATELY. Both matter.
	#
	# The `--filter` output is a pinned ARRAY, so it has nowhere to carry a `warnings`
	# key — the exit code is the only channel this path has. Without `--strict` a row
	# the loader THREW AWAY (a typo'd `status:`) simply vanishes, and a compacted
	# session silently forgets a live claim.
	#
	# `|| in_progress_rc=$?` IS LOAD-BEARING under `set -euo pipefail`. A bare
	# `x=$(cmd)` whose command exits non-zero ABORTS THE WHOLE HOOK — and `--strict`
	# exits 2 by design the moment the store drops a row, so a first draft of this
	# turned a hook that quietly lost a claim into one that emitted NOTHING AT ALL,
	# precisely when the store was broken. `cmd || rc=$?` keeps errexit happy while
	# still capturing both the stdout and the status.
	#
	# And NOT `|| echo ""`: command substitution captures stdout and then APPENDS the
	# fallback, yielding a JSON stream. `jq -r 'length'` over a stream returns TWO
	# numbers. Capture the status instead of papering over it.
	in_progress_json=""
	in_progress_rc=0
	_ready=$(diarie_ready_cmd)
	if [ -n "$_ready" ]; then
		# shellcheck disable=SC2086
		in_progress_json=$($_ready --filter in_progress --strict --json --root "$PWD" 2>/dev/null) || in_progress_rc=$?
	fi

	# 1 = InputError (ENOSTORE/EUSAGE) — stdout holds an error OBJECT, not an array.
	# Never slice it. This branch is NOT gated on the store existing, unlike the
	# startup prime below, so 1 is reachable.
	if [ "$in_progress_rc" -eq 1 ]; then
		in_progress_json=""
	fi

	if [ -n "$in_progress_json" ] && [ "$in_progress_json" != "[]" ]; then
		summary=$(printf '%s' "$in_progress_json" | jq -r '.[0:5][] | "  \(.id) \(.title)"' 2>/dev/null || echo "")
		if [ -n "$summary" ]; then
			# shellcheck disable=SC2016
			parts+=("In-progress tracker task(s):
${summary}

Read the task row in \`.diarie/tasks/\` to recover full context for any claim above.")
		fi
	fi

	# 2 = ResultError: it ran, and the answer is no. The loader threw a row away, so
	# the list above is INCOMPLETE — say so. Silence here is how a live claim gets
	# forgotten.
	if [ "$in_progress_rc" -eq 2 ]; then
		# shellcheck disable=SC2016
		parts+=("⚠ The task store is NOT SOUND — a malformed field, an unreadable file, or a dependency cycle. Any claims listed above may be INCOMPLETE. Run \`diarie validate\`.")
	fi
	return 0
}

# ============================================================================
# Startup / resume / clear collectors
# ============================================================================

# What is ready, what is blocked, what is still claimed.
tracker_prime() {
	# Two reads, ~0.2s total against a 5s timeout: the queue (counts AND titles) and
	# the in-progress claims. `diarie stats` is not enough — it returns counts without
	# titles. Ids come back namespaced as `<slug>/<id>`; strip the slug for display.
	#
	# Gate on the STORE, not just the reader. The canonical predicate (CLAUDE.md
	# `### Files-availability convention`) is a `.diarie/tasks/tasks-*.yml` AND a
	# runnable reader — gating on the reader alone made the prime announce
	# "Tracker: 0 ready · 0 blocked" in a repo with no tracker at all. That is not a
	# silent skip, it is a confident false report, which is worse.
	tracker_cmd=""
	if compgen -G ".diarie/tasks/tasks-*.yml" >/dev/null 2>&1; then
		tracker_cmd=$(diarie_ready_cmd)
	fi

	if [ -n "$tracker_cmd" ]; then
		# shellcheck disable=SC2086
		queue_json=$($tracker_cmd --json --root "$PWD" 2>/dev/null || echo "")
		if [ -n "$queue_json" ]; then
			# NO `|| echo "[]"`. It never replaced the output — command substitution
			# captures stdout and then APPENDS the fallback, so a failing call yielded a
			# JSON *stream*. Branch on the status instead.
			# shellcheck disable=SC2086
			if ! claims_json=$($tracker_cmd --filter in_progress --json --root "$PWD" 2>/dev/null); then
				# InputError (ENOSTORE/EUSAGE): stdout holds an error OBJECT. Discard it.
				claims_json="[]"
			fi
			[ -n "$claims_json" ] || claims_json="[]"

			# Ask whether `.ready` EXISTS — never `.ready | length` alone. An ENOSTORE
			# payload has no `.ready`, and `null | length` is **0**: a number, which sails
			# straight through the numeric guard below and prints a confident
			# "Tracker: 0 ready · 0 blocked". That is the fictional empty backlog this
			# whole contract exists to kill, reconstructed by the hook out of an error
			# message. (`jq -e` does NOT save you here — 0 is not falsy.)
			n_ready=$(printf '%s' "$queue_json" | jq -r 'if type == "object" and has("ready") then (.ready | length) else empty end' 2>/dev/null || echo "")
			n_blocked=$(printf '%s' "$queue_json" | jq -r '[.blocked[]? | select((.children | length) == 0)] | length' 2>/dev/null || echo "0")
			n_epics=$(printf '%s' "$queue_json" | jq -r '[.blocked[]? | select((.children | length) > 0)] | length' 2>/dev/null || echo "0")
			n_attn=$(printf '%s' "$queue_json" | jq -r '.needsAttention | length' 2>/dev/null || echo "0")
			# `type == "array"` for the same reason `has("ready")` guards n_ready: `length`
			# on an error OBJECT returns its KEY COUNT — a number, which sails through the
			# numeric guard and prints a confident, fictional claim count.
			n_claimed=$(printf '%s' "$claims_json" | jq -r 'if type == "array" then length else 0 end' 2>/dev/null || echo "0")

			# THE ROWS THE LOADER THREW AWAY. `queue_json` is the PARTITION path, which
			# carries `warnings` in its payload — so the prime can see a dropped row
			# without a second invocation.
			n_warn=$(printf '%s' "$queue_json" | jq -r 'if type == "object" then (.warnings // [] | length) else 0 end' 2>/dev/null || echo "0")

			# A non-numeric n_ready means the reader failed or emitted something
			# unexpected — stay silent rather than print a broken line.
			if [ -n "$n_ready" ] && [ "$n_ready" -eq "$n_ready" ] 2>/dev/null; then
				# "blocked" counts DEP-blocked rows only. An epic is blocked by its own open
				# children — that is an epic in flight, the healthy state of a container, and
				# reporting it as a blockage makes a working sprint read as a stalled one.
				tracker_summary="Tracker: ${n_ready} ready · ${n_blocked} blocked · ${n_claimed} in progress"
				if [ "$n_epics" -gt 0 ] 2>/dev/null; then
					tracker_summary="${tracker_summary} · ${n_epics} epic(s) in flight"
				fi
				if [ "$n_attn" -gt 0 ] 2>/dev/null; then
					tracker_summary="${tracker_summary} · ${n_attn} needs attention"
				fi

				# A LOADER COMPLAINT MAY MAKE EVERY COUNT ABOVE A LIE, so it belongs on the
				# same line as the numbers. Note the careful wording: this counts WARNINGS,
				# not dropped rows, and they are not the same. One row with three bad fields
				# yields three warnings, and only a bad `status` (or an unreadable file)
				# actually REMOVES rows from the counts — a bad `priority` is coerced to
				# `medium` and the row still appears everywhere. Saying "N rows DROPPED"
				# would overstate the count AND misstate the consequence. A guard that lies
				# in the reassuring direction and a guard that cries wolf both lie.
				if [ "$n_warn" -gt 0 ] 2>/dev/null; then
					tracker_summary="${tracker_summary} · ⚠ ${n_warn} loader complaint(s) — counts above may be INCOMPLETE; run \`diarie validate\`"
				fi

				# `ready` already sorts by priority, so the first rows are the ones worth
				# naming. `priority` and `title` are OPTIONAL in the schema, so an unvalidated
				# store would render "T-1 (null)". Default them the way `ready` already
				# defaults priority for sorting.
				next_ready=$(printf '%s' "$queue_json" | jq -r '[.ready[0:3][] | "\(.id | sub("^.*/"; "")) (\(.priority // "medium"))"] | join(" · ")' 2>/dev/null || echo "")
				if [ -n "$next_ready" ]; then
					tracker_summary="${tracker_summary}
  next ready: ${next_ready}"
				fi

				claims=$(printf '%s' "$claims_json" | jq -r '.[0:3][] | "    \(.id | sub("^.*/"; "")) \(.title // "(untitled)")"' 2>/dev/null || echo "")
				if [ -n "$claims" ]; then
					tracker_summary="${tracker_summary}
  in progress:
${claims}"
				fi

				# shellcheck disable=SC2016
				tracker_summary="${tracker_summary}

Find work with \`diarie ready\`; claim by setting \`status: in_progress\` in \`.diarie/tasks/\`."
				parts+=("$tracker_summary")
			fi
		fi
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

parts=()

if [ "$source" = "compact" ]; then
	collect_in_progress_claims

	# Nothing claimed is the common case, and it deserves silence. Each plugin labels
	# its OWN compaction output rather than one plugin owning a shared preamble — a
	# user who installs only diarie still gets framed output.
	[ "${#parts[@]}" -gt 0 ] || exit 0

	message="Context was just compacted — tracker state:"
	for part in "${parts[@]}"; do
		message="${message}

${part}"
	done
	emit_context "$message"
	exit 0
fi

tracker_prime

# Exit silently if there is no tracker to report on.
[ "${#parts[@]}" -gt 0 ] || exit 0

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

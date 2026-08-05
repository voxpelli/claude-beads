#!/bin/bash
# ledger's SessionStart hook. Branches on the SessionStart `source` field:
#
#   source == "compact"  → name the open UPSTREAM tracking files and nudge for
#       un-captured friction. This is the ONLY post-compaction slot that injects
#       additionalContext into the resumed, tool-capable agent: PreCompact's
#       additionalContext goes to the non-agentic summarizer and PostCompact is
#       observability-only (neither can inject). See decision vp-beads-48f.
#
#   otherwise (startup/resume/clear) → warn about tracked private overlays (an
#       irreversible leak) and nudge dormant repos whose ledger has gone unread.
#
# Emits exactly ONE JSON object, through `emit_context`. Claude Code reads only the
# first object on stdout and silently drops any others, so every collector appends
# to `parts` and the single emitter merges them.
#
# Empty-state contract: the compact branch always emits (the capture nudge is
# unconditional); the startup branch emits nothing if no conditions are met.
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
#      command whose status is seen, swallowing `cmd`'s. The `|| rc=$?` idioms depend
#      on that status.

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
# COPIED, never shared. Each plugin ships its own hook, and a shard that hand-rolls
# its own jq re-opens the same hole.
emit_context() {
	jq -n --arg msg "$1" \
		'{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $msg}}'
}

# ============================================================================
# Compaction-recovery collectors (source == "compact")
# ============================================================================

# Open UPSTREAM packages.
collect_open_upstream_files() {
	upstream_pkgs=""
	while IFS= read -r f; do
		[ -z "$f" ] && continue
		base="${f##*/}"
		pkg="${base#UPSTREAM-}"
		pkg="${pkg%.md}"
		if [ -z "$upstream_pkgs" ]; then
			upstream_pkgs="$pkg"
		else
			upstream_pkgs="${upstream_pkgs}, ${pkg}"
		fi
	done < <(find . -maxdepth 1 -name "UPSTREAM-*.md" 2>/dev/null | sort)

	if [ -n "$upstream_pkgs" ]; then
		# shellcheck disable=SC2016
		parts+=("Open UPSTREAM tracking files: ${upstream_pkgs}. \`/ledger review\` inspects entries; otherwise read the files directly.")
	fi
	return 0
}

# Capture nudge. Post-compaction the agent works from the summary and has tool
# access, so this is a short actionable nudge rather than a multi-step script.
collect_capture_nudge() {
	# shellcheck disable=SC2016
	parts+=("If the compacted conversation produced un-captured sprint insights — upstream friction, technical decisions, vendor issues, resolved UPSTREAM entries, or cross-project extraction opportunities — capture them now, via \`/ledger log\` (or \`/ledger resolve\` for a fixed entry), or straight into the UPSTREAM/SYNERGY files, or Basic Memory (search first, then edit/write). Keep it concise: capture the insight, not the conversation.")
	return 0
}

# ============================================================================
# Startup / resume / clear collectors
# ============================================================================

# Private SYNERGY overlays (PRIVATE-SYNERGY-<sibling>.md) are gitignored and hold
# content deliberately kept out of the public repo — committing one is an
# irreversible leak. Warn if any is tracked. Same for the synergy local override
# registry, which holds private-sibling registrations (names, relationships of
# proprietary partners).
check_private_overlays() {
	tracked_private=$(git ls-files 'PRIVATE-SYNERGY-*.md' 2>/dev/null | tr '\n' ' ') || tracked_private=""
	tracked_private="${tracked_private% }"
	if [ -n "$tracked_private" ]; then
		parts+=("WARNING: private SYNERGY overlay file(s) tracked by git: ${tracked_private}. These PRIVATE-SYNERGY-*.md overlays are gitignored private content and must not be committed (irreversible leak). To fix: git rm --cached ${tracked_private}; git commit --no-gpg-sign -m \"chore: untrack private overlay\"")
	fi
	if git ls-files --error-unmatch .claude/synergy-registry.local.json >/dev/null 2>&1; then
		parts+=("WARNING: .claude/synergy-registry.local.json is tracked by git. It holds private-sibling registrations (names of proprietary partners) and must not be committed (irreversible leak). To fix: git rm --cached .claude/synergy-registry.local.json; git commit --no-gpg-sign -m \"chore: untrack synergy local registry\"")
	fi
	return 0
}

# Surface unreviewed UPSTREAM/SYNERGY entries in low-activity repos.
check_dormancy() {
	upstream_count=$(find . -maxdepth 1 -name "UPSTREAM-*.md" 2>/dev/null | wc -l | tr -d ' ') || upstream_count=0
	synergy_count=$(find . -maxdepth 1 -name "SYNERGY-*.md" 2>/dev/null | wc -l | tr -d ' ') || synergy_count=0

	if [ "$upstream_count" -gt 0 ] || [ "$synergy_count" -gt 0 ]; then
		# A repo we CANNOT measure is not a dormant one. Collapsing a failed
		# `git rev-list` to 0 made the failure to measure into the strongest possible
		# evidence for the very claim it failed to support — outside a git repo, or on
		# an unborn HEAD, the nudge fired every time. A genuine 0 (a repo with commits,
		# none in 90 days) still exits 0 and still counts.
		recent=$(git rev-list --count --since="90 days ago" HEAD 2>/dev/null) || recent=""
		[ -n "$recent" ] || return 0
		if [ "$recent" -le 4 ]; then
			if [ "$upstream_count" -gt 0 ] && [ "$synergy_count" -gt 0 ]; then
				# shellcheck disable=SC2016
				parts+=("Low-activity repo: ${upstream_count} UPSTREAM and ${synergy_count} SYNERGY tracking file(s). Entries and extraction candidates in dormant repos can stay trapped locally for months. \`/ledger review\` or \`/ledger promote\` surfaces them and advances ready candidates.")
			elif [ "$upstream_count" -gt 0 ]; then
				# shellcheck disable=SC2016
				parts+=("Low-activity repo with ${upstream_count} UPSTREAM tracking file(s). Entries in dormant repos can stay trapped locally for months. \`/ledger review\` or \`/ledger promote\` makes that friction discoverable from other projects.")
			else
				# shellcheck disable=SC2016
				parts+=("Low-activity repo with ${synergy_count} SYNERGY tracking file(s). Extraction candidates in dormant repos can stay unacted on for months. \`/ledger review\` advances ready candidates.")
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
	collect_open_upstream_files
	collect_capture_nudge

	# Each plugin labels its OWN compaction output rather than one plugin owning a
	# shared preamble — a user who installs only ledger still gets framed output, and
	# no cross-plugin coordination is needed for a string.
	#
	# The two emitters are deliberately NOT unified: this one seeds `message` with the
	# preamble, the startup one seeds it empty and only inserts a separator BETWEEN
	# parts. Merging them is where an off-by-one newline hides.
	message="Context was just compacted — ledger state:"
	for part in "${parts[@]}"; do
		message="${message}

${part}"
	done
	emit_context "$message"
	exit 0
fi

check_private_overlays
check_dormancy

# Exit silently if nothing to report.
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

#!/bin/bash
# Session-start hook. Branches on the SessionStart `source` field:
#
#   source == "compact"  → emit a sprint-state recovery snapshot + a capture
#       nudge. This is the ONLY post-compaction slot that injects
#       additionalContext into the resumed, tool-capable agent: PreCompact's
#       additionalContext goes to the non-agentic summarizer and PostCompact is
#       observability-only (neither can inject). See decision vp-beads-48f.
#       Replaces the retired precompact.sh (reflect) and post-compact.sh
#       (recover) hooks.
#
#   otherwise (startup/resume/clear) → sensitive-file warning, dormancy nudge,
#       Dependabot alert summary, trend-review reminder.
#
# Emits exactly ONE JSON object with all content merged into additionalContext.
# Prior versions emitted multiple separate objects; Claude Code reads only the
# first and silently drops the rest.
#
# Empty-state contract: the compact branch always emits (recovery preamble +
# capture nudge); the startup branch emits nothing if no conditions are met.

set -euo pipefail

# SessionStart delivers a JSON event on stdin carrying `source`
# (startup|resume|clear|compact). Read it defensively — empty/absent stdin or
# parse failure falls through to the startup branch. The `cat` is a blocking
# read bounded only by the external hooks.json `timeout: 5`; the hook runner
# (not a user) closes stdin once it has written the event, so `cat` returns
# immediately in normal operation.
input=$(cat 2>/dev/null || echo "")
source=$(printf '%s' "$input" | jq -r '.source // ""' 2>/dev/null || echo "")

# Accumulate message parts in an array; join with double newline before emitting.
parts=()

# ============================================================================
# Compaction-recovery branch (source == "compact")
# ============================================================================
if [ "$source" = "compact" ]; then
	# --- Open UPSTREAM packages ---
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
		parts+=("Open UPSTREAM tracking files: ${upstream_pkgs}. Use \`/upstream-tracker\` workflow 2 (Review open) to inspect entries.")
	fi

	# --- Recently-touched SWARM/RETRO files (within last hour) ---
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

	# --- In-progress bd claim (hooks are exempt from the silent-skip rule:
	# this is recovery plumbing, not a user-facing workflow step) ---
	if command -v bd >/dev/null 2>&1; then
		in_progress_json=$(bd list --status=in_progress --json 2>/dev/null || echo "")
		if [ -n "$in_progress_json" ] && [ "$in_progress_json" != "[]" ]; then
			summary=$(printf '%s' "$in_progress_json" | jq -r '.[0:5][] | "  \(.id) \(.title)"' 2>/dev/null || echo "")
			if [ -n "$summary" ]; then
				# shellcheck disable=SC2016
				parts+=("In-progress bd issue(s):
${summary}

Use \`bd show <id>\` to recover full context for any claim above.")
			fi
		fi
	fi

	# --- Capture nudge (folds the retired precompact.sh reflection prompt,
	# adapted to post-compaction: the agent now works from the summary and has
	# tool access, so this is a short actionable nudge, not a 6-step script) ---
	# shellcheck disable=SC2016
	parts+=("If the compacted conversation produced un-captured sprint insights — upstream friction, technical decisions, vendor issues, resolved UPSTREAM entries, or cross-project extraction opportunities — capture them now via \`/upstream-tracker\`, \`/synergy-tracker\`, or Basic Memory (search first, then edit/write). Keep it concise: capture the insight, not the conversation.")

	# Prepend a recovery preamble so Claude knows why this context arrived.
	preamble="Context was just compacted. Sprint-state recovery snapshot:"
	message="$preamble"
	for part in "${parts[@]}"; do
		message="${message}

${part}"
	done
	jq -n --arg msg "$message" '{"additionalContext": $msg}'
	exit 0
fi

# ============================================================================
# Startup / resume / clear branch
# ============================================================================

# --- Sensitive-file git-tracking check ---
# Warn only if .beads/.beads-credential-key is committed to git. It is a
# per-machine encryption key (federation peer auth) and must never be pushed.
#
# .beads/interactions.jsonl is NOT flagged: this repo intentionally tracks it
# as the agent audit trail (see README "beads and Dolt configuration"). It
# holds bd field_change events, not conversation logs or credentials.
#
# stdout is redirected too — `git ls-files --error-unmatch` prints the matched
# path on success, which would otherwise pollute the JSON emitted below.
if git ls-files --error-unmatch .beads/.beads-credential-key >/dev/null 2>&1; then
	parts+=("WARNING: .beads/.beads-credential-key is tracked by git. It is a per-machine encryption key and must not be committed. To fix: git rm --cached .beads/.beads-credential-key 2>/dev/null; echo .beads-credential-key >> .beads/.gitignore; git commit --no-gpg-sign -m \"chore: untrack beads credential key\"")
fi

# Private SYNERGY overlays (PRIVATE-SYNERGY-<sibling>.md) are gitignored and
# hold content deliberately kept out of the public repo — committing one is an
# irreversible leak. Warn if any is tracked.
tracked_private=$(git ls-files 'PRIVATE-SYNERGY-*.md' 2>/dev/null | tr '\n' ' ') || tracked_private=""
tracked_private="${tracked_private% }"
if [ -n "$tracked_private" ]; then
	parts+=("WARNING: private SYNERGY overlay file(s) tracked by git: ${tracked_private}. These PRIVATE-SYNERGY-*.md overlays are gitignored private content and must not be committed (irreversible leak). To fix: git rm --cached ${tracked_private}; git commit --no-gpg-sign -m \"chore: untrack private overlay\"")
fi
# The synergy local override registry holds private-sibling registrations
# (names, relationships of proprietary partners). Committing it leaks those
# names — warn if it is tracked.
if git ls-files --error-unmatch .claude/synergy-registry.local.json >/dev/null 2>&1; then
	parts+=("WARNING: .claude/synergy-registry.local.json is tracked by git. It holds private-sibling registrations (names of proprietary partners) and must not be committed (irreversible leak). To fix: git rm --cached .claude/synergy-registry.local.json; git commit --no-gpg-sign -m \"chore: untrack synergy local registry\"")
fi
# --- end sensitive-file check ---

# --- Dormancy nudge ---
# Surface unreviewed UPSTREAM/SYNERGY entries in low-activity repos.
# Runs before the retro-count section so repos with no RETRO files still get nudged.
upstream_count=$(find . -maxdepth 1 -name "UPSTREAM-*.md" 2>/dev/null | wc -l | tr -d ' ') || upstream_count=0
synergy_count=$(find . -maxdepth 1 -name "SYNERGY-*.md" 2>/dev/null | wc -l | tr -d ' ') || synergy_count=0

if [ "$upstream_count" -gt 0 ] || [ "$synergy_count" -gt 0 ]; then
	recent=$(git rev-list --count --since="90 days ago" HEAD 2>/dev/null || echo "0")
	if [ "$recent" -le 4 ]; then
		if [ "$upstream_count" -gt 0 ] && [ "$synergy_count" -gt 0 ]; then
			# shellcheck disable=SC2016
			parts+=("Low-activity repo: ${upstream_count} UPSTREAM and ${synergy_count} SYNERGY tracking file(s). Entries and extraction candidates in dormant repos can stay trapped locally for months. Consider \`/upstream-tracker\` workflow 2 (review-open) or workflow 6 (promote-to-BM), and \`/synergy-tracker\` to review and advance ready candidates.")
		elif [ "$upstream_count" -gt 0 ]; then
			# shellcheck disable=SC2016
			parts+=("Low-activity repo with ${upstream_count} UPSTREAM tracking file(s). Entries in dormant repos can stay trapped locally for months. Consider \`/upstream-tracker\` workflow 2 (review-open) or workflow 6 (promote-to-BM) so friction is discoverable from other projects.")
		else
			# shellcheck disable=SC2016
			parts+=("Low-activity repo with ${synergy_count} SYNERGY tracking file(s). Extraction candidates in dormant repos can stay unacted on for months. Consider \`/synergy-tracker\` to review and advance ready candidates.")
		fi
	fi
fi
# --- end dormancy nudge ---

# --- Dependabot alert summary ---
# Surface open Dependabot alerts at session start so vulnerabilities are
# visible before `git push` prints them in remote output. Silent on every
# failure path: missing gh, no GitHub remote, rate-limited, no alerts, or
# any non-zero exit from gh. Never blocks the hook.
if command -v gh >/dev/null 2>&1; then
	remote_url=$(git remote get-url origin 2>/dev/null || echo "")
	# Parse owner/repo from common GitHub remote URL forms:
	#   git@github.com:owner/repo.git
	#   https://github.com/owner/repo.git
	#   https://github.com/owner/repo
	owner_repo=""
	case "$remote_url" in
	git@github.com:*)
		owner_repo="${remote_url#git@github.com:}"
		owner_repo="${owner_repo%.git}"
		;;
	https://github.com/* | http://github.com/*)
		owner_repo="${remote_url#*github.com/}"
		owner_repo="${owner_repo%.git}"
		;;
	esac
	if [ -n "$owner_repo" ]; then
		# Validate shape: must look like "owner/repo" with no extra slashes.
		case "$owner_repo" in
		*/*/*) owner_repo="" ;;
		*/*) ;;
		*) owner_repo="" ;;
		esac
	fi
	if [ -n "$owner_repo" ]; then
		# per_page=100 caps the count at 100 — repos with more open alerts
		# will read as "100" rather than the true total. Acceptable for a
		# session-start nudge (not an authoritative audit).
		alert_count=$(gh api "repos/${owner_repo}/dependabot/alerts?state=open&per_page=100" --jq 'length' 2>/dev/null || echo "")
		# Only emit when count is a positive integer.
		case "$alert_count" in
		'' | *[!0-9]*) ;;
		0) ;;
		*)
			parts+=("[security] ${alert_count} open Dependabot alert(s) — https://github.com/${owner_repo}/security/dependabot")
			;;
		esac
	fi
fi
# --- end Dependabot alert summary ---

# --- Trend-review reminder ---
# RETRO files are gitignored; find correctly ignores .gitignore so the count
# reflects files on disk.
count=$(find . -maxdepth 1 -name "RETRO-*.md" 2>/dev/null | wc -l | tr -d ' ') || count=0

if [ "$count" -gt 0 ]; then
	mod=$((count % 4))
	if [ "$mod" -eq 3 ]; then
		next=$((count + 1))
		parts+=("Trend-review reminder: Sprint ${next} will be a trend-review sprint. When you close this sprint, /retrospective will also run the full UPSTREAM trend review, beads health audit (bd stats, stale issues, blocked issues), and Basic Memory graph audit (schema validation, drift detection, duplicate audit). Plan for a longer retrospective session.")
	elif [ "$mod" -eq 0 ]; then
		current=$((count + 1))
		parts+=("Trend-review sprint: Sprint ${current} is a trend-review sprint. Running /retrospective will perform the full UPSTREAM trend review, beads health audit, and Basic Memory graph audit in addition to the standard retrospective. Plan for a longer session.")
	fi
fi
# --- end trend-review reminder ---

# Exit silently if nothing to report
if [ "${#parts[@]}" -eq 0 ]; then
	exit 0
fi

# Join parts with double newline and emit as a single JSON object.
# jq --arg handles all quoting and escaping.
message=""
for part in "${parts[@]}"; do
	if [ -n "$message" ]; then
		message="${message}

${part}"
	else
		message="$part"
	fi
done

jq -n --arg msg "$message" '{"additionalContext": $msg}'

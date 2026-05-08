#!/bin/bash
# Session-start hook: sensitive-file warning, trend-review reminder,
# dormancy nudge for UPSTREAM and SYNERGY files.
#
# Emits exactly ONE JSON object with all content merged into additionalContext.
# Prior versions emitted multiple separate objects; Claude Code reads only the
# first and silently drops the rest.
#
# Empty-state contract: if no conditions are met, emit nothing and exit 0.

set -euo pipefail

# Accumulate message parts in an array; join with double newline before emitting.
parts=()

# --- Sensitive-file git-tracking check ---
# Warn if .beads/interactions.jsonl or .beads/.beads-credential-key are
# committed to git. Both are local-only runtime data that should not be
# pushed to remote repos.
tracked_sensitive=""
if git ls-files --error-unmatch .beads/interactions.jsonl 2>/dev/null; then
	tracked_sensitive=".beads/interactions.jsonl"
fi
if git ls-files --error-unmatch .beads/.beads-credential-key 2>/dev/null; then
	if [ -n "$tracked_sensitive" ]; then
		tracked_sensitive="$tracked_sensitive and .beads/.beads-credential-key"
	else
		tracked_sensitive=".beads/.beads-credential-key"
	fi
fi
if [ -n "$tracked_sensitive" ]; then
	parts+=("WARNING: ${tracked_sensitive} is tracked by git. These files contain local-only runtime data (conversation logs or credentials) and must not be committed. To fix: git rm --cached .beads/interactions.jsonl .beads/.beads-credential-key 2>/dev/null; echo interactions.jsonl >> .beads/.gitignore; echo .beads-credential-key >> .beads/.gitignore; git commit --no-gpg-sign -m \"chore: untrack beads sensitive files\"")
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

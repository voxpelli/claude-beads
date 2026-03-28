#!/bin/bash
# Session-start hook: sensitive-file warning, trend-review reminder,
# dormancy nudge for UPSTREAM and SYNERGY files.

set -euo pipefail

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
	printf '{"systemMessage": "WARNING: %s is tracked by git. These files contain local-only runtime data (conversation logs or credentials) and must not be committed. To fix: git rm --cached .beads/interactions.jsonl .beads/.beads-credential-key 2>/dev/null; echo interactions.jsonl >> .beads/.gitignore; echo .beads-credential-key >> .beads/.gitignore; git commit --no-gpg-sign -m \"chore: untrack beads sensitive files\""}\n' "$tracked_sensitive"
fi
# --- end sensitive-file check ---

# Dormancy nudge: surface unreviewed UPSTREAM/SYNERGY entries in low-activity repos
# Runs BEFORE the retro-count section so new repos (no RETRO files) still get nudged.
upstream_count=$(find . -maxdepth 1 -name "UPSTREAM-*.md" 2>/dev/null | wc -l | tr -d ' ') || upstream_count=0
synergy_count=$(find . -maxdepth 1 -name "SYNERGY-*.md" 2>/dev/null | wc -l | tr -d ' ') || synergy_count=0
if [ "$upstream_count" -gt 0 ] || [ "$synergy_count" -gt 0 ]; then
	recent=$(git rev-list --count --since="90 days ago" HEAD 2>/dev/null || echo "0")
	if [ "$recent" -le 4 ]; then
		if [ "$upstream_count" -gt 0 ]; then
			# Backticks are literal markdown, not command substitution
			# shellcheck disable=SC2016
			printf '{"systemMessage": "Low-activity repo with %s UPSTREAM tracking file(s). Entries in dormant repos can stay trapped locally for months. Consider `/upstream-tracker` W2 (review) or W6 (promote to BM) so friction is discoverable from other projects."}\n' "$upstream_count"
		fi
		if [ "$synergy_count" -gt 0 ]; then
			# Backticks are literal markdown, not command substitution
			# shellcheck disable=SC2016
			printf '{"systemMessage": "Low-activity repo with %s SYNERGY tracking file(s). Extraction candidates in dormant repos can stay unacted on for months. Consider `/synergy-tracker` to review and advance ready candidates."}\n' "$synergy_count"
		fi
	fi
fi

# Trend-review reminder (depends on retro count)
count=$(find . -maxdepth 1 -name "RETRO-*.md" 2>/dev/null | wc -l | tr -d ' ') || count=0

# No retros yet — Sprint 1, no trend-review reminder needed
if [ "$count" -eq 0 ]; then
	exit 0
fi

mod=$((count % 4))

if [ "$mod" -eq 3 ]; then
	next=$((count + 1))
	printf '{"systemMessage": "Trend-review reminder: Sprint %d will be a trend-review sprint. When you close this sprint, /retrospective will also run the full UPSTREAM trend review, beads health audit (bd stats, stale issues, blocked issues), and Basic Memory graph audit (schema validation, drift detection, duplicate audit). Plan for a longer retrospective session."}\n' "$next"
elif [ "$mod" -eq 0 ]; then
	current=$((count + 1))
	printf '{"systemMessage": "Trend-review sprint: Sprint %d is a trend-review sprint. Running /retrospective will perform the full UPSTREAM trend review, beads health audit, and Basic Memory graph audit in addition to the standard retrospective. Plan for a longer session."}\n' "$current"
fi

exit 0

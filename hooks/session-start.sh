#!/bin/bash
# Trend-review reminder: emits a systemMessage when the next or current sprint
# is a trend-review sprint (every 4th sprint). Silent otherwise.

set -euo pipefail

count=$(find . -maxdepth 1 -name "RETRO-*.md" 2>/dev/null | wc -l | tr -d ' ')

# No retros yet — Sprint 1, no reminder needed
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

# Dormancy nudge: surface unreviewed UPSTREAM entries in low-activity repos
upstream_count=$(find . -maxdepth 1 -name "UPSTREAM-*.md" 2>/dev/null | wc -l | tr -d ' ')
if [ "$upstream_count" -gt 0 ]; then
	recent=$(git rev-list --count --since="90 days ago" HEAD 2>/dev/null || echo "0")
	if [ "$recent" -le 4 ]; then
		# Backticks are literal markdown, not command substitution
		# shellcheck disable=SC2016
		printf '{"systemMessage": "Low-activity repo with %s UPSTREAM tracking file(s). Entries in dormant repos can stay trapped locally for months. Consider `/upstream-tracker` W2 (review) or W6 (promote to BM) so friction is discoverable from other projects."}\n' "$upstream_count"
	fi
fi

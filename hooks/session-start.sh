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

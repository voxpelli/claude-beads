#!/bin/bash
# Post-compact hook: re-prime sprint context after Claude Code compacts.
#
# Counterpart to precompact.sh — PreCompact flushes insights to memory,
# PostCompact primes sprint-state recovery so workflows survive the
# compaction boundary. Surfaces:
#
#   1. Currently-open UPSTREAM packages (from UPSTREAM-*.md filenames)
#   2. Recently-touched SWARM/RETRO files (modified within last hour)
#   3. Any in-progress bd claim (bd list --status in_progress)
#
# Emits exactly ONE JSON object with all content merged into additionalContext.
# Multi-object output gets silently dropped — see session-start.sh comment.
#
# Empty-state contract: if nothing to surface, emit nothing and exit 0.

set -euo pipefail

# Accumulate message parts in an array; join with double newline before emitting.
parts=()

# --- Open UPSTREAM packages ---
upstream_pkgs=""
while IFS= read -r f; do
	# Skip empty lines from no-match find output.
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
# --- end UPSTREAM packages ---

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
# --- end recent SWARM/RETRO ---

# --- In-progress bd claim ---
if command -v bd >/dev/null 2>&1; then
	# bd list --status=in_progress --json emits a JSON array of issue
	# objects (each with id + title fields). JSON mode avoids the text
	# mode's "No issues found." filler line, ANSI status glyphs, priority
	# markers, and "Status:" legend footer — all of which would otherwise
	# pollute the recovery preamble. Silent on any failure (no .beads
	# directory, bd error, etc.) — never blocks the hook.
	in_progress_json=$(bd list --status=in_progress --json 2>/dev/null || echo "")
	# Treat empty output and the literal "[]" as "nothing in progress".
	# jq's `.[0:5][]` slicing keeps the payload bounded without piping to
	# `head` (which can SIGPIPE 141 under `set -euo pipefail`).
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
# --- end in-progress bd claim ---

# Exit silently if nothing to report
if [ "${#parts[@]}" -eq 0 ]; then
	exit 0
fi

# Prepend a recovery preamble so Claude knows why this context arrived.
preamble="Context was just compacted. Sprint-state recovery snapshot:"

# Join parts with double newline and emit as a single JSON object.
# jq --arg handles all quoting and escaping.
message="$preamble"
for part in "${parts[@]}"; do
	message="${message}

${part}"
done

jq -n --arg msg "$message" '{"additionalContext": $msg}'

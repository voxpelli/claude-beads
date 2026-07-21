#!/usr/bin/env bash
# Descriptive audit of a Claude Code file-based memory directory.
#
# Usage: audit-memory.sh <memory-dir>
#
# Surfaces FACTS for judgment; it does NOT enforce any rule. Validity of
# frontmatter types, line limits, and staleness is decided by the caller against
# the memory contract in the ACTIVE system prompt — which is authoritative and
# may differ from any value hardcoded here. This script only reports what is,
# so the consolidation skill can compare it to the live contract.
set -euo pipefail

dir="${1:-}"
if [ -z "$dir" ]; then
	echo "ERROR: pass the memory directory path (from the active system prompt's memory block)" >&2
	exit 2
fi
if [ ! -d "$dir" ]; then
	echo "NO_DIR: $dir does not exist — memory has not been populated yet"
	exit 0
fi

index="$dir/MEMORY.md"

echo "=== MEMORY DIR: $dir ==="
echo

# --- Index (MEMORY.md) ---
if [ -f "$index" ]; then
	echo "INDEX: MEMORY.md present, $(wc -l <"$index" | tr -d ' ') lines"
else
	echo "INDEX: MEMORY.md MISSING"
fi
echo

# --- Per-file frontmatter (descriptive) ---
echo "=== TOPIC FILES ==="
shopt -s nullglob
for f in "$dir"/*.md; do
	base="$(basename "$f")"
	[ "$base" = "MEMORY.md" ] && continue

	# Extract the frontmatter block (between the first two '---' lines).
	fm="$(awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit} f{print}' "$f")"
	name="$(printf '%s\n' "$fm" | grep -m1 '^name:' | sed 's/^name:[[:space:]]*//' || true)"
	desc="$(printf '%s\n' "$fm" | grep -m1 '^description:' | sed 's/^description:[[:space:]]*//' || true)"
	# type may be flat (`type:`) or nested (`  type:` under metadata). Anchor to
	# start-of-line-after-indent so it does NOT match a `node_type:` line, which
	# the memory subsystem injects alongside the declared type.
	typ="$(printf '%s\n' "$fm" | grep -m1 '^[[:space:]]*type:' | sed 's/^[[:space:]]*type:[[:space:]]*//' || true)"
	# Subsystem-injected fields to PRESERVE on rewrite (do not strip these).
	injected="$(printf '%s\n' "$fm" | grep -oE '(node_type|originSessionId|permalink):' | tr '\n' ',' | sed 's/,$//' || true)"

	flags=""
	[ -z "$fm" ] && flags="$flags NO_FRONTMATTER"
	[ -z "$name" ] && flags="$flags no-name"
	[ -z "$desc" ] && flags="$flags no-description"
	[ -z "$typ" ] && flags="$flags no-type"
	# Session-dated filename (YYYY-MM-DD or YYYYMMDD) — a rename candidate.
	echo "$base" | grep -Eq '[0-9]{4}-?[0-9]{2}-?[0-9]{2}' && flags="$flags SESSION-DATED"
	# Not linked from the index.
	if [ -f "$index" ] && ! grep -q "($base)" "$index"; then
		flags="$flags NOT-IN-INDEX"
	fi

	printf -- '- %s\n    type=%s  name=%s  injected=[%s]\n    lines=%s%s\n' \
		"$base" "${typ:-∅}" "${name:-∅}" "${injected:-none}" \
		"$(wc -l <"$f" | tr -d ' ')" \
		"${flags:+  flags:$flags}"
done
echo

# --- Index integrity: entries pointing at missing files ---
if [ -f "$index" ]; then
	echo "=== DANGLING INDEX ENTRIES (link target missing) ==="
	grep -oE '\(([A-Za-z0-9._-]+\.md)\)' "$index" | tr -d '()' | while read -r target; do
		[ -f "$dir/$target" ] || echo "- MISSING: $target"
	done
	echo
fi

echo "=== END AUDIT (compare every value above to the live system-prompt contract) ==="

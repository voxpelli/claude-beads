#!/usr/bin/env bash
# Tests for audit-memory.sh — vp-dream's only executable artifact.
#
# This exists because the script shipped with the house signature defect: a no-match `grep`
# under `set -euo pipefail` KILLED it mid-report, after a section header and before END AUDIT,
# so a link-free MEMORY.md produced a truncated report that reads exactly like a complete one
# with a clean section. shellcheck passed it the whole time — it has no check for that class
# (filed: UPSTREAM-brew--shellcheck.md).
#
# The assertions below are ordered by the direction a wrong answer is DANGEROUS in: the empty
# input must produce a COMPLETE report that says nothing was checked, because the failure mode
# is a false all-clear, not a crash.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
audit="$here/../skills/vp-dream/scripts/audit-memory.sh"

passed=0
failed=0

# $1 = name, $2 = condition already evaluated to "yes"/"no"
assert() {
	if [ "$2" = "yes" ]; then
		passed=$((passed + 1))
		echo "  ✓ $1"
	else
		failed=$((failed + 1))
		echo "  ✗ $1" >&2
	fi
}

yn() { if [ "$1" -eq 0 ]; then echo yes; else echo no; fi; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mem="$tmp/mem"
mkdir -p "$mem"
printf -- '---\nname: a\ndescription: d\nmetadata:\n  type: project\n---\n\nbody\n' >"$mem/a.md"

echo "audit-memory.sh"

# --- 1. THE REGRESSION. A link-free index is the empty-input case, and the script must survive
#        it and SAY so. Before the fix this exited 1 having printed the DANGLING header and
#        nothing after it.
printf '# Memory\n\nProse with no links at all.\n' >"$mem/MEMORY.md"
out="$(bash "$audit" "$mem" 2>&1)"
code=$?
assert "link-free MEMORY.md: exits 0 (it used to die mid-report)" "$(yn "$code")"
echo "$out" | grep -q "END AUDIT"
assert "link-free MEMORY.md: report is COMPLETE, reaching END AUDIT" "$(yn $?)"
# The fix must not be a bare `|| true` — an empty section under the header is the same false
# all-clear, just quieter. It has to name which of the three states this is.
echo "$out" | grep -q "NOT CHECKED"
assert "link-free MEMORY.md: says NOTHING WAS CHECKED, not an empty section" "$(yn $?)"
echo "$out" | grep -q "NOT a clean bill of health"
assert "link-free MEMORY.md: explicitly refuses to read as a clean result" "$(yn $?)"

# --- 2. Links that all resolve must be DISTINGUISHABLE from case 1. If these two print the
#        same thing, the fix has not actually separated "checked, fine" from "not checked".
printf '# Memory\n\n- [A](a.md) — hook\n' >"$mem/MEMORY.md"
resolved="$(bash "$audit" "$mem" 2>&1)"
echo "$resolved" | grep -q "all 1 link target(s) resolve"
assert "resolving links: reports the COUNT it verified" "$(yn $?)"
echo "$resolved" | grep -q "NOT CHECKED"
assert "resolving links: does NOT reuse the not-checked wording" "$(yn $((1 - $?)))"

# --- 3. A real dangling entry must still be named. The point of the whole section.
printf '# Memory\n\n- [A](a.md) — hook\n- [Ghost](ghost.md) — gone\n' >"$mem/MEMORY.md"
dangling="$(bash "$audit" "$mem" 2>&1)"
echo "$dangling" | grep -q "MISSING: ghost.md"
assert "a dangling link is still NAMED" "$(yn $?)"
echo "$dangling" | grep -q "END AUDIT"
assert "a dangling link does not truncate the report either" "$(yn $?)"

# --- 4. Controls, so the suite cannot pass by the script being inert.
bash "$audit" "$tmp/nonexistent" >/dev/null 2>&1
assert "a missing memory dir exits 0 (populated-yet-absent is not an error)" "$(yn $?)"
bash "$audit" >/dev/null 2>&1
assert "no argument exits 2 (a usage error IS an error)" "$(yn $((${?} == 2 ? 0 : 1)))"

echo
echo "$((passed + failed)) tests: $passed passed, $failed failed"
[ "$failed" -eq 0 ]

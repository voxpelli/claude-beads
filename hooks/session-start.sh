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
#   otherwise (startup/resume/clear) → sensitive-file warning, TRACKER PRIME
#       (ready/blocked/in-progress — the orientation the external beads plugin's
#       `bd prime` used to give), dormancy nudge, Dependabot alert summary,
#       trend-review reminder.
#
# Emits exactly ONE JSON object with all content merged into additionalContext.
# Prior versions emitted multiple separate objects; Claude Code reads only the
# first and silently drops the rest.
#
# Empty-state contract: the compact branch always emits (recovery preamble +
# capture nudge); the startup branch emits nothing if no conditions are met.

set -euo pipefail

# --- Resolve the `diarie` tracker CLI. ---
#
# diarie is an EXTERNAL dependency now: it resolves on PATH (a global install, or npm's
# node_modules/.bin under `npm run`) or from the consuming project's own node_modules/.bin.
# There is no vendored in-repo / in-plugin cli.js rung anymore, so the hook needs no plugin root.
#
# Callers MUST pass --root "$PWD". `.diarie/` is COMMITTED, so a plugin release ships
# vp-beads' own backlog inside the marketplace cache; a diarie invoked from the plugin
# that fell back to walking up from cwd would report OUR tasks as the user's. The CLI
# now errors (ENOSTORE) rather than inventing an empty backlog, but the right root is
# still ours to supply.
# Emits the full `ready` invocation prefix, not just a binary name: the installed CLI takes
# `ready` as a SUBCOMMAND. Returning a bare binary name would leave each caller to append it,
# which is a place to get it wrong. diarie is an EXTERNAL dependency now (no vendored in-repo /
# in-plugin cli.js), so it resolves on PATH or from the project's node_modules/.bin.
diarie_ready_cmd() {
	if command -v diarie >/dev/null 2>&1; then
		echo "diarie ready"
	elif [ -x "$PWD/node_modules/.bin/diarie" ]; then
		echo "$PWD/node_modules/.bin/diarie ready"
	fi
}

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

	# --- In-progress tracker claim (hooks are exempt from the silent-skip rule:
	# this is recovery plumbing, not a user-facing workflow step). Prefer the
	# `diarie` CLI when installed; else the in-repo reader. Both emit a JSON
	# array of task rows for `--filter in_progress`. ---
	# `--strict`, and the STATUS CAPTURED SEPARATELY. Both matter.
	#
	# The `--filter` output is a pinned ARRAY, so it has nowhere to carry a `warnings` key — the exit
	# code is the only channel this path has. Without `--strict` a row the loader THREW AWAY (a typo'd
	# `status:`) simply vanishes, and a compacted session silently forgets a live claim. That is the
	# defect this whole tool exists to abolish, on the path it runs at every session start.
	#
	# And the old `|| echo ""` had to go. It does NOT replace the output on failure: command
	# substitution captures stdout and then APPENDS the fallback, yielding a JSON stream. `jq` happily
	# slices both documents — but `jq -r 'length'` over a stream returns TWO numbers, and the startup
	# branch interpolates that straight into its `Tracker:` line. Capture the status instead of
	# papering over it.
	# `|| in_progress_rc=$?` IS LOAD-BEARING — this file runs under `set -euo pipefail` (line 24).
	#
	# A bare `x=$(cmd)` whose command exits non-zero ABORTS THE WHOLE HOOK under errexit. And
	# `--strict` exits 2 by design the moment the store drops a row — so the first draft of this fix
	# turned a hook that quietly lost a claim into one that emitted NOTHING AT ALL (no recovery
	# snapshot, no capture nudge) and exited 2, precisely when the store was broken. Strictly worse
	# than the bug it was fixing, and invisible to every test: I only saw it by RUNNING THE HOOK.
	#
	# `cmd || rc=$?` keeps errexit happy (a failing command on the left of `||` is not an error) while
	# still capturing both the stdout and the status.
	in_progress_json=""
	in_progress_rc=0
	_ready=$(diarie_ready_cmd)
	if [ -n "$_ready" ]; then
		# shellcheck disable=SC2086
		in_progress_json=$($_ready --filter in_progress --strict --json --root "$PWD" 2>/dev/null) || in_progress_rc=$?
	fi

	# 1 = InputError (ENOSTORE/EUSAGE) — stdout holds an error OBJECT, not an array. Never slice it.
	# This branch is NOT gated on the store existing, unlike the startup prime below, so 1 is reachable.
	#
	# It is also what a genuine CRASH exits with, and that used to matter: an unparseable tasks file
	# threw out of `loadTasks`, reached cli.js's "unexpected error" branch, exited 1 — and this branch
	# then blanked the payload, silently discarding the live claims that were in the OTHER, healthy
	# files. `loadTasks` now warns-and-skips a bad file, so it comes back as exit 2 with a warning
	# instead. The comment above stated an invariant the code did not have; the fix was in store.js,
	# not here.
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

	# 2 = ResultError: it ran, and the answer is no. The loader threw a row away, so the list above is
	# INCOMPLETE — say so. Silence here is how a live claim gets forgotten.
	if [ "$in_progress_rc" -eq 2 ]; then
		# shellcheck disable=SC2016
		parts+=("⚠ The task store is NOT SOUND — a malformed field, an unreadable file, or a dependency cycle. Any claims listed above may be INCOMPLETE. Run \`diarie validate\`.")
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
# .beads/interactions.jsonl is NOT flagged: it holds bd field_change events,
# not conversation logs or credentials. (bd is retired; this check remains because
# the credential key is still on disk in repos that have not run /deintegrate-beads.)
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

# --- Tracker prime ---
# The orientation the external beads plugin's `bd prime` used to inject at
# SessionStart, minus its ~1.5k-token bloat: what is ready, what is blocked, what
# is still claimed. Without this the startup branch emits no tracker state at all,
# so every session begins blind to the backlog.
#
# Hooks are exempt from the silent-skip rule (this is orientation plumbing, not a
# user-facing workflow step) — silent when there is no tracker. Prefer the `diarie`
# CLI when installed; else the in-repo reader.
#
# Two reads, ~0.2s total against a 5s timeout: the queue (counts AND titles) and
# the in-progress claims. `--stats` is not enough — it returns counts without
# titles. Ids come back namespaced as `<slug>/<id>`; strip the slug for display.
# Gate on the STORE, not just the reader. The canonical predicate (CLAUDE.md
# `### Files-availability convention`) is a `.diarie/tasks/tasks-*.yml` AND a runnable
# reader — gating on the reader alone made the prime announce
# "Tracker: 0 ready · 0 blocked" in a repo with no tracker at all. That is not a silent
# skip, it is a confident false report, which is worse.
tracker_cmd=""
if compgen -G ".diarie/tasks/tasks-*.yml" >/dev/null 2>&1; then
	tracker_cmd=$(diarie_ready_cmd)
fi

if [ -n "$tracker_cmd" ]; then
	# shellcheck disable=SC2086
	queue_json=$($tracker_cmd --json --root "$PWD" 2>/dev/null || echo "")
	if [ -n "$queue_json" ]; then
		# NO `|| echo "[]"`. It never replaced the output — command substitution captures stdout and
		# then APPENDS the fallback, so a failing call yielded a JSON *stream* (`[…]` then `[]`). The
		# array slices below survive that (jq reads streams), but `jq -r 'length'` returns TWO numbers,
		# and `n_claimed` is interpolated straight into the `Tracker:` line — a malformed, multi-line
		# report from a guard meant to prevent exactly that. Branch on the status instead.
		# shellcheck disable=SC2086
		if ! claims_json=$($tracker_cmd --filter in_progress --json --root "$PWD" 2>/dev/null); then
			# InputError (ENOSTORE/EUSAGE): stdout holds an error OBJECT, not an array. Discard it.
			claims_json="[]"
		fi
		[ -n "$claims_json" ] || claims_json="[]"

		# Ask whether `.ready` EXISTS — never `.ready | length` alone. An ENOSTORE payload has
		# no `.ready`, and `null | length` is **0**: a number, which sails straight through the
		# numeric guard below and prints a confident "Tracker: 0 ready · 0 blocked". That is the
		# fictional empty backlog this entire contract exists to kill, reconstructed by the hook
		# out of an error message. (`jq -e` does NOT save you here — 0 is not falsy.) `has()`
		# emits nothing for an error payload, so n_ready stays empty and the guard stays quiet.
		n_ready=$(printf '%s' "$queue_json" | jq -r 'if type == "object" and has("ready") then (.ready | length) else empty end' 2>/dev/null || echo "")
		n_blocked=$(printf '%s' "$queue_json" | jq -r '[.blocked[]? | select((.children | length) == 0)] | length' 2>/dev/null || echo "0")
		n_epics=$(printf '%s' "$queue_json" | jq -r '[.blocked[]? | select((.children | length) > 0)] | length' 2>/dev/null || echo "0")
		n_attn=$(printf '%s' "$queue_json" | jq -r '.needsAttention | length' 2>/dev/null || echo "0")
		# `type == "array"` for the same reason `has("ready")` guards n_ready above: `length` on an
		# error OBJECT returns its KEY COUNT — a number, which sails through the numeric guard and
		# prints a confident, fictional claim count.
		n_claimed=$(printf '%s' "$claims_json" | jq -r 'if type == "array" then length else 0 end' 2>/dev/null || echo "0")

		# THE ROWS THE LOADER THREW AWAY. `queue_json` is the PARTITION path, which carries `warnings`
		# in its payload — so the prime can see a dropped row without a second invocation. It could
		# not before: a task claimed with a typo'd `status:` vanished from every count above, and the
		# session was told a confident, complete-looking story with a live claim missing from it.
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

			# A LOADER COMPLAINT MAY MAKE EVERY COUNT ABOVE A LIE, so it belongs on the same line as the
			# numbers. Note the careful wording: this counts WARNINGS, not dropped rows, and they are not
			# the same. One row with three bad fields yields three warnings, and only a bad `status` (or
			# an unreadable file) actually REMOVES rows from the counts — a bad `priority` is coerced to
			# `medium` and the row still appears everywhere. Saying "N rows DROPPED" would overstate the
			# count AND misstate the consequence. A guard that lies in the reassuring direction and a
			# guard that cries wolf are both guards that lie.
			if [ "$n_warn" -gt 0 ] 2>/dev/null; then
				tracker_summary="${tracker_summary} · ⚠ ${n_warn} loader complaint(s) — counts above may be INCOMPLETE; run \`diarie validate\`"
			fi

			# `ready` already sorts by priority, so the first rows are the ones worth naming.
			# `priority` and `title` are OPTIONAL in the schema, so an unvalidated store would
			# render "T-1 (null)" / "T-1 null". Default them the way `ready` already
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
# --- end tracker prime ---

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
		parts+=("Trend-review reminder: Sprint ${next} will be a trend-review sprint. When you close this sprint, /retrospective will also run the full UPSTREAM trend review, tracker health audit (validate-tasks, --stats, stale tasks, blocked tasks), and Basic Memory graph audit (schema validation, drift detection, duplicate audit). Plan for a longer retrospective session.")
	elif [ "$mod" -eq 0 ]; then
		current=$((count + 1))
		parts+=("Trend-review sprint: Sprint ${current} is a trend-review sprint. Running /retrospective will perform the full UPSTREAM trend review, tracker health audit, and Basic Memory graph audit in addition to the standard retrospective. Plan for a longer session.")
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

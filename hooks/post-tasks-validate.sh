#!/usr/bin/env bash
# PostToolUse: validate the flat-YAML task store immediately after an agent edits it.
#
# The `check:tasks` stage already guarantees integrity at `npm run check` time. This
# hook closes the gap in between: an agent that hand-edits a task row (the only way
# to write — there is no CRUD helper, by design) can introduce a dangling dep, a bad
# enum, or a cycle and keep working for an hour before anything says so. Here the
# feedback is immediate.
#
# Advisory, never blocking: it reports and lets the agent fix. Silent when the store
# is clean — a hook that speaks on every edit gets tuned out.
#
# Note it validates the WHOLE store, not just the edited file, so a pre-existing
# unrelated error surfaces on any edit. That is honest, not a bug.
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
[ -n "$FILE_PATH" ] || exit 0

# Only fire for the task store itself.
case "$FILE_PATH" in
*/.diarie/tasks/tasks-*.yml | */.diarie/tasks/tasks-*.yaml) ;;
*) exit 0 ;;
esac

# Derive the project root from the edited file's own path rather than assuming the
# hook's cwd: PostToolUse gives us an absolute file_path, and that is the one thing
# we can trust to point at the right project.
PROJECT_ROOT="${FILE_PATH%/.diarie/tasks/*}"
[ -n "$PROJECT_ROOT" ] && [ -d "$PROJECT_ROOT/.diarie/tasks" ] || exit 0

# Resolve a validator. Four rungs, and the LAST one is the only one a real consumer
# ever reaches: these are the plugin's hooks, so they run inside someone else's
# project, where `diarie` is not on PATH and there is no `diarie/` in their tree.
#
# Every rung passes --root "$PROJECT_ROOT" explicitly. That is not belt-and-braces:
# `.diarie/` is COMMITTED, so a plugin release ships vp-beads' OWN backlog inside the
# marketplace cache. A diarie invoked from the plugin that fell back to walking up
# from cwd would find the plugin's store and cheerfully validate *our* tasks while
# reporting on *theirs*. Explicit root, always.
#
# Silent if none is runnable — a hook that cannot validate must say nothing, not spam.
result=""
if command -v diarie >/dev/null 2>&1; then
	result=$(diarie validate --json --root "$PROJECT_ROOT" 2>/dev/null || true)
elif [ -x "$PROJECT_ROOT/node_modules/.bin/diarie" ]; then
	result=$("$PROJECT_ROOT/node_modules/.bin/diarie" validate --json --root "$PROJECT_ROOT" 2>/dev/null || true)
fi
[ -n "$result" ] || exit 0

# NOT `.clean // empty`: jq's `//` treats `false` as absent, so the alternative
# fires on exactly the case we care about (an INVALID store) and the hook would go
# silent precisely when it has something to say. `tostring` keeps false as "false".
# A missing key yields "null", and unparseable output yields "" — both stay quiet.
clean=$(printf '%s' "$result" | jq -r '.clean | tostring' 2>/dev/null || true)
[ "$clean" = "false" ] || exit 0

errors=$(printf '%s' "$result" | jq -r '(.errors // [])[] | "  - \(.)"' 2>/dev/null || true)
[ -n "$errors" ] || exit 0

msg="The task store is invalid after that edit (validate-tasks):

${errors}

Fix the YAML in \`.diarie/tasks/\` before continuing — a dangling dep or bad enum silently distorts what \`ready-walker\` reports as workable."

jq -n --arg msg "$msg" '{"additionalContext": $msg}'
exit 0

# diarie (Claude Code plugin)

Everyday session hooks for the [`diarie`](https://github.com/voxpelli/diarie) flat-YAML
tracker. Hooks only — no skills.

## What it does

| hook | event | behaviour |
| ---- | ----- | --------- |
| `post-tasks-validate.sh` | `PostToolUse` (`Edit`/`Write`) | Validates the whole `.diarie/` store the moment a task row is edited, and reports the errors. Silent when the store is clean. |

Editing a task row is the only way to write to the store — there is no CRUD helper,
by design — so a dangling dep, a bad enum or a cycle can otherwise sit undetected
until the next `diarie validate`. This closes that gap without blocking anything:
the hook is advisory, and reports rather than refuses.

## Requirements

* `jq` on `PATH`.
* A runnable `diarie` — resolved from `PATH`, else the consuming project's
  `node_modules/.bin/diarie`. When neither is reachable the hook stays silent
  rather than spamming every edit.

The project root is derived from the edited file's own path, never from the hook's
working directory, so the hook validates the store the user is editing rather than
one shipped inside the plugin cache.

## Development

```bash
npm run check          # md + shellcheck/shfmt + hook integration tests
```

The hook suite lives in `scripts/check-hooks.mjs` and is self-contained: it reads
`hooks/hooks.json`, drives each wired script with a registered stimulus, and
asserts the emitted `hookSpecificOutput.hookEventName` matches the event the script
is registered under. A hook wired without a stimulus fails rather than being
skipped.

# UPSTREAM-beads

Tracking friction with [beads](https://github.com/steveyegge/beads) (the `bd` CLI).

## Feature Requests

- **`bd init` should auto-gitignore `interactions.jsonl`** (2026-03-28) — The
  `interactions.jsonl` file is an append-only audit trail that generates noise in
  git history. It had to be manually removed from git tracking and added to
  `.gitignore` in this project. `bd init` should add `.beads/interactions.jsonl`
  to `.beads/.gitignore` automatically. Similarly, `.beads-credential-key` is a
  credential file that should never be committed.
  Ownership: upstream · Workaround: full — manual gitignore + `git rm --cached`

- **`bd memory search` for targeted mid-session context lookup** (2026-03-28) —
  `bd prime` injects all memories at session start, but agents running mid-session
  (post-compact) have no `bd memory list` or `bd memory search <query>` to check
  existing entries without re-triggering full prime injection. A targeted search
  command would enable cheap mid-session lookups. Related: could `bd prime` accept
  a `--since` or `--scope` flag to make partial re-priming cheaper?
  Ownership: upstream · Workaround: partial — `bd show <id>` works for known
  issue IDs, but memory/context discovery requires `bd list` + iteration

## Bugs

_No entries yet._

## Upstream Opportunities

_No entries yet._

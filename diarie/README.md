# diarie

**A flat-YAML task tracker that is just files. No daemon, no database, no git hooks.**

Your backlog is a YAML file in your repo. `diarie` reads it, tells you what is ready to work on, and
refuses to lie to you when the store is broken. That is the whole product.

You write to it with your editor. There is no `diarie add`, deliberately — see
[The write side is your editor](#the-write-side-is-your-editor).

## Why

Issue trackers want to be the system of record. That means a database, which means a daemon, which
means a sync protocol, which means git hooks — and now leaving is a migration project.

`diarie` inverts that. **Git is the database.** The store is ordinary committed files, so your backlog
diffs, branches, merges, and code-reviews like everything else in the repo, and it survives `diarie`
being uninstalled. The CLI is a *reader* over files you own.

It is built for repos where agents and humans share a backlog, and where the tracker must not become
the thing you cannot leave.

## Install

```bash
npm install --save-dev diarie
```

Requires Node.js `^20.19.0 || ^22.13.0 || >=24`.

## Quick start

```bash
npx diarie init            # creates .diarie/
```

That gives you `.diarie/tasks/tasks-<slug>.yml`:

```yaml
meta:
  slug: backlog
  title: Main backlog
tasks:
  - id: proj-auth
    title: Add session auth
    status: pending          # pending | in_progress | completed | failed | cancelled | deferred
    type: task               # task | doc | decision | milestone
    priority: high           # critical | high | medium | low | backlog
    labels: [feature]
    acceptance_criteria:
      - a session cookie survives a restart
  - id: proj-login
    title: Login form
    status: pending
    type: task
    priority: medium
    deps: [proj-auth]        # blocked until proj-auth is completed
```

Then:

```bash
diarie ready       # what can I start right now?
diarie stats       # counts, plus stale in-progress claims
diarie validate    # dangling deps, bad enums, dependency cycles
```

`diarie ready` walks the dependency graph and shows only work whose blockers are done. `deps` blocks;
`parent` nests (an epic is a task with children, not a special type).

Note there is **no `blocked` status**. Blocked is *computed* from the graph, not stored on the row — so
it cannot go stale, and you cannot forget to unset it when the blocker lands.

## Commands

| | |
| --- | --- |
| `diarie init` | Create a `.diarie/` store |
| `diarie ready` | List the work that is ready to start · `[--filter <status>] [--blocked] [--strict] [--json]` |
| `diarie stats` | Totals, ready, blocked, stale claims · `[--stale] [--days <n>] [--json]` |
| `diarie validate` | Check for dangling deps, bad enums, and cycles · `[--json]` |
| `diarie migrate` | One-way import of a [beads](https://github.com/steveyegge/beads) export |

`--root <dir>` points at a project explicitly; otherwise `diarie` searches upward from the cwd, like
`git` does.

## A missing store is an ERROR, not an empty backlog

This is the design decision the tool is built around, and it is why the exit codes are worth reading.

Point most tools at a project that tracks its work elsewhere and they print nothing and exit 0 — which
is indistinguishable from *"you have no work left."* Those are opposite situations, and conflating
them is how a broken tracker gets reported as a clean sprint.

So:

| exit | meaning |
| --- | --- |
| **0** | The answer is on stdout. An **empty but present** store is a legitimate answer. |
| **1** | You asked wrong. A machine-readable `code` says how: `ENOSTORE` (no store here), `EUSAGE`, `EEXIST`. |
| **2** | It ran, and the answer is **no**: the store is unsound (`validate` found errors, or `ready --strict` on a store with dropped rows). |

With `--json`, an error is a JSON object on **stdout**, not a message on stderr:

```console
$ diarie ready --json --root /tmp/not-a-project
{
  "error": "no .diarie/ store found",
  "code": "ENOSTORE"
}
$ echo $?
1
```

So a script can tell *"this project tracks its work elsewhere"* from *"this project has no work left"* —
which is the entire point. Ask for `--json`, and never discard the exit code.

`ready --strict` exits 2 if the store is unsound: a malformed row was dropped, a dependency dangles, a
cycle exists. Use it in a hook or CI step that must not proceed on a store it cannot trust.

## The write side is your editor

There is no `diarie add`, no `diarie close`, no `diarie assign`. Claiming a task is:

```yaml
    status: in_progress
    agent: alice
```

Completing it is `status: completed`. That is not an omission — a CRUD layer would make `diarie` the
owner of your data, and the point is that you own it. The files are the API; `git` is the audit log;
`diarie validate` is the integrity gate. Run it after you edit.

## Types

Four, and they are exclusive:

| type | lives in | |
| --- | --- | --- |
| `task` | `.diarie/tasks/*.yml` | A unit of work. **The only type `ready` ever surfaces.** |
| `milestone` | `.diarie/tasks/*.yml` | A structural marker (`v1.0`). No effort, no assignment. |
| `decision` | `.diarie/decisions/<id>.md` | An architectural choice and its reasoning. Stays open while in force. |
| `doc` | `.diarie/docs/<id>.md` | Reference prose. |

**The type is exclusive; the framing is additive.** `bug`, `feature`, `chore`, `spike` are *labels* on a
`task` — because "what kind of thing is this" admits one answer, while "how should I think about it"
admits several. An epic is a `task` with children, via `parent:`.

`decision` and `doc` carry prose, so they are markdown files with the schema in frontmatter — and
because the ready-walk only globs `tasks-*.yml`, a decision in force is *structurally* incapable of
being offered to you as workable.

## Library

`diarie` is a library with a bin. The pure functions are exported and fully typed:

```js
import { computeReady, loadTasks } from 'diarie'
import { VALID_TYPES } from 'diarie/schema'

const { tasks } = await loadTasks('/path/to/project')
const { ready, blocked, needsAttention } = computeReady(tasks)
```

`needsAttention` is the third partition, and it matters: a row whose *required* fields are malformed is
**broken**, not merely non-workable. It is never silently dropped — dropping a bad row hides it from the
human whose typo it is.

## Reading the store honestly

Two rules the reader follows, which you may want to follow too:

- **A guard that DROPS a value must also REPORT it, naming the consequence.** Not `invalid priority`, but
  *"invalid priority `urgent` — it will be treated as `medium`"*. The consequence is the part that tells
  you whether to care.
- **Represent the malformed row; never delete it.** `validate` is the authority that rejects. The
  reader's job is to be honest.

## License

MIT © [Pelle Wessman](https://kodfabrik.se/)

# diarie vs beads — an incident log, not a brochure

`diarie` is the flat-YAML tracker this project migrated to after beads (`bd`) broke.
This document records **what each of its design choices buys, and the specific
incident that taught us to want it**.

Every row below is something we hit. Nothing here is claimed from reading beads'
documentation — that is the "doc-alignment is not operational-alignment" rule, and it
is why the last section is the one about where beads is still _better_. A strengths
list without that section is marketing.

Provenance: the ADR-grade rationale for choosing this substrate lives in
`DESIGN-tracker-exploration.md` (v3 block) and
`RESEARCH-tracker-migration-synthesis-2026-06.md`. This file is the _contrast_.

---

## The forcing function

Homebrew auto-upgraded beads 1.0.5 → 1.1.0. Its schema-migration gate now **panics on
every write**:

```
refusing to auto-apply 4 pending schema migrations to a remote-backed database
(v49 -> v53): rekey aux row ids: events: invalid hash length: 19
```

`bd create`, `bd update`, `bd close`, `bd stats` — all dead. Reads still work.

The binary is installed **globally**, so this did not break one repo. It broke _every_
repo on beads, simultaneously, on a package-manager upgrade nobody asked for. That is
the difference between a bug and a class of risk: no amount of care in _our_ repo could
have prevented it, and no amount of care can prevent the next one.

---

## What each choice buys

| diarie                                                                                                                                                                                                                     | beads — as observed here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | The principle                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **No git hooks. Ever.**                                                                                                                                                                                                    | Sets `git config core.hooksPath` → `<abs>/.beads/hooks`, installing five shims (`pre-commit`, `post-merge`, `pre-push`, `post-checkout`, `prepare-commit-msg`). Because it redirects `hooksPath` rather than writing to `.git/hooks/`, **`.git/hooks/` looks pristine** — the hooks are invisible to anyone who checks the obvious place. `pre-commit` shells out to `bd` and **propagates its exit code** (300 s timeout). Every commit in this repo — _including the ones migrating away from beads_ — routed through the dead binary. | Platform proximity. Do not stand between the user and git.                                                               |
| **No daemon. No ports, no PID files, no orphans.**                                                                                                                                                                         | A `dolt sql-server` process per repo. **Two were running on this machine** while writing this — one for this repo, one orphaned from a repo long closed (upstream `#4282`). The daemon holds the entire issue history open, so it cannot even be killed carelessly.                                                                                                                                                                                                                                                                      | Simplicity over correctness. A tracker is not a database server.                                                         |
| **Nothing phones home.**                                                                                                                                                                                                   | Ships metrics **enabled by default**. The spool at `~/.beads/eventsData/` grew from **115 to 125 files during this session** — the events generated by the `bd` reads used to _migrate off it_.                                                                                                                                                                                                                                                                                                                                          | Sovereignty.                                                                                                             |
| **Never writes to your `CLAUDE.md`, `AGENTS.md`, or `.claude/settings.json`.**                                                                                                                                             | `bd setup claude` injects a managed block into `CLAUDE.md`/`AGENTS.md` and `SessionStart`/`PreCompact` hook entries into `.claude/settings.json`.                                                                                                                                                                                                                                                                                                                                                                                        | Substrate, not opinion. `ROADMAP.md` names the anti-goal outright: _"a tool that colonizes project `CLAUDE.md` files"_.  |
| **The data _is_ the repo.** Plain YAML: committed, diffable, reviewable in a PR, editable in any editor. The entire backlog is **617 lines**.                                                                              | `.beads/` is a **32 MB Dolt database**, and bd's own `.beads/.gitignore` leaves only fragments tracked. In this repo the whole directory is gitignored — so **none of the issue history was in git at all.** The migration's committed JSONL archive is the first time it ever was.                                                                                                                                                                                                                                                      | Lock-in resistance; data portability. You cannot be locked into a text file.                                             |
| **A point release cannot break your writes.** Writing is `Edit`. There is no write path to break.                                                                                                                          | See "The forcing function" above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Platform proximity.                                                                                                      |
| **Nothing unworkable is ever offered as work.** A `decision` is a record, a `milestone` is a marker, and a container — a parent with open children — is the sum of its children, not a task. None are ever "ready".        | Type-blind — lists `decision` and `milestone` issues as ready. Our own dual-run caught it on `vp-beads-etm`: `bd ready` offered a _decision_ as the next thing to work on. bd got containers right, though, and for a reason we gave up: it had an `epic` _type_.                                                                                                                                                                                                                                                                        | Correctness where it is cheap. We had to earn back, in logic, what bd got structurally — see `## The uncomfortable one`. |
| **A lost tracker says so.** Pointed at a project with no store, `diarie` exits non-zero and emits `{"code":"ENOSTORE"}` on **stdout**. An absent store and an empty one are different questions and get different answers. | Not a beads failing — **ours**. Our own reader printed a well-formed, entirely fictional empty backlog to stdout, sent its only warning to a stderr that ten call sites pipe to `/dev/null`, and exited **0**. Every consumer was told "you have no work" by a tool that had no idea where it was. Found by asking why `ready` succeeded in a directory with no `.diarie/`.                                                                                                                                                              | The failure mode here is never a crash. It is a green check over work not done.                                          |
| **Uninstalling is deleting a folder.**                                                                                                                                                                                     | The tracker is dead and it still owns your git hooks, a daemon, and two git-config keys — which is why `/deintegrate-beads` had to be written at all. `bd hooks uninstall` cannot even clean its own default install shape (its `--help` admits it only touches `.git/hooks/`).                                                                                                                                                                                                                                                          | An exit ramp is a feature.                                                                                               |

---

## What it actually is

The whole tracker is **\~2572 lines of JavaScript** in one npm workspace — `diarie/`, a
`cli.js` plus a `lib/`. The authority is `lib/schema.js` (enums, the ready rule,
`TRACKER_DIR`); `lib/store.js` is the only thing that knows how to find a store;
`lib/ready.js` and `lib/validate.js` are pure functions over a loaded task list.

**Five runtime dependencies**, and this document has to say so plainly, because it used to
say **one** (`js-yaml`) and add — with some satisfaction — that _"pretending otherwise
would be exactly the kind of claim this document exists to avoid."_ The claim outlived its
truth by two commits, which is the more instructive failure.

The five: `js-yaml` (someone has to parse the YAML), `peowly` + `peowly-commands` (arg
parsing over `node:util.parseArgs`), `pony-cause`, and `@voxpelli/typed-utils`. That is
**25 transitive packages, 2.9 MB**. The template this CLI follows also ships
`markdown-or-chalk`, which was **declined**: it is 101 transitive packages and 10 MB on its
own — 97% of the template's entire install — for syntax-highlighted code fences a task
tracker never renders. A tracker that prints a list of tasks does not need a markdown
renderer, and the dependency count is a thing this project is allowed to be smug about only
if it keeps checking.

There is deliberately **no CRUD helper**. Writing a task is `Edit`. That is the
substrate-not-opinion line: the tool provides the primitives (a schema, a reader, a
validator) and declines to own your workflow.

---

## Where beads is still ahead

Real gaps. This is also the roadmap.

* **Duplicate detection.** `bd find-duplicates`, including `--method=ai`, and
  `bd supersede`. There is no analog; `/backlog-groomer` now compares titles and labels
  by hand. This is the biggest genuine loss.
* **Staleness.** `bd stale` aged _open_ issues. `diarie stats --stale` is
  **`in_progress`-scoped only** — pending-item aging has to be read off each row's
  `updated:` field. A pending-stale mode is worth adding.
* **Search.** bd had fuzzy/semantic search across issues. We have `grep`.
* **Cross-repo federation.** bd could sync issues between repos. `diarie` cannot, and
  does not intend to.
* **A memory store.** `bd remember` is gone with the write-gate, and `/harden-memories`
  was deleted with it. (Its contents are, as of 1.1.0, **unrecoverable** — `bd memories`
  hits the same gate.)
* **Maturity.** beads has issue types, validation-on-create, a rich CLI, and years of
  work behind it. `diarie` has one real migration behind it.

A tracker that does less is only better if the things it dropped were the things
costing you. That was true here — a daemon, a DB, hidden git hooks, and telemetry were
the price of dedup and fuzzy search, and we would rather grep.

---

## The uncomfortable one

beads' ready-walk being type-blind is the kind of bug we could have written ourselves.
We _did_ write it: `computeReady` was type-blind too, until a 10-agent review caught it
in 2026-07 (`ec73dd9`). The dual-run against bd is what proved both were wrong.

Then we wrote it again. Collapsing bd's `epic` _type_ into `task` + `parent:` is the
better model, but it moved the container check from the type gate — where it was
structural and free — into logic nobody wrote. So `computeReady` offered the migration
epic itself as the next thing to work on, and the dogfooded tracker prime led with it on
its first run. Fixed 2026-07-11 (`vp-beads-epc`): a parent with open children is now
blocked _by_ those children, and children ride in their own field, because a dep must
finish first while a child is merely contained.

The fix is the part worth keeping. `loadTasks` globalized `id` and `deps` into a
`slug/id` namespace but handed `parent` back raw, so `parent` could never equal any
`id` — every parent lookup had been silently finding nothing. The obvious fix (index
children by parent, compare to id) would therefore have found **zero children for every
epic**, concluded there was nothing to exclude, changed no behaviour, and **passed a
green test suite** — including a unit test, which writes `id` and `parent` by hand in one
consistent id-space and so cannot see the incoherence at all. It was caught by asking why
the ids in a debug print did not match, and pinned by reverting the fix to watch the
tests go red.

That is the whole lesson, and it is the same one every time: **the failure mode here is
never a crash. It is a green check over work not done.** The validator that passed on a
missing store. The `--json` branch that emitted no JSON. The probe that counted prose as
tasks. The tracker that printed an empty backlog when it was lost. Simplicity buys fewer
_classes_ of failure — a daemon that cannot orphan, a write path that cannot break, hooks
that cannot hijack. It does not buy correctness. That still has to be earned, and the only
reason we trust the ready-walk is that we ran it against 131 real issues, explained every
divergence, and now break it on purpose to confirm the tests notice.

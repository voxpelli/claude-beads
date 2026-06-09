# VISION — vp-beads

> Direction and voice, not a backlog. This is the durable intent above
> [`ROADMAP.md`](./ROADMAP.md) (sequencing) and the per-sprint work. It changes rarely.

## The stance

**vp-beads is the calm, sovereign answer to agentic development: sprint-workflow
choreography for one developer amplified by Claude Code agents, on plain text and git — no
daemon, no database, no fleet. Where Gas Town federates a 20–30-agent workforce on a SQL
server, vp-beads keeps a single human sovereign over legible files. Local-first,
lock-in-resistant, composable, calm.**

This is not "a smaller Gas Town." It is a different answer to the central question of the
next decade of software — *how should a developer work with agents?* There are two honest
poles:

| Dimension | **Gas Town pole** (maximalist / federated) | **Calm-sovereign pole** (vp-beads) |
| --- | --- | --- |
| State | Dolt SQL server, daemon, `:3307` | Plain text + git + Basic Memory. No DB, no daemon, no port. |
| Concurrency | A *fleet*: a Mayor slinging work to 20–30 agents | *Choreography*: file-disjoint waves of ephemeral agents, one human conductor |
| Scale target | Grows the org-chart of agents | One human, amplified. Single-agent is a graceful subset. |
| Lock-in | A server, a daemon, a role taxonomy, a federation protocol | Everything `grep`-able and `cat`-able. Delete the plugin; your work survives as markdown + git. |
| Failure mode | Daemon/DB down → fleet stalls; distributed-systems debugging | A skill misfires → read a file, fix it. Failure is local and legible. |
| For | Teams running continuous autonomous agents, where coordination *is* the product | Solo + small-team sovereign builders who want agents to amplify **one mind** and refuse a daemon between them and their files |

Both poles are correct **for their audience**. Fleet-scale federation genuinely wins when
the coordination is the product — that is Gas Town's right answer for its people. The calm
pole is the answer for the sovereign solo builder. We are not better; we are the *other
answer*, and we own it deliberately.

## The operational test (the lead motif)

Every feature decision defers to one sentence — the
[lead motif](./CLAUDE.md), used as a filter, not as marketing:

> **Sprint workflow choreography for solo developers running Claude Code agent swarms —
> with constitutional safety middleware and Basic Memory graph integration.**

The stance above is the motif's *why*. When a feature is proposed, the question is: *does it
belong to the calm-sovereign pole, or the Gas Town pole?* The two-poles table is the
adjudicator.

## The doctrine (identity made of refusals)

These are not arbitrary scope calls — they are the calm-sovereign pole made concrete. Each
is an automatic **no**, and each points back at the stance. (The full constraint list with
reasons and revival triggers lives in [`ROADMAP.md`](./ROADMAP.md) Section 6.)

- **No daemon, no background process.** The substrate is files; git is the only "server".
- **No SQL / binary state store.** Plain text + git + Basic Memory. (This is *why* we are
  leaving bd's Dolt substrate — see the synthesis doc and DESIGN v3.)
- **No web dashboard.** The terminal and the markdown files are the UI.
- **No fleet roles, no Mayor, no standing org-chart of agents.** Ephemeral agents under one
  human, never a persistent workforce.
- **No multi-tenant / RBAC / CRDT / federation** at single-host scale. Sovereignty means
  single-owner; collaboration is git, not a sync engine.
- **No host colonization.** We never inject directives that tell Claude Code to stand down
  its own memory/task primitives. We live *alongside* the platform, not in tension with it.
- **No workflow-prescribing substrate.** The substrate provides primitives; the *skills*
  supply the workflow. A tool that competes with the user for the mandate to dictate workflow
  is a misfit even when its workflow is good.

When in doubt: the simpler, more legible, more deletable option is the one that fits the
pole.

## Lineage

The stance is not invented here; it is *recognized*. It rests on a real intellectual canon:

- **Local-first software** — Ink & Switch (the seven ideals; "you own your data, in spite of
  the cloud").
- **Calm technology** — Mark Weiser & John Seely Brown ("The Coming Age of Calm
  Technology"); the Calm Tech Institute.
- **Convivial tools** — Ivan Illich, *Tools for Conviviality* (autonomy-preserving,
  human-scale tools vs. tools that dominate their users) — the keystone that names *why* a
  daemon between you and your files is the thing to refuse.
- **Worse-is-Better** — Richard Gabriel (simplicity over correctness; "the JavaScript you
  write is the JavaScript that runs").
- **Small tech** — Aral Balkan; **indieweb / POSSE** — own your tools, own your data.

These are applied recursively here: own your tools, own your data, at a higher level of
abstraction each turn — now to the way a solo developer commands a swarm of agents.

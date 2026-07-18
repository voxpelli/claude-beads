# diarie — Vision

**A task tracker you cannot be trapped by.**

Every issue tracker eventually wants to be your system of record. That wants a database, which wants a
daemon, which wants a sync protocol and a set of git hooks — and by then leaving is a migration project.
diarie is the refusal of that path. Your backlog is YAML in your repo; the CLI is a reader over files you
own. Uninstall it and your backlog is still there.

This document is the direction and the guardrails. For how to use the tool, see the [README](./README.md);
for where it is going, see the [ROADMAP](./ROADMAP.md); for its visual and verbal identity, see the
[BRAND](./BRAND.md).

## The invariants

These are promises, not features. They are the reasons to trust diarie with a backlog, and they do not
change:

- **Git is the database.** The store is ordinary committed files, so a backlog diffs, branches, merges,
  and code-reviews like the rest of the repo — and outlives the tool.
- **The CLI reads; your editor writes.** There is no `diarie add` / `close` / `assign`. A CRUD layer would
  make diarie the owner of your data; the point is that you own it.
- **A missing store is an error, not an empty backlog.** `ENOSTORE` (exit 1) is distinct from a present
  store with no work (exit 0) — because *"tracks its work elsewhere"* and *"has no work left"* are opposite
  situations, and conflating them is how a broken tracker reads as a clean sprint.
- **Ready and blocked are computed, never stored.** They are a pure function of the dependency graph, so
  they cannot go stale and you cannot forget to unset them.
- **Four exclusive types; framings are labels.** A type answers *"what kind of thing is this"* (one
  answer); a label answers *"how should I think about it"* (several).
- **The reader is honest.** A malformed row is represented, never silently dropped — dropping it hides it
  from the human whose typo it is. `validate` is the authority that rejects; the reader's job is to report.
- **diarie degrades; it never forces itself.** A tool that silently treats an absent tracker as an empty
  one makes a project that tracks its work elsewhere look broken. diarie says so instead.

## What diarie will never become

The non-goals are load-bearing. diarie will not grow a daemon, a database, a sync protocol, git hooks, a
CRUD write layer, or a web dashboard. It is not a project-management product and will not become one.
Leaving must always be free.

## The test for any feature

Before anything is added, it must pass one question: *does this keep the store plain files you own, and the
CLI a reader over them?* A feature that needs a daemon, a lock, or ownership of your data to work is out of
scope by construction, not by preference. These refusals are firm but not superstitious: like every
constraint here, one can be reopened — but only against a named trigger that changes the reasoning, never
talked back in by convenience. The sentence at the top of this file is a design test, not a slogan.

## Lineage

diarie invents none of this; it applies a canon. Local-first software (Ink & Switch — *you own your data,
in spite of the cloud*); convivial tools (Ivan Illich — tools that preserve their user's autonomy instead
of dominating them, which is precisely why a daemon between you and your files is the thing to refuse);
calm technology (Weiser & Brown); worse-is-better (Richard Gabriel — the simpler thing that ships and
stays legible); and the own-your-data ethos of indieweb / POSSE. A backlog is a small place to apply them —
which is the point: own your tools and your data, one abstraction at a time.

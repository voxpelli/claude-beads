# diarie — Roadmap

*Status: `0.1.0` — built and in use, not yet published (held behind a name gate). Last reviewed 2026-07-18.*

A living sketch of direction, not a backlog — the granular work lives in the tracker itself. This file is
the shape of where diarie is going and, as importantly, where it will not go. Every entry here must pass
the feature test in [VISION.md](./VISION.md): plain files you own, a CLI that only reads them.

## Now — the first release

- **Publish `0.1.0`.** `diarie.dev` is registered; claiming the npm name is the remaining hold. Publishing
  drops `private: true` and cuts the first standalone release.
- **Stand diarie up as its own repository.** It currently lives as a workspace inside a parent repo; the
  package is already structured so its own gates, tests, and lint travel with it (nothing to reach back for).
- **Ship an agent usage-skill companion at publish.** One canonical place an agent learns the
  claim / close / validate / ready primitives and the `ENOSTORE` / exit-code contract — taught once, not
  re-derived per project.

## The road to 1.0.0

`1.0.0` is a maturity claim, not a version bump on a timer: it is reached when diarie has proven generic
beyond its first projects — organic installs, and issues filed by people other than its author. Until then
it stays `0.x` with honest semver: the surface can still move, and breaking changes are allowed and
announced.

## Near — small and decided

- **Reconcile the `decision` lifecycle vocabulary.** A decision in force is `pending` today, but there is
  no honest status for *superseded / reversed* among the six. Pick one deliberately — a `superseded_by:`
  field (which keeps the status enum clean) or a mapped status — rather than reintroducing the `open` /
  `closed` scheme the tracker does not have.

## Later — open questions, not commitments

Ideas that fit the vision but are not scheduled. diarie's default answer to *"should it also do X"* is no,
so this list stays short on purpose.

- A separate schema/reference companion (types, enums, `validate` semantics), if the single usage skill
  proves too broad for one audience to hold.
- Richer `ready` filtering or additional `--json` shapes, if real use demands them.

## The refusals

The non-goals are the roadmap's spine, and they are identity, not backlog: diarie will not grow a daemon, a
database, a sync protocol, git hooks, a CRUD write layer, or a web dashboard. Each is firm but carries a
named revival trigger rather than being permanent by temperament — the discipline, and the reasons, live in
[VISION.md](./VISION.md). Leaving must always be free: uninstall diarie and your backlog is still there, in
files you own.

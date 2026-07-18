---
id: diarie-spa
title: Store-path CLI API — nested-init refuses unless --nested; TASKS_ROOT renames to DIARIE_ROOT
status: pending
type: decision
priority: medium
updated: '2026-07-18'
---

## Decision

When `diarie init` runs and an **ancestor** `.diarie/` store already exists above the target
directory, it **REFUSES** by default: it exits as an `InputError` (exit 1) carrying a dedicated
state code **`EANCESTOR`** — parallel to `init`'s existing `EEXIST`, NOT `EUSAGE`. An ancestor
store is a *state, not a typo*, which is exactly `init.js`'s own stated reason for giving
`EEXIST` its own code instead of folding it into `EUSAGE` (`init.js:121`); the ancestor refusal
is its sibling and must get symmetric treatment so a `--json` consumer can branch on it. Creating
a nested backlog then requires an explicit `--nested` flag. Separately, the environment override
`TASKS_ROOT` is renamed to `DIARIE_ROOT`, and a read-only `diarie where` / `--show-root` resolver
is added to surface store structure by query.

This is **deferred implementation.** The store split that produced this record runs on `init`'s
CURRENT allow-behavior — `resolveInitRoot` does not walk up, so `init` creates a nested store
even with an ancestor present — and therefore nothing here gates that split.

Two refusal paths exist, kept **distinct** because they answer different questions:

1. **Ancestor `.diarie/` exists, the target dir is fresh** → refuse unless `--nested`. The
   question is *"did you mean to shadow the store above you for this subtree?"*
2. **A `.diarie/` already exists AT the target** → refuse for content-safety; `--force`
   overrides. The question is *"may I overwrite the store that is already here?"* This is
   already diarie's `EEXIST` behavior — settled and unchanged.

They are not one flag with two messages: `--nested` opts INTO a new nested store, `--force`
opts INTO clobbering an existing one. Collapsing them would let `--force` silently create a
nested backlog, or `--nested` silently overwrite one.

**Precedence and composition.** The same-target check (case 2, `EEXIST`) runs FIRST and wins — it
is about *this* directory, the most specific fact on disk. The ancestor check (case 1,
`EANCESTOR`) runs only when the target dir is fresh. So `--force` governs an overwrite-in-place
and `--nested` governs a fresh nested store; they address different states and need not compose.
And `--nested` passed with NO ancestor present is a harmless **no-op** — `init` proceeds normally,
never an error — because the alternative (erroring) would teach users to omit it and the
alternative (making it always-safe-to-pass) would erode the deliberate-act semantics it exists to
protect. The flag means "yes, I know there is a store above me"; with nothing above, there is
nothing to acknowledge.

## Rationale

**Refuse-unless-`--nested` (case 1) overrides the prior-art lean, deliberately.** A 4-round
reference-class survey placed diarie in the DATA-store class (node_modules, DataLad, DVC), where
nested stores are independent, nearest-wins, and benign — so the class norm is *silent nesting*
and DataLad/node_modules never warn on an ancestor. The decision goes the other way on purpose:
diarie's thesis is that you always know exactly which store you are in — the `ENOSTORE`
invariant exists for precisely that. A nested backlog silently shadowing an ancestor for a
subtree is the ESLint "surprise-ancestor" failure: invisible precedence nobody asked for. Making
it a deliberate `--nested` act is the strongest cure, and matches jj's refuse posture (jj was
built to fix git's silent-nest regret).

**`DIARIE_ROOT`, not `DIARIE_DIR`.** The value is a *project root* — the directory that CONTAINS
`.diarie/`, not the `.diarie/` directory itself. `DIARIE_DIR` would misname the referent and
invite a user to point it straight at `.diarie/`, producing a resolve that never finds a store.

**Structure by query, not by warning.** `diarie where` reveals which store resolves (the DataLad
`subdatasets` / `git rev-parse --show-toplevel` analog). That is how an independent data store
surfaces nesting — a read the user asks for, never a per-command runtime nag.

## Alternatives Considered

- **Allow + inform (the data-store class norm)** — declined. Correct for node_modules (nobody
  reasons about "which node_modules"), but diarie IS a thing the user reasons about; a silent
  nested backlog defeats the `ENOSTORE` clarity the tool is built on.
- **Warn but still create** — declined. A warning that creates the store anyway is the ESLint
  cascade mistake: by the time the warning is read, the surprise already happened.
- **`DIARIE_DIR` naming** — declined; misnames the referent (see Rationale).
- **DataLad's `-d` "register as a tracked subdataset" model** — declined on purpose. diarie
  backlogs are independent with no cross-store references; there is no super-store to register
  into.
- **`EUSAGE` (or no code) for the ancestor refusal** — declined. An ancestor store is a state,
  not a usage typo; folding it into the code `vp-beads-cli` minted for unknown flags/subcommands
  would stop a `--json` consumer from distinguishing a precondition refusal from a mistyped
  command. It gets its own state code (`EANCESTOR`), exactly as `EEXIST` did and for the exact
  reason `init.js:121` records.
- **`-C` as a `short:'C'` alias of `--root`** — declined. `-C` is a CHDIR (re-anchors the
  walk-up start, PRESERVES nearest-wins); `--root` is a PIN (points AT a store, DISABLES
  walk-up). Fusing them forward-collides with a real `-C` and conflates two operations git ships
  separately on purpose.

## Deferred implementation spec

**Pre-publish-gated (settle before the first publish):**

- **Env rename `TASKS_ROOT` → `DIARIE_ROOT`.** Clean rename, no shim. Doc-grep touch-points:
  `diarie/lib/store.js` (`resolveRoot` / `resolveInitRoot`), `diarie/test/cli.spec.js`,
  `skills/migrate-tracker/SKILL.md`, `diarie/README.md`, a CHANGELOG entry. Leave
  historical/archive files.
- **`--nested` (case 1).** Bare `diarie init` with an ancestor present → `InputError`
  (exit 1, `EANCESTOR`) on the structured `{error, code}` channel, message: `an ancestor .diarie/
  exists at <path>; pass --nested to create an independent nested backlog here (it takes
  precedence for this subtree)`. With `--nested` → create it, optionally echoing the same line
  as confirmation. `--nested` ships WITH the refuse default (both are pre-publish-gated).
- **Plugin/symlink guard on the new ancestor-walk — make it STRUCTURAL, not a "MUST" (implementer
  caveat).** The ancestor check is the FIRST walk-up ever added inside `init` — `resolveInitRoot`
  never walked up, so `init` has never once hit the plugin guard that `resolveRoot` carries. The
  new walk must start from the RESOLVED root's parent (cwd / `--root` / `DIARIE_ROOT`), not raw
  cwd, AND carry `assertNotPluginsOwnStore` (`CLAUDE_PLUGIN_ROOT` + `realpath`/symlink
  resolution) — otherwise `diarie init` inside an installed plugin checkout falsely reports the
  plugin's frozen `.diarie/` as an ancestor and BLOCKS init (under the refuse posture a false
  positive stops work rather than silently mis-resolving, so the guard matters MORE here, not
  less). But do NOT satisfy this with a hand-rolled second walk that *remembers* to call the
  guard — that is exactly the rot `store.js:135` forbids ("a defense that depends on every future
  sentence remembering is not a defense"). Extract the walk-up-with-guard into ONE shared
  primitive that both `resolveRoot` and the ancestor-check call, so a walk that skips the guard
  cannot be written. The illegal state (an unguarded walk) should be unrepresentable, not merely
  discouraged.
- **Same-target clobber (case 2).** `.diarie/` already at the target → refuse (`EEXIST`,
  settled). A `--force` override is ADDITIVE, not pre-publish-gated.

**Additive / post-publish (not gating):**

- **`diarie where` / `--show-root`** — a new read-only four-part command that prints the resolved
  store root (and, later, the ancestor chain). Query, not warning.
- **`-C <dir>`** — deferred; when added, a genuine chdir flag distinct from `--root`, with no
  ambient env pin (an ambient `GIT_DIR`-style default selector is the #1 footgun).

**Type note — the `--nested` confirmation channel.** The refuse path reuses the existing
`InputError` `{error, code}` channel, so it needs no new type. The ONLY place a structured notice
type would appear is the OPTIONAL `--nested` success confirmation. If one is added, model it as
an `InitNotice[]` DISCRIMINATED UNION — a `{kind}`-tagged variant per notice — not a `string[]`.
A bare string array cannot be branched on by a `--json` consumer, and the CLI's whole
structured-output contract is that machine-facing output carries typed kinds, not prose.

## Affects

- `diarie/lib/store.js`, `diarie/lib/commands/init.js`, `diarie/lib/flags/store.js`
- `diarie/test/*.spec.js` — new cases for the refuse path and the env rename
- `skills/migrate-tracker/SKILL.md`, `diarie/README.md`, CHANGELOG
- The store split recorded alongside this — both stores live simultaneously in the vp-beads
  monorepo as a nearest-wins battle test — runs on `init`'s current allow-behavior; this
  decision does not gate it.
- **Forward caveat (Obsidian).** A per-dir data store needs a nesting warning only if it carries
  cross-boundary relational integrity (Obsidian's inter-vault links). diarie has none; revisit
  ONLY if diarie ever adds cross-store task references.

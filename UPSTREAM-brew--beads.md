# UPSTREAM-brew--beads

Tracking friction with [brew:beads](https://github.com/gastownhall/beads) (the `bd` CLI). Repo transferred from `steveyegge/beads` to `gastownhall/beads` during the v1.0.0 cycle (2026-04-03); old URL still redirects, but the Homebrew formula `homepage` field still references the old URL as of 2026-05.

## Feature Requests

- **Add `validation.on-update` config key (template validation gap on update)**
  (2026-05-04) — `bd` exposes `validation.on-create`, `validation.on-close`,
  `validation.on-sync`, and `validation.metadata.mode` config keys, but no
  `validation.on-update`. Result: an agent or user can call
  `bd update <id> --description=…` and strip required sections (e.g.
  `## Acceptance Criteria`, `## Steps to Reproduce`) without any validation
  firing. The gate exists at create-time and close-time but the middle of the
  issue's life is unguarded. DeepWiki cites regression tests
  `TestBug11_UpdateAcceptsInvalidStatus` and `TestBug12_UpdateAcceptsEmptyTitle`
  showing `bd update` has historically accepted states `bd create` rejects;
  those were fixed for status/title but the template `RequiredSections` check
  was never wired into update. Concrete fix: add `validation.on-update` with
  the same `none`/`warn`/`error` enum, calling `LintIssue` after the update is
  applied. With this configured (and `on-create=error` + `on-close=error`)
  every state transition would be gated.
  Ownership: upstream · Workaround: partial — `validation.on-close=error`
  re-validates at close time so stripped acceptance criteria block the close;
  `bd lint` catches it on demand. Neither covers the in-flight window.

- **DeepWiki index lags binary on `validation.*` config keys** (2026-05-04) —
  Asked DeepWiki for the full list of `validation.*` config keys; it returned
  only `validation.on-create` and `validation.on-sync`. The installed binary
  (v1.0.3) accepts `bd config set validation.on-close error` and
  `bd config set validation.metadata.mode error` without complaint, and the
  earlier DeepWiki response about `validation.metadata.mode` documented it
  thoroughly — so the wiki's per-key answers are inconsistent. Likely cause:
  DeepWiki's index is behind the current beads tagged release. Not a beads
  bug per se, but worth flagging that downstream users (especially agents)
  shouldn't trust DeepWiki for the current `validation.*` key set — query
  the binary instead. Ownership: deepwiki (not beads) · Workaround: full —
  always cross-check `bd config list` or read source.

- **Expose required-sections-per-type via `bd types --required-sections` or
  similar** (2026-05-04) — Validation gates enforce per-type required
  markdown sections (e.g. spike requires `## Goal` + `## Findings`, decision
  requires `## Decision` + `## Rationale` + `## Alternatives Considered`,
  epic requires `## Success Criteria`), but there is no CLI surface to query
  these requirements. Discovery is by trial-and-error: attempt `bd create
  --type=<type> --description="x" --json` and parse the error JSON. This is
  fine for a human one-shot, but tooling/agents that want to generate
  compliant issues at scale need a structured manifest. Concrete fix: add
  `bd types --required-sections` (or extend `bd types --json` to include
  required sections per type), so consumers can build issue templates that
  pass validation on first try. Ownership: upstream · Workaround: partial
  — discoverable empirically per-type by attempting creates with `--json`.

- **Add `--set-section <name> <content>` to `bd update` for granular spike resolution** (2026-05-05) — `bd update <id> --description=<full>` requires re-supplying the entire issue description to populate just one section (e.g. a spike's `## Findings`). For agent-driven spike-resolution workflows this means HEREDOCing the entire description with all unchanged sections preserved verbatim — cumbersome and risks transcription errors. Concrete fix: add `bd update <id> --set-section "Findings" "<content>"` (or similar) that reads the current description, splices the named section, and writes back. Particularly impactful for multi-spike sprints where 3+ spikes need findings populated from agent output. Severity: minor · Ownership: upstream · Workaround: full — HEREDOC the full description, but verbose. Source: RETRO-9 "What could improve".
- **`bd ready` default `--limit 10` makes ~60% of ready work invisible to agents** (2026-05-05) — `bd ready` defaults to `--limit 10` (per `bd ready --help`); on a healthy backlog this hides most ready work. In a sprint this session the project had 26 ready issues but `bd ready` returned only 10 — the 14 P3/P4 ready issues under epic `vp-beads-0e9` were silently absent from the agent's view of the backlog. The `bd prime` workflow context that ships in SessionStart never mentions the limit. Two complementary fixes: (a) raise the default to e.g. 25 so most projects see all ready work, AND/OR (b) document the `--limit 10` default in `bd prime`'s "Finding Work" section so agents know to override. Severity: minor · Ownership: upstream · Workaround: full — pass `--limit 100` (or `--json | jq` for full set). Source: RETRO-9 "What could improve".
- **Add `--type` flag to `bd dep add` for relationship typing** (2026-05-04)
  — `bd dep add` only supports the implicit "blocks/depends-on" relationship
  type. Other useful relationship types (`related`, `duplicates`,
  `references`, `superseded-by`) must be tracked via labels or comment text
  rather than as first-class typed dependencies. The upstream `/beads:decision`
  slash command (in the `beads` Claude Code plugin, not vp-beads) documents
  `bd dep add <new-id> <old-id> --type related` as part of its supersede
  workflow — but the flag does not exist on the bd CLI binary (v1.0.3,
  verified via `bd dep add --help`). The slash command's documented workflow
  fails at this step. Concrete fix: add `--type <relationship>` flag to
  `bd dep add` (with at minimum `blocks` and `related`; ideally extensible
  via config like custom types/statuses). This would unblock the
  `/beads:decision` supersede workflow without needing a slash-command-side
  workaround. Ownership: upstream · Workaround: partial — manually use
  `bd note <id>` or labels to record relationship type alongside the
  untyped dependency.

## Bugs

- **Inconsistent metadata-key validation across `--metadata` vs `--set-metadata`/`--unset-metadata`**
  (2026-05-04) — `bd update <id> --metadata '{"unknown-field": "x"}'` accepts the
  hyphenated key without complaint; the resulting metadata stores
  `unknown-field` as a regular field. But the granular flags
  `--set-metadata` and `--unset-metadata` enforce regex
  `[a-zA-Z_][a-zA-Z0-9_.]*` and reject hyphens with
  `Error: invalid metadata key "unknown-field": must match [a-zA-Z_][a-zA-Z0-9_.]*`.
  Net effect: a hyphenated key written via `--metadata` becomes uncleanable by
  `--unset-metadata`, and `--set-metadata` / `--unset-metadata` and `--metadata`
  do not agree on which keys are valid. Concrete fix: the JSON-blob path on
  `--metadata` should run the same regex check (preferred), or the granular
  flags should relax to match. Either way, one rule across the surface.
  Ownership: upstream · Workaround: partial — use only `--set-metadata` /
  `--unset-metadata` (and disciplined underscore-only key naming) to stay
  consistent with bd's internal convention (`execution_agent_type` etc.).

- **No way to delete a metadata key once set with a name `--unset-metadata` rejects**
  (2026-05-04) — Continuation of the above bug. If a key with disallowed
  characters (hyphens, etc.) ends up in metadata via the `--metadata` JSON
  path, `--unset-metadata <key>` rejects on the regex. Setting the key to
  JSON `null` via `--metadata '{"key":null}'` merges in as a literal `None`
  value rather than deleting the key. Net effect: orphan keys are
  uncleanable through any documented CLI path. Concrete fix: either accept
  hyphenated keys in `--unset-metadata`, OR have JSON `null` in a `--metadata`
  merge delete the key (the JSON-merge-patch convention from RFC 7396).
  Ownership: upstream · Workaround: partial — direct DB edit via `dolt sql`
  is theoretically possible but wildly disproportionate; in practice orphan
  keys persist as cosmetic clutter.

- **`bd create --help` lists outdated `--type` allowed values** (2026-05-04)
  — Help text for `bd create` reads
  `Issue type (bug|feature|task|epic|chore|decision); custom types require
  types.custom config`. The binary actually accepts three additional core
  types added in v1.0.0: `spike`, `story`, `milestone` (verified via
  `bd create --type=spike` succeeding without `types.custom` set, and
  confirmed by `bd types` listing all nine as built-in core types). The help
  text was not updated when the new types shipped. Confusing for agents that
  read `--help` as authoritative — they may incorrectly add the new types
  to `types.custom` thinking they're not built-in, or avoid the new types
  entirely. Concrete fix: regenerate the help text from the same source as
  `bd types` so they stay in sync. Severity: minor · Ownership: upstream
  · Workaround: full — query `bd types` for the authoritative list.

- **`/beads:decision` slash command's supersede workflow uses non-existent
  `bd dep add --type related` syntax** (2026-05-04) — The
  upstream `beads` Claude Code plugin (in `beads-marketplace`, ships
  alongside the CLI from `gastownhall/beads`) includes a slash command at
  `plugins/beads/skills/beads/commands/decision.md` documenting the
  supersede workflow. Step 2 of supersede reads:
  `bd dep add <new-id> <old-id> --type related`. The `--type` flag does
  not exist on `bd dep add` (verified: `bd dep add --help` lists only
  `--blocked-by` and `--depends-on` aliases; attempting the documented
  command would fail with "unknown flag"). Net effect: any user/agent
  following the documented supersede workflow hits an error at step 2.
  Two possible fixes: (a) update the slash command to use what `bd dep add`
  supports (e.g. drop the `--type` flag and accept the default blocking
  relationship, or use a label/comment to capture the "related" semantic),
  OR (b) add `--type` flag to `bd dep add` (see related Feature Request
  above). Severity: degraded · Ownership: upstream · Workaround: partial
  — document the working syntax manually and avoid running the slash
  command's supersede helper.

- **`bd doctor`'s "Claude Hook Completeness" check ignores plugin-provided
  hooks** (2026-05-04) — `bd doctor` (v1.0.3) reports a "Missing hook
  event(s): PreCompact" warning when checking for SessionStart and
  PreCompact hooks, recommending `bd setup claude` as the fix. The check
  appears to scan only `~/.claude/settings.json` (where `bd setup claude
  --global` writes its hook config), and does not detect equivalent hooks
  provided by Claude Code plugins like the upstream `beads` plugin (which
  registers SessionStart + PreCompact running `bd prime`) or third-party
  plugins like `vp-beads` (which registers SessionStart with custom
  warnings/nudges and PreCompact). Net effect: users with the plugins
  installed see a false-positive warning suggesting they install
  redundant hooks that would actually double-fire (see related issue:
  vp-beads-0e9.3 spike investigating bd prime double-fire). Concrete fix:
  expand the check to also inspect `~/.claude/plugins/cache/*/plugin.json`
  hook declarations, OR have the check report "no hooks detected from
  settings.json — verify plugin coverage if installed" rather than
  prescribing a specific install command. Severity: minor · Ownership:
  upstream · Workaround: full — functionality is unaffected; only the
  doctor report is a false positive.

## Upstream Opportunities

_No entries yet._

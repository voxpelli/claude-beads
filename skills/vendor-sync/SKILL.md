---
name: vendor-sync
description: "Pull latest upstream changes from vendor subtrees into this project. Use when the user says 'sync vendor', 'pull upstream', 'update subtrees', 'vendor pull', 'vendor sync', 'sync vendors', 'vendor changes', or wants to update any vendor package from its upstream repository. Also use when the user mentions a vendor package name followed by 'pull', 'sync', or 'update'."
argument-hint: "[package-name]"
user-invocable: true
paths:
  - ".claude/vendor-registry.json"
  - "vendor/**"
  - "UPSTREAM-*.md"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - mcp__basic-memory__search_notes
  - mcp__basic-memory__read_note
  - mcp__basic-memory__edit_note
---

# Vendor Sync

Pull latest upstream changes into one or more vendor subtrees, cross-reference
the diff against open upstream issue tracking entries, and re-link workspace
packages.

## Registry

Read the vendor subtree registry from `.claude/vendor-registry.json`. Each
entry has the shape:

```json
{ "prefix": "vendor/pkg", "remote": "remote-name", "branch": "branch-name", "package": "@scope/pkg-name" }
```

- **prefix** — the local `vendor/` directory used as the subtree prefix
- **remote** — the git remote alias configured in this repo
- **branch** — the upstream branch to pull from
- **package** — the npm package name; maps to `UPSTREAM-<name>.md` filename
  (slashes → `--`, drop leading `@`): e.g. `@voxpelli/pkg` → `UPSTREAM-voxpelli--pkg.md`

Optional fields:

- **local-path** — alternative on-disk path for the subtree if it does not
  live at `prefix` (rare; used for monorepo layouts or CI checkout paths).
  When absent, skills use `prefix` as the on-disk location.

If `.claude/vendor-registry.json` does not exist, offer to create it via
workflow 0 (Bootstrap registry). Do not attempt to read the subtree
table from any other source.

### Local override file

`.claude/vendor-registry.local.json` is a gitignored companion that overrides
fields in the committed `.claude/vendor-registry.json`. It mirrors the
`settings.local.json` convention: machine-specific state stays out of version
control, while the committed registry documents the shared schema.

```json
[
  { "package": "@scope/pkg-name", "local-path": "/abs/path/to/checkout" }
]
```

Resolution rules:

1. Read `.claude/vendor-registry.json`.
2. If `.claude/vendor-registry.local.json` exists, read it and merge on top,
   matching entries by the `package` key (the most stable identifier across
   machines). Fields present in `.local.json` win; absent fields keep the
   base value.
3. Entries in `.local.json` whose `package` does not appear in the base
   registry are ignored — the base registry remains the authoritative source
   of which subtrees exist.

Vendor subtrees almost always live at their `prefix` and don't need local
overrides — this companion exists for symmetry with `synergy-registry.local.json`
and for the rare monorepo or non-standard checkout case. Never commit
`.claude/vendor-registry.local.json`: it encodes machine-specific paths.

## Workflow

### 0. Bootstrap registry

Run this workflow when the user wants to create `.claude/vendor-registry.json`
from scratch, or when workflow 1 (Determine scope) redirects here because no
registry exists. The flow derives most fields from the working tree and prompts
only at the residuals.

> **Precondition: the vendor subtree must already exist on disk under
> `vendor/`.** This workflow registers an existing subtree; it does NOT
> add new ones. To add a new subtree, first run
> `git subtree add --prefix vendor/<name> <remote> <branch> --squash`
> (the user runs this themselves), then invoke workflow 0 (Bootstrap
> registry) to register it.

1. **Detect candidate vendor directories.**

   ```bash
   find vendor/ -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort
   ```

   If the command returns nothing (no `vendor/` directory at all, or it is
   empty), ask the user for an explicit subtree path. If multiple candidates
   are returned, process them one at a time — one preview-confirm cycle per
   entry — rather than batching, so each entry can be derived and corrected
   independently.

2. **Auto-derive fields for each candidate.** For a candidate at `<dir>`:

   - `prefix` — the directory path itself (e.g. `vendor/foo`).
   - `branch` — query the upstream branch from the candidate remote once it
     is known (see step 3):

     ```bash
     git remote show <remote> 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}'
     ```

     If the command fails, returns empty, or yields the literal `(unknown)`
     (which `git remote show` emits when the remote has no HEAD set), default
     to `main`. Treat any captured value containing parentheses or other
     non-`[A-Za-z0-9._/-]` characters the same way.
   - `package` — read `<dir>/package.json` if present:

     ```bash
     node -e "try{const p=require('./<dir>/package.json');const n=(p&&typeof p==='object'?p.name:'')||'';if(n)console.log(n)}catch{}"
     ```

     If the output is blank (empty or whitespace only), ask the user for
     the package name.

3. **Prompt only the residuals.** Use at most two `AskUserQuestion` calls (each
   `header` field stays within the 12-character SDK cap):

   - `header: "Remote"` — present a menu of remote aliases gathered from
     `git remote -v | awk '{print $1}' | sort -u | grep -v '^origin$'`. If
     the list is empty, ask the user to type both an alias and the upstream
     URL, and instruct them to run `git remote add <alias> <url>` themselves
     before continuing — do not run `git remote add` automatically.
   - `header: "Local path"` — only ask when the on-disk subtree lives
     somewhere other than `prefix` (rare monorepo or alt-checkout case). The
     answer feeds `.claude/vendor-registry.local.json`, never the committed
     base registry.

4. **Preview both files in a single message** before writing. Show the
   proposed `.claude/vendor-registry.json` entry and, when a `local-path` was
   provided, the proposed `.claude/vendor-registry.local.json` entry. Ask
   `Confirm? [yes / edit / skip]`. On `edit`, re-prompt the affected derived
   field individually. On `skip`, **discard this candidate (do not write)
   and continue to the next candidate** in the multi-candidate batch — do
   NOT abort the entire workflow on a per-entry skip. After all candidates
   are processed, the final report (step 8 below) lists which entries were
   written and which were skipped. On `yes`, proceed to step 5.

5. **Write both files** via the `Write` tool. Always write base and
   `.local.json` separately — never embed `local-path` in the committed
   registry. If the base registry already exists (returning user adding a
   second entry), this workflow does not append; that case is tracked
   separately and falls back to manual editing for now.

6. **Verify round-trip parse.** Use the `Read` tool to re-read each written
   file, then validate the JSON via
   `node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' <path>`
   (any non-zero exit signals invalid JSON). Confirm the required fields
   are present:
   - Base entry must have `prefix`, `remote`, `branch`, `package`.
   - `.local.json` entry, when written, must have `package` and `local-path`.

   On base-registry parse failure or missing required fields, abort
   workflow 0 (Bootstrap registry) entirely — report the failure and offer
   to re-run. On
   `.local.json` parse failure only, warn and continue without the local
   override (the base registry alone is still usable).

7. **Check `.local.json` gitignore status.** When a `.local.json` was
   written, run:

   ```bash
   git check-ignore -q .claude/vendor-registry.local.json
   ```

   Exit status semantics: `0` = file is gitignored (no action); `1` = file
   is **not** gitignored — warn the user with the exact line to add: "Add
   `.claude/*.local.json` to your `.gitignore` (covers both
   vendor-registry.local.json and synergy-registry.local.json, and is
   forward-compatible with future `.local.json` registries)." Do not
   auto-edit `.gitignore` — it is user-owned. `128` = the check itself
   failed (not a git repo, or another git error) — report the underlying
   error and skip the gitignore warning rather than emitting a
   false-positive.

8. **Resume to workflow 1 (Determine scope).** Once verification passes, the
   newly created registry is ready for the rest of the sync flow.

The `UPSTREAM-<package>.md` filename for each new entry follows the standard
convention: slashes → `--`, drop leading `@` (e.g. `@scope/pkg` →
`UPSTREAM-scope--pkg.md`). Workflow 1 (Determine scope) and downstream steps
will create these files lazily; workflow 0 (Bootstrap registry) does not pre-create them.

### 1. Determine scope

Read and parse `.claude/vendor-registry.json`. If
`.claude/vendor-registry.local.json` exists, read it and merge on top per the
resolution rules in the Registry section above (per-entry merge by `package`
key; fields in `.local.json` win). Then determine which subtrees to pull:

- If the user names a specific package (by prefix directory, remote alias, or
  package name), pull only that entry
- Match casual names: "auth" → the entry whose remote or package contains
  "auth"; resolve ambiguity by asking
- If the user says "all" or does not specify, pull all entries

### 2. Check working tree

```bash
git status
```

Subtree pulls create merge commits; the working tree must be clean. If there
are uncommitted changes, warn the user and ask whether to proceed.

### 3. Pull each subtree

Before pulling, capture the current HEAD so later steps can diff accurately
even if conflict resolution adds extra commits:

```bash
PRE_PULL_HEAD=$(git rev-parse HEAD)
```

For each selected entry, run:

```bash
git subtree pull --prefix <prefix> <remote> <branch> --squash
```

Use the git remote alias from the registry, not a full URL. The `--squash`
flag collapses upstream history into a single merge commit.

If the pull reports "Already up to date", say so and skip the remaining steps
for that entry.

### 4. Resolve conflicts

First check whether any conflicts exist:

```bash
git diff --name-only --diff-filter=U
```

If the output is empty, no conflicts — skip to step 5. If conflicts exist, for
modify/delete conflicts (upstream deleted a file that was locally modified from
a previous squash pull), always accept the upstream version:

- Deletions: `git rm <file>`
- Content conflicts: `git checkout --theirs <file>`

Vendor directories must mirror upstream exactly.

### 5. Clean stale vendor node_modules

Remove any leftover `node_modules/` inside each pulled vendor directory before
running npm install. These are untracked artifacts from previous installs that
can poison npm workspace resolution:

```bash
rm -rf <prefix>/node_modules
```

Run this for every entry that was pulled.

### 6. Re-link workspaces

```bash
npm install
```

This updates workspace symlinks after subtree contents change.

### 7. Cross-reference changelog against UPSTREAM tracking files

For each pulled subtree that has a `CHANGELOG.md` (or `CHANGES.md`, `HISTORY.md`)
in its prefix directory, extract the changelog entries added by the pull:

```bash
git diff $PRE_PULL_HEAD -- <prefix>/CHANGELOG.md
```

Parse the added lines (those starting with `+`) to identify new changelog entries
(bug fixes, features, breaking changes). Compare each entry against the open items
in the corresponding `UPSTREAM-<package>.md` file — including `## Upstream
Opportunities` entries. If a changelog entry clearly addresses an open UPSTREAM
item (matching keywords, issue references, or described behavior), flag it as a
candidate for auto-resolution with your confidence level. For Upstream
Opportunities: if a changelog entry mentions a merged feature that matches a local
opportunity by keyword or upstream PR URL, flag as a **contribution-resolved**
event at high confidence.

- **High confidence** — changelog explicitly mentions the bug/feature by name or
  references the same upstream issue URL
- **Medium confidence** — changelog describes a fix/feature in the same area as
  the UPSTREAM entry but doesn't reference it directly
- **Low confidence** — only a vague topical match; mention but don't auto-resolve

For high-confidence matches, proceed to resolve the entry in step 8. For medium
confidence, note the match in the report and let the user decide. Skip low
confidence matches in the resolution step but mention them in the report.

If no changelog file exists in the pulled prefix, skip this step for that entry
and rely solely on the code diff cross-reference in step 8.

### 8. Cross-reference code diff against UPSTREAM tracking files

This is the primary resolution mechanism — do not defer this to the retro.

For each pulled subtree, capture the full sync diff scoped to the vendor
directory (not just the summary):

```bash
git show HEAD -- <prefix>
```

Read the corresponding `UPSTREAM-<package>.md` file (derived from the
registry `package` field). For each open entry in that file, check whether
the sync diff visibly addresses the issue (bug fixed, feature added, API
changed). If an entry appears resolved by the diff:

1. Delete the entry from the tracking file
2. For vendor files: if the section is now empty, restore the
   `_No entries yet._` placeholder
3. Note each deleted entry in your report

If no tracking file exists for a pulled package, skip this step for that entry.

### 8b. Annotate Basic Memory friction entries

For each entry auto-resolved in steps 7–8, check whether a corresponding
Basic Memory entity note exists with an `## Upstream Friction` section. If
Basic Memory MCP tools are available:

1. Call `mcp__basic-memory__search_notes` with the package name
2. If a note exists, call `mcp__basic-memory__read_note` to check for a
   matching friction entry
3. If found, call `mcp__basic-memory__edit_note` with `find_replace` to append
   an annotation to the matching entry's line. Use entry-type-specific text:
   - **Bugs / Feature Requests:** `_(Resolved by vendor-sync YYYY-MM-DD)_`
   - **Upstream Opportunities:** `_(Contributed upstream, merged YYYY-MM-DD)_`
   Use `expected_replacements=1`. Always match against the note's exact text.
4. Annotation only — never delete entries, never move them to `### Resolved`.
   The upstream-tracker's workflow 6 (Promote to Basic Memory) handles pruning
   during its prune pass.

If Basic Memory tools are not available or no matching entry exists, skip
silently. This annotation step is best-effort — vendor-sync works identically
without it, and stale Basic Memory entries are caught by trend review.

### 9. Verify

Check `package.json` scripts and run the most comprehensive available
verification in order of preference:

1. `npm run check && npm test` — if both scripts exist
2. `npm run check` — if only `check` exists
3. `npm test` — if only `test` exists

Show the last 5 lines of output. If verification fails after a pull, report
the errors. The user may need to adapt app code to upstream API changes.

### 10. Report

Summarize the results:

- Which subtrees were pulled and whether there were changes
- Which UPSTREAM entries were resolved (deleted) and why
- Whether verification passed
- Any app-side implications from the upstream changes (API changes, new
  exports, behavioral differences visible in the diff)
- If any resolved UPSTREAM entries overlap with Extraction Candidates in
  `SYNERGY-*.md` files (e.g., a feature extracted to the shared upstream),
  mention the overlap so the user can update the SYNERGY file via
  `/synergy-tracker`

## Guidelines

- **Division of labor.** vendor-sync owns UPSTREAM auto-resolution during
  subtree pulls. It does not modify SYNERGY files — cross-project pattern
  tracking is managed by `/synergy-tracker`.
- **Registry-first discovery.** Refuses to proceed without
  `.claude/vendor-registry.json` — no guessing at subtree prefixes.
- **Annotation semantics.** BM annotation-only (step 8b) — never delete or
  move entries in `## Upstream Friction`. The upstream-tracker's workflow 6 (Promote to Basic Memory)
  handles pruning during its prune pass.

## Error handling

- **Registry not found** — tell the user this project has no
  `.claude/vendor-registry.json` and offer to run workflow 0 (Bootstrap
  registry) to create it interactively. If the user agrees, run workflow 0
  (Bootstrap registry), then resume. Otherwise stop.
- **No changes** — if a pull reports "Already up to date", skip steps 4–8b for
  that entry and note it in the report.
- **npm install failures** — most commonly caused by stale `node_modules/`
  inside vendor directories (step 5). If install fails after cleaning those,
  check for peer dependency conflicts between vendor devDependencies and the
  root project.
- **Verification failures** — report errors. Do not attempt auto-fixes unless
  the failure is clearly a stale artifact (re-run npm install and retry once).
- **Subtree heuristics fail** — if `git subtree pull` errors because git cannot
  identify the subtree prefix correctly, use the explicit merge fallback:
  ```bash
  git fetch <remote> <branch>
  git merge -X subtree=<prefix> --squash <remote>/<branch>
  ```
  Then proceed from step 4 (conflict resolution) normally.

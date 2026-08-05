# `pull` — vendor subtree sync + auto-resolve

Pull latest upstream changes into one or more vendor subtrees, cross-reference the diff
against open `UPSTREAM-*.md` entries, auto-resolve what the diff addresses, and re-link
workspaces. Upstream-object only (there is no sibling subtree to pull).

**Registry-FIRST, refuse-to-guess.** `pull` reads `.claude/vendor-registry.json`
`{prefix, remote, branch, package}` (+ `.local.json` override, per `SKILL.md`). It
**refuses to proceed without a registry** — no guessing at subtree prefixes — and offers
`0. Bootstrap registry` instead. (This is a deliberately stricter stance than the sibling
modes' optional/degrade registry handling — do not conflate them.)

## 0. Bootstrap registry

Run when the user wants to create `.claude/vendor-registry.json`, or when scope determination
redirects here. Derives most fields from the working tree; prompts only residuals.

> **Precondition: the subtree must already exist on disk under `vendor/`.** This registers an
> existing subtree; it does not add new ones. To add one, the user first runs
> `git subtree add --prefix vendor/<name> <remote> <branch> --squash` themselves.

1. **Detect candidates:** `find vendor/ -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort`.
   Nothing returned → ask for an explicit path. Multiple → process one at a time
   (preview-confirm per entry, not batched).
2. **Auto-derive per candidate `<dir>`:** `prefix` = the dir; `branch` =
   `git remote show <remote> | grep 'HEAD branch' | awk '{print $NF}'` (default `main` on
   failure/empty/`(unknown)`/non-`[A-Za-z0-9._/-]`); `package` = read `<dir>/package.json`
   `name` (ask if blank).
3. **Prompt residuals** (≤2 `AskUserQuestion`, `header` ≤12 chars): `header: "Remote"` (menu
   from `git remote -v | awk '{print $1}' | sort -u | grep -v '^origin$'`; if empty, ask for
   alias + URL and instruct the user to run `git remote add` themselves — never auto-add);
   `header: "Local path"` only when the subtree lives somewhere other than `prefix` (feeds
   `.local.json`, never the committed base).
4. **Preview both files** in one message; ask `Confirm? [yes / edit / skip]`. On `edit`,
   re-prompt the affected field. On `skip`, **discard this candidate and continue to the next**
   — do NOT abort the batch. On `yes`, proceed.
5. **Write both files** (`Write`); base and `.local.json` always separate — never embed
   `local-path` in the committed registry. Appending to an existing base registry is not
   supported (falls back to manual editing).
6. **Verify round-trip:** re-read each file and `node -e
   'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' <path>`. Base must have
   `prefix, remote, branch, package`; `.local.json` (if written) must have
   `package, local-path`. Base parse/field failure → abort bootstrap and offer to re-run;
   `.local.json`-only failure → warn and continue without the override.
7. **Check `.local.json` gitignore** (`git check-ignore -q .claude/vendor-registry.local.json`):
   `0` = ignored (ok); `1` = warn to add `.claude/*.local.json` (do NOT auto-edit
   `.gitignore` — user-owned); `128` = report the underlying error and skip the warning.
8. **Resume** to scope determination.

## 1–10. The pull pipeline

1. **Determine scope.** Parse the registry (+ `.local.json` override). Pull the named entry
   (match by prefix dir / remote / package; resolve ambiguity by asking), or all entries if
   "all"/unspecified.
2. **Check working tree** (`git status`). Subtree pulls create merge commits — the tree must
   be clean; if not, warn and ask whether to proceed.
3. **Pull each subtree.** Capture `PRE_PULL_HEAD=$(git rev-parse HEAD)` first (so later diffs
   are accurate even if conflict resolution adds commits), then
   `git subtree pull --prefix <prefix> <remote> <branch> --squash` (alias from the registry,
   not a URL). "Already up to date" → skip the rest for that entry.
4. **Resolve conflicts.** `git diff --name-only --diff-filter=U`; if empty, skip to 5. For
   modify/delete conflicts, **always accept upstream** (`git rm <file>` for deletions,
   `git checkout --theirs <file>` for content) — vendor dirs must mirror upstream exactly.
5. **Clean stale vendor `node_modules`:** `rm -rf <prefix>/node_modules` for each pulled
   entry (untracked artifacts poison workspace resolution).
6. **Re-link workspaces:** `npm install`.
7. **Cross-reference changelog.** For each pulled subtree with a `CHANGELOG.md` (or
   `CHANGES.md`/`HISTORY.md`), `git diff $PRE_PULL_HEAD -- <prefix>/CHANGELOG.md`; parse added
   (`+`) lines and compare against open `UPSTREAM-<package>.md` items (incl. Upstream
   Opportunities). Confidence bands: **High** (changelog names the bug/feature or the same
   issue URL) → auto-resolve in step 8; **Medium** (same area, no direct reference) → note,
   user decides; **Low** (vague topical) → mention only. For Opportunities, a merged feature
   matching by keyword/PR URL is a **contribution-resolved** event at high confidence. No
   changelog → skip, rely on step 8.
8. **Cross-reference code diff (primary resolution — do not defer to the retro).** For each
   pulled subtree, `git show HEAD -- <prefix>`; read `UPSTREAM-<package>.md`; for each open
   entry the diff visibly addresses (bug fixed, feature added, API changed): delete the entry;
   for vendor files restore `_No entries yet._` if the section empties; note each deletion.
   * **8b. Annotate Basic Memory (annotation-only).** For each auto-resolved entry, if BM
     tools are available: `search_notes` the package → `read_note` for a matching friction
     entry → `edit_note` `find_replace` to append (`expected_replacements=1`, match exact
     text): Bugs/Feature Requests `_(Resolved by ledger pull YYYY-MM-DD)_`, Opportunities
     `_(Contributed upstream, merged YYYY-MM-DD)_`. **Never delete or move to `### Resolved`**
     — pruning is `promote`'s job. Best-effort; skip silently if unavailable.
9. **Verify.** Run the most comprehensive available: `npm run check && npm test`, else
   `npm run check`, else `npm test`. Show the last 5 lines. On failure, report — the user may
   need to adapt app code to upstream API changes.
10. **Report:** which subtrees pulled and whether they changed; which UPSTREAM entries
    resolved and why; whether verification passed; app-side implications (API changes, new
    exports); and any resolved UPSTREAM entries overlapping `SYNERGY-*.md` Extraction
    Candidates (so the user can update the SYNERGY file via `log` (sibling)).

## Error handling

* **Registry not found** — offer `0. Bootstrap registry`; otherwise stop.
* **No changes** — "Already up to date" skips steps 4–8b for that entry.
* **npm install failures** — usually stale vendor `node_modules` (step 5); else check peer-dep
  conflicts between vendor devDependencies and the root.
* **Verification failures** — report; do not auto-fix unless clearly a stale artifact (re-run
  `npm install` and retry once).
* **Subtree heuristics fail** — explicit merge fallback: `git fetch <remote> <branch>` then
  `git merge -X subtree=<prefix> --squash <remote>/<branch>`, then resume from step 4.

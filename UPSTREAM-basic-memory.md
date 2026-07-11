# UPSTREAM-basic-memory

Tracking friction with [Basic Memory](https://github.com/basicmachines-co/basic-memory) — the
local-first knowledge graph this plugin's skills read and write via `mcp__basic-memory__*`.

## Feature Requests

_No entries yet._

## Bugs

- **The sync path duplicates observation rows in the index — 19% of all observations are
  duplicates** (2026-07-11) \[broken\] — 241 of 1,654 entities (14.6%) carry every observation
  **two or three times** in Basic Memory's SQLite index. The markdown files on disk are **clean**.
  This is index corruption, not note corruption.

  ```
  file  ~/basic-memory/npm/npm-markdown-or-chalk.md → 23 observation lines, 23 distinct  (clean)
  index observation table for that entity          → 48 rows,             24 distinct  (2x)

  graph-wide:  26,832 observation rows / 21,740 distinct (entity, content) pairs
               → 5,092 duplicate rows · 241 of 1,654 entities affected · factor 2x, some 3x
  ```

  `bm status` reports **"No changes"** and `bm doctor` **passes** — the health vocabulary believes
  the index is consistent while 19% of its observation rows are duplicates. **That detection gap is
  the reproducible half of this entry**, and the part worth acting on.

  **The mechanism is NOT established, and this entry does not pretend it is.** The duplicates are
  _historical_: the current write path is clean. Tested by editing three notes and re-measuring —
  a `find_replace` that deleted observations (12 rows / 12 distinct), a relation rename (7/7), and
  a whole-section insert (63/63 → 64/64, adding exactly one row). None duplicated anything. So
  `edit_note` does not reproduce it, and the origin (an older version, an interrupted sync, a
  migration) is unknown.

  **Correction — the tool is not lying.** This entry previously claimed that `schema_validate`
  "double-counts every observation and invents a phantom `note` category". Both halves were
  **wrong**, and wrong in the direction that blamed the tool instead of the data:

  - `schema_validate` reports the index **faithfully**. It returns each observation twice because
    the observation _is in the database twice_. Verified by querying the `observation` table
    directly against the file on disk.
  - The `note` category is **real**, not phantom. Basic Memory parses _any_ `- ` bullet as an
    observation, and an uncategorized one defaults to category `note`. The single `note`
    observation on that entity is the `## Upstream Friction` bullet — a section **this project's
    own `/upstream-tracker` writes**. It then gets duplicated like everything else. (Whether BM
    _should_ parse non-`## Observations` bullets as observations is a separate, milder question.)
  - **`schema_diff` is unaffected.** Its counts are note-presence counts, not observation counts:
    the denominator (343 engineering notes) matches `bm project info` exactly, several of its
    numerators are **odd** (31, 19, 23, 11 — a doubled integer cannot be odd), and `new_fields`
    is empty, so the `note` category is not leaking into it either. The earlier claim that
    "every schema-evolution decision is being made on inflated numbers" is **refuted**;
    schema-evolution thresholds read clean data.

  Severity: broken (silent data-integrity loss in the index) · Ownership: upstream
  (basic-memory 0.22.1) · Workaround: **full, and local** — the markdown files are the source of
  truth and are clean, so `bm reset --reindex` (drop tables, rebuild from filesystem) should
  restore a correct index. Because the current write path tests clean, this is expected to be a
  _durable_ fix rather than temporary relief — but that has not been executed or re-measured yet,
  and the sentence will be corrected here if it turns out otherwise. It refuses to run while MCP
  clients are attached.

  Related upstream history — this is the same bug _class_ the project has been chasing:
  v0.22.0 PR #946 (`build_context` duplicate-observation hydration when entity and observation
  permalinks diverge) and v0.22.1 PR #986 (vector-search hydration id collisions). Both were
  read-path fixes; this one is on the **write/sync path**, and the duplicate rows survive in the
  database.

  **Prior art:** searched `basicmachines-co/basic-memory` (107 open issues) for `schema_validate`
  and for duplicate/double-counted observations — **no existing report**.

  <details>
  <summary><strong>Drafted GitHub issue — NOT FILED.</strong> Paste-ready; filing needs an explicit go-ahead.</summary>

  **Title:** `[BUG] bm status / bm doctor report a healthy index while 19% of observation rows are duplicates (files are clean)`

  **Body:**

  ````markdown
  ### Summary

  Basic Memory's index accumulates **duplicate observation rows**. The markdown files on disk are
  clean — each observation appears once — but the `observation` table holds the same
  `(entity_id, content)` pair two or three times. In my graph, **5,092 of 26,832 observation rows
  (19%) are duplicates, across 241 of 1,654 entities (14.6%)**.

  `bm status` reports "No changes" and `bm doctor` passes. Nothing in the health vocabulary
  surfaces this, so it is invisible until a tool reads observations back.

  ### Version

  `basic-memory 0.22.1` (Homebrew tap, SQLite backend)

  ### Reproduction / evidence

  Compare one note's file against its index rows:

  ```sh
  $ grep -cE '^- \[' ~/basic-memory/npm/npm-markdown-or-chalk.md          # file
  23
  $ grep -E '^- \[' ~/basic-memory/npm/npm-markdown-or-chalk.md | sort -u | wc -l
  23                                                                       # clean, no dupes

  $ sqlite3 ~/.basic-memory/memory.db "
      SELECT COUNT(*), COUNT(DISTINCT o.content)
      FROM observation o JOIN entity e ON o.entity_id = e.id
      WHERE e.permalink = 'main/npm/npm-markdown-or-chalk';"
  48|24                                                                    # every row stored twice
  ```

  Graph-wide:

  ```sh
  $ sqlite3 ~/.basic-memory/memory.db "
      SELECT COUNT(*) FROM (
        SELECT e.id FROM entity e JOIN observation o ON o.entity_id = e.id
        GROUP BY e.id HAVING COUNT(*) > COUNT(DISTINCT o.content));"
  241                                    # entities with duplicated observations (of 1,654)

  $ sqlite3 ~/.basic-memory/memory.db "SELECT COUNT(*) FROM observation;"
  26832
  $ sqlite3 ~/.basic-memory/memory.db "
      SELECT COUNT(*) FROM (SELECT DISTINCT entity_id, content FROM observation);"
  21740                                  # → 5,092 duplicate rows
  ```

  The duplication factor is almost always exactly **2×**, occasionally **3×**.

  ### What I could NOT establish: the mechanism

  I cannot reproduce the *insertion*. The current write path appears clean — I edited three notes
  and re-measured each: a `find_replace` deleting observations (12 rows / 12 distinct), a relation
  rename (7/7), and a whole-section insert (63 → 64 rows, 64 distinct, adding exactly one row).
  None duplicated anything.

  So these duplicates are **historical** — left by an older version, an interrupted sync, or a
  migration. I am reporting the *state* and the *detection gap*, not a reproduction of the write.

  ### The reproducible defect: the health tooling cannot see it

  `bm status` → `No changes`. `bm doctor` → `Doctor checks passed.` Both on the index measured
  above. Whatever wrote the duplicates, **nothing in the health vocabulary detects that the index
  diverges from the files** — which is what let 5,092 duplicate rows sit unnoticed. A file-vs-index
  consistency check (observation row count per entity vs observation lines per file) would surface
  this class immediately.

  ### Impact

  Any tool that reads observations back through the index reports inflated data. `schema_validate`
  returns each observation twice in `field_results[].values` and in `unmatched_observations` — and
  it is *correct to do so*, because the rows really are there. It still reports `passed: true`,
  `0 errors`: the note is valid, the index is not. An agent auditing its own knowledge graph is
  therefore reading doubled counts and cannot tell.

  (`schema_diff` appears unaffected — its counts are note-presence counts, not observation counts.)

  ### Expected

  A re-sync of an unchanged or edited file should leave exactly one observation row per
  observation line. `bm status` / `bm doctor` should be able to detect divergence between file
  and index.

  ### Workaround

  `bm reset --reindex` rebuilds the index from the filesystem (the files are the source of truth
  and are clean). Since the current write path tests clean, this should be durable rather than
  temporary relief.
  ````

  </details>

## Upstream Opportunities

_No entries yet._

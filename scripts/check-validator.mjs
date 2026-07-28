/**
 * Unit tests for validate-plugin.mjs audit helpers.
 *
 * Currently covers `auditSilentSkips` (the Files-availability regression
 * guard): planted violations must be flagged, while the canonical Tier C
 * sentence and legitimate non-tracker silent skips must stay clean.
 */

import { auditSilentSkips } from './audit-silent-skips.mjs'

let passed = 0
let failed = 0

/**
 * @param {string} name
 * @param {boolean} cond
 */
function assert (name, cond) {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}`)
  }
}

console.log('auditSilentSkips')

// Planted violation: skips a tracker step silently with no announce/Tier marker.
assert(
  'flags a planted un-announced tracker silent-skip',
  auditSilentSkips('- No `.diarie/tasks/` directory — skip the `ready-walker` read silently; carry on.').length === 1
)

// Canonical Tier C sentence — exempt via the "Tier" / "announce" markers.
assert(
  'does not flag the canonical Tier C announce bullet',
  auditSilentSkips(
    '- **Tracker unavailable** (Tier C) — when unavailable, announce it and run the rest; do not skip the `ready-walker` steps silently.'
  ).length === 0
)

// Legit non-tracker silent skip (Basic Memory / SYNERGY) — no tracker token.
assert(
  'does not flag a non-tracker silent skip (Basic Memory)',
  auditSilentSkips('- If Basic Memory tools are not available, skip this sub-step silently.').length === 0
)

// `diarie …` inside a fenced code block must not trip the check.
assert(
  'ignores tracker commands inside fenced code blocks',
  auditSilentSkips('Some prose.\n\n```bash\ndiarie ready   # skip silently\n```\n').length === 0
)

// The post-rename vocabulary. diarie renames its store to `diarium/`|`.diarium/`, so prose written
// against the new name must trip the audit exactly as the old name does — otherwise the convention
// quietly stops being enforced on the day the rename lands, with nothing going red.
assert(
  'flags a silent-skip written in the post-rename `diarium` vocabulary',
  auditSilentSkips('- No `.diarium/tasks/` directory — skip the read silently; carry on.').length === 1
)

// The near-miss that actually exercises the `\b` anchors. `diaries` CONTAINS `diarie`, so it matches
// the bare alternation and is rejected only by the trailing word boundary — delete the anchors and
// this assertion goes red. An earlier fixture used `diarist`, which contains neither `diarie` nor
// `diarium` and therefore passed identically with the anchors removed: a test for the alternation
// wearing the label of a test for the boundary.
assert(
  'does not flag `diaries` — a word CONTAINING the vocabulary but not equal to it',
  auditSilentSkips('- The diaries are skipped silently.').length === 0
)

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

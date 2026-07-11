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

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

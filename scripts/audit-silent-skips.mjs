/**
 * Audit skill/agent prose for un-announced silent-skip of tracker steps.
 *
 * The Files-availability convention (CLAUDE.md `### Files-availability
 * convention`) declares that **silently skipping a tracker step is a bug**: a
 * Tier C component must *announce* each degraded step. Legitimate silent skips
 * of non-tracker concerns (UPSTREAM / SYNERGY / Basic Memory availability) are
 * fine and are NOT flagged — they do not mention the tracker (`ready-walker` /
 * `.diarie` / `diarie`).
 *
 * Warn-level heuristic. Operates on logical units (list items / paragraphs)
 * after masking YAML frontmatter and fenced code blocks, so `ready-walker …`
 * command examples in fences do not trip it. A unit is flagged when it mentions
 * skipping (`skip` + `silent`/`silently`) AND a tracker token (see
 * `TRACKER_VOCABULARY`) but lacks an exemption marker (`announce` or `Tier`).
 *
 * Pure: returns findings rather than mutating shared state, so it is unit-
 * testable in isolation (see `scripts/check-validator.mjs`).
 */

// The store-dir vocabulary this audit looks for IN PROSE. Deliberately NOT `TRACKER_DIR` from
// `diarie/schema`: that constant is being REMOVED upstream (diarie renames the store to
// `diarium/`|`.diarium/` and replaces the singular constant with `TRACKER_DIRS` / `trackerDirIn()`),
// so importing it couples this audit's survival to a shape that is changing. It also never needed
// the constant — this is prose token matching, not path construction, and the old
// `t.includes(TRACKER_DIR)` disjunct was already redundant beside `/\bdiarie\b/` (`.diarie` has a
// word boundary before `d`). Matching both vocabularies keeps the audit working across the rename
// with no dependency on which name won.
const TRACKER_VOCABULARY = /\bready-walker\b|\bdiari(?:e|um)\b/

// Module-scope line helpers — pure, so they are not re-created per call.
const blank = (/** @type {string} */ slice) => slice.replaceAll(/[^\n]/g, ' ')
const isListItem = (/** @type {string} */ l) => /^\s*(?:[-*+]|\d+\.)\s/.test(l)
const isHeading = (/** @type {string} */ l) => /^\s*#/.test(l)

/**
 * @param {string} content - Raw markdown file contents.
 * @returns {{ line: number, snippet: string }[]} One finding per offending unit.
 */
export function auditSilentSkips (content) {
  const masked = content
    .replace(/^---\n[\s\S]*?\n---/, blank) // YAML frontmatter (file top)
    .replaceAll(/```[\s\S]*?```/g, blank) // fenced code blocks

  const lines = masked.split('\n')

  /** @type {{ startLine: number, text: string }[]} */
  const units = []
  /** @type {{ startLine: number, text: string } | undefined} */
  let cur

  for (const [i, line] of lines.entries()) {
    if (line.trim() === '' || isHeading(line)) {
      cur = undefined
      continue
    }
    if (isListItem(line) || cur === undefined) {
      cur = { startLine: i + 1, text: line }
      units.push(cur)
    } else {
      cur.text += ' ' + line
    }
  }

  /** @type {{ line: number, snippet: string }[]} */
  const findings = []
  for (const u of units) {
    const t = u.text.toLowerCase()
    const skips = t.includes('skip') && /silent(?:ly)?/.test(t)
    const tracker = TRACKER_VOCABULARY.test(t)
    const exempt = t.includes('announce') || t.includes('tier')
    if (skips && tracker && !exempt) {
      findings.push({ line: u.startLine, snippet: u.text.trim().slice(0, 120) })
    }
  }
  return findings
}

/**
 * Audit skill/agent prose for un-announced silent-skip of beads steps.
 *
 * The Beads-availability convention (CLAUDE.md `### Beads-availability
 * convention`) declares that **silently skipping a `bd` step is a bug**: a
 * Tier C component must *announce* each degraded step, and a Tier B component
 * stops explicitly. Legitimate silent skips of non-beads concerns (UPSTREAM /
 * SYNERGY / Basic Memory availability) are fine and are NOT flagged — they do
 * not mention `bd` / `.beads`.
 *
 * Warn-level heuristic. Operates on logical units (list items / paragraphs)
 * after masking YAML frontmatter and fenced code blocks, so `bd …` command
 * examples in fences do not trip it. A unit is flagged when it mentions
 * skipping (`skip` + `silent`/`silently`) AND a beads token (`bd` as a word, or
 * `.beads`) but lacks an exemption marker (`announce` or `Tier`).
 *
 * Pure: returns findings rather than mutating shared state, so it is unit-
 * testable in isolation (see `scripts/check-validator.mjs`).
 *
 * @param {string} content - Raw markdown file contents.
 * @returns {{ line: number, snippet: string }[]} One finding per offending unit.
 */
export function auditSilentSkips (content) {
  const blank = (/** @type {string} */ slice) => slice.replace(/[^\n]/g, ' ')

  const masked = content
    .replace(/^---\n[\s\S]*?\n---/, blank) // YAML frontmatter (file top)
    .replace(/```[\s\S]*?```/g, blank) // fenced code blocks

  const lines = masked.split('\n')
  const isListItem = (/** @type {string} */ l) => /^\s*([-*+]|\d+\.)\s/.test(l)
  const isHeading = (/** @type {string} */ l) => /^\s*#/.test(l)

  /** @type {{ startLine: number, text: string }[]} */
  const units = []
  /** @type {{ startLine: number, text: string } | null} */
  let cur = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '' || isHeading(line)) {
      cur = null
      continue
    }
    if (isListItem(line) || cur === null) {
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
    const skips = t.includes('skip') && /silent(ly)?/.test(t)
    const beads = /\bbd\b/.test(t) || t.includes('.beads')
    const exempt = t.includes('announce') || t.includes('tier')
    if (skips && beads && !exempt) {
      findings.push({ line: u.startLine, snippet: u.text.trim().slice(0, 120) })
    }
  }
  return findings
}

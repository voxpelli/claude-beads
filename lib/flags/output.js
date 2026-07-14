/**
 * Output flags — shared by every command that prints a result.
 *
 * `--json` is the template's convention (`-j`). The loose scripts this CLI replaced were
 * inconsistent about it — one spelled it `--format json`, its sibling `--json` — and a greenfield
 * CLI should not inherit an incoherence from tools that no longer exist.
 *
 * No validator: a boolean cannot be malformed. A group earns a `validate*Flags`
 * when it has something to coerce or reject — see `filter.js` and `staleness.js`.
 */

export const outputFlags = /** @satisfies {import('peowly').AnyFlags} */ ({
  json: {
    description: 'Output the result as JSON',
    listGroup: 'Output options',
    type: 'boolean',
    'default': false,
    'short': 'j',
  },
})

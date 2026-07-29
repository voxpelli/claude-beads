/**
 * Local ESLint rule: a JSDoc tag description (`@property`, `@param`, `@returns`,
 * etc.) must stay on one physical comment line, and the description text itself
 * (excluding the leading `@tag {type} name`) is capped at a maximum length.
 *
 * Adopted from voxpelli/liggare-mcp (`eslint-local-rules/`). No published
 * eslint-plugin-jsdoc rule covers this: `multiline-blocks`
 * (`noMultilineBlocks`/`multilineTags`) only decides whether a WHOLE comment
 * block collapses to one line, and errors out the moment a block carries more
 * than one tag — it cannot allow a multi-`@property` typedef to stay multi-line
 * while still forbidding any ONE tag's description from wrapping onto a
 * continuation line. Upstream gajus/eslint-plugin-jsdoc#1158 (closed as the
 * whole-block `requireSingleLineUnderCount` option) is the closest existing
 * feature and still whole-block granularity, not per-tag.
 *
 * Built on `comment-parser` (the tokenizer eslint-plugin-jsdoc itself uses under
 * `@es-joy/jsdoccomment`) rather than a hand-rolled regex: its per-tag `source`
 * array already separates a tag's own multi-line `{type}` (e.g.
 * `@type {{ foo: () => void }}`, spanning several lines with an EMPTY
 * `tokens.description` on each) from genuine wrapped prose (non-empty
 * `tokens.description` on more than one source line) — the exact distinction a
 * regex/brace-counting approach has to reconstruct by hand.
 */

import { parse } from 'comment-parser'

/** @import { Rule } from 'eslint' */

const DEFAULT_MAX_LENGTH = 100
// @file/@module are file-level prose headers, not structured single-fact tags;
// @example is expected to hold a multi-line code sample.
const DEFAULT_IGNORED_TAGS = ['example', 'file', 'module']

/** @type {Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow a JSDoc tag description from wrapping onto a continuation line, and cap its line length',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxLength: { type: 'integer', minimum: 1 },
          ignoredTags: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      wrapped: 'JSDoc @{{tag}} description wraps onto a continuation line; keep it on one physical line (the same reason a multi-line TODO comment is hard to parse) and shorten it instead.',
      tooLong: 'JSDoc @{{tag}} description is {{length}} characters, over the {{max}}-character limit; shorten it.',
    },
  },
  create (context) {
    const options = context.options[0] ?? {}
    const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH
    const ignoredTags = new Set(options.ignoredTags ?? DEFAULT_IGNORED_TAGS)
    const { sourceCode } = context

    return {
      Program () {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type !== 'Block' || !comment.value.startsWith('*')) continue

          // `sourceCode.getText()` takes an ESTree *node*, and a comment is not one — it
          // is a `Comment`, which carries no `type` from the node union. Rebuilding the
          // raw comment from its value is byte-identical: espree sets `value` to exactly
          // the text between the opening `/*` and the closing `*/`.
          const [block] = parse(`/*${comment.value}*/`)
          if (!block) continue

          // `loc` and `range` are optional on the ESTree base node type that `Comment`
          // extends. ESLint populates `loc` on every comment it hands to a rule, so both
          // fallbacks are unreachable in practice — but they fall back rather than
          // `continue`, because skipping the comment would silently drop a report that
          // fires today, and a lint rule that quietly stops reporting is the worst of the
          // three outcomes.
          const commentStartLine = comment.loc?.start.line ?? (comment.range ? sourceCode.getLocFromIndex(comment.range[0]).line : 1)

          for (const tag of block.tags) {
            if (ignoredTags.has(tag.tag)) continue

            const firstSourceLine = tag.source[0]
            if (!firstSourceLine) continue
            const reportLine = commentStartLine + firstSourceLine.number

            const descriptionLines = tag.source.filter(s => s.tokens.description.trim() !== '')
            if (descriptionLines.length > 1) {
              context.report({ loc: { line: reportLine, column: 0 }, messageId: 'wrapped', data: { tag: tag.tag } })
            }

            for (const s of tag.source) {
              const descriptionLength = s.tokens.description.length
              if (descriptionLength > maxLength) {
                context.report({
                  loc: { line: commentStartLine + s.number, column: 0 },
                  messageId: 'tooLong',
                  data: { tag: tag.tag, length: String(descriptionLength), max: String(maxLength) },
                })
              }
            }
          }
        }
      },
    }
  },
}

export default rule

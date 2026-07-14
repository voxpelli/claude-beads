/**
 * Error taxonomy, from node-cli-template.
 *
 * `InputError` — the user got it wrong (bad flag, no store here). Exit 1, message
 * only; the cause chain is deliberately hidden, because a stack trace is not an
 * answer to "you pointed me at the wrong directory".
 *
 * `ResultError` — the operation ran and the answer is "no". Exit 2, no message:
 * the command has already said its piece on stdout. `validate` finding errors is
 * the canonical case — the errors ARE the output.
 */

export class InputError extends Error {
  /** @override */
  name = 'InputError'

  /**
   * @param {string} message
   * @param {string} [body]
   * @param {string} [code]   machine-readable tag (e.g. ENOSTORE, EUSAGE) for --json consumers
   * @param {ErrorOptions} [options]  `{ cause }` — preserved when an upstream error is
   *   re-thrown as one of ours, so a genuine bug wearing a user-error's clothes stays diagnosable
   */
  constructor (message, body, code, options) {
    super(message, options)

    /** @type {string|undefined} */
    this.body = body

    // A first-class field rather than a post-hoc `/** @type {any} */ (e).code = …`
    // cast. That cast was not just ugly: in no-semicolon style a line starting with
    // `(` gets no ASI semicolon, so `const e = new InputError(m)` followed by
    // `(e).code = …` parsed as `new InputError(m)(e)` — calling the result as a
    // function, with `e` referenced inside its own initializer. It crashed the
    // ENOSTORE path, which is the one path this whole CLI exists to get right.
    /** @type {string|undefined} */
    this.code = code
  }
}

export class ResultError extends Error {
  /** @override */
  name = 'ResultError'
}

# UPSTREAM: @voxpelli/typed-utils

## Bugs

* **`isErrorWithCode`'s type predicate is unsound — it promises `code: string`
  but only checks the key exists** (2026-07-14, v5.0.0) — the declared type is
  `value is Error & { code: string }` (`lib/misc.d.ts:11-13`), while the
  implementation is:

  ```js
  export function isErrorWithCode (value) {
    return value instanceof Error && 'code' in value   // presence only. No typeof.
  }
  ```

  `'code' in value` does not prove `code` is a string. Any error class that
  _declares_ the field — a very ordinary thing for a custom error to do —
  satisfies the guard while carrying `undefined`, and TypeScript then cheerfully
  permits `err.code.startsWith(…)` on it.

  **This is not theoretical; it took down diarie's CLI.** `InputError`
  (`diarie/lib/utils/errors.js`) assigns `this.code = code` unconditionally, so
  `'code' in err` is `true` for every instance, including the ones constructed
  with two arguments where `code` is `undefined`. A guard written as

  ```js
  if (isErrorWithCode(err) && err.code.startsWith('ERR_PARSE_ARGS_')) { … }
  ```

  threw `TypeError: Cannot read properties of undefined (reading 'startsWith')`
  on three ordinary user-error paths (`ready --filter bogus`,
  `stats --days abc`, a second `init`), turning clean, actionable messages into
  stack traces — and, under `--json`, into an **empty stdout**. `tsc` passed. It
  had to: the predicate told it the value was a string.

  The sibling guards in the same file (`isErrorWithCodeAndPath`, etc.) share the
  shape and presumably the defect.

  Ownership: **upstream** (voxpelli's own package) · Workaround: add
  `typeof err.code === 'string'` at every call site — which is exactly the check
  the predicate exists to spare you, so the guard currently provides negative
  value: it is more dangerous than an inline `'code' in err`, because it _looks_
  like it narrowed.

  Suggested fix:

  ```js
  export function isErrorWithCode (value) {
    return value instanceof Error && 'code' in value && typeof value.code === 'string'
  }
  ```

  Note the fix is source-compatible for every honest caller and only rejects the
  callers that were already broken.

  Found while hardening diarie's exit-code taxonomy (`vp-beads-cli`); the
  in-repo guard now carries a comment forbidding its own "simplification" back to
  the unsound form.

## Feature Requests

_No entries yet._

## Upstream Opportunities

_No entries yet._

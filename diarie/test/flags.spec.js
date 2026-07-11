/**
 * Unit tests for the flag validators.
 *
 * These are the functions that used to be trapped inside `run()`, reachable only by
 * spawning a process. They are pure — no filesystem, no printing, no `process` — so
 * they are tested here directly, which is the entire argument for lifting them out.
 *
 * Each validator lives in the same module as the flag it validates
 * (`lib/flags/filter.js`, `lib/flags/staleness.js`), so a flag's declaration and its
 * meaning cannot drift apart.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { validateFilterFlags } from '../lib/flags/filter.js'
import { validateStaleFlags } from '../lib/flags/staleness.js'
import { InputError } from '../lib/utils/errors.js'

describe('validateFilterFlags', () => {
  it('passes a status the store can actually hold', () => {
    assert.deepEqual(validateFilterFlags({ filter: 'in_progress' }), { filter: 'in_progress' })
  })

  it('accepts every member of the status enum', () => {
    for (const status of ['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'deferred']) {
      assert.deepEqual(validateFilterFlags({ filter: status }), { filter: status })
    }
  })

  it('treats an ABSENT filter as valid — it selects the partition view, not an error', () => {
    assert.deepEqual(validateFilterFlags({ filter: undefined }), { filter: undefined })
  })

  it('rejects a status the schema does not know, and names the alternatives', () => {
    assert.throws(
      () => validateFilterFlags({ filter: 'bogus' }),
      (/** @type {unknown} */ err) => {
        assert.ok(err instanceof InputError)
        assert.match(err.message, /^--filter must be one of: pending, in_progress, completed, failed, cancelled, deferred$/)
        return true
      }
    )
  })

  it('rejects `closed` — a bd fossil that is NOT a diarie status', () => {
    // The exact value that made a blocked-review conditional dead code elsewhere:
    // it is not in VALID_STATUSES, so it can never match, and nothing ever said so.
    assert.throws(() => validateFilterFlags({ filter: 'closed' }), InputError)
  })

  it('rejects the empty string rather than treating it as absent', () => {
    assert.throws(() => validateFilterFlags({ filter: '' }), InputError)
  })
})

describe('validateStaleFlags', () => {
  it('coerces the string flag to a number', () => {
    assert.deepEqual(validateStaleFlags({ days: '30', stale: false }), { days: 30, stale: false })
  })

  it('truncates a fractional threshold to whole days', () => {
    assert.deepEqual(validateStaleFlags({ days: '7.9', stale: true }), { days: 7, stale: true })
  })

  it('accepts zero — "stale the moment it is claimed" is a coherent question to ask', () => {
    assert.deepEqual(validateStaleFlags({ days: '0', stale: false }), { days: 0, stale: false })
  })

  it('REJECTS a non-numeric threshold instead of silently yielding NaN', () => {
    // The failure this guard exists for: `Number('abc')` is NaN, every `<` comparison
    // against NaN is false, and the command reports ZERO stale claims — a confident
    // wrong answer, indistinguishable from a healthy store.
    assert.throws(
      () => validateStaleFlags({ days: 'abc', stale: false }),
      (/** @type {unknown} */ err) => {
        assert.ok(err instanceof InputError)
        assert.equal(err.message, '--days must be a non-negative number (got "abc")')
        return true
      }
    )
  })

  it('rejects a negative threshold — a cutoff in the future makes every claim stale', () => {
    assert.throws(() => validateStaleFlags({ days: '-1', stale: false }), InputError)
  })

  it('rejects Infinity', () => {
    assert.throws(() => validateStaleFlags({ days: 'Infinity', stale: false }), InputError)
  })
})

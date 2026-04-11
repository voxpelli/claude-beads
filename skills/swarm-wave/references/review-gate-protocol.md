# Review Gate Protocol

Reference material for swarm-wave workflow 3 (Post-wave gate). See `SKILL.md`
for the gate sequence.

## Two-Reviewer Structure

Every post-wave gate launches exactly two review agents in parallel:

**Code Reviewer (Agent 1)** — always domain-agnostic:

- Reads all files modified in the wave
- Reviews: correctness, edge cases, null/undefined handling, error
  propagation, type safety, obvious logic errors
- Output: confidence score (0-100) and findings by severity (HIGH /
  MEDIUM / LOW)

**Domain Reviewer (Agent 2)** — specialized by wave content:

- Reviews the same files through a domain-specific lens
- Output: confidence score and domain-specific findings

## Domain Specialization Table

| Wave Content | Domain Reviewer Type | Focus |
|---|---|---|
| Auth, session, permissions | Security reviewer | OWASP Top 10, privilege escalation, input trust |
| Database queries, migrations | Data integrity reviewer | SQL injection, transaction safety, reversibility |
| API endpoints, HTTP handlers | API contract reviewer | Status codes, error shapes, backwards compatibility |
| Test files only | Test quality reviewer | Coverage gaps, flaky patterns, assertion completeness |
| Config, tooling, CI | Ops reviewer | Idempotency, secret handling, failure modes |
| Documentation only | Clarity reviewer | Accuracy, completeness, example correctness |
| Mixed or unclear | Second code reviewer | Same focus as Agent 1, independent pass |

## Confidence Thresholds

| Reviewer | Default Threshold | Security-Adjacent Threshold |
|---|---|---|
| Code reviewer | 80+ | 80+ (unchanged) |
| Domain reviewer | 60+ | 80+ |

**Security-adjacent**: any wave touching auth, session management,
cryptography, file system permissions, or environment variable handling.

## Severity Handling

| Severity | Action |
|---|---|
| HIGH | Gate blocks — must fix before committing, then re-gate |
| MEDIUM | Present to user — accept risk or fix |
| LOW | Log only, commit proceeds |

## Recurring Bug Classes

Patterns most commonly caught by the gate in practice:

- **Missing null guard** — agent assumes a value exists; reviewer catches
  the undefined path
- **Incomplete error propagation** — error thrown but not surfaced to caller
- **Type widening** — agent uses `any` or drops a narrowing guard
- **Test gap** — new code path has no test coverage
- **Stale snapshot** — test snapshot not updated for changed behavior
- **API shape change** — return type changes without updating callers

## Gate Failure Recovery

**`npm run check` fails** (lint or type errors):
Fix inline — these are mechanical. Do not launch a fix agent for lint
errors. Re-run `npm run check` to confirm. Proceed to the tally step.

**HIGH-severity review finding**:
Launch a targeted fix agent: "Fix the following concern: \[finding text].
Scope: \[affected files]." After the agent completes, return to step 1
(re-gate from the top).

**LOW/MEDIUM finding, user accepts risk**:
Commit with a note in the commit message body:
`[gate: accepted risk — finding summary]`.

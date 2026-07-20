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

| Wave Content                 | Domain Reviewer Type    | Focus                                                 |
| ---------------------------- | ----------------------- | ----------------------------------------------------- |
| Auth, session, permissions   | Security reviewer       | OWASP Top 10, privilege escalation, input trust       |
| Database queries, migrations | Data integrity reviewer | SQL injection, transaction safety, reversibility      |
| API endpoints, HTTP handlers | API contract reviewer   | Status codes, error shapes, backwards compatibility   |
| Test files only              | Test quality reviewer   | Coverage gaps, flaky patterns, assertion completeness |
| Config, tooling, CI          | Ops reviewer            | Idempotency, secret handling, failure modes           |
| Documentation only           | Clarity reviewer        | Accuracy, completeness, example correctness           |
| Mixed or unclear             | Second code reviewer    | Same focus as Agent 1, independent pass               |
| **A new guard, lint rule, or quantified test suite** | **Evasion reviewer** | **Sole deliverable: N inputs the guard does NOT catch. Returning zero findings is a FAILED review, not a pass.** |

### Why the evasion reviewer exists

A guard is a claim about inputs it has never seen. Whoever wrote it chose the inputs it *was*
tested on — and that choice carries the author's blind spot into the test suite, where it reads
as coverage.

The evidence is not theoretical. Across multiple real defects tracked across a sprint cycle, the author's own adversarial
attempt never once found the author's own blind spot:

- The `invalid:` fixtures for a new ast-grep rule were **confirmatory** — they proved the rule
  caught what its author already knew to write. Two reviewers broke its exemption clause in three
  ways within minutes (an `exit(2)` in the ELSE arm, one in a nested closure, one merely *wrapped*
  by the sanctioned branch). All three were exempted, silently.
- A quantified table of user mistakes covered every mistake its author could enumerate. The bug was
  the row that was not there: it **never crossed two flags**, and `--filter` × `--strict` was the
  defect.
- A rule-parity checker written to catch silent drift shipped with a hardcoded list and a line-based
  YAML comparison — **drifting silently.**

So: **whenever a guard's correctness rests on an input set its author chose, someone else must choose
the inputs.** The evasion reviewer's job is not to approve the guard. It is to defeat it, and to
report exactly how.

> **This row is enforced by compliance, not by machinery — `severity: warning`, and saying otherwise
> would be the same lie the guards exist to catch.** What has actually worked, empirically, is a
> human asking *"did you run the gate?"* — so the honest mitigation is to make the question easy to
> ask, not to claim a receipt nobody checks.

**Acceptance criteria for any new guard: it must be shown going RED**, on the case that motivated it.
A green run proves nothing — it is indistinguishable from a guard inspecting nothing at all. Plant the
violation, watch it fail, then remove it.

## Confidence Thresholds

| Reviewer        | Default Threshold | Security-Adjacent Threshold |
| --------------- | ----------------- | --------------------------- |
| Code reviewer   | 80+               | 80+ (unchanged)             |
| Domain reviewer | 60+               | 80+                         |

**Security-adjacent**: any wave touching auth, session management,
cryptography, file system permissions, or environment variable handling.

## Severity Handling

| Severity | Action                                                 |
| -------- | ------------------------------------------------------ |
| HIGH     | Gate blocks — must fix before committing, then re-gate |
| MEDIUM   | Present to user — accept risk or fix                   |
| LOW      | Log only, commit proceeds                              |

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

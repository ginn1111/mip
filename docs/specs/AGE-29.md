---
status: draft
scope: skills/mip-prototype, skills/mip-verify, tests
owner: gintary
---

# Spec — AGE-29 mip-prototype and mip-verify skills

Source: Linear AGE-29; RFC 0005: mip-prototype (low-fidelity motion representation and visual review), mip-verify (implementation check against the locked creative contract).

## Problem

No skill tells an agent how to produce a prototype-spec the evaluator and reviewer accept, or how to check an implementation against the locked prototype.

## Desired behavior

- **B1 Location.** `skills/mip-prototype/SKILL.md`, `skills/mip-verify/SKILL.md`, same format as AGE-28.
- **B2 mip-prototype.** Covers prototype-spec fields, `validatePrototype`, `evaluate(spec, scenarioId, timeMs)`, and handing off to the web reviewer (`mip preview`). It never claims approval.
- **B3 Fixture.** `skills/mip-prototype/example.prototype.json` passes `validatePrototype` and `planValid`.
- **B4 mip-verify.** Compares an implementation to the locked prototype at review instants (frame manifest, `packages/prototype/review-manifest.mjs`) and produces a `verification-record` payload `{implementationRef, checks[{name, passed}], result}` for human review. It does not lock it.
- **B5 Integration test.** `tests/skills.test.mjs` validates the example and evaluates every storyboard instant twice with identical snapshots.

## Inputs / outputs

In: none at runtime. Out: two SKILL.md files, an example spec, tests.

## Constraints

- Approvals: every approval, creative or not, happens in the web reviewer by a human (project owner decision 2026-10-15). Code never creates an approval or a lock.
- Duplicate JSON keys are never allowed; parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`).
- Protocol identifier is `mip/0.7`.
- No new runtime dependency unless this spec says so.

## Acceptance criteria
- [ ] Both SKILL.md files have valid frontmatter (B1).
- [ ] The example passes `validatePrototype` and `planValid` (B3).
- [ ] The integration test fails if the example becomes invalid (B5).
- [ ] A test fails if either skill instructs approving or locking (B2, B4).
- [ ] A `verification-record` built per mip-verify validates against `schemas/v0.7/payload.schema.json` (B4).
- [ ] `npm test` passes.

## Edge cases
- The implementation runtime (AGE-31) may not exist yet; the test covers the verification-record shape only.

## Assumptions and open decisions (human decides)
- Numeric tolerance for implementation checks: 1e-6 on evaluated properties at review instants is an assumption pending owner decision (same status in AGE-31). Owner: user.

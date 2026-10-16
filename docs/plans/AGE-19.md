---
status: draft
scope: packages/glossary, tests/glossary.test.mjs
owner: gintary
---

# Plan — AGE-19 resolver `unknown` classification

Spec: `docs/specs/AGE-19.md`. Verify: `npm test`. Install: `npm install --include=dev`.

1. **Baseline and schema check.** `npm test`. Read `schemas/v0.7/payload.schema.json` for the `semantic-contract` payload and confirm `status` is not an enum that rejects `unknown`. If it is, stop and report on the card. Evidence: counts, schema excerpt.
2. **Failing tests (B1 to B7).** In `tests/glossary.test.mjs` add one test per acceptance criterion: unknown candidate, `extractIntent` blocking, gate blocks with `UNRESOLVED_AMBIGUITY` (build a locked intent plus semantic contract as in `tests/gates.test.mjs`), human resolution clears the block, no-candidates results unchanged, duplicate, empty and alias candidates, project override. Run: the new tests fail.
3. **Resolver (B1, B2, B6).** In `packages/glossary/index.mjs` add `candidates` handling to `resolve()`: after layer matching, add one `unknown` match per remaining unmatched, non-empty, unique candidate. Resolver tests pass.
4. **Intent and contract (B3, B4).** Pass `candidates` through `extractIntent`; make `proposeSemanticContract` and `reviewSemanticContract` handle `unknown`. Remaining tests pass.
5. **Regression.** The golden tests for organic, cinematic and magnetic and the no-candidates equality test pass unchanged.
6. **Mutation check.** Make unknown candidates return `resolved`; the gate and blocking tests must fail. Restore.
7. **Verify and report.** `npm test` from `/home/aioz/personal/mip`; quote the result on the card. Small commits: tests, resolver, contract. Do not push or merge.

Risks: payload schema may constrain `status`; checked in step 1 before any code.

---
status: draft
scope: schemas/v0.7/evidence-pack.schema.json (new), packages/evidence (new), tests
owner: gintary
---

# Plan — AGE-34 Reference Evidence Pack schema and provenance

Spec: `docs/specs/AGE-34.md`. Verify: `npm test`. Install: `npm install --include=dev`.

1. **Baseline.** `npm test`; evidence: counts. Read `schemas/v0.7/artifact.schema.json` `$defs.digest` and `$defs.evidence` and reuse them by copying the patterns (cross-file `$ref` needs ajv registration; see how `tests/schema.test.mjs` loads schemas).
2. **Fixtures first.** Create `tests/fixtures/evidence-pack/valid-scorpio.json` and one invalid file per rule listed in the spec acceptance criteria. Keep the valid pack small: one source, three observations, one hypothesis, three bindings (one per provenance class).
3. **Failing schema tests (B1 to B5).** Add `tests/evidence-pack.test.mjs` that loads each fixture with ajv and asserts the expected result. Run: fail (no schema).
4. **Schema (B1 to B5, B9).** Write `schemas/v0.7/evidence-pack.schema.json`. Schema tests pass.
5. **Failing integrity tests (B6, B7).** Add tests for `validateEvidencePack` with the referential and provenance fixtures. Run: fail (no module).
6. **Validator (B6, B7).** Write `packages/evidence/index.mjs`: `validateEvidencePack(pack)` and `packEvidence(pack, uri)` (B8) using `digest` from `packages/artifacts/index.mjs`. Tests pass.
7. **Binding test (B8).** Build an `intent-profile` carrying `packEvidence(...)` and assert `artifact.schema.json` accepts it and the digest changes when the pack changes.
8. **Mutation check.** Remove the `confidence` requirement, then the unknown-source check; the matching tests must fail. Restore each.
9. **Verify and report.** `npm test` from `/home/aioz/personal/mip`; quote the result on the card. Small commits: fixtures and tests, schema, validator, binding. Do not push or merge.

Risks: cross-schema `$ref` handling; if it blocks, inline the two patterns and note it on the card.

---
status: draft
scope: glossary/core, schemas/v0.7/glossary.schema.json, tests/glossary.test.mjs
owner: gintary
---

# Plan — AGE-18 glossary examples and governance

Spec: `docs/specs/AGE-18.md`. Verify: `npm test`. Install: `npm install --include=dev`.

1. **Baseline.** `npm test`; evidence: counts, including the 30-entry glossary test.
2. **Failing tests first (B2, B3, B1).** In `tests/schema.test.mjs` add: valid entry with examples passes; empty example field fails; unknown example key fails. In `tests/glossary.test.mjs` add: every seed entry has at least one example, and each `phrase` contains the term or an alias using the word-boundary rule. Run: the seed tests must fail (no examples yet).
3. **Schema (B2).** Add optional `examples` to `glossary.schema.json`. Schema tests pass; seed test still fails.
4. **Seed (B1).** Add one example per entry in `seed.json`, derived from that entry's `definition` and `motionHints`. List any entry where grounding is thin on the card instead of padding it. Seed tests pass.
5. **Governance (B4).** Write `glossary/GOVERNANCE.md` with the approval rule (direct human requirement or official source).
6. **Guard (B5).** Existing tests confirm 30 entries, all `proposed`, `magnetic` still ambiguous.
7. **Mutation check.** Remove one example, then change one phrase to a word not in its entry; each must fail a test. Restore.
8. **Verify and report.** `npm test` from `/home/aioz/personal/mip`; quote the result on the card. Small commits: tests, schema, seed, governance. Do not push or merge.

Risks: example quality is subjective. The card records which entries need human review.

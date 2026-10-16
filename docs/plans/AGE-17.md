---
status: draft
scope: specs/v0.7, tests/schema.test.mjs
owner: gintary
---

# Plan — AGE-17 canonical hashing vectors and migration policy

Spec: `docs/specs/AGE-17.md`. Verify: `npm test`. Install: `npm install --include=dev`.

1. **Baseline.** Run `npm test`; expect all pass. Evidence: counts.
2. **Derive V3 by hand.** Sort the five keys by UTF-16 code units on paper in the plan notes, then confirm with `node -e` using `json-canonicalize`. If they differ, stop and report. Evidence: both orders on the card.
3. **Failing vector tests (B1).** Add `tests/vectors.test.mjs` with V2 to V5 and hard-coded expected strings and SHA-256 values (compute the SHA-256 of each expected canonical string with `sha256sum`, independent of the library). Run: V2 to V5 must pass or fail for a reason that is a real finding. Do not edit expected values to match output without a recorded reason.
4. **ADR-0002 (B2).** Write `specs/v0.7/ADR-0002-migration.md` with status `proposed`: context, decision, alternatives (in-place edit rejected, new revision chosen), consequences, follow-ups.
5. **ADR-0001 link (B3).** Update the "Test vectors" section to list V1 to V5 and link ADR-0002.
6. **Mutation check.** Change one character in each expected value in turn; each must fail. Restore.
7. **Verify and report.** `npm test` from `/home/aioz/personal/mip`; quote the exact result on the card. Small commits: tests, ADR-0002, ADR-0001. Do not push or merge.

Risks: V4/V5 may expose current behavior that contradicts the ADR; that is reported, not fixed here.

---
status: draft
scope: packages/prototype, packages/gates, tests, scripts/smoke-scorpio.mjs
owner: gintary
---

# Plan — AGE-27 review evidence digests

Spec: `docs/specs/AGE-27.md`. Canonical verification: `npm test`, then `npm run smoke:scorpio`. Install with `npm install --include=dev`.

1. **Baseline.** Run `npm test` on the branch before any change. Evidence: 88/88 pass.
2. **Failing test for the manifest (B1, B2, B3, B4).** Add `tests/review-manifest.test.mjs`: deterministic digest, spec key-order invariance, comment instant changes digest, animation parameter changes digest, one entry per scenario in order, storyboard outside range ignored, duplicates removed. Run it: must fail (module missing).
3. **Manifest module.** Add `packages/prototype/review-manifest.mjs` exporting `reviewInstants`, `reviewManifest`, `expectedEvidence(prototypeArtifact, scenarioReviews)`. Import `reviewFrame` from `./review.mjs` and `digest` from `../artifacts/index.mjs`. Step 2 tests must pass.
4. **Failing gate tests (B6).** In `tests/review-evidence.test.mjs`: `evidence: []` gives `MISSING_REVIEW_EVIDENCE`; altered digest, extra entry, duplicate entry give `REVIEW_EVIDENCE_MISMATCH`. Run: must fail.
5. **Gate.** In `packages/gates/index.mjs`, extend `checkPrototypeEvidence` to compare `review.evidence` with `expectedEvidence(prototype, review.payload.scenarioReviews)`. Step 4 tests pass.
6. **Service (B5).** In `packages/prototype/review-evidence.mjs`, set `evidence: expectedEvidence(prototype, scenarioReviews)` when building the review in `finish`. Add a test that the stored review has one entry per scenario with the B3 `uri` and `mediaType`.
7. **Reconcile existing fixtures.** Reviews built by hand with `evidence: []` that must pass the gate (`tests/review-drafts.test.mjs`, `tests/review-hardening.test.mjs`, `tests/reviewer-hardening.test.mjs`) use `expectedEvidence(...)`. Do not weaken any negative test.
8. **Smoke.** Extend `scripts/smoke-scorpio.mjs`: after the throwaway approval, assert one evidence entry and that the gate passes. The smoke store is a throwaway directory; never use a store a human reviewed.
9. **Mutation check.** Make the gate skip the evidence comparison; new gate tests must fail. Restore.
10. **Verify and report.** Run `npm test` and `npm run smoke:scorpio` from `/home/aioz/personal/mip`; quote exact results on the card. Commit in small scoped commits (test, module, gate, service, fixtures). Do not push or merge; open a PR only when the user says so.

Risks: float determinism across JS engines (mitigated by 6-decimal rounding); fixture churn in step 7.

---
status: draft
scope: packages/prototype, packages/gates, tests, scripts/smoke-scorpio.mjs
owner: gintary
---

# Spec — AGE-27 review evidence digests

Linear: AGE-27 deliverable 1 ("evidence digests MUST refer to the exact reviewed media/prototype representation"). Authority for the contract: `specs/v0.7/ADR-0001-integrity.md` ("Evidence includes media URI and content digest").

## Problem

Every `prototype-review` stores `evidence: []`. The review is bound to the prototype-spec digest, but nothing records the frames the reviewer actually saw, and the gate never reads `evidence`. A changed evaluator or changed comment instants leave no trace in the review.

## Desired behavior

Each approved review carries one frame-manifest evidence entry per scenario. The phase gate recomputes the same entries from the locked prototype-spec and the review's own comments, and blocks on any difference.

- **B1 Manifest.** `reviewManifest(spec, scenarioId, instants)` returns `{scenarioId, instants, frames}`. `frames[i]` is `reviewFrame(spec, scenarioId, instants[i])` with every number rounded to 6 decimals.
- **B2 Instants.** Sorted, unique integers: `0`, `durationMs`, every storyboard `timeMs` inside `[0, durationMs]`, `startMs` and `endMs` of every review segment that contains the scenario, and every comment `timeMs` of that scenario in the review.
- **B3 Evidence entry.** `{uri, digest, mediaType}` where `uri = mip:frame-manifest/<prototypeId>@<revision>/<scenarioId>`, `digest = digest(manifest)` (same JCS SHA-256 as artifacts), `mediaType = application/vnd.mip.frame-manifest+json`.
- **B4 Order.** One entry per scenario, in `spec.scenarios` order.
- **B5 Persistence.** The final approval writes the entries into `prototype-review.evidence`. `evidence` is already part of the artifact digest, so it is locked with the review. Drafts carry no evidence.
- **B6 Gate.** For every prototype-review the gate recomputes B3 from the prototype-spec payload and the review's `scenarioReviews`. It must report:
  - `MISSING_REVIEW_EVIDENCE` when `evidence` is empty or lacks an expected `uri`.
  - `REVIEW_EVIDENCE_MISMATCH` when a digest or `mediaType` differs, or an entry is extra or duplicated.

## Inputs / outputs

- In: prototype-spec payload (`scenarios`, `reviewSegments`, `storyboard`, `durationMs`, evaluator data), `scenarioReviews`.
- Out: `evidence` array on `prototype-review`; new gate violation codes above. No change to `schemas/v0.7` (the `evidence` def already has `uri`, `digest`, `mediaType`).

## Constraints

- Pure functions, no I/O, no new dependency. The module must not import the gate or the service (no cycles).
- Must not change the approval flow, draft logic, or reviewer UI.
- Must not store media bytes. The manifest is recomputed, not stored.
- Rounding to 6 decimals is part of the contract, so digests do not depend on last-bit float differences.

## Acceptance criteria
- [ ] Same spec and reviews give identical evidence on repeated runs; key order of the spec does not change the digest (B1, B3).
- [ ] Changing one comment instant changes that scenario's evidence digest (B2).
- [ ] Changing an animation parameter in the prototype changes the digest (B1).
- [ ] Final approval stores exactly one evidence entry per scenario with the B3 `uri` and `mediaType` (B4, B5).
- [ ] `validateGate('implementation', ...)` returns `PASS` for a reviewed prototype with correct evidence.
- [ ] The gate returns `BLOCKED` with `MISSING_REVIEW_EVIDENCE` for `evidence: []`, and `REVIEW_EVIDENCE_MISMATCH` for an altered digest, an extra entry, and a duplicate entry (B6).
- [ ] `npm test` passes (existing 88 tests plus new ones) and `npm run smoke:scorpio` ends `SMOKE OK`.

## Edge cases
- Scenario with no comments: instants are still B2 boundaries and keyframes.
- Storyboard point outside `[0, durationMs]`: ignored.
- Duplicate instants across sources: deduplicated.
- Two scenarios: two entries, each with its own comments only.
- Existing reviews with `evidence: []` become invalid at the gate. None exist outside demo stores. Accepted inside `mip/0.7`; bump the protocol id if any exist elsewhere.

## Open (TBD)
- Pixel capture (PNG per frame) and immutable media storage are out of scope. Owner: Linear follow-up after human review.

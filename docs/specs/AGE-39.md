---
status: draft
scope: examples/alignment (new), tests
owner: gintary
---

# Spec — AGE-39 Reference-vs-prototype alignment reviewer

Source: Linear AGE-39; RFC 0007 step 7 and human effort minimization (synchronized timelines, frames vs preview, replicate vs adapt).

## Problem

A human cannot compare reference evidence with the drafted prototype or correct inferred transitions before locking.

## Desired behavior

- **B1 Reuse.** Extends the Scorpio reviewer pattern (`examples/scorpio/serve.mjs`): same host token, draft and approval flow, same gate. Approval stays a human act in the web reviewer.
- **B2 Synchronized timeline.** One slider drives the nearest reference frame and the prototype preview at the same instant.
- **B3 Corrections.** Accept, reject or edit an inferred observation; edits create a new prototype-spec revision.
- **B4 Modes.** `replicate` or `adapt` recorded on the review.
- **B5 Locking.** Through the existing `PrototypeReviewService` and gates, with frame-manifest and pack evidence.

## Inputs / outputs

In: AGE-38 drafts and their pack. Out: reviewed, human-locked artifacts.

## Constraints

- Approvals: every approval, creative or not, happens in the web reviewer by a human (project owner decision 2026-10-15). Code never creates an approval or a lock.
- Duplicate JSON keys are never allowed; parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`).
- Protocol identifier is `mip/0.7`.
- No new runtime dependency unless this spec says so.

## Acceptance criteria
- [ ] Browser test: scrubbing shows the matching reference frame and preview time (B2).
- [ ] An edit produces revision 2 and leaves revision 1 unchanged (B3).
- [ ] The implementation gate passes only after human approval (B5).
- [ ] No approval without the host token (B1).
- [ ] `npm test` passes.

## Edge cases
- No frame near an instant: show the nearest with its time offset.

## Assumptions and open decisions (human decides)
- UI follows `DESIGN.md`.

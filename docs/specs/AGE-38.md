---
status: draft
scope: packages/draft-artifacts (new), tests
owner: gintary
---

# Spec — AGE-38 Generate draft MIP artifacts from reference evidence

Source: Linear AGE-38; RFC 0007 steps 4 to 6 (motion representation; glossary resolution separating OBSERVED, INFERRED, DECLARED; draft intent-profile, semantic-contract, prototype-spec; never auto-lock).

## Problem

An evidence pack cannot become the artifacts the gates and reviewer work on.

## Desired behavior

- **B1 Input.** A pack passing AGE-34 validation; failing packs are rejected with violations.
- **B2 intent-profile.** `goal` from DECLARED bindings when present, else explicitly unresolved; references list the pack evidence.
- **B3 semantic-contract.** Hypotheses resolve through `resolve` with the candidate concept (AGE-19). INFERRED concepts stay `ambiguous` until a human decides; unknown terms stay `unknown` and block.
- **B4 prototype-spec.** Observations become tracks and storyboard frames at measured times. Easing `linear` unless DECLARED. Inferred values cite their observation id; nothing invented.
- **B5 Provenance.** Each draft's `evidence[]` contains `packEvidence(pack, uri)`; the digest changes when the pack changes.
- **B6 Never approve.** Drafts have lifecycle `draft`, no approvals, and validate against artifact and payload schemas.

## Inputs / outputs

In: evidence pack. Out: three draft artifacts in an ArtifactStore.

## Constraints

- Approvals: every approval, creative or not, happens in the web reviewer by a human (project owner decision 2026-10-15). Code never creates an approval or a lock.
- Duplicate JSON keys are never allowed; parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`).
- Protocol identifier is `mip/0.7`.
- No new runtime dependency unless this spec says so.

## Acceptance criteria
- [ ] From the AGE-34 Scorpio fixture, three drafts validate (B6).
- [ ] INFERRED and unknown concepts keep `validateGate('prototype', ...)` BLOCKED (B3).
- [ ] Changing one observation changes the evidence digest in all drafts (B5).
- [ ] No draft has approvals or a lock (B6).
- [ ] `npm test` passes.

## Edge cases
- A pack with no DECLARED goal yields an explicitly unresolved goal.

## Assumptions and open decisions (human decides)
- Where assumptions are shown to the human: assumed the semantic-contract blocking list plus the uncertainty report. Owner: user.

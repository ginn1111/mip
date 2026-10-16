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
- **B2 intent-profile.** `goal` from DECLARED bindings when present, else explicitly unresolved (representation: see Assumptions); references list the pack evidence.
- **B3 semantic-contract.** Hypotheses resolve through `resolve` with the candidate concept (AGE-19). INFERRED concepts stay `ambiguous` until a human decides; unknown terms stay `unknown` and block.
- **B4 prototype-spec.** Observations become tracks and storyboard frames at measured times. Easing comes only from a DECLARED binding; otherwise it is an assumption for the human (see Assumptions). Inferred values cite their observation id; nothing invented.
- **B5 Provenance.** Each draft's `evidence[]` contains `packEvidence(pack, uri)`; the digest changes when the pack changes.
- **B6 Never approve.** Drafts have lifecycle `draft`, no approvals, and validate against artifact and payload schemas.
- **B7 Generator report.** Every default the generator writes (easing, fps, initial state, anything not taken from a DECLARED binding or an observation) is listed in the generator's report as an assumption for the human.

## Inputs / outputs

In: evidence pack. Out: three draft artifacts in an ArtifactStore.

## Constraints

- Approvals: every approval, creative or not, happens in the web reviewer by a human (project owner decision 2026-10-15). Code never creates an approval or a lock.
- Duplicate JSON keys are never allowed; parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`).
- Protocol identifier is `mip/0.7`.
- No new runtime dependency unless this spec says so.
- Glossary approval follows `glossary/GOVERNANCE.md`: only a direct human requirement or an official source approves a term. Drafts never approve a glossary term.

## Acceptance criteria
- [ ] From the AGE-34 Scorpio fixture, three drafts validate (B6).
- [ ] INFERRED and unknown concepts yield the violation code `UNRESOLVED_AMBIGUITY`; the test asserts that code, not only BLOCKED (drafts are unlocked, so the gate is BLOCKED anyway) (B3).
- [ ] RFC 0007: the same evidence pack generates byte-identical drafts twice (reproducible generation).
- [ ] RFC 0007: a changed source observation creates a new revision of dependent drafts and invalidates dependents of the old revision; it does not fail with EEXIST.
- [ ] Every default the generator writes appears in the generator report as an assumption (B7).
- [ ] Changing one observation changes the evidence digest in all drafts (B5).
- [ ] No draft has approvals or a lock (B6).
- [ ] `npm test` passes.

## Edge cases
- A pack with no DECLARED goal yields an explicitly unresolved goal.

## Assumptions and open decisions (human decides)
- Defaults for easing, fps and initial state when the pack has no DECLARED value. The generator picks none silently; each written default is reported as an assumption (B7). Which default, or none (field absent and gate blocked), is a human decision. Owner: user.
- Representation of an unresolved goal: payload `goal` has `minLength 1`, so an empty string is invalid. Candidate: a visible placeholder string plus a blocking entry the semantic gate reports. Must ensure no human can lock an unresolved goal unnoticed; mechanism undecided. Owner: user.
- Where assumptions are shown to the human: assumed the semantic-contract blocking list plus the uncertainty report. Owner: user.

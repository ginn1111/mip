---
status: draft
scope: packages/glossary, tests/glossary.test.mjs
owner: gintary
---

# Spec — AGE-19 resolver `unknown` classification

Linear: AGE-19. Authority: RFC 0002 (Linear document): classes known, contextual, ambiguous, unknown, custom; precedence scene, project, domain, core; "unknown phrases MUST NOT be silently promoted"; "the semantic phase MUST not lock with blocking unknowns".

## Problem

`resolve()` returns only `resolved` or `ambiguous`, and only for phrases that match an entry. A phrase with no entry is dropped. Verified on current `main`: `extractIntent('Make it zorbly and organic').blockingAmbiguities` is `[]` and `resolve('zorbly')` is `[]`. A semantic contract can therefore lock with an unseen term.

## Desired behavior

- **B1 Candidates.** `resolve(text, {candidates, project, scene, domain})` accepts `candidates`, an optional array of phrases the caller extracted. Without `candidates` behavior is unchanged.
- **B2 Unknown.** Every candidate that matches no entry in any layer yields a match `{term: <candidate>, status: 'unknown', interpretations: [], provenance: null, approvalStatus: null}`. Candidates that match are classified as today.
- **B3 Blocking.** `extractIntent` passes candidates through; unknown phrases appear in `blockingAmbiguities`. `proposeSemanticContract` emits them with `status: 'unknown'`, empty `interpretation` and no `glossaryId`.
- **B4 Human resolution.** `reviewSemanticContract` accepts a decision for an unknown phrase. It records the interpretation as a human decision and sets `status: 'resolved'`. It still requires `actorId` and `reviewedDigest`.
- **B5 Gate.** An `unknown` concept keeps the contract blocked, so the existing `UNRESOLVED_AMBIGUITY` gate rule applies. No gate code change is expected.
- **B6 Precedence.** Layer order stays scene, project, domain, core. A candidate found in several layers resolves once, from the earliest layer.
- **B7 Candidate meanings.** An `ambiguous` result keeps listing all interpretations as candidate meanings.

## Inputs / outputs

- In: free text plus optional `candidates` and layer arrays.
- Out: matches with status `resolved`, `ambiguous` or `unknown`. No schema change: the `semantic-contract` payload already allows free `status` strings (to verify in plan step 1).

## Constraints

- Detecting which words in free text are design terms is out of scope. The caller (agent or human) supplies candidates. No heuristics, no model calls.
- `contextual` and `custom` classes from RFC 0002 are out of scope (TBD).
- Matching keeps the current word-boundary rule.

## Acceptance criteria
- [ ] `resolve('Make it zorbly', {candidates:['zorbly']})` returns one `unknown` match (B2).
- [ ] `extractIntent` with that candidate has `blockingAmbiguities` containing `zorbly` (B3).
- [ ] A semantic contract with an unknown concept fails `validateGate('prototype', ...)` with `UNRESOLVED_AMBIGUITY` (B5).
- [ ] A human decision for the unknown phrase resolves it and clears the block (B4).
- [ ] Without `candidates`, existing results are identical (B1), and the existing organic, cinematic and magnetic golden tests still pass.
- [ ] Project override of a core term still wins (B6).
- [ ] `npm test` passes.

## Edge cases
- Empty or whitespace-only candidate: ignored.
- Duplicate candidates: reported once.
- Candidate equal to an alias of a known entry: classified as that entry, not unknown.
- Candidate whose entry is `deprecated`: still matches (policy TBD).

## Open (TBD)
- Candidate extraction (who produces it, from what). Owner: user, belongs with AGE-20.
- Whether deprecated entries should downgrade to a warning. Owner: user.

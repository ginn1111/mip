---
status: draft
scope: specs/v0.7, tests/schema.test.mjs
owner: gintary
---

# Spec — AGE-17 canonical hashing vectors and migration policy

Linear: AGE-17. Authority: `specs/v0.7/ADR-0001-integrity.md` (JCS digest field set, lock process, version policy, one test vector). Done per Linear: test vectors and migration ADR.

## Problem

ADR-0001 has one canonicalization vector and a five-line version policy. There is no vector for numbers or key order beyond ASCII, and no ADR that says what a migration is and what it invalidates.

## Desired behavior

- **B1 Vectors.** `tests/schema.test.mjs` (or a new `tests/vectors.test.mjs`) checks at least these vectors against hard-coded canonical strings and SHA-256 values, not recomputed by the code under test:
  - V1 (exists): `{"z":1,"a":{"b":2,"a":1}}` gives `{"a":{"a":1,"b":2},"z":1}`.
  - V2 (RFC 8785 numbers): input `{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"literals":[null,true,false]}` gives `{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}`. This output was checked against the installed `json-canonicalize`.
  - V3 (key order by UTF-16 code unit): keys `"\u20ac"`, `"\r"`, `"1"`, `"\u00f6"`, `"\ufb33"` sort as RFC 8785 section 3.2.3 requires. Expected string is hand-derived in the plan before it is hard-coded.
  - V4: an artifact digest is unchanged when only `lifecycle`, `approvals` or `lock` change, and changes when `payload`, `evidence`, `dependencies` or `revision` change.
  - V5: `undefined`, `NaN`, `Infinity` and duplicate keys are rejected by the digest function (ADR forbids them).
- **B2 Migration ADR.** New `specs/v0.7/ADR-0002-migration.md` with status `proposed`, covering: protocol identifier negotiation, additive vs incompatible changes, a migration always creates a new revision, which approvals and locks it invalidates, how dependents become stale, and what a reader does with an unsupported protocol.
- **B3 Cross-reference.** ADR-0001 "Test vectors" lists V1 to V5 and links ADR-0002.

## Inputs / outputs

- In: `json-canonicalize`, `digest` and `artifactDigest` from `packages/artifacts/index.mjs`.
- Out: tests, one new ADR, a changed ADR-0001 section. No runtime change.

## Constraints

- Do not change the immutable field set. V5 exposed that `digest()` accepted values ADR-0001 forbids; on the user's instruction it now rejects them (a digest-semantics change for invalid input only; valid JSON digests are unchanged).
- ADR-0002 states policy only. No migration tool.

## Acceptance criteria
- [ ] V1 to V5 pass in `npm test` with hard-coded expected values (B1).
- [ ] Mutating any expected canonical string or digest makes the test fail (B1).
- [ ] `specs/v0.7/ADR-0002-migration.md` exists with all topics in B2, status `proposed` (B2).
- [ ] ADR-0001 links the vectors and ADR-0002 (B3).
- [ ] `npm test` passes.

## Edge cases
- V5: `digest` used to accept `NaN`; fixed. Duplicate keys are now rejected at every read boundary by `parseStrictJson` (project owner decision).
- Unicode normalization: JCS does not normalize; the ADR must say so.

## Open (TBD)
- Protocol authority conflict: RFC 0003 in Linear says `mip/0.5` (draft v0.6), the repo and ADR say `mip/0.7`. Owner: user. ADR-0002 uses `mip/0.7` until decided.
- Whether a v0.7 to v0.8 migration helper will ever exist. Owner: user.

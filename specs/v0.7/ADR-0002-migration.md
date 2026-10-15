# ADR 0002 — Protocol Versioning and Migration

Status: proposed. Linear: AGE-17. Extends `ADR-0001-integrity.md` (version policy section).

## Context

Artifacts carry `protocol` (today `mip/0.7`) and are hashed over their immutable content, which includes `protocol`. Approvals and locks bind to that digest. A change to protocol rules, schemas or digest inputs therefore affects every stored artifact. ADR-0001 says readers reject unsupported identifiers and that migrations create a new revision, but it does not say what a migration invalidates or how dependents are treated.

## Decision

1. **Identifier.** `protocol` is an exact string. A reader supports an explicit set of identifiers and rejects any other. It never reinterprets an unknown identifier.
2. **Additive change.** A change that adds only optional fields and keeps every existing meaning may keep the same identifier. Strict validators still reject fields that the schema for that identifier does not list.
3. **Incompatible change.** A change to required fields, field meaning, the digest field set, canonicalization or the gate matrix needs a new identifier.
4. **Migration is a new revision.** Migrating an artifact writes revision N+1 with the new `protocol`. Revision N is never edited and stays verifiable under its own identifier.
5. **Digest changes invalidate approvals.** Because `protocol` is inside the digest, revision N+1 has a new digest. Approvals and locks for revision N do not carry over. The new revision needs its own human approval and lock, in phase order.
6. **Dependents become stale.** Dependents reference exact `{id, revision, digest}`. When an upstream artifact gets a new revision, dependents pointing at the old digest fail the gate with `STALE_DEPENDENCY` until they are migrated and re-approved.
7. **Mixed graphs.** A gate run rejects a dependency graph that mixes protocol identifiers unless a later ADR defines an explicit allowance.
8. **No duplicate keys.** Stored and received JSON with a repeated object key is rejected, never resolved to one value.
9. **No normalization.** Canonicalization does not apply Unicode normalization. Two strings that differ only in normalization form hash differently.
10. **Tooling.** A tool may propose a migration, never lock one, and never grant approval (ADR-0001, lock process step 6).

## Alternatives considered

- **In-place edit with a version field outside the digest.** Rejected: it breaks the guarantee that an approval refers to exact content.
- **Carry approvals across a mechanical migration.** Rejected: approval is a human act on specific content. Automatic carry-over would be agent self-attestation.
- **Single global protocol with silent coercion.** Rejected: it hides incompatibility and defeats strict validation.

## Consequences

- Positive: history stays verifiable. A migration cannot slip past human review.
- Negative: any protocol bump forces re-approval of every dependent chain. That cost is accepted for creative locks.

## Follow-up

- Decide whether mixed-protocol graphs ever need an allowance (TBD, owner: project owner).
- Reconcile the protocol identifier: Linear RFC 0003 says `mip/0.5` (draft v0.6), the repository and ADR-0001 say `mip/0.7`. This ADR uses `mip/0.7` (TBD, owner: project owner).

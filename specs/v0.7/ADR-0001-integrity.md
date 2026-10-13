# ADR 0001 — Canonical Integrity, Approvals, and Versioning

Status: Accepted for M1 draft baseline · AGE-17

## Decision

MIP v0.7 hashes **immutable content** using RFC 8785 JSON Canonicalization Scheme (JCS), UTF-8, SHA-256, lowercase hex prefixed with `sha256:`. `undefined`, NaN, infinity, duplicate keys and unsupported JSON values are forbidden. Every digest is over the canonical JSON bytes, not pretty-printed text.

### Content covered by artifact digest
`{protocol,id,projectId,kind,revision,dependencies,payload,evidence}`.
Exclude `lifecycle`, `approvals`, and `lock` because they are mutable governance metadata and would make the digest self-referential.

Dependencies are stable references with `id`, `revision`, and exact content `digest`; order in arrays is meaningful and MUST be preserved. Evidence includes media URI and content digest. Evidence assets MUST be stored immutably or checked against their recorded digest.

### Lock process
1. Validate schema and immutable content; recalculate digest.
2. Resolve every dependency recursively and require it locked and non-stale.
3. Ensure required human approval explicitly refers to the recalculated digest, with authenticated human identity and persisted timestamp.
4. Validate phase-specific criteria (blocking glossary ambiguity, scenario approvals, etc.).
5. Atomically write a lock record containing digest, dependencyDigests and timestamp; transition lifecycle to locked. Concurrent modifications MUST fail and be retried from latest revision.
6. Append an audit event. The agent cannot grant its own human approval.

`approved` is a pre-lock review status; it does not confer immutability. `superseded` is lifecycle metadata: historical locked revisions remain verifiable, but are not valid inputs to new work unless explicitly pinned and authorized.

## Version policy
- `protocol` is an exact wire identifier (currently `mip/0.7`); readers MUST reject unsupported identifiers rather than silently reinterpret.
- Minor draft increments may add optional fields without changing existing semantics; incompatible changes require a new explicitly negotiated identifier.
- Every artifact has a monotonically increasing positive `revision`; never update content at a revision in place.
- Importers MAY propose migrations but MUST generate a new revision and require fresh approvals when the content digest changes.
- Unknown schema fields are rejected by strict validators for v0.7.

## Security
Hashes prove byte-level integrity, not authorship. Authenticated approvals and durable audit logs are separately required. Any digest validation used for locks MUST occur on the server/CLI authority, never trust only the client UI.

## Test vectors
The canonicalization test fixture uses this raw JSON: `{"z":1,"a":{"b":2,"a":1}}`.
Canonical form MUST be: `{"a":{"a":1,"b":2},"z":1}`.
The test suite derives SHA-256 from this exact canonical form and independently compares it against the canonicalization library result. Also test key-order invariance, content mutation, and excluded metadata invariance.

## Open for subsequent milestones
Authentication and transactional lock persistence are M3 implementation work. This ADR fixes the contract; it does not claim a production security implementation.

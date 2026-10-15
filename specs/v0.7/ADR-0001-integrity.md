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
Vectors live in `tests/schema.test.mjs` (V1) and `tests/vectors.test.mjs` (V1 to V5). Expected canonical strings and SHA-256 values are hard-coded and independent of the code under test.

- **V1.** Raw `{"z":1,"a":{"b":2,"a":1}}` canonicalizes to `{"a":{"a":1,"b":2},"z":1}`; the test also covers key-order invariance, content mutation, and excluded metadata invariance.
- **V2.** RFC 8785 number forms: `333333333.33333329`, `1E30`, `4.50`, `2e-3` and `0.000000000000000000000000001` canonicalize to `333333333.3333333`, `1e+30`, `4.5`, `0.002` and `1e-27`, with `literals` before `numbers`.
- **V3.** Keys sort by UTF-16 code units (RFC 8785 section 3.2.3), including a surrogate pair that sorts before U+FB33 although its code point is higher.
- **V4.** An artifact digest ignores `lifecycle`, `approvals` and `lock`, and changes with `protocol`, `id`, `projectId`, `kind`, `revision`, `dependencies`, `payload` or `evidence`.
- **V5.** `digest()` rejects `undefined`, `NaN`, infinity, functions, symbols, BigInt, class instances (for example `Date`, `Map`) and cycles with `Unsupported JSON value at <path>`. Duplicate object keys are never allowed: every read boundary (artifact store, lock records, review drafts, reviewer request bodies, glossary seed) parses with `parseStrictJson`, which rejects them (project owner decision 2026-10-15).

Versioning and migration policy: `ADR-0002-migration.md`.

## Open for subsequent milestones
Authentication and transactional lock persistence are M3 implementation work. This ADR fixes the contract; it does not claim a production security implementation.

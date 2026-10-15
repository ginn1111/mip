---
status: draft
scope: schemas/v0.7/evidence-pack.schema.json (new), packages/evidence (new), tests
owner: gintary
---

# Spec — AGE-34 Reference Evidence Pack schema and provenance

Linear: AGE-34. Authority: RFC 0007 (Linear document), "Required evidence schema (proposal)" and "Reference capture policy". Done per Linear: valid and invalid fixtures and MIP artifact bindings.

## Problem

MIP has no schema for evidence extracted from a reference (video, GIF, website, Figma, storyboard). Without one, extractors (AGE-35 to AGE-37) and the draft generator (AGE-38) have nothing to agree on, and observed facts cannot be told from inferred or declared ones.

## Desired behavior

- **B1 Schema.** New `schemas/v0.7/evidence-pack.schema.json` (JSON Schema 2020-12, `additionalProperties: false`, same style as the other v0.7 schemas). A pack has `protocol: mip/0.7`, `id`, `sources[]`, `observations[]`, `hypotheses[]`, `bindings[]`.
- **B2 source.** `{id, kind, uri, digest, capturedAt, environment, licenseOrPermissionNotes}`. `kind` is one of `video`, `gif`, `website`, `figma`, `storyboard`. `digest` is the existing `sha256:` digest pattern. `capturedAt` is a date-time. `environment` records at least viewport, device, frame rate where known; unknown values are explicit `null`, not omitted.
- **B3 observation.** `{id, sourceId, timeRangeMs:[start,end], actorId, event, property, measuredValue, measurementMethod, confidence, evidenceRefs[]}`. `confidence` is a number from 0 to 1. `timeRangeMs` has integers with `start <= end`. `evidenceRefs` reuse the `{uri, digest, mediaType}` evidence shape.
- **B4 hypothesis.** `{id, concept, proposedInterpretation, sourceObservationIds[], confidence, alternatives[], reviewStatus}`. `reviewStatus` is `proposed`, `accepted` or `rejected`.
- **B5 binding.** `{intentField, observationIds[], hypothesisIds[], provenanceClass}`. `provenanceClass` is `OBSERVED`, `INFERRED` or `DECLARED`.
- **B6 Referential integrity.** A pure function `validateEvidencePack(pack)` in `packages/evidence/index.mjs` returns `{ok, violations[]}` and reports codes: `UNKNOWN_SOURCE`, `UNKNOWN_OBSERVATION`, `UNKNOWN_HYPOTHESIS`, `DUPLICATE_ID`, `EMPTY_BINDING` (no observation or hypothesis ids). Schema alone cannot express these.
- **B7 Provenance rules.** A binding with `OBSERVED` must list at least one observation and no hypothesis only. A binding with `INFERRED` must list at least one hypothesis. A binding with `DECLARED` may list neither. The function reports `PROVENANCE_MISMATCH` otherwise.
- **B8 Artifact binding.** A pack is not a new artifact kind. It is referenced from `evidence[]` of `intent-profile`, `semantic-contract` or `prototype-spec` as `{uri, digest, mediaType: application/vnd.mip.reference-evidence-pack+json}`, where `digest` is the JCS digest of the pack. A helper `packEvidence(pack, uri)` builds that entry.
- **B9 Claims policy.** The schema has no field that asserts original code or exact easing. `measurementMethod` and `confidence` are required on every observation.

## Inputs / outputs

- In: a pack JSON object.
- Out: schema validation result, referential violations, an evidence entry for artifacts. No extraction code.

## Constraints

- No change to `artifact.schema.json` or `payload.schema.json`.
- No runtime dependency. Fixtures live under `tests/fixtures/evidence-pack/`.
- The Scorpio reference fixture is synthetic (hand-written), not extracted from a real video.

## Acceptance criteria
- [ ] A valid Scorpio pack validates against the schema and `validateEvidencePack` returns `ok` (B1 to B6).
- [ ] One invalid fixture per rule fails with the expected reason: missing `confidence`, confidence 1.5, `start > end`, bad digest, unknown kind, unknown `provenanceClass`, extra field (B1 to B5).
- [ ] Fixtures for `UNKNOWN_SOURCE`, `UNKNOWN_OBSERVATION`, `UNKNOWN_HYPOTHESIS`, `DUPLICATE_ID`, `EMPTY_BINDING` return the matching codes (B6).
- [ ] `OBSERVED` with only a hypothesis returns `PROVENANCE_MISMATCH` (B7).
- [ ] `packEvidence` output validates against the existing artifact `evidence` item schema, and an artifact carrying it still passes `artifact.schema.json` (B8).
- [ ] `npm test` passes.

## Edge cases
- Observation with `start == end` is valid (instant).
- Unknown environment values are `null`, and a missing key is invalid.
- Pack with no hypotheses and only `OBSERVED` bindings is valid.
- Rights: `licenseOrPermissionNotes` is required but may say "unknown"; the pack never claims redistribution rights.

## Open (TBD)
- Provenance label: the Linear issue says `OBSERVED/INFERRED/DECLARED`, RFC 0007 step 5 says `DESIGNER_DECLARED`. This spec uses `DECLARED`. Owner: user.
- Whether rights need structured fields beyond free-text notes. Owner: user.
- `measurementMethod` vocabulary (free string now). Owner: user, decide with AGE-35.

---
status: draft
scope: glossary/core, schemas/v0.7/glossary.schema.json, tests/glossary.test.mjs
owner: gintary
---

# Spec — AGE-18 glossary examples and governance

Linear: AGE-18. Authority: RFC 0002 (Linear document) entry contract. Done per Linear: 30 grounded seed concepts with examples and governance.

## Problem

`glossary/core/seed.json` has 30 concepts with provenance and status `proposed`. None has examples, and the RFC 0002 entry contract asks for "examples of human phrase, interpreted intent and motion manifestation". There is no written governance for who may approve or change an entry.

## Desired behavior

- **B1 Examples.** Each seed entry gains `examples`: an array with at least one item `{phrase, intent, manifestation}`, all non-empty strings. `phrase` contains the entry's term or an alias, so it is findable by `resolve`.
- **B2 Schema.** `glossary.schema.json` accepts an optional `examples` array with that item shape (`additionalProperties: false`). It stays optional so project-level entries without examples remain valid.
- **B3 Seed rule.** A test requires every core seed entry to have at least one valid example.
- **B4 Governance.** New `glossary/GOVERNANCE.md` states: status lifecycle `proposed`, `approved`, `deprecated`; approval only from a direct human requirement or an official source found by an agent (decided by the project owner, 2026-10-15); a content change bumps `revision`; ids never change; deprecated entries stay resolvable but flagged; project entries specialize core entries and never overwrite them (RFC 0002 precedence).
- **B5 Status unchanged.** All 30 entries stay `proposed`. Examples do not approve anything.

## Inputs / outputs

- In: `glossary/core/seed.json`, `schemas/v0.7/glossary.schema.json`, `tests/glossary.test.mjs`, `tests/schema.test.mjs`.
- Out: updated seed with examples, schema change, one new Markdown file, new tests.

## Constraints

- Examples must be grounded: describe motion consistent with the entry's existing `definition` and `motionHints`. No invented authority or citations.
- `provenance.source` stays `project` for entries curated here; do not relabel any as `standard`.
- Do not add concepts, rename ids, or change interpretations.

## Acceptance criteria
- [ ] 30 entries, each with at least one valid example, and the glossary schema validates the whole seed (B1, B2, B3).
- [ ] A seed entry with an empty example field fails schema validation (B2).
- [ ] An example `phrase` that contains neither the term nor an alias fails the seed test (B1).
- [ ] `glossary/GOVERNANCE.md` exists and covers each point in B4 (B4).
- [ ] All 30 statuses are still `proposed`, and the 30-entry test still passes (B5).
- [ ] `npm test` passes.

## Edge cases
- Multi-word terms and aliases: the phrase check uses the same word-boundary match as `resolve`.
- `magnetic` stays ambiguous after the change.

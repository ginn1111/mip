---
status: draft
scope: packages/import-figma (new), tests
owner: gintary
---

# Spec — AGE-37 Figma handoff importer

Source: Linear AGE-37; RFC 0007 (Figma frame/layer/variable extraction; screen recordings for temporal movement).

## Problem

Figma handoffs cannot become evidence for draft MIP artifacts.

## Desired behavior

- **B1 Input.** A local file shaped like the Figma REST `GET /v1/files/:key` response, plus an optional second local file shaped like `GET /v1/files/:key/variables/local` (variables under `meta.variables`; the files response has no variables). No network or token by default.
- **B2 Mapping.** Frames become storyboard candidates; layers actor candidates (names, bounds); variables composition constraints; prototype interactions (`transitionNodeID`, transition type and duration) observations with method `figma-prototype`.
- **B3 Unknowns.** Missing temporal data is listed as unknown with a suggestion to record a screen capture (AGE-35).
- **B4 Output.** Pack valid under AGE-34, source kind `figma`, license notes from user input. Component data (components, styles, component sets) is omitted in v1 and listed as unsupported.

## Inputs / outputs

In: Figma file JSON. Out: evidence pack, unknowns list.

## Constraints

- Approvals: every approval, creative or not, happens in the web reviewer by a human (project owner decision 2026-10-15). Code never creates an approval or a lock.
- Duplicate JSON keys are never allowed; parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`).
- Protocol identifier is `mip/0.7`.
- No new runtime dependency unless this spec says so.

## Acceptance criteria
- [ ] A hand-written Figma-shaped fixture maps to actors, frames, transitions (B2).
- [ ] Every actor and observation traces to a node id (B2).
- [ ] Missing timing yields unknowns, not guesses (B3).
- [ ] Output validates under AGE-34 (B4).
- [ ] License notes passed by the user appear in the pack; absent notes are recorded as missing, not invented (B4).
- [ ] Component data in the input is listed as omitted (B2).
- [ ] `npm test` passes.

## Edge cases
- Unsupported node types are listed, not silently dropped.

## Assumptions and open decisions (human decides)
- A real Figma file and token must come from the human; fixtures follow the published response shape and must be checked against a real export. Owner: user.

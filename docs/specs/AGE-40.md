---
status: draft
scope: eval/import (new), docs/reports, tests
owner: gintary
---

# Spec — AGE-40 Evaluate import pipeline for fidelity and reviewer effort

Source: Linear AGE-40; RFC 0007 acceptance tests; RFC 0006 caveats.

## Problem

There is no evidence that reference-first import saves effort or keeps fidelity versus manual briefing.

## Desired behavior

- **B1 Comparison.** Per reference (video, local site, storyboard): manual briefing versus reference-first import (AGE-35/36, AGE-38, AGE-39).
- **B2 Metrics.** Concept coverage, timing fidelity at review instants, missed transitions, ambiguities raised, measured human time.
- **B3 Report.** `docs/reports/AGE-40.md`; missing human sessions reported as missing.

## Inputs / outputs

In: references, human sessions. Out: metrics and report.

## Constraints

- Approvals: every approval, creative or not, happens in the web reviewer by a human (project owner decision 2026-10-15). Code never creates an approval or a lock.
- Duplicate JSON keys are never allowed; parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`).
- Protocol identifier is `mip/0.7`.
- No new runtime dependency unless this spec says so.

## Acceptance criteria
- [ ] Metric code is deterministic on fixture outputs (B2).
- [ ] The report contains no unmeasured number (B3).
- [ ] `npm test` passes.

## Edge cases
- A failed pipeline stage counts as a failure.

## Assumptions and open decisions (human decides)
- Human participants must come from the human. Owner: user.

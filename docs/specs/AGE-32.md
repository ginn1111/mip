---
status: draft
scope: eval/ (new), docs/reports, tests
owner: gintary
---

# Spec — AGE-32 Evaluate MIP against baseline on Scorpio and a 20-task suite

Source: Linear AGE-32; RFC 0006 (arms A baseline, B semantic, C full MIP; 20 tasks in five groups of four; caveats).

## Problem

There is no evidence that MIP improves alignment or fidelity over normal prompting.

## Desired behavior

- **B1 Dataset.** `eval/tasks/*.json`: 20 tasks, four each of explicit motion, ambiguous artistic, multistage, interactive/interruptible, conflicting intents. Hidden expected intents in `eval/expected/`, never shown to the agent.
- **B2 Harness.** `eval/run.mjs` records machine metrics for one arm and task: intent coverage, glossary classification accuracy, missed critical ambiguities, gate violations, revisions, elapsed time, token/cost, abandoned attempts. Task order is randomized per arm (seeded, recorded) per RFC 0006.
- **B3 Human ratings.** Visual agreement and timing match need blind human raters. The harness exports blinded sheets; it never fills scores.
- **B4 Report.** `docs/reports/AGE-32.md`: method, data, measured results, RFC 0006 caveats. Unmeasured targets are hypotheses.
- **B5 Honesty.** Missing human ratings are reported as missing. No synthetic scores.

## Inputs / outputs

In: tasks, an agent runner per arm. Out: metrics JSON, blinded sheets, report.

## Constraints

- Approvals: every approval, creative or not, happens in the web reviewer by a human (project owner decision 2026-10-15). Code never creates an approval or a lock.
- Duplicate JSON keys are never allowed; parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`).
- Protocol identifier is `mip/0.7`.
- No new runtime dependency unless this spec says so.

## Acceptance criteria
- [ ] 20 task and 20 expected files validate against a schema (B1).
- [ ] Metrics on a fixture run are deterministic (B2).
- [ ] Every arm uses the same model and environment; the harness refuses a run config where they differ (B2).
- [ ] Metrics include token/cost and abandoned attempts; task order is randomized with a recorded seed (B2).
- [ ] Rating sheets contain no arm labels (B3).
- [ ] The report marks every unmeasured target as a hypothesis (B4, B5).
- [ ] `npm test` passes.

## Edge cases
- A crashed arm run counts as a failure, not dropped.

## Assumptions and open decisions (human decides)
- Human raters (who, how many) must come from the human. Owner: user.
- Agent and model: RFC 0006 requires the same model and environment for all arms, so only the arm's MIP tooling differs. Which single model and environment: owner: user.

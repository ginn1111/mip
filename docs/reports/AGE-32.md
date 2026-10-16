---
status: draft
scope: eval/, docs/reports, tests
owner: gintary
---

# Report — AGE-32 MIP versus baseline on Scorpio and a 20-task suite

## Method

Arms (RFC 0006): A baseline prompting, B semantic only, C full MIP. Suite: 20 tasks, five groups of four (explicit motion, ambiguous artistic, multistage, interactive, conflicting intents) in `eval/tasks/`. Hidden expectations in `eval/expected/`, never passed to a runner. `eval/run.mjs` records per arm and task: intent coverage, glossary classification accuracy, missed critical ambiguities, gate violations, revisions, elapsed time, token/cost, abandoned attempts. Every arm uses the same model and environment (RFC 0006): only the arm's MIP tooling differs, and the harness refuses to blind or merge results whose recorded model or environment differ. Task order is randomized per arm from a recorded seed. A crashed run, or one with invalid output, counts as a failure: zero coverage, every critical ambiguity missed, counters null (never best). Ratios with no denominator are null. Visual agreement and timing match need blind human raters; the harness exports blinded sheets with empty scores and never fills them. Blind ids are an HMAC under a random secret kept only in the key file; arms merge into one shuffled sheet.

## Data

No arm has been run. The single agent, model and environment used for all arms are an open decision owned by the user; raters (who, how many) are an open decision owned by the user. The only executed run is the fixture run in `tests/eval.test.mjs`, which checks harness determinism and is not evidence about MIP.

## Measured results

None.

## Human ratings

Visual agreement: missing. Timing match: missing. No synthetic scores.

## Targets

| Target | Status |
| --- | --- |
| MIP raises intent coverage over baseline | hypothesis, unmeasured |
| MIP raises glossary classification accuracy | hypothesis, unmeasured |
| MIP misses fewer critical ambiguities | hypothesis, unmeasured |
| MIP yields fewer gate violations | hypothesis, unmeasured |
| MIP needs fewer revisions | hypothesis, unmeasured |
| MIP improves visual agreement | hypothesis, unmeasured (human ratings missing) |
| MIP improves timing match | hypothesis, unmeasured (human ratings missing) |

## RFC 0006 caveats

RFC 0006 is not in this repository; its caveat text must be transcribed from the source by a human before this report is final. Flagged open.

Limits independent of RFC 0006: expectations are keyword-based, so coverage measures stated intent, not rendered fidelity; one run per arm and task, no variance estimate.

## Reproduce

Per arm: `node eval/run.mjs --arm <label> --runner <module> --model <id> --environment <id> --out <metrics.json> [--seed <s>]` (same model, environment and seed for every arm).

Blinded sheet over all arms: `node eval/run.mjs merge <a.json> <b.json> <c.json> --sheet <sheet.json> --key <key.json>`. Keep the key file away from raters.

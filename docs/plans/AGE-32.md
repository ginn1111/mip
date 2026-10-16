---
status: draft
scope: eval/ (new), docs/reports, tests
owner: gintary
---

# Plan — AGE-32 Evaluate MIP against baseline on Scorpio and a 20-task suite

Spec: `docs/specs/AGE-32.md`. Verify: `npm test`; install with `npm install --include=dev` (the shell may export `NODE_ENV=production`).

1. Baseline: `npm install --include=dev && npm test` in the card worktree.
2. Write task/expected schemas and the 20 tasks.
3. Failing tests for metrics on a fixture run.
4. Implement `eval/run.mjs` and blinded sheet export.
5. Write the report with machine metrics only; mark human ratings missing.
6. Verify: `npm test`; quote the exact result on the card. Small scoped commits. Push the branch; open a PR with base `integration/m5-base` (retarget to `main` after upstream PRs merge). Never merge.

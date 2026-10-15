---
status: draft
scope: eval/import (new), docs/reports, tests
owner: gintary
---

# Plan — AGE-40 Evaluate import pipeline for fidelity and reviewer effort

Spec: `docs/specs/AGE-40.md`. Verify: `npm test`; install with `npm install --include=dev` (the shell may export `NODE_ENV=production`).

1. Baseline: `npm install --include=dev && npm test` in the card worktree.
2. Failing tests for metrics on fixture outputs.
3. Implement metrics and report; fill only measured values; mark missing sessions.
4. Verify: `npm test`; quote the exact result on the card. Small scoped commits. Push the branch; open a PR with base `integration/m5-base` (retarget to `main` after upstream PRs merge). Never merge.

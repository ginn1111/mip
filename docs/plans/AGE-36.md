---
status: draft
scope: packages/capture-web (new), tests
owner: gintary
---

# Plan — AGE-36 Live website motion capture and inspection

Spec: `docs/specs/AGE-36.md`. Verify: `npm test`; install with `npm install --include=dev` (the shell may export `NODE_ENV=production`).

1. Baseline: `npm install --include=dev && npm test` in the card worktree.
2. Failing tests: allowlist refusal, local CSS-transition page, canvas fallback, replay determinism.
3. Implement CDP capture reusing the browser harness pattern.
4. Mutation: remove the allowlist check; a test must fail.
5. Verify: `npm test`; quote the exact result on the card. Small scoped commits. Push the branch; open a PR with base `integration/m5-base` (retarget to `main` after upstream PRs merge). Never merge.

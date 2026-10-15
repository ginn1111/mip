---
status: draft
scope: packages/draft-artifacts (new), tests
owner: gintary
---

# Plan — AGE-38 Generate draft MIP artifacts from reference evidence

Spec: `docs/specs/AGE-38.md`. Verify: `npm test`; install with `npm install --include=dev` (the shell may export `NODE_ENV=production`).

1. Baseline: `npm install --include=dev && npm test` in the card worktree.
2. Failing tests from the AGE-34 Scorpio fixture: schema-valid drafts, blocking semantics, digest propagation, no approvals.
3. Implement the three generators.
4. Mutation: mark INFERRED resolved; the gate test must fail.
5. Verify: `npm test`; quote the exact result on the card. Small scoped commits. Push the branch; open a PR with base `integration/m5-base` (retarget to `main` after upstream PRs merge). Never merge.

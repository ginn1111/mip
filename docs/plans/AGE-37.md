---
status: draft
scope: packages/import-figma (new), tests
owner: gintary
---

# Plan — AGE-37 Figma handoff importer

Spec: `docs/specs/AGE-37.md`. Verify: `npm test`; install with `npm install --include=dev` (the shell may export `NODE_ENV=production`).

1. Baseline: `npm install --include=dev && npm test` in the card worktree.
2. Write a Figma-shaped fixture and failing mapping tests.
3. Implement the importer (local JSON only).
4. Mutation: drop a node id from provenance; a test must fail.
5. Verify: `npm test`; quote the exact result on the card. Small scoped commits. Push the branch; open a PR with base `integration/m5-base` (retarget to `main` after upstream PRs merge). Never merge.

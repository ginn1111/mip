---
status: draft
scope: skills/mip-prototype, skills/mip-verify, tests
owner: gintary
---

# Plan — AGE-29 mip-prototype and mip-verify skills

Spec: `docs/specs/AGE-29.md`. Verify: `npm test`; install with `npm install --include=dev` (the shell may export `NODE_ENV=production`).

1. Baseline: `npm install --include=dev && npm test` in the card worktree.
2. Write `skills/mip-prototype/example.prototype.json` and failing `tests/skills.test.mjs`.
3. Write both SKILL.md files.
4. Mutation: break the example; tests must fail.
5. Verify: `npm test`; quote the exact result on the card. Small scoped commits. Push the branch; open a PR with base `integration/m5-base` (retarget to `main` after upstream PRs merge). Never merge.

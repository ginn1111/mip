---
status: draft
scope: skills/mip-director, skills/mip-glossary, tests
owner: gintary
---

# Plan — AGE-28 mip-director and mip-glossary Agent Skills

Spec: `docs/specs/AGE-28.md`. Verify: `npm test`; install with `npm install --include=dev` (the shell may export `NODE_ENV=production`).

1. Baseline: `npm install --include=dev && npm test` in the card worktree.
2. Write failing `tests/skills-director.test.mjs` (frontmatter, gate-code mapping extracted from `packages/gates/index.mjs`, gate-check and no-self-approval wording).
3. Write both SKILL.md files until green.
4. Mutation: drop one code from the mapping; the test must fail.
5. Record `docs/walkthroughs/AGE-28.md` from real CLI runs.
6. Verify: `npm test`; quote the exact result on the card. Small scoped commits. Push the branch; open a PR with base `integration/m5-base` (retarget to `main` after upstream PRs merge). Never merge.

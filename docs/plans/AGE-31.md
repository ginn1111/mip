---
status: draft
scope: packages/runtime-three (new), packages/runtime-gsap (new), tests
owner: gintary
---

# Plan — AGE-31 Three.js and GSAP runtime integration

Spec: `docs/specs/AGE-31.md`. Verify: `npm test`; install with `npm install --include=dev` (the shell may export `NODE_ENV=production`).

1. Baseline: `npm install --include=dev && npm test` in the card worktree.
2. Add `three`, `gsap` as optional peer and dev dependencies; core packages import neither.
3. Failing Node tests for `bind/seek/destroy` at every Scorpio review instant.
4. Implement `packages/runtime-gsap`, then `packages/runtime-three`.
5. Mutation: add a GSAP ease; tests must fail.
6. Build a verification-record payload in a test; do not lock it.
7. Verify: `npm test`; quote the exact result on the card. Small scoped commits. Push the branch; open a PR with base `integration/m5-base` (retarget to `main` after upstream PRs merge). Never merge.

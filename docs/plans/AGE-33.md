---
status: draft
scope: docs/design/AGE-33.md (design only)
owner: gintary
---

# Plan — AGE-33 Optional MCP server and Ginflow plugin integration (design)

Spec: `docs/specs/AGE-33.md`. Verify: `npm test`; install with `npm install --include=dev` (the shell may export `NODE_ENV=production`).

1. Baseline: `npm install --include=dev && npm test` in the card worktree.
2. Read RFC 0005 and `packages/cli`.
3. Write `docs/design/AGE-33.md` per tool with open questions.
4. Check no tool approves or locks.
5. Verify: `npm test`; quote the exact result on the card. Small scoped commits. Push the branch; open a PR with base `integration/m5-base` (retarget to `main` after upstream PRs merge). Never merge.

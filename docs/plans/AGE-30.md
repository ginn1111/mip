---
status: draft
scope: packages/cli (new), package.json bin, tests
owner: gintary
---

# Plan — AGE-30 MIP CLI for standalone projects

Spec: `docs/specs/AGE-30.md`. Verify: `npm test`. Install: `npm install --include=dev`. Blocked on the TBD items in the spec for B7 and B8; do B1 to B6 and B9 first.

1. **Baseline.** `npm test`; evidence: counts. Read `packages/artifacts/index.mjs`, `packages/gates/index.mjs`, `packages/glossary/index.mjs` exports.
2. **Failing CLI tests (B2, B9).** Add `tests/cli.test.mjs` that spawns `node packages/cli/bin.mjs` in a temp directory: `init` creates files and refuses a second run, `--help` for each command, unknown command exits 1 with one line. Run: fail (no CLI).
3. **Skeleton (B1, B9).** Add `packages/cli/bin.mjs` with `parseArgs`, a command table and help text; add `bin` to `package.json`. Tests from step 2 pass.
4. **init and intent (B2, B3).** Implement `init` and `intent create` over `ArtifactStore`. Test: after `intent create`, the store has a draft intent and semantic contract.
5. **glossary, validate, status (B4, B5).** Implement the three commands, `--json` for validate and status, exit code 2 on `BLOCKED`. Test: `validate --phase semantic` is `BLOCKED` with a magnetic intent.
6. **preview (B6).** Start the reviewer from `examples/scorpio/serve.mjs` logic for a scene. Test with a throwaway store; never approve.
7. **lock (B7), fail closed.** `lock` exits 3 for creative kinds and for every kind until the TBD is decided. Test: store scan after every command finds no `approvals` entry and no `lock`.
8. **verify (B8).** Do not implement until the user decides where `implementation-contract` comes from. Record this on the card as blocked.
9. **Mutation check.** Make `lock` write an approval; the store-scan test must fail. Restore.
10. **Verify and report.** `npm test` and `node packages/cli/bin.mjs --help` from `/home/aioz/personal/mip`; quote results on the card. Small commits per step. Do not push or merge.

Risks: B7 and B8 depend on user decisions; card stays In Progress, not done, until then.

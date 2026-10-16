---
status: draft
scope: packages/cli (new), package.json bin, tests
owner: gintary
---

# Spec — AGE-30 MIP CLI for standalone projects

Linear: AGE-30. Authority: RFC 0005 (Linear document): proposed commands `mip init`, `intent create --scene`, `glossary resolve --scene`, `validate --phase`, `preview --scene`, `lock --phase`, `status`, `verify`; "tools can request human review but MUST NOT fabricate approval"; "enforcement MUST remain in core". Done per Linear: complete CLI flow with meaningful failures and help.

## Problem

The protocol has no command line. Everything runs through tests or the Scorpio example server. The repo has no `bin`, no CLI package, and no project layout for a standalone project.

## Desired behavior

- **B1 Entry.** `package.json` gets `bin: {mip: packages/cli/bin.mjs}`. The CLI uses only `node:util` `parseArgs` and existing packages. No new dependency.
- **B2 Project layout.** `mip init [dir]` creates `mip.config.json` (protocol `mip/0.7`, project id) and an artifact store directory (default `.mip/artifacts`). It refuses to overwrite an existing config.
- **B3 intent.** `mip intent create --scene <id> --text <text> [--candidate <phrase>...]` runs `extractIntent` and writes a draft `intent-profile` and `semantic-contract` to the store. It prints unresolved ambiguities.
- **B4 glossary.** `mip glossary resolve --scene <id> --text <text>` prints each match with status `resolved`, `ambiguous` or `unknown` (the `unknown` status needs AGE-19; before it lands the command reports resolved and ambiguous only).
- **B5 validate and status.** `mip validate --phase <phase>` loads the artifacts for that phase and runs `validateGate`, printing `PASS` or `BLOCKED` with violation codes, exit 0 or 2. Known limitation: it gates the latest revision of each kind across all scenes, not one scene. `mip status` shows each artifact kind, revision, lifecycle and whether it is locked.
- **B6 preview.** `mip preview --scene <id>` starts the existing reviewer server for the scene's prototype-spec and prints the URL. It does not approve anything.
- **B7 lock.** `mip lock --phase <phase>` never creates an approval. For every phase it refuses with exit 3 and points to the web reviewer (`mip preview`). Project owner decision 2026-10-15: all approvals, creative or not, happen in the web reviewer; extending the reviewer to non-creative artifacts is separate work (AGE-23 follow-up).
- **B8 verify.** `mip verify` runs `validateGate('verification', ...)`. It needs an `implementation-contract` artifact (TBD below).
- **B9 Help and failures.** `mip --help` and `mip <command> --help` print usage. Unknown command, missing flag, missing store or unreadable artifact give a one-line message and exit 1. Exit codes: 0 ok, 1 usage or I/O, 2 gate BLOCKED, 3 approval refused.

## Inputs / outputs

- In: CLI args, `mip.config.json`, artifact store on disk.
- Out: stdout text (machine-readable `--json` flag on `validate` and `status`), files in the store, exit codes.

## Constraints

- Core stays authority: the CLI calls `ArtifactStore`, `validateGate`, `extractIntent` and the approval service. No duplicated gate logic.
- No fabricated approval, no agent self-approval, no auto-approve flag.
- Not in scope: MCP server, three-r3f and gsap adapters, skills packaging.

## Acceptance criteria
- [ ] `mip init` creates config and store, and a second run refuses (B2).
- [ ] `mip intent create` then `mip validate --phase semantic` reports `BLOCKED` while a blocking ambiguity exists (B3, B5).
- [ ] `mip status` lists artifacts with lifecycle and lock state; `--json` output parses (B5).
- [ ] `mip lock` exits 3 for every phase and names the reviewer (B7).
- [ ] No command writes an `approvals` entry or a `lock` (B7), checked by a test that scans the store after every command.
- [ ] Every command has `--help`; bad input exits 1 with one line (B9).
- [ ] `npm test` passes and `node packages/cli/bin.mjs --help` works from a clean checkout.

## Edge cases
- Re-running `intent create` for an existing scene creates a new revision, never edits in place.
- Store path outside the project directory is rejected.
- Phase name unknown: exit 1 listing valid phases.

## Open (TBD)
- Where `implementation-contract` and `verification-record` come from (no code for them exists). Owner: user. B8 is blocked on this.
- Package location `packages/cli` and the `.mip/` store default follow RFC 0005 and `serve.mjs`. Confirm. Owner: user.

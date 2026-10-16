---
status: draft
scope: skills/mip-director, skills/mip-glossary, tests
owner: gintary
---

# Spec — AGE-28 mip-director and mip-glossary Agent Skills

Source: Linear AGE-28; RFC 0005: skills mip-director (entry point, orchestrates phases) and mip-glossary (terminology resolution); agent skills MUST tell agents to check gates before consuming phase artifacts; enforcement stays in the core engine.

## Problem

There is no agent-facing entry point. An agent has no instructions for the MIP phase order, gate checks or glossary resolution.

## Desired behavior

- **B1 Location.** `skills/<name>/SKILL.md` at repo root (Agent Skills format: YAML frontmatter `name`, `description`, then Markdown). Assumption: repo-root `skills/`; RFC 0005 fixes no path.
- **B2 mip-director.** Describes the CLI gate phases `semantic, prototype, implementation, verification, complete` (the keys of `REQUIREMENTS` in `packages/gates/index.mjs`), the artifact each produces, and the order. There is no `intent` gate: the `intent-profile` is an input checked by the `semantic` gate. The skill covers `complete` (requires a locked `verification-record`). Before using an upstream artifact the agent runs `mip validate --phase <phase>` (CLI) and stops on `BLOCKED`.
- **B3 Recovery.** Maps every violation code `packages/gates/index.mjs` can emit to a next action (for example `UNRESOLVED_AMBIGUITY` to mip-glossary, `MISSING_HUMAN_APPROVAL` to the web reviewer via `mip preview`).
- **B4 mip-glossary.** Explains `resolve` and the statuses `resolved`, `ambiguous`, `unknown`; ambiguous or unknown terms are asked of the human, never guessed. Approval follows `glossary/GOVERNANCE.md` (direct human requirement or official source).
- **B5 No self-approval.** Both skills say the agent never approves or locks; approval is a human act in the web reviewer.

## Inputs / outputs

In: none at runtime. Out: two SKILL.md files and a test.

## Constraints

- Approvals: every approval, creative or not, happens in the web reviewer by a human (project owner decision 2026-10-15). Code never creates an approval or a lock.
- Duplicate JSON keys are never allowed; parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`).
- Protocol identifier is `mip/0.7`.
- No new runtime dependency unless this spec says so.

## Acceptance criteria
- [ ] Both SKILL.md files have valid frontmatter (`name` equals the directory, non-empty `description`) (B1).
- [ ] A test extracts every violation code emitted by `packages/gates/index.mjs` and fails if mip-director does not map it (B3).
- [ ] A test fails if either skill lacks the gate-check instruction or the no-self-approval rule (B2, B5).
- [ ] `docs/walkthroughs/AGE-28.md` records real CLI output of an agent following the skills through intent and semantic phases, ending BLOCKED on the `magnetic` ambiguity.
- [ ] `npm test` passes.

## Edge cases
- A gate code added later must break the mapping test.

## Assumptions and open decisions (human decides)
- Repo-root `skills/` vs a package path: assumed repo root. Owner: user.

---
status: draft
scope: docs/design/AGE-33.md (design only)
owner: gintary
---

# Spec — AGE-33 Optional MCP server and Ginflow plugin integration (design)

Source: Linear AGE-33; RFC 0005 (tools `mip.get_status`, resolve_glossary, create_intent, validate_artifact, validate_gate, create_prototype, get_preview, request_review, lock_artifact, verify_implementation; tools may request review but MUST NOT fabricate approval).

## Problem

Agents in other hosts cannot use MIP without the CLI. No interface or auth boundary is defined.

## Desired behavior

- **B1 Tools.** One section per RFC 0005 tool: input, output, core function called, errors.
- **B2 Auth boundary.** No tool approves or locks. `lock_artifact` becomes `request_review`, returning the reviewer URL (all approvals happen in the web reviewer).
- **B3 Ginflow mapping.** MIP phases to Ginflow cards and gates; which side enforces what.
- **B4 Feasibility.** Effort and risk per tool; which reuse the CLI.

## Inputs / outputs

In: RFC 0005, packages. Out: one design document.

## Constraints

- Approvals: every approval, creative or not, happens in the web reviewer by a human (project owner decision 2026-10-15). Code never creates an approval or a lock.
- Duplicate JSON keys are never allowed; parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`).
- Protocol identifier is `mip/0.7`.
- No new runtime dependency unless this spec says so.

## Acceptance criteria
- [ ] `docs/design/AGE-33.md` covers every RFC 0005 tool (B1).
- [ ] No tool can create an approval or lock (B2).
- [ ] Open questions are listed, not invented.
- [ ] `npm test` passes.

## Edge cases
- Design only; no implementation.

## Assumptions and open decisions (human decides)
- MCP transport: assumed stdio. Owner: user.

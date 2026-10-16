---
name: mip-director
description: Use when creating or changing motion or animation with MIP (Motion Intent Protocol). Entry point that orders the phases (intent and semantic, then prototype, implementation, verification, complete), runs the gate before each phase, and maps every gate violation to a next action.
---

# mip-director

Entry point for MIP (`mip/0.7`). Enforcement lives in the core engine; this skill only tells you how to drive it.

## Phases and artifacts

Run in this order. Each phase consumes the locked artifacts of the phases before it.

| Phase | Produces | Command |
|---|---|---|
| intent | `intent-profile` | `mip intent create --scene <id> --text <text>` |
| semantic | `semantic-contract` | written with the intent; resolve terms with mip-glossary |
| prototype | `prototype-spec`, `prototype-review` | human review in the web reviewer (`mip preview --scene <id>`) |
| implementation | `implementation-contract` | after the prototype gate passes |
| verification | `verification-record` | `mip verify` |
| complete | none; final gate, needs the locked `verification-record` | `mip validate --phase complete` |

## Gate check (mandatory)

Before you use an upstream artifact, run:

    mip validate --phase <phase>

Valid gate phases: `semantic|prototype|implementation|verification|complete`. There is no `intent` gate: the `semantic` gate checks the `intent-profile`.

Use `--json` for machine output. Exit 0 is `PASS`. Exit 1 is usage or I/O error (missing or unknown phase, no project): fix the command. Exit 2 is `BLOCKED`: stop, read the violation codes, follow the table below, run the gate again. Never consume artifacts of a phase that is `BLOCKED`.

## No self-approval

You never approve and never lock. Approval is a human act in the web reviewer (`mip preview --scene <id>`). `mip lock` refuses by design. Do not edit artifact files to add approvals, locks or digests, and do not work around a `BLOCKED` result.

## Recovery: violation code to next action

| Code | Next action |
|---|---|
| `MISSING_REQUIRED` | Create the missing artifact kind with the phase command above, then ask the human to approve it. |
| `DEPENDENCY_CYCLE` | Stop. Artifacts depend on each other in a loop; report to the human. Do not edit. |
| `SUPERSEDED` | A newer revision exists. Use the latest revision and re-run the gate. |
| `NOT_LOCKED` | Ask the human to approve in the web reviewer (`mip preview --scene <id>`). Never lock yourself. |
| `DIGEST_MISMATCH` | Artifact changed after lock, or never locked (if `NOT_LOCKED` is also listed, handle that first). Do not repair it; create a new revision and ask for a new human approval. |
| `LOCK_DEPENDENCY_MISMATCH` | Lock no longer matches its dependencies. Create a new revision and ask for a new human approval. |
| `MISSING_HUMAN_APPROVAL` | Ask the human to approve in the web reviewer (`mip preview --scene <id>`). |
| `UNVERIFIED_HUMAN_APPROVAL` | Approval is not host-verified. Ask the human to approve again through the web reviewer (`mip preview --scene <id>`). |
| `UNRESOLVED_AMBIGUITY` | Use mip-glossary. Ask the human to resolve each blocking term; never guess. |
| `MISSING_DEPENDENCY` | A referenced artifact is not in the store. Restore it or recreate the chain; report to the human. |
| `STALE_DEPENDENCY` | An upstream artifact changed. Create a new downstream revision and ask for a new human approval. |
| `MISSING_PROTOTYPE_REVIEW` | Ask the human to review the prototype in the web reviewer (`mip preview --scene <id>`). |
| `DUPLICATE_PROTOTYPE_REVIEW` | More than one review targets one prototype. Report to the human; do not delete. |
| `PROTOTYPE_REVIEW_MISMATCH` | Review does not match the prototype digest. Ask the human to review the current prototype in the web reviewer (`mip preview --scene <id>`). |
| `PROJECT_MISMATCH` | Review and prototype belong to different projects. Report to the human. |
| `INCOMPLETE_PROTOTYPE_REVIEW` | Not every scenario is reviewed or the decision is not approved. Ask the human to finish the review in the web reviewer (`mip preview --scene <id>`). |
| `REVIEWER_MISMATCH` | Review and approvals come from different humans. Ask one human to redo the review in the web reviewer (`mip preview --scene <id>`). |
| `MISSING_REVIEW_EVIDENCE` | Review lacks frame evidence. Ask the human to redo the review in the web reviewer (`mip preview --scene <id>`). |
| `REVIEW_EVIDENCE_MISMATCH` | Review evidence differs from the recomputed manifest. Ask the human to redo the review in the web reviewer (`mip preview --scene <id>`). |

Only creative (prototype) approval has a web reviewer today. For semantic or implementation approval there is no reviewer yet: stop and ask the human; do not approve or lock.

A code not listed here: stop and report it. Do not guess a fix.

---
status: draft
scope: docs/design/AGE-33.md (design only)
owner: ginb
---

# Design — AGE-33 Optional MCP server and Ginflow plugin integration

Spec: `docs/specs/AGE-33.md`. Plan: `docs/plans/AGE-33.md`. Design only; no code ships with this document.

RFC 0005 (Linear) is not in the repo. Its tool names and rules come from the spec's Source line; the repo-side protocol is `specs/v0.7/RFC.md` (mip/0.7).

## 1. Principles

- The MCP server is a thin adapter, like `packages/cli/bin.mjs`. Enforcement stays in core (`validateGate`, `ArtifactStore`, `ApprovalService`). The server adds no gate logic.
- No tool approves, locks, attests or supersedes. The server never imports `ApprovalService`, `createApprovalAuthenticator`, `PrototypeReviewService.approveDraft`, or `reviewSemanticContract`. It never receives `MIP_REVIEW_TOKEN` or `MIP_APPROVAL_SECRET`.
- Every approval, creative or not, is a human act in the web reviewer (owner decision 2026-10-15).
- Every JSON read (store files, tool arguments carried as text, config) uses `parseStrictJson` (`packages/artifacts/index.mjs`). Duplicate keys are rejected. `ArtifactStore.read` already does this. Do not copy `parseConfig` from the CLI; the CLI comment already says to move to `parseStrictJson`.
- Protocol identifier is `mip/0.7`; reject any other `protocol` in config or artifacts.
- No new runtime dependency by default. See Q2 for the one decision that could change this.
- Artifact IDs go through the store's `^[a-zA-Z0-9._-]+$` rule; the store directory must stay inside the project (same check as CLI `loadProject`).

## 2. Common conventions

Project root: server start directory, or `--project <dir>` argument; it holds `mip.config.json`. Each tool call loads config strictly and builds an `ArtifactStore`. No state is cached between calls.

Result shape (all tools): MCP `content` text holding JSON, plus `isError` on failure.

```
ok:     {"ok":true, ...tool fields}
error:  {"ok":false,"code":"<CODE>","message":"<one line>"}
```

Common error codes: `NO_PROJECT` (no `mip.config.json`), `BAD_CONFIG` (unreadable or duplicate key), `UNSUPPORTED_PROTOCOL`, `BAD_INPUT` (schema or ID rule), `STORE_ERROR` (I/O), `APPROVAL_REFUSED` (any attempt to approve or lock). Gate BLOCKED is a normal result, not an error: `ok:true, status:"BLOCKED"`.

Mapping to CLI exit codes: 0 -> `ok:true`; 1 -> `NO_PROJECT`, `BAD_CONFIG`, `BAD_INPUT`, `STORE_ERROR`; 2 -> `status:"BLOCKED"`; 3 -> `APPROVAL_REFUSED`.

## 3. Tools (B1)

RFC 0005 lists ten tools. All ten have a section. `lock_artifact` exists only as a refuser (see 3.9).

### 3.1 get_status

- Input: none.
- Output: `{ok, artifacts:[{id,revision,kind,lifecycle,lock:"none"|"present"}]}`. Same rows as `mip status --json`.
- Core: `ArtifactStore.history`, `ArtifactStore.read`; lock = existence of `<revision>.json.lock` sidecar (as CLI `allArtifacts`).
- Errors: `NO_PROJECT`, `BAD_CONFIG`, `STORE_ERROR`.
- Reads only. Presence of a sidecar is reported, not verified; `validate_gate` is the verifier.

### 3.2 resolve_glossary

- Input: `{scene:string, text:string}`. Both required; `text` non-blank.
- Output: `{ok, matches:[{term,status,interpretations:[{meaning}]}]}`.
- Core: `resolve` from `packages/glossary`.
- Errors: `BAD_INPUT`.
- Note: the CLI accepts `--scene` but `resolve(text)` ignores it. The tool keeps the argument for parity and passes no scene terms. Whether to pass project and scene terms is Q6.
- Needs no project store; works without `mip.config.json`.

### 3.3 create_intent

- Input: `{scene:string (ID rule), text:string, candidates?:string[]}`.
- Output: `{ok, intent:{id,revision}, semantic:{id,revision}, blockingAmbiguities:string[]}`.
- Core: `extractIntent`, `proposeSemanticContract`, `ArtifactStore.create`. Same flow as CLI `intent create`.
- Writes: two new revisions, `lifecycle:"draft"`, `approvals:[]`, no `lock`. The tool hard-codes these; the caller cannot pass lifecycle, approvals or lock.
- Errors: `BAD_INPUT`, `NO_PROJECT`, `STORE_ERROR` (including `EEXIST` race on a revision: report, never overwrite).
- Idempotency: not idempotent; each call adds a revision.

### 3.4 validate_artifact

- Input: `{id:string, revision?:integer}` (default latest).
- Output: `{ok, ref:{id,revision,digest}, kind, lifecycle, findings:[{code,detail?}]}`.
- Core: `ArtifactStore.read` (strict), `artifactDigest`. Structural checks only: protocol is `mip/0.7`, `kind` known, digest computes; for `kind:"prototype-spec"` also `validatePrototype(payload)` (throw -> finding `INVALID_PROTOTYPE`).
- Errors: `BAD_INPUT`, `STORE_ERROR` (unknown artifact -> `NOT_FOUND`).
- Distinct from `validate_gate`: this checks one artifact in isolation, never approval or lock state, never mutates.
- Open: JSON Schema check (`schemas/`) is not wired into a runtime package today; adding it needs `ajv`, a devDependency only. See Q5.

### 3.5 validate_gate

- Input: `{phase:"semantic"|"prototype"|"implementation"|"verification"|"complete"}`.
- Output: `{ok, status:"PASS"|"BLOCKED", phase, violations:[{code,artifact?|kind?}]}`. Identical to `mip validate --json`.
- Core: `validateGate(phase, latestInputsPerKind, ref=>store.read(...))`, with the same input selection as CLI `runGate`.
- Errors: `BAD_INPUT` (unknown phase), `NO_PROJECT`, `STORE_ERROR`.
- `verifyApproval` is not passed. Consequence: any creative artifact (prototype-spec, prototype-review) yields `UNVERIFIED_HUMAN_APPROVAL` through this tool, so implementation and later gates return BLOCKED there. This matches today's CLI and keeps the server free of the approval secret. Fixing it needs a verification-only path that does not hold the signing secret. See Q3.

### 3.6 create_prototype

- Input: `{id:string, scene:string, spec:object}` where `spec` is the `prototype-spec` payload (actors, states, transitions, tracks, scenarios, `reviewSegments`, `durationMs`).
- Output: `{ok, prototype:{id,revision,digest}}`.
- Core: `validatePrototype(spec)`, then `ArtifactStore.create` with `kind:"prototype-spec"`, `lifecycle:"draft"`, `dependencies` = latest `semantic-contract` ref, `approvals:[]`.
- Errors: `BAD_INPUT`, `INVALID_PROTOTYPE` (message from `validatePrototype`), `MISSING_DEPENDENCY` (no semantic-contract), `STORE_ERROR`.
- The agent authors the spec; the server does not generate motion. The CLI has no equivalent command; this is new surface (see section 6).
- The caller cannot set lifecycle, approvals, lock, evidence.

### 3.7 get_preview

- Input: `{scene:string}` (today only `scorpio`).
- Output: `{ok, url, ref:{id,revision,digest}}` where `url` is the reviewer address, e.g. `http://127.0.0.1:<port>/`.
- Core: the existing reviewer server (`examples/scorpio/serve.mjs`), read-only `GET /api/prototype` for the ref.
- Errors: `BAD_INPUT` (unsupported scene), `PREVIEW_UNAVAILABLE` (reviewer not running or not configured).
- The server does not start the reviewer: starting needs `MIP_REVIEW_TOKEN`, `MIP_APPROVAL_SECRET`, `MIP_REVIEWER_ID`, which the MCP process must not hold. A human starts `mip preview`; the tool reports the URL from `MIP_REVIEWER_URL`. See Q4. It never returns the review token.

### 3.8 request_review

- Input: `{id:string, revision?:integer}` (default latest).
- Output: `{ok, ref:{id,revision,digest}, reviewerUrl, status:"review_requested"}`.
- Core: `ArtifactStore.read`; digest from `artifactDigest`; URL as in 3.7.
- Writes: nothing in the baseline design. It returns the reviewer URL and the digest the human will bind approval to. It sets no lifecycle, no approval, no lock.
- Errors: `NOT_FOUND`, `PREVIEW_UNAVAILABLE`, `BAD_INPUT`.
- Moving an artifact to `in_review` would be a lifecycle write with no core transition function today (`ArtifactStore.create` accepts `in_review`, but only for new revisions). Writing it is not part of this design. See Q7.
- Only `prototype-spec` and `prototype-review` have a reviewer today. For other kinds the tool returns `REVIEW_UNSUPPORTED` until the AGE-23 follow-up extends the web reviewer to non-creative artifacts.

### 3.9 lock_artifact

- Input: `{id:string, revision?:integer}` (accepted so callers fail clearly).
- Output: always error `{ok:false, code:"APPROVAL_REFUSED", message:"approval is a human act in the web reviewer; call request_review"}`, `isError:true`.
- Errors: `APPROVAL_REFUSED` always; `BAD_INPUT` for a malformed argument.
- Core: none. It validates input shape and refuses. It performs no store write, creates no `.lock` sidecar and calls no `ApprovalService`.
- Spec B2 says `lock_artifact` becomes `request_review`. Two readings: (a) do not register `lock_artifact` at all and expose only `request_review`; (b) register it as an always-refusing alias, as `mip lock` does. This document assumes (b) for CLI parity and clearer failures from hosts that expect the RFC name. Decision is open (Q8).

### 3.10 verify_implementation

- Input: none.
- Output: same as `validate_gate` for `phase:"verification"`.
- Core: `validateGate('verification', ...)`, as CLI `verify`.
- Errors: as 3.5.
- It needs an `implementation-contract` artifact. Creating one is not in the tool list; where that artifact comes from is open (Q9, inherited from AGE-30).

## 4. Auth boundary (B2)

| Capability | MCP server | Web reviewer (human) |
| --- | --- | --- |
| Create draft artifacts | yes (`create_intent`, `create_prototype`) | no |
| Read, validate, run gates | yes | no |
| Return reviewer URL and digest | yes | n/a |
| Approve (`ApprovalService`) | never | yes, with verified identity |
| Create `.lock` sidecar | never | via `ApprovalService` only |
| Hold `MIP_REVIEW_TOKEN`, `MIP_APPROVAL_SECRET` | never | yes |

Enforcement points:
1. Static: tool registry contains no tool whose handler can reach an approval or lock function. A test greps the server sources for `ApprovalService`, `attestApproval`, `.lock` writes, and `approveDraft`. (Required when the server is built; see section 7.)
2. Input: handlers build artifacts from a fixed template (`lifecycle:"draft"`, `approvals:[]`, `evidence:[]`). Caller fields named `lifecycle`, `approvals`, `lock`, `attestation` are rejected with `BAD_INPUT`, not ignored.
3. Environment: the server process is started without the approval secret. Gate verification of creative approvals therefore cannot run inside it (Q3).
4. Core gate: even a forged artifact written to disk cannot pass `validateGate` without a valid human approval and, for creative kinds, a verified attestation.

Prompt-injection note: tool arguments and artifact text are untrusted data. The server never executes them and never echoes secrets.

## 5. Ginflow mapping (B3)

Terms: Ginflow Initiative phases (Discovery, Shaping, Execution, Decision) and Kanban cards; `ginflow-gate` validates card completion. MIP phases are artifact phases inside one project.

| MIP phase (gate) | Artifact produced | Ginflow place | MCP tool | Who enforces |
| --- | --- | --- | --- | --- |
| Intent (`semantic` gate input) | intent-profile | Discovery output or first Execution card | `create_intent`, `resolve_glossary` | MIP core: glossary, no gate |
| Semantic (`semantic`, `prototype`) | semantic-contract | Shaping: ambiguities resolved before Execution | `validate_gate` | MIP core gate; human resolves ambiguity |
| Prototype | prototype-spec, prototype-review | One Execution card per prototype; card blocks on human review | `create_prototype`, `get_preview`, `request_review` | Web reviewer (approval); MIP gate (evidence) |
| Implementation | implementation-contract | Execution card(s) with code scope | `validate_gate implementation` | MIP gate before card starts; `ginflow-gate` at card completion |
| Verification | verification-record | Final Execution card; Decision phase reads it | `verify_implementation` | MIP gate; `ginflow-gate` for card evidence |

Division of enforcement:
- MIP core enforces artifact truth: locks, digests, approvals, stale dependencies, review evidence. Its verdict is `PASS` or `BLOCKED` with codes.
- Ginflow enforces process truth: card fields, scope, verification command recorded, baseline commit, drift of linked paths, one-card-per-workspace. It does not read MIP artifacts.
- The two meet at card acceptance text and card evidence: a card's acceptance may say "`validate_gate implementation` returns PASS"; the worker records that result on the card. `ginflow-gate` checks that evidence exists, not that MIP agrees.
- A Ginflow human decision (Decision phase, `approved_for_mr`) is not a MIP approval. Neither substitutes for the other.
- A card blocked on a human review uses `kanban_block` with kind `needs_input` and the reviewer URL; unblock happens after the human approves in the web reviewer, never by a tool.

Plugin integration shape (open): whether Ginflow gets a plugin that calls these tools, or the worker calls the MCP server directly, is Q10. This document specifies only that any plugin calls the same ten tools and gains no extra power.

## 6. Feasibility (B4)

Effort: S = under a day, M = 1-3 days, L = more. Reuse: CLI means the logic exists in `packages/cli/bin.mjs`; core means a package function.

| Tool | Effort | Risk | Reuse |
| --- | --- | --- | --- |
| get_status | S | low | CLI logic |
| resolve_glossary | S | low | core `resolve` |
| create_intent | S | low | CLI logic |
| validate_artifact | M | medium: no per-artifact validator exists; schema wiring (Q5) | core, new glue |
| validate_gate | S | medium: creative approvals always unverified (Q3) | CLI logic |
| create_prototype | M | medium: new surface; spec authoring by agents | core, no CLI |
| get_preview | S | medium: reviewer lifecycle and URL discovery (Q4) | partly CLI |
| request_review | S | medium: no `in_review` transition, reviewer is scorpio-only (Q7) | new |
| lock_artifact | S | low: refuser | CLI logic |
| verify_implementation | S | medium: no source of implementation-contract (Q9) | CLI logic |

Cross-cutting:
- CLI logic is inside `bin.mjs` and prints to stdout; only `main` is exported. Reusing it needs a refactor to shared functions, or spawning `mip <cmd> --json` as a child process. Over stdio the server must never write to stdout outside the protocol. Q1.
- `status` and `validate` have `--json`; `intent`, `glossary`, `verify` do not.
- Overall: whole server is M-L, dominated by the CLI-reuse choice and the verification-secret gap.

## 7. Verification plan for the future implementation

Not part of this card. Recorded so the build card inherits it.
- One test per tool: success shape and each listed error code.
- Auth boundary test: tool list contains no approving tool; `lock_artifact` returns `APPROVAL_REFUSED` and leaves no `.lock` file; source scan for forbidden imports.
- Strict JSON test: a store file with a duplicate key makes every reading tool return `BAD_CONFIG` or `STORE_ERROR`, never a parsed value.
- Parity test: `validate_gate` and `get_status` outputs equal `mip validate --json` and `mip status --json` on the same fixture.

## 8. Open questions (human decides; none are decided here)

- Q1 CLI reuse: refactor `bin.mjs` into importable functions, or spawn the CLI with `--json`? Affects every tool's effort. Owner: user.
- Q2 Transport and SDK: spec assumes stdio. Followed here. Writing the server with no dependency means hand-rolling JSON-RPC over stdio; using the official MCP SDK is a new runtime dependency, which the spec forbids unless it says so. Owner: user.
- Q3 Creative-approval verification: `validate_gate` and `verify_implementation` cannot verify attested approvals without the approval secret. Options: keep BLOCKED, give the server a verify-only credential, or have the reviewer expose a verification endpoint. Owner: user.
- Q4 Reviewer lifecycle: who starts the reviewer, and how the server learns its URL (`MIP_REVIEWER_URL`, a file in `.mip/`, or a fixed port). Owner: user.
- Q5 `validate_artifact` scope: structural only, or JSON Schema validation (adds `ajv` outside devDependencies). Owner: user.
- Q6 Glossary scope: pass project and scene glossary terms into `resolve`, and where they live. Owner: user.
- Q7 `request_review` state: does it only return the URL, or also write an `in_review` revision? A write needs a core transition function. Owner: user.
- Q8 `lock_artifact`: omit entirely, or register as an always-refusing alias (assumed). Owner: user.
- Q9 Source of `implementation-contract` and `verification-record` artifacts; no tool creates them. Inherited from AGE-30. Owner: user.
- Q10 Ginflow plugin shape: direct MCP calls by workers, or a plugin wrapping them; where Ginflow keeps MIP gate results (card metadata field or comment). Owner: user.
- Q11 Multi-project: one server per project root (assumed) or a project argument per call. Owner: user.
- Q12 RFC 0005 text is not in the repo; confirm the ten tool names and the `get_preview` / `create_prototype` meanings used here. Owner: user.

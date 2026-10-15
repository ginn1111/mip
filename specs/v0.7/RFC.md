# MIP RFC 0001 — Motion Intent Protocol

Status: Draft
Protocol identifier: `mip/0.7`
Linear issue: AGE-15

## 1. Purpose

MIP provides an auditable communication contract between humans and coding agents for animation. It turns natural-language creative intention or designer-supplied references into agreed semantics, reviewable motion prototypes, and verified implementation.

## 2. Terminology

- **Intent**: The human's desired experience and constraints.
- **Observation**: A directly perceivable fact extracted from source material.
- **Inference**: A hypothesized meaning or property derived from observations.
- **Glossary concept**: A versioned, scoped definition with interpretations.
- **Semantic contract**: Human-agreed interpretation of the intent and design vocabulary.
- **Prototype**: A non-production visual representation for testing creative alignment.
- **Scenario**: Defined initial state and ordered interactions governing a preview.
- **Artifact**: Versioned, typed specification or evidence record.
- **Lock**: Immutable binding of a canonical content digest, upstream dependencies, and approvals.
- **Gate**: Machine-verifiable eligibility check for progressing to a phase.

Normative words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY express respectively mandatory, prohibited, recommended, discouraged and optional behavior.

## 3. Workflow

Five phases: Intent Understanding -> Semantic Alignment -> Prototype Review -> Implementation -> Verification. Each phase MUST produce a versioned artifact. All downstream phases MUST verify the required upstream locked artifacts and their digest chain. Intent-first and reference-first ingestion converge on the same phase artifacts.

Required artifacts:
1. Intent Profile (locked before Semantic)
2. Semantic Contract (locked before Prototype)
3. Prototype Spec **and** Prototype Review (both locked before Implementation)
4. Implementation Contract (locked before Verification)
5. Verification Record (locked before completion)

Reference-first import additionally creates an Evidence Pack, which MUST preserve observation versus inference versus designer-declared information and link claims to source evidence. Imported specs remain drafts until approved.

## 4. Artifact lifecycle

`draft -> in_review -> approved -> locked -> superseded`; review can return to draft. A lock MUST never mutate the previously locked revision. A new upstream revision causes dependent locks to become stale. A gate MUST reject stale dependencies, missing approvals, mismatched digests and unresolved blocking ambiguity.

## 5. Glossary resolution

Definitions consist of stable IDs, domains, definitions, aliases, contextual interpretations, provenance, scope and revisions. Precedence: scene -> project-approved -> domain -> core -> proposed. An agent MUST distinguish established meanings from proposed interpretations. Material ambiguity MUST be explicitly resolved before semantic lock. Human preferences MUST NOT overwrite core terminology silently.

## 6. Deterministic prototype

A prototype contains actors, states, transitions, tracks, storyboard keyframes, and review scenarios. The evaluator `evaluate(spec, scenarioId, timeMs)` MUST return identical canonical scene snapshots for identical inputs. Event ordering, random seeds, overlapping tracks and transition interruption MUST be defined. Reviewer MUST support a scenario selector, storyboard view, transition view, animation view and timeline scrubbing. Human approval MUST bind to the exact prototype revision and evidence.

### 6.1 Review evidence and creative locks

A `prototype-spec` declares non-empty, unique `scenarios` and `reviewSegments`; every segment names at least one existing scenario and a valid time range, and every scenario is covered by at least one segment. A `prototype-review` records, for its exact `prototypeRef` (`{id,revision,digest}`), one accepted entry per scenario and one accepted entry per required segment of that scenario, plus the verified human `reviewer`.

A host MUST authenticate the human once per approval and MUST NOT accept caller-supplied roles. Approvals of `prototype-spec` and `prototype-review` MUST carry a host attestation over `{actor,decision,reviewedDigest,timestamp}`; consumers MUST verify it. Locking MUST be all-or-nothing: a failed approval leaves no new lock.

The implementation gate MUST block when any `prototype-spec` lacks exactly one matching locked `prototype-review`, when the review digest, project or coverage does not match, when the review is not `approved`, or when the reviewer differs from the attested approver.

## 7. Artifact envelope

Common fields: protocol, id, projectId, kind, revision, lifecycle, dependencies, payload, evidence, approvals and lock. Dependencies carry `{id,revision,digest}`. Approvals carry actor, role, decision, timestamp and reviewedDigest. Locks carry content digest and dependency digests. Canonical JSON serialization SHOULD use RFC 8785 (JCS) with immutable fields explicitly enumerated; final hashing test vectors are part of AGE-17.

## 8. Protocol messages

Types: INTENT, INTERPRETATION, CLARIFICATION, GLOSSARY_RESOLUTION, SPEC_PROPOSAL, PREVIEW_READY, REFINE, APPROVAL, LOCK_REQUEST, GATE_RESULT, VERIFICATION_RESULT. Common message fields: protocol, messageId, sessionId, correlationId (optional), actor, type, artifactRefs, payload and timestamp. Payloads MUST be validated by type.

## 9. Conformance profiles

**Core**: validates messages/artifacts, enforces digest-bound approvals, locks, revisions, dependencies and phase gates.

**Semantic**: Core + scoped glossary, ambiguity categorization, human semantic decisions.

**Prototype**: Core + deterministic snapshots, scrubbing and scenario review.

**Reference Import**: Core + evidence pack, provenance, uncertainty, source digest and draft generation.

**Engineering Adapter**: Core + implementation bindings and verification evidence.

No profile implies that an AI model can read minds or recover inaccessible original source code from a video.

## 10. Non-goals

Not an animation engine, not a replacement for GSAP/Three.js/Rive/Lottie, not a mandate to use multiple agents, not a generic task runner, and not automatic approval of inferred designs. Prototype source is not binding production implementation technology.

## 11. Privacy and security

Only capture references the user is authorized to access. Store rights metadata. Human approvals must be authenticated and bound to a digest. Agents MUST NOT approve their own creative output on a human's behalf. Evidence storage SHOULD avoid exposing credentials, private web pages or sensitive design assets.

## 12. Open decisions

- Canonical hash envelope exact inclusion/exclusion and vector fixtures (AGE-17)
- Final JSON schemas and message payload constraints (AGE-16)
- Approved identity/authentication provider
- Snapshot precision, event ordering and state-interruption rules
- Migration policy for future protocol versions
- Cross-runtime visual fidelity thresholds

## 13. Example

Human: "Click Scorpio; the globe should feel magnetic and elegant, rotate smoothly, then reveal its stars."

Glossary resolution: "magnetic" is ambiguous (focal pull vs simulated force); human approves focal attraction. Semantic contract is approved and locked. Prototype evaluator renders scenario `select-scorpio` at any requested time. Human inspects storyboard, transitions and animated preview; approves exact review digest. Implementation consumes locked artifacts. Verification checks sequence, framing and constraints.

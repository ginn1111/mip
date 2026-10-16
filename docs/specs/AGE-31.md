---
status: draft
scope: packages/runtime-three (new), packages/runtime-gsap (new), tests
owner: gintary
---

# Spec — AGE-31 Three.js and GSAP runtime integration

Source: Linear AGE-31; RFC 0005 (adapters three-r3f, gsap); RFC 0001: a Canvas mock may approve pacing; its source is not the required production architecture.

## Problem

Approved motion exists only as a spec and a Canvas preview. Nothing binds it to production renderers.

## Desired behavior

- **B1 Adapter contract.** Each adapter exports `bind(spec, scenarioId, target)` returning `{seek(timeMs), destroy()}`. `seek` sets every bound property to exactly `evaluate(spec, scenarioId, timeMs)`. No adapter re-implements easing.
- **B2 Dependencies.** `three` and `gsap` are optional `peerDependencies` plus devDependencies for tests; core packages import nothing from them. Assumption flagged for the human: the repo has no runtime dependency today.
- **B3 GSAP.** A paused timeline whose progress maps to absolute time and calls `seek`; it adds no easing.
- **B4 Three.js.** An explicit binding table maps actor properties to object fields (for example `globe.rotation` to `mesh.rotation.y`).
- **B5 Verification.** At every Scorpio review instant, bound values equal evaluator values within the tolerance (assumed 1e-6, pending owner decision, see Assumptions), recorded as a `verification-record` payload, not locked.

## Inputs / outputs

In: prototype-spec, scenario, target. Out: bound targets and a verification-record payload.

## Constraints

- Approvals: every approval, creative or not, happens in the web reviewer by a human (project owner decision 2026-10-15). Code never creates an approval or a lock.
- Duplicate JSON keys are never allowed; parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`).
- Protocol identifier is `mip/0.7`.
- No new runtime dependency unless this spec says so.

## Acceptance criteria
- [ ] Verification references a locked `prototype-spec`; an unlocked or superseded one is refused (the card consumes locked upstream specs) (B5).
- [ ] Adapters run in Node tests without a GPU (B1).
- [ ] At each Scorpio review instant, values match the evaluator within the assumed tolerance 1e-6, pending owner decision (B5).
- [ ] A mutation adding a GSAP ease fails a test (B3).
- [ ] Core packages gain no runtime dependency (B2).
- [ ] `npm test` passes.

## Edge cases
- Unknown binding: `bind` throws naming actor and property.
- Seeking backwards equals a fresh seek.

## Assumptions and open decisions (human decides)
- Numeric tolerance 1e-6 is an assumption pending owner decision (same status in AGE-29). Owner: user.
- Dependency policy (optional peerDependencies) needs a human decision before merge. Owner: user.
- React Three Fiber layer out of scope; plain Three.js only. Owner: user.

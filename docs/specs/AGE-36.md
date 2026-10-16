---
status: draft
scope: packages/capture-web (new), tests
owner: gintary
---

# Spec — AGE-36 Live website motion capture and inspection

Source: Linear AGE-36; RFC 0007 (repeatable scenarios; DOM/CSS/CDP where available; video fallback for canvas/WebGL; never assert inaccessible internals; authorized sources only).

## Problem

Motion on live websites cannot be captured as replayable evidence.

## Desired behavior

- **B1 Sources.** Only `localhost`/`127.0.0.1` or URLs in an explicit allowlist file from the human. Others refused before any request. Assumption flagged until a rights policy exists.
- **B2 Scenario.** JSON steps (`navigate`, `click`, `hover`, `wait`) and a viewport; replays deterministically.
- **B3 Capture.** Headless Chrome over CDP (pattern of `tests/browser-harness.mjs`): screenshots at an interval, `Animation` domain for CSS animations and transitions, computed styles of selected elements. Canvas/WebGL falls back to screenshots (Linear AGE-36 and RFC 0007 say video fallback; see Assumptions).
- **B4 Claims.** CDP easing is labelled as the element's declared CSS timing function, never as original source. Unreadable values go to the uncertainty report.
- **B5 Output.** Pack valid under AGE-34, source kind `website`.

## Inputs / outputs

In: scenario, allowlist. Out: evidence pack, uncertainty report.

## Constraints

- Approvals: every approval, creative or not, happens in the web reviewer by a human (project owner decision 2026-10-15). Code never creates an approval or a lock.
- Duplicate JSON keys are never allowed; parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`).
- Protocol identifier is `mip/0.7`.
- No new runtime dependency unless this spec says so.

## Acceptance criteria
- [ ] A local page with a CSS transition yields its duration and timing function (B3, B4).
- [ ] A non-allowlisted URL is refused before any request (B1).
- [ ] Two runs give the same observations (B2).
- [ ] A canvas-only page gives screenshot evidence and an uncertainty entry (B3).
- [ ] `npm test` passes.

## Edge cases
- Chrome missing: skip with a clear message, like the browser tests.

## Assumptions and open decisions (human decides)
- Canvas/WebGL fallback: Linear says video, this spec says screenshots (no new dependency; AGE-35 can extract from a video recorded separately). Screenshots assumed until the owner decides. Owner: user.
- Rights policy for real external sites. Until decided: localhost and allowlist only. Owner: user.

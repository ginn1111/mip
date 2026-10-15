---
name: mip-prototype
description: Use when producing or checking a MIP (mip/0.7) prototype-spec, a low-fidelity motion representation, and handing it to a human for visual review. Covers spec fields, validatePrototype, evaluate, and the mip preview handoff. Never approves or locks.
---

# mip-prototype

Phase after semantic. Output: a `prototype-spec` artifact (protocol `mip/0.7`) that a human reviews in the web reviewer.

## Before you start

Run `mip validate --phase prototype`. Stop on `BLOCKED`; follow the recovery map in mip-director.

## Payload fields (all required)

- `durationMs`: positive integer.
- `fps`: positive integer.
- `actors`: `[{id, initialProperties?}]`; unique ids.
- `states`: `[{id}]`.
- `transitions`: `[{id, from, to, trigger, durationMs, startMs?}]`; `startMs` is needed for the transition to show in review frames.
- `tracks`: `[{actorId, property, keyframes[{timeMs, value, easing?}]}]`. One track per actor+property. Keyframe times strictly increase and stay within `durationMs`. `value` is a number or number array. Easing: `linear`, `ease-in`, `ease-out`, `ease-in-out`.
- `storyboard`: `[{timeMs, caption}]`.
- `scenarios`: `[{id, initialState, events[{timeMs, type, toState?}]}]`; at least one; events ordered by time.
- `reviewSegments`: `[{id, startMs, endMs, scenarioIds}]`; integer times, `startMs < endMs <= durationMs`; every scenario is in at least one segment.

Worked example: `skills/mip-prototype/example.prototype.json`.

## Check it

1. `validatePrototype(spec)` from `packages/prototype/index.mjs` throws on a bad spec.
2. `planValid(spec)` from `packages/prototype/review-rules.mjs` must be `true`.
3. `evaluate(spec, scenarioId, timeMs)` returns the deterministic snapshot `{actors, state, events}`. Same spec, scenario and time always give the same snapshot. Evaluate every storyboard instant for every scenario and read the values before handoff.
4. Parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`). Duplicate keys are never allowed.

## Hand off

Run `mip preview --scene scorpio`. The human reviews every scenario and segment in the web reviewer and approves there.

## Rules

- The agent never approves and never locks. Every approval is a human act in the web reviewer; `mip lock` refuses.
- Never claim the prototype is approved, accepted or locked. Report only: validated, ready for human review.
- If intent or motion is unclear, ask the human; do not guess.

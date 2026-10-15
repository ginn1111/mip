---
name: mip-verify
description: Use when checking an implementation against the locked MIP (mip/0.7) prototype and preparing a verification-record payload for human review. Compares evaluated properties at review instants. Never approves or locks.
---

# mip-verify

Phase after implementation. Output: a `verification-record` payload for a human to review.

## Before you start

Run `mip validate --phase verification`. Stop on `BLOCKED`; follow the recovery map in mip-director.

## Compare

1. Take the locked `prototype-spec` payload.
2. For each scenario, get instants with `reviewInstants(spec, scenarioId, scenarioReviews)` and frames with `reviewManifest(spec, scenarioId, instants)` from `packages/prototype/review-manifest.mjs`. This is the frame manifest the human reviewed.
3. Read the implementation's value of each actor property at each instant. Compare to the manifest frame (`animation.<actor>.<property>`) within tolerance 1e-6. One check per scenario and instant, or grouped, with a descriptive `name`.
4. Parse stored or received JSON with `parseStrictJson` (`packages/artifacts/index.mjs`). Duplicate keys are never allowed.

Assumption, open decision (owner: user): tolerance is 1e-6 on evaluated properties at review instants. Flag it; do not change it.

## Output

```json
{
  "implementationRef": {"id": "<artifact id>", "revision": 1, "digest": "sha256:<64 hex>"},
  "checks": [{"name": "autoplay@1000 globe.rotation", "passed": true}],
  "result": "pass"
}
```

`result` is `pass` only when every check passed, else `fail`. No extra keys.

## Rules

- The agent never approves and never locks. Every approval is a human act in the web reviewer; `mip lock` refuses.
- Present the record as a proposal for human review. Never claim it is approved, accepted or locked.
- If the implementation runtime is missing, say so and stop; do not invent check results.

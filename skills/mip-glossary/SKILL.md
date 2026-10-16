---
name: mip-glossary
description: Use when a motion description contains terms such as "magnetic", "snappy" or "bouncy" that must be resolved against the MIP glossary. Explains mip glossary resolve, its statuses resolved, ambiguous and unknown, and how to ask the human instead of guessing.
---

# mip-glossary

Terminology resolution for MIP (`mip/0.7`). Used by mip-director when a gate reports `UNRESOLVED_AMBIGUITY`.

## Resolve

    mip glossary resolve --scene <id> --text <text>

Each term prints with a status:

- `resolved`: exactly one interpretation. Use it.
- `ambiguous`: several interpretations. Ask the human which one they mean. Never guess.
- `unknown`: no glossary entry. Ask the human what they mean. Never guess.

`mip intent create --scene <id> --text <text>` records every non-`resolved` term as a blocking ambiguity in the semantic contract. The semantic gate stays `BLOCKED` until the human resolves them.

## Gate check

Before you use an upstream artifact, run `mip validate --phase <phase>` and stop on `BLOCKED`. Phase order and violation recovery: mip-director.

## Approval

Glossary entries follow `glossary/GOVERNANCE.md`. An entry becomes `approved` only from a direct human requirement or an official published source recorded in `provenance.reference`. `proposed` entries resolve but are not approved truth.

## No self-approval

You never approve and never lock. You never approve your own proposed entry or meaning. Approval is a human act in the web reviewer (`mip preview`).

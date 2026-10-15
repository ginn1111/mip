---
status: draft
scope: skills/mip-director, skills/mip-glossary, tests
owner: ginb
---

# Walkthrough — AGE-28 agent following mip-director and mip-glossary

Real output of `mip` (repo at commit of this branch) in a fresh directory, scene `demo`. Steps follow `skills/mip-director/SKILL.md`: intent, semantic, gate check, stop on `BLOCKED`.

1. mip-glossary: resolve terms. `magnetic` is `ambiguous`, so the agent must ask the human.
2. mip-director: create intent and semantic contract.
3. mip-director gate check: `mip validate --phase semantic` is `BLOCKED`. Agent stops. `UNRESOLVED_AMBIGUITY` maps to mip-glossary: ask the human which meaning of `magnetic`. The `NOT_LOCKED`, `MISSING_HUMAN_APPROVAL` codes map to the web reviewer; `DIGEST_MISMATCH` is reported because nothing is locked yet.
4. `mip lock` refuses: approval is a human act.

```
$ mip init
initialized <tmp dir>
[exit 0]

$ mip glossary resolve --scene demo --text 'make the card feel magnetic and snappy'
snappy            resolved  Quick deliberate motion with low perceived latency
magnetic          ambiguous Attraction of attention or subjects toward a focal point
[exit 0]

$ mip intent create --scene demo --text 'make the card feel magnetic and snappy'
created demo-intent@1 and demo-semantic@1
blocking ambiguities: magnetic
[exit 0]

$ mip status
demo-intent@1               intent-profile            draft     lock=none
demo-semantic@1             semantic-contract         draft     lock=none
[exit 0]

$ mip validate --phase semantic
BLOCKED semantic
  NOT_LOCKED demo-intent@1
  DIGEST_MISMATCH demo-intent@1
  MISSING_HUMAN_APPROVAL demo-intent@1
  NOT_LOCKED demo-semantic@1
  DIGEST_MISMATCH demo-semantic@1
  MISSING_HUMAN_APPROVAL demo-semantic@1
  UNRESOLVED_AMBIGUITY demo-semantic@1
[exit 2]

$ mip lock --phase semantic
mip: approval is a human act in the web reviewer: run `mip preview`
[exit 3]

```

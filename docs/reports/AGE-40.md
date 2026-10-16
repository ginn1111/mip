---
status: draft
scope: eval/import, docs/reports
owner: ginb
---

# Report — AGE-40 import pipeline evaluation

Manual briefing versus reference-first import. Only measured values appear; everything else is marked not measured or MISSING.

## Arm: manual

| Reference | Kind | Pipeline | Concept coverage | Timing fidelity | Missed transitions | Ambiguities raised | Human time |
| --- | --- | --- | --- | --- | --- | --- | --- |


## Arm: import

| Reference | Kind | Pipeline | Concept coverage | Timing fidelity | Missed transitions | Ambiguities raised | Human time |
| --- | --- | --- | --- | --- | --- | --- | --- |


## Comparison

No comparison: manual arm missing, import arm missing.

## Missing inputs

- all references: none supplied (video, local site, storyboard); no human sessions

Human participants and their sessions must come from the human (open decision, owner: user). No effort comparison versus manual briefing is claimed without them.

## RFC 0006 caveats

- Small sample: few references and participants; no statistical power is claimed.
- Participants must be comparable across arms (skill, familiarity); assignment is an open decision.
- Same model, environment and task framing for both arms; order effects (learning from the first arm) are not controlled here.
- Ground truth is human-authored; metrics measure fidelity to it, not design quality.
- Human time is timed by the human; code never starts, stops or approves a session.
- AGE-39 alignment decisions are human review acts in the web reviewer and have no machine output to read here, so no alignment-based metric is reported.
- A hypothesis is not a result: unmeasured targets stay hypotheses.

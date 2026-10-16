# Glossary governance

Applies to `glossary/core/seed.json` and project glossaries. Entry shape: `schemas/v0.7/glossary.schema.json`. Resolution precedence: RFC 0002 (scene, project, domain, core).

## Status lifecycle

| Status | Meaning |
|---|---|
| `proposed` | Curated, not reviewed. Resolvable, but never treated as an approved truth. All 30 core seed entries are `proposed`. |
| `approved` | A human accepted the entry, from a direct human requirement or from an official source an agent recorded and a human confirmed (see Approval). |
| `deprecated` | Kept for history. Still resolvable, flagged, and not for new work. |

Examples and edits never change status by themselves. Only a human moves an entry to `approved`, either on a direct human requirement or by confirming an official source an agent recorded (see Approval).

## Changes

- A change to `term`, `definition`, `aliases`, `interpretations` or `examples` bumps `revision` by one. Exception: first-time examples in the initial seed do not bump `revision`; the 30 core entries stay at `revision: 1`. Any later example change bumps it.
- An `id` never changes. A renamed concept is a new entry, and the old one becomes `deprecated`.
- Future work: semantic contracts binding to an exact entry `id` and `revision`. Not implemented; the payload schema only carries `glossaryId`.

## Precedence and scope

- A project or scene entry may specialize a core entry for its own context. It must not overwrite or silently replace the core entry.
- Personal and project preferences live in project glossaries, separate from general vocabulary.

## Examples

- Each core entry carries at least one example (project entries keep examples optional): a phrase a person might say, the intent it expresses, and how it shows up in motion.
- The phrase must contain the entry's term or one of its aliases, so the resolver can find it.
- An example must agree with the entry's `definition` and `motionHints`. Do not add examples that need outside authority.

## Approval

An entry moves to `approved` only when its meaning comes from one of two sources:

1. **Direct human requirement.** A human states the meaning or approves the entry explicitly.
2. **Official source.** An agent finds the meaning in an authoritative published reference (for example an established animation or cinematography text, a standards body, or a vendor's official documentation). The agent records the reference in `provenance.reference` with `provenance.source: standard`.

On the official-source path the agent only proposes: it records the reference, and a human confirms and changes the status. The agent never invents a meaning and never approves its own proposal. When neither source exists, the entry stays `proposed`. The agent warns the human and leaves the decision to them.

Examples follow the same rule: an agent-drafted example stays unreviewed until a human accepts it or it is traced to an official source.

# Glossary governance

Applies to `glossary/core/seed.json` and project glossaries. Entry shape: `schemas/v0.7/glossary.schema.json`. Resolution precedence: RFC 0002 (scene, project, domain, core).

## Status lifecycle

| Status | Meaning |
|---|---|
| `proposed` | Curated, not reviewed. Resolvable, but never treated as an approved truth. All 30 core seed entries are `proposed`. |
| `approved` | A human with approval authority accepted the entry. |
| `deprecated` | Kept for history. Still resolvable, flagged, and not for new work. |

Examples and edits never change status by themselves. Only an explicit human decision moves an entry to `approved`.

## Changes

- A change to `term`, `definition`, `aliases`, `interpretations` or `examples` bumps `revision` by one.
- An `id` never changes. A renamed concept is a new entry, and the old one becomes `deprecated`.
- Semantic contracts bind to an exact entry `id` and `revision`.

## Precedence and scope

- A project or scene entry may specialize a core entry for its own context. It must not overwrite or silently replace the core entry.
- Personal and project preferences live in project glossaries, separate from general vocabulary.

## Examples

- Each entry carries at least one example: a phrase a person might say, the intent it expresses, and how it shows up in motion.
- The phrase must contain the entry's term or one of its aliases, so the resolver can find it.
- An example must agree with the entry's `definition` and `motionHints`. Do not add examples that need outside authority.

## Approval

- Who may approve entries: TBD: approver (owner: project owner to decide).
- Whether examples need human review before the seed is marked `approved`: TBD (owner: project owner).

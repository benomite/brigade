# The ticket card — spec and plan (#68)

**Date**: 2026-10-08
**Status**: decided — the location and the format are the Manager's technical qualification, in
the issue; the reading choices below ("What the dev settled") can be contested in review
**Issue**: #68 "What a ticket must carry: dependencies and file zone"
**Resolves**: open question no. 2 of `2026-10-08-brigade-v2-design.md`
**Builds on**: `2026-10-08-runtime-rail.md` (polling, rail facts),
`2026-10-08-station-claude.md` (the `no-calibration` refusal, a precedent imitated). This document
redecides nothing of what appears in them.

---

## The decision

Dependencies and zone live in **a dedicated comment of the issue**, the card, marked by the
marker `<!-- brigade:fiche -->` and made of `key: value` lines:

```
<!-- brigade:fiche -->
**Ticket card** — read by the runtime, fixable by hand.
- awaiting: #68, #69
- zone: runtime/src/rail.ts, runtime/test/rail.test.ts
```

The rationale, the usage and the table of unreadable cases are in `docs/runtime.md`, "La fiche d'un
ticket": it is the living doc, this document does not copy it.

| Issue criterion | What carries it |
|---|---|
| Visible on GitHub, not only in the database | A comment of the issue; the database keeps only a derived copy (`card`) |
| Readable and fixable by hand, without breaking the format | `key: value` lines; the reading tolerates case, bold, bullets, spaces, surrounding prose |
| Survives a reformatting of the body | The card is not in the body |
| The runtime says when it does not understand | Everything not understood becomes a `problem` of the card; the station refuses the ticket (86 `unreadable-card`) and comments what to fix; `run rail` displays it |
| The choice written with its rationale, and what it leaves to milestone 4 | `docs/runtime.md`, "Pourquoi un commentaire" and "Ce que la fiche laisse au jalon 4" |
| Open question no. 2 marked resolved | `2026-10-08-brigade-v2-design.md`, § Open questions |

## Measured against GitHub, on 2026-10-08

The announced trap — would a hand-fixed card be read again? — was measured on issue #68
with a temporary comment, not assumed:

| Gesture | Issue `updated_at` | ETag of the issue list |
|---|---|---|
| Post a comment | moves | changes |
| **Edit** that comment | **moves** | **changes** |
| Delete it | moves | changes |

The existing conditional polling is therefore enough: no second poll, no `since`. The granularity
of `updated_at` is the second: two modifications in the same second, separated by a poll,
would not be told apart — the second would be read at the next modification.

## What the dev settled

Reading details that the qualification left open. Each has a test.

1. **No card ≠ unreadable card.** An issue with no marked comment is a ticket with no
   dependency or zone (`card: null`): the card is optional, otherwise every ticket of milestone 1
   would become 86.
2. **The refusal happens at the take, by the station**, in the image of `no-calibration`: a ticket
   already taken or in pass whose card becomes unreadable is not interrupted. The rail carries the
   problems from the poll on (`run rail` shows them right away).
3. **A card posted by someone without write access to the repository is ignored**
   (`author_association` other than `OWNER`, `MEMBER`, `COLLABORATOR`), and said on journald.
   Refusing it would have let any passer-by put a ticket of a public repository at 86; reading
   it, dictate a zone.
4. **"Edited by a third party": read as it is.** The REST API does not say who edited, and GitHub
   allows it only to the author and to those with write access to the repository.
5. **An unknown key is a problem**, not an ignored line — including the future `requiert`,
   `domaine`, `budget` as long as the runtime does not read them.
6. **`#N` awaited**: must exist on the repository (issue or PR, open or closed) and not be the
   ticket itself. Cycles are #70's business.
7. **`zone`**: strings, carried as they are. Only what leaves the repository is refused
   (absolute, `~`, `..`, `\`). Folder, file or pattern: #73 will say how to interpret them.
8. **The comments read are cached in memory**, by `updated_at` — cache, not state, like the
   poll's ETag: a restart costs one read per ticket of the rail.
9. **A card that depends on something other than its issue is not cached** (PR review):
   a nonexistent `#N`, an author without write access. Neither the creation of #N nor the invitation
   of the author makes the issue move: as long as this lasts, the poll is not confirmed — it stays
   unconditional — and the card is re-read at every tick.
10. **The uniqueness key of a `ticket.changed` carries the fingerprint of its content** (PR
    review): what the rail reads of an issue can change without its `updated_at` moving — case 9,
    or a card that a previous runtime did not read. Without it, the fact would be refused as a
    duplicate, and the poll never confirmed.

## Plan

| Module | What changes |
|---|---|
| `src/fiche.ts` (new) | Pure reading, no I/O: `fiche(commentaires)`, `porteFiche`, `illisible` |
| `src/github.ts` | `commentaires(numero)`, paginated |
| `src/alimenter.ts` | Reads the card of modified issues, checks the `#N`, carries it in `ticket.arrived` / `ticket.changed` |
| `src/evenements/rail.ts`, `src/projections/rail.ts` | `card?: Fiche \| null`, optional on replay; `card` column (JSON) |
| `src/station.ts` | `unreadable-card` refusal, comment, `card-readable` return |
| `src/montrer-rail.ts` | The card and its problems, indented under the ticket |

## Out of scope

- Having `awaiting` (#70) or `zone` (#73) **enforced**.
- Having a card **written** by the runtime or the manager (#69, #71).
- `status`: it already shows the reason for the 86; the detailed card stays in `run rail`.

# The manager splits an epic into executable tickets — spec and plan (#71)

**Date**: 2026-10-08
**Status**: decided — the five product decisions below, put in `question-spec #71`, were
confirmed as they stood by the Manager on 2026-10-08, with one addition to the second: a closed
epic is never split. The choices in "What the dev decided" remain contestable in
review; the bound of twelve tickets and the reconciliation by marker are accepted.
**Issue**: #71 "The manager splits an epic into executable tickets" (epic #75, milestone 2)
**Builds on**: `2026-10-08-brigade-v2-design.md` (§The manager, principles 2 and 6),
`2026-10-08-manager-qualifie-et-calibre.md` (the judgment, the fingerprint, "once per state", the
chef's action stronger than the manager's), `2026-10-08-fiche-du-ticket.md` (the card, which is
authoritative on an issue), `2026-10-08-pass-et-grant-merge.md` (intent before effect, the
reconciliation — precedent imitated).

---

## The product decisions

| # | Question | Decision | What the other choice would cost |
|---|---|---|---|
| 1 | What triggers a split? | Any open issue, by a trusted author, that carries `epic` **or** that #69's judgment calls `epic` — the milestone's exit criterion says "sets no label". `blocked-on-human` always holds it back. The `epic` label therefore no longer means "set aside without an LLM" (decision 2 of #69) but "to be split". | Split on request only: one line in `trier` (`manager.ts`). |
| 2 | Epics already split by hand (#75)? | Two tiers. In code: an issue whose body carries the `<!-- brigade:tickets -->` block without the log having split it is set aside (`already-split`), without an LLM. That is the guarantee, and the action to take before turning on. Also in code: a closed epic is never split, the state being reread just before creating. At the LLM, as a safety net: a third answer, "already split". | The second tier is fallible — an LLM is reading. An opt-in per epic would be safe, and contradicts "no label". |
| 3 | Are tickets born fired? | Yes: `model:`/`effort:` at creation, the card afterwards, `fire` last. They do not go back through #69's judgment. | Born without `fire`: remove the call to `labelliser` in `creer` (`decoupage.ts`) — the milestone then no longer "crosses" the kitchen on its own. |
| 4 | The question to the chef? | A comment on the epic, no label; reread when it changes, like a refusal from #69. Readable in `run manager`. The epic is not on the rail: `run rail` says nothing about it. | Also set `blocked-on-human`: the chef would have to remove it when answering. |
| 5 | The list in the epic? | A block at the end of the body, between two markers, the only place the runtime rewrites. A chef's ticket enters it through the `Épique : #N` line of its body. The manager does not close the epic. | — |

## What the dev decided

- **The split is a second judgment**, through the same path as the first: the guardrails'
  `lancer`, without a tool, outside a worktree, in the log like a cook, neutral for the breaker if
  it is readable and failed otherwise. `manager.ts` now carries a generic `demander`, which the
  judgment and the split share.
- **An epic without a label costs two calls**: #69's judgment recognizes it, the split splits it.
  Its refusal is then not commented — the split speaks.
- **The LLM receives the repository's plan** — its folders on two levels, read in the station's
  clone (`Depot.fichiers`). Without it, it would assign zones blindly: it has no tool.
- **Dependencies are ranks**, not numbers: a ticket only awaits tickets placed before it in the
  list. The order is therefore the list's, and a cycle is impossible by construction. Issue numbers
  only exist at creation, and the card carries them.
- **All or nothing at reading.** A single unreadable ticket (no criterion, no zone, a zone that the
  card would refuse, calibration outside the table) and the whole split is refused. The zone is
  checked by rereading, through `fiche()`, the card that would come out of it: the manager never
  posts a card that the rail would not know how to read.
- **Twelve tickets at most.** Beyond that, the answer is unreadable — the instruction then asks the
  LLM to turn it into a question.
- **Never two splits.** `manager.split` carries the whole plan and is written before the first call
  to GitHub; the projection refuses to replace it. Each creation is announced
  (`manager.split-creating`) then recorded (`manager.split-created`). An announcement without a
  record is reconciled: the ticket is looked for among the issues modified since the split, by the
  `<!-- brigade:decoupage #N.k -->` marker in its body.
- **Trust also applies at resumption.** The marker is only recognized on an issue by a trusted
  author, and only a trusted card exempts from setting the manager's own: on a public repository,
  anyone can write either.
- **Markers only count alone on their line, outside a code block** — the card's rule. The start
  marker alone is enough to say "already split".
- **The manager's question is reread by the next split**, without entering the fingerprint:
  it does not wake it up, but the chef's answer is read with it (`<!-- brigade:question -->`).
- **The card then `fire`** are not announced: setting `fire` is idempotent, and the card is
  looked for in the comments of a resumed ticket before being set again.
- **An epic's fingerprint ignores the block** the runtime writes in it: it does not wake itself up.
  And a split epic leaves the sort before anything else: #69's judgment never sees it again,
  whatever becomes of its body.
- **The list is computed on the log alone**, before the poll: a ticket's state changes without
  any issue moving. It carries no date, its fingerprint is in the log
  (`manager.split-listed`), and GitHub is only called if it has changed.
- **A chef's ticket is adopted, not otherwise judged**: `Épique : #N` makes it enter the list
  (`manager.split-adopted`), and it follows #69's ordinary path. Only trusted authors can attach
  one.
- **Held back along the way**: `blocked-on-human` set on an epic whose tickets are being created
  suspends the creations.

## Out of scope, left as it is

Checking that two zones do not overlap (#73) · reacting to the failure of a ticket born of a split
(#74) · closing the epic when everything is served · an epic's budget (milestone 3).

## Plan

1. `evenements/manager.ts`, `projections/decoupages.ts`: the split's facts, the state of each
   epic and of its tickets.
2. `github.ts`: `creerIssue`, `ecrireCorps`, `issuesDepuis`; `depot.ts`: `fichiers`.
3. `epique.ts`: the delimited block, the `Épique : #N` line.
4. `decouper.ts`: the instruction, the reading of the answer, a ticket's body and card.
5. `decoupage.ts`: judge, create, resume, say, adopt, keep the list.
6. `manager.ts`: the sort (`decouper`, `fini`), shared `demander`; `manager-cli.ts`: the epics.
7. `docs/runtime.md`.

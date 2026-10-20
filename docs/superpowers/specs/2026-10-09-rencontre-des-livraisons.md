# Two deliveries green separately do not break the integration together — spec and plan (#99)

**Date**: 2026-10-09
**Status**: decided — the product decisions below are the orchestrator's (answer of 2026-10-09 to
`question-spec #99`); "What the dev decided" is contestable in review
**Issue**: #99 — epic #101, milestone 4
**Builds on**: `2026-10-08-brigade-v2-design.md` (§ The pass), `2026-10-08-pass-et-grant-merge.md`,
`2026-10-08-zones-de-fichiers.md`, `2026-10-09-plusieurs-cooks.md` (the machine guard). This
document redecides nothing of what appears there.

The behavior, as the chef lives it, is in `docs/runtime.md`, "Quand la base a avancé sous une
livraison" and "Ce que la pass ne garantit pas": that is the living doc, this document does not
copy it.

---

## The gap

The pass handles deliveries one by one: the merges are already serial. The gap is between "judged
green" and "merged": the base may have moved since the branch left, and GitHub conditions the
merge only on the head of the PR.

## Product decisions

1. **The mechanism is a combination**, not "branch up to date required" (a rebase cook for each
   neighbor's merge: quota, in N²):
   - base unchanged: merge;
   - base moved, disjoint files: merge without replay, said in the log and on the issue, then
     gates on the base itself, outside any ticket;
   - base moved, files in common, no conflict: gates replayed on the result of the merge, in a
     throwaway worktree — no branch touched, no model called.
   **No batch to wait for.**
2. **Base red after a merge**: alert (log, journald, comment on the tickets whose merge was to be
   verified), and **merges under grant suspended** — the green deliveries wait, visibly, and leave
   again on their own when it goes green. **The chef repairs.** Also stopping the taking of
   tickets is out of scope: #143 (delivered since, see `2026-10-09-base-rouge-station-retenue.md`).
3. **Gates red on the result of the merge**: a finding sent back to the cook, a rebase
   instruction, and it **consumes a referral** — like a conflict.
4. **An overlap limited to common paths does not trigger a replay.**
5. **No further branch protection is assumed.** If "branch up to date required" is enabled,
   GitHub's refusal goes back to the cook for a rebase.
6. **A gates replay goes through #98's machine guard.**
7. **The throwaway worktree is removed in every case** — green, red, runtime killed then
   restarted.

## Criteria, and what carries them

| Criterion | What carries it |
|---|---|
| Two green deliveries do not break the base without anyone knowing | `rencontrer`, called by `decider` before writing `grant.used`; `controlerBase`, at the end of each pass |
| Disjoint zones do not pay for a useless check | delivered files (`depot.changes`) ∩ files received by the base (`depot.arrives`), common ones set aside by `possede`: empty, no replay. The merges without replay of a single pass share **one** base check |
| The chef sees what happened when the base moved | `pass.base-moved` (`replay`), `pass.replayed`, the note of the merge comment, `pass -- <ticket>` |
| Broken all the same: detected after the merge, and surfaced | `base_suspects` (projection) → `controlerBase` → `base.checked`; journald, comment per ticket, head of `npm run pass` |
| Nothing is serialized beyond a replay | no batch; a replay is bounded by `delaiGatesMs` and can be read (phase `replaying`) |
| "What the pass does not guarantee" is up to date | `docs/runtime.md` |
| Runtime killed between two merges: nothing twice | the intent to merge stays `grant.used` → existing reconciliation; a reconciled merge without replay stays to be verified (`unverified` lives in the projection); `depot.jeter()` at startup |

## What the dev decided

- **Real files, not declared zones.** The criterion says "the disjoint zones of #73"; what is
  compared is the delivery's diff against what the base received — a delivery may overflow its
  zone, and a ticket without a card has none. #73's common paths, for their part, are taken as
  they are (`possede`).
- **Every merge outside the runtime is to be verified**, not only the pass's: a PR merged by hand
  lands on a base nobody looked at. Cost: one suite on the base per manual merge. It is the
  `merge.done` fact that carries it (`unverified`), not the projection deducing it: a log from
  before this ticket, replayed at startup, makes none of its old merges suspect.
- **A replay that cannot be done is surfaced to the chef** (`replay-failed`): only a merge that
  leaves unmerged paths is a conflict. The trial commit is made without signature or hook.
- **A delivery turned red by its meeting is an attempt** for the manager (`pass.replayed` not
  green, `pass.outdated`), just like a red `pass.judged`.
- **A manual merge is also noted on a queued delivery** — at the tick, and at GitHub's refusal if
  the pass tries to merge an already merged PR.
- **A second look's comparison point is the last green replay**, not the branch's start: what the
  base received before has already been replayed with the delivery.
- **The base check does not hold merges back** until it has concluded: only a **red** base
  suspends. Between the merge and its verdict, the base may be red without being known — the doc
  says so.
- **A red base is replayed only if it moves** (read at the tick). No command to force a replay: a
  manual merge triggers one.
- **"Branch behind" is read on the PR's card** (`mergeable_state: "behind"`), reread after the
  refusal — not in the refusal's sentence, which nothing guarantees.
- **The machine guard covers only the replays** (meeting, base), not the judgment's gates, which
  never had it.
- **A throwaway worktree that vanished under the gates** (removed by hand) gives red gates, hence
  a referral: no special case.

## Plan

1. `depot.ts`: `rapatrier`, `retard`, `arrives`, `essayer`, `jeter` — tested on a real repository.
2. `evenements/pass.ts` and `projections/pass.ts`: `pass.base-moved`, `pass.replayed`,
   `pass.outdated`, `pass.waiting`, `base.checked`; phases `replaying` and `waiting`; tables
   `base_checks` and `base_suspects`.
3. `github.ts`: `PR.enRetard`.
4. `pass.ts`: `rencontrer`, `controlerBase`, the "branch behind" refusal, the machine guard.
5. `montrer-pass.ts`: the history and the state of the base.
6. `docs/runtime.md`.

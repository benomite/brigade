# A grant carries an expiry, and lapses on its own — spec (#256)

**Date**: 2026-10-10
**Status**: decided by the Manager, **to be validated by the PO after the fact** — the six product
decisions below are the dev's recommendations (`question-spec #256` of 2026-10-10), adopted as
they stood by the orchestrator the same day, without the PO; "What the dev settled" can be
challenged in review
**Issue**: #256 "A grant carries an expiry, and lapses on its own" (milestone 3, epic #254)
**Builds on**: `2026-10-08-pass-et-grant-merge.md` (the grant as facts in the log, the `grant.used`
intent written before the merge, reconciliation on wake-up).

The behavior, as the chef experiences it, is in `docs/runtime.md`, "The `merge` grant" and the
`grant` block of `status`: that is the living doc, this document does not copy it.

---

## What was true before coding

Established by reading `runtime/src/grant-cli.ts`, `pass.ts` (`decider`) and
`projections/pass.ts`:

- The grant is a row of the `grants` table (`action`, `active`, `since`, `by`), projected from two
  facts: `grant.activated` and `grant.revoked`. Nothing in it carries an end.
- The pass reads `grantActif` **inside the transaction** that writes the intent to merge
  (`grant.used`), and a second time when it comes back from the meeting with the base (`decider`
  calls itself again): "at the next decision" is therefore already the only place where the grant
  counts.
- `grant.used` is the **intent**, not the use: the result is written afterwards (`merge.done`,
  `merge.failed`) and is filed on the `grant_uses` row left without an `outcome`.
- The pass receives its clock (`options.maintenant`), the log has its own: no test needs to wait.
- `grant` and `status` open the log **read-only**: they cannot write anything to it, and must not
  be able to.
- `status` says nothing about the grant today.

## Decisions made without the PO

The six are to be reviewed as a whole by the PO: none was written in the issue.

1. **The shape of the expiry.** Three options, on `enable` as on `extend`:
   `--until <date or time>` (`2026-10-12T18:00`, `2026-10-12` = the end of that day, `18h30` =
   today, local time of the machine), `--for <duration>` (`4h`, `2d`, `30min` — translated into a
   date at write time), `--uses <n>`. A time already past today is **refused**, not pushed to the
   next day. With no option: no expiry, as today.
2. **Date and uses together**: allowed. Whichever is reached first lapses the grant, and the
   lapse fact says which.
3. **`extend`** only applies to an active grant. `--until` / `--for` set a new expiry (`--for 2h`:
   two hours from now); `--uses N` adds N to the remaining uses; `--no-expiry` lifts it. A date
   closer than the current one is refused: shortening is revoking. `enable` on an already active
   grant writes nothing and points to `extend`.
4. **The count.** A merge intent without a result **reserves** a use; refused by GitHub, it gives
   it back; merged, it consumes it. A merge done by hand by the chef consumes nothing; a pass
   merge reconciled after a stop consumes. **Clarified in review of PR #274**: what consumes is a
   pass intent concluded by a merge, whichever account GitHub names — a PR found merged while an
   intent was in flight consumes, even if the merge reads `outside`. "By hand" therefore means:
   without a pass intent.
5. **After the lapse.** `status` keeps a line as long as the grant's state is "lapsed", and stays
   silent for an absent or revoked grant. A green delivery arriving afterwards keeps the
   `no-grant` reason in the log; its issue comment and its queue line say the grant lapsed, and
   when.
6. **"Expiring soon".** Less than an hour from the expiry, or when only one use is left.

| Issue criterion | What carries it |
|---|---|
| Grant with an expiry; no expiry stays possible | `enable merge [--until … \| --for …] [--uses n]`; `grant.activated` carries `until` and `uses` |
| Lapses on its own, at the next decision | The effective state is computed at read time; the pass reads it in its decision transaction |
| Lapse written, distinct from a revocation | `grant.expired`, with its cause; `LAPSED` versus `REVOKED` |
| `grant` shows what is left | `direGrant`, on the effective state: the time, the uses, or "no expiry" |
| Count on use | Remaining uses are counted on the pass's `merge.done`, not on `grant.used` |
| Extend without revoking, the history says so | `grant.extended`; "latest actions" of `grant` |
| `status` says it without being asked | The `grant` block of the header; `EXPIRING SOON` within an hour or at the last use |
| Expired with the runtime stopped: expired at restart | The effective state does not depend on a written fact; the pass writes `grant.expired` before any decision |

## What the dev settled

- **Three facts, no state on the side.**
  - `grant.activated`: `{ action, until?, uses? }` — a fact from before this ticket, without these
    fields, reads as "no expiry". A limit that is written but unreadable does not make a grant
    without end: it is already reached.
  - `grant.extended`: `{ action, until?: string | null, uses?: number | null }` — `uses` is what
    is **added**; null, the limit is lifted; absent, it does not change. No effect on a grant that
    is not active.
  - `grant.expired`: `{ action, cause: "until" | "uses", since }` — `since` is the real expiry,
    not the time someone noticed it; for a grant with uses, the instant of the last merge.
- **The lapse is a computed state before it is a written fact.** `etatDuGrant(base, action,
  maintenant)` returns the **effective** state, and takes the time as a mandatory argument: no
  reader can forget it. A grant whose expiry has passed is lapsed for everyone, whether
  `grant.expired` is in the log or not (`unrecorded`). Safety therefore rests on no write.
- **Who writes `grant.expired`.** The pass, at the head of each run (so at startup, before any
  decision, and at the latest at the tick) and in the transaction that writes a `merge.done`. The
  fact makes the grant inactive: the next check finds nothing, so it is written only once. Bare
  `grant` and `status` open the log read-only and never write. **A departure from what I had
  announced at the `question-spec`** ("only the runtime writes it"): the chef's commands that
  already write (`enable`, `extend`, `revoke`) write it too, in their own transaction, before
  their own fact — otherwise an `enable` typed between the expiry and the tick would overwrite the
  lapse, and the history would never say it. That fact carries the author `runtime`, not `chef`:
  it is not his action.
- **The uses.** `uses_left` is a column of `grants`, decremented by the projection when a merge
  concludes an intent left without a result, **born under the current grant** (`granted_seq`): a
  merge intended under a since-revoked grant takes nothing from the one that replaced it. The
  merge's `by` field does not enter into it: without an identity of its own, the pass cannot
  always recognize itself. Reservations are not stored: they are the `grant_uses` rows without a
  result, counted at read time.
- **An intent is always concluded** (review of PR #274). `merge.done` consumes it, `merge.failed`
  gives it back; a ticket that left the rail concludes it when the pass drops its delivery
  (`pass.abandoned`, which carries `merged` when GitHub says the PR is merged), or at departure
  itself if there is nothing to drop; a PR that GitHub no longer knows is treated as not merged. A
  GitHub refusal on a PR found merged no longer writes `merge.failed` before `merge.done`: the
  intent concludes on the merge.
- **All remaining uses held by in-flight merges**: the decision writes nothing — no fact, no
  comment; journald says it once per delivery — and resumes at the next wake-up, the delivery
  staying green. No new waiting reason: the state lasts the time of one reconciliation, one tick
  at most.
- **The stop reason does not change** (`no-grant`): `pass.held` additionally carries `expired`,
  the instant of the lapse, filed in a column of the pass (`grant_expired`). It is what the issue
  comment, the `status` queue and `pass -- <ticket>` read. Re-granting does not rewrite those
  lines: they say what was true at the stop.
- **Dates are read in ISO 8601 UTC**, as everywhere else in the runtime, with the remaining
  duration beside them. What the chef types (`18h`) is in the machine's time; what he rereads is
  the UTC instant and "3 h 31 left". This is the most debatable point of the rendering: a local
  time on display would be gentler, but it would be the only one in the runtime.
- **`src/grant.ts`** carries everything that is testable in-process with a given time (expiry
  parsing, actions, wordings); `src/grant-cli.ts` is now only a facade.
- **The tests**: in-process for the projection, the typed expiry, the actions, the queue and
  `status`; four on the pass with its kitchen; three on the CLI in a real Node (its arguments, its
  exit codes, its read-only mode).

## Out of scope

The "all projects" scope, new actions, the charter (#255), the dry run (#258), hard caps (#259),
the default duration of a `merge` (open question no. 3 of the epic: the default stays "no
expiry").

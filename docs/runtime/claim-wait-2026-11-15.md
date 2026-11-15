# Claim wait on benomite/brigade — diagnosis (#3677)

*Ticket #3677, filed by the station.* The median lost time of the project's 14 recent tickets is 27 min, over its
threshold of 2 min (`lostTimeMaxMin`). Waiting for a claim is 460 of their 583 lost minutes (79%), in all 14 tickets.
The measure is unchanged: `attentePrise`, from `fire` (or filing) to the first claim, and from each cook given back to
the next claim (`runtime/src/temps-ticket/mesure.ts`).

Everything below comes from the ticket's Evidence section (the times of the 14 tickets and 40 of the 618 journal
events of the window) and from the merge commits of `main` (their commit dates, UTC). The cook could not read the
station's journal, so the 578 events that were not cited are unknown.

## #3513: 282 of the 460 minutes, a zone held by a delivery waiting for the chef

- #3513 was fired at 16:50:54 on 2026-11-14 and claimed at 21:32:51.
- The kitchen was held from 19:40:56. At 20:19:28 and again at 21:32:29 the claim gate said why:
  `#3513 is claimable but not claimed, the claim gate skipped it: zone held by #3560`. In the same lines #3500 was held
  by #3512, and #3529 and #3558 by #3510.
- At 21:32:35 the chef's answer to card #3567 was recorded: `Validated by the chef: PR #3561 is merged`. PR #3561
  (#3512) was merged at 21:32:28, PR #3565 (#3560) at 21:32:38, PR #3530 (#3510) at 21:32:47. #3513 was claimed 13 s
  after #3560's merge.

A ticket in pass holds its whole zone until it is merged (#3509), including a delivery the pass holds for the chef — the
validation of its screen, the review of a sensitive ticket. Those deliveries wait for a human, not for the kitchen. #3446
had already stopped them from taking a place of the pass for that reason, but they still held their zone, so every
ticket whose zone overlapped them waited for the chef's answer too.

What the evidence does not show: whether #3560 and #3510 were held for the chef themselves, or waited for #3512's merge
for another reason. Their three merges came within 19 s, right after the chef's answer on a card. That fits deliveries
held for the chef, but does not prove it.

## #3647, #3648, #3651, #3657, #3662: a claim gate that stopped without a word

- #3647, #3648 and #3651 were fired between 19:54:28 and 19:54:43 on 2026-11-15. They were claimed at 20:24:19,
  20:24:26 and 20:26:45. No merge reached `main` between 19:00:04 (PR #3633) and 20:31:42 (PR #3663).
- At 20:27:00 the kitchen was held, since 19:51:12, with 16 tickets waiting. The cause it gave was `ci-wait` on #3637
  alone, and its `skips` were empty: the claim gate had said nothing about any of the 16.

The turn stops claiming without a word in two places: when its places are full (`enVol.size + aRendre.size >= places`)
and when the pass is full (`PASS_MAX`). The only exception is a ticket that waits for an open ticket, which says so (#3647).
#3446 already noted that a full pass writes no line, so which of the two held each wait "is not measured". The same
silence leaves these 30-minute waits without a named cause.

## The fix

- **A delivery held for the chef holds no zone** while its head is the one held (`retenuesDuTour`, the set that already
  frees its pass place), whether through its open PR or as a ticket in pass (`tenue` in `runtime/src/brigade-github.ts`).
  A delivery that the pass is still reviewing, merging or waiting on CI for keeps holding its zone, as before. If the
  chef sends it back, the delivery comes back as a new head, and its ticket waits for any ticket that took its zone in
  the meantime, under the usual rule.
- **A full stop says so.** When the places or the pass are full, each claimable ticket the gate leaves gets a skip line
  naming the bound and the tickets that hold it: `the station's 6 places are all taken (#…)`, or
  `the pass holds 5 deliveries, its most is 5 (#…)`. The held kitchen reads these lines, and the lost-time evidence
  cites them through `kitchen.held`. The next measure can then say which bound held each claim wait.

## The checks

```sh
cd runtime && node --test --test-name-pattern=3677 test/validation-design/validation-design.test.ts test/brigade-github.test.ts
```

All three tests fail on the code before the fix and pass after it.

The median lost time of the next recent tickets is not measured here. The station measures it again over the tickets
merged after this fix, and opens a new ticket if it is still above 2 min. That ticket's evidence will name, in its held
kitchen lines, the bound that stopped the claim gate.

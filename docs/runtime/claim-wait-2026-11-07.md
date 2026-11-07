# Claim wait on BOBL-tech/mirrorscreen — diagnosis (#2832)

*Ticket #2832, re-filed from BOBL-tech/mirrorscreen#1132.* The quality alert measured a median lost time of
3.8 min on the project's 3 recent tickets, over its threshold of 2 min (`lostTimeMaxMin`), all of it
"waiting for a claim": #923 lost 6 min of its 10 min, #394 lost 3.8 min of its 9.2 min.

## What "waiting for a claim" counts

`pertesDuTicket` (`runtime/src/temps-max/mesure.ts`) adds two phases of a ticket's record under this loss:
`attenteQualification` (from filing to `fire`, when `fire` comes within the hour) and `attentePrise` (from
`fire`, or filing, to the first claim the issue bears) — `marquesDuDepot` in `runtime/src/temps-ticket/mesure.ts`.
The claim wait ends at the first claim, read on GitHub at the merge (#2732), whichever station took it.

## Which station claims mirrorscreen's tickets

The computer's station (`runtime/src/station-ordinateur/servir.ts`) can serve BOBL-tech/mirrorscreen: #2815 and
#2820 corrected two causes of claim wait there already (its drain at every ready release, then a restart
request nobody played — `runtime/src/station-update/README.md`, `docs/runtime/station.md`). But #923 and #394
were not claimed there: their timestamps (below) show both qualified and claimed by `parade-box/claude`, the
box's station, whose loop is `brancherBrigadeGithub` (`runtime/src/brigade-github.ts`).

## The cause corrected here

A ticket becomes claimable on a station's turn when a fact frees what held it: a cook given back (its place),
a delivery (its place), a merge (a dependency, a held zone, a pass place). The station's GitHub-only turn
(`runtime/src/brigade-github.ts`) says so by `station.presser(true)`: *a turn at once*. On the box, the loop
(`brancherBrigadeGithub`) honours that `true` since #2802.

On the computer's station, the loop did not:

- `ouvrir` wired the project's turn as `tour.presser = () => service.presser?.()`: the `true` was dropped;
- `service.presser` only ever scheduled the next turn `ATTENTE_PRESSEE_MS` (30 s) away, and a fact that fell
  during a turn brought the next one 30 s after that turn ended.

So every ticket freed by a merge, a delivery or a cook given back on the computer's station waited for its
claim up to 30 s more than on the box — and the end of the running turn plus 30 s when the fact fell during a
turn. That is waiting for a claim, counted in full in the ticket's lost time.

**The fix, at its source** (`servir.ts`): the project's turn passes `maintenant` through, and the loop keeps
the shortest delay it was asked for: 0 for a fact that makes a ticket claimable, 30 s for the other facts of
the pass (#2333), the interval otherwise — the same rule as the box's loop.

## The check

`runtime/test/station-ordinateur/servir.test.ts`, test *"the loop: a fact that makes a ticket claimable brings
its claim at once, not 30 s later, between turns or during one (#2832)"*, measures on a simulated clock the
seconds between a ticket becoming claimable (the project's turn presses with `true`) and its claim (the next
turn that reads it), once between two turns and once during a turn that ends 5 s after the fact:

```sh
cd runtime && node --test --test-name-pattern=2832 test/station-ordinateur/servir.test.ts
```

| | between turns | during a turn (5 s left) |
|---|---|---|
| before the fix | 30 s | 35 s |
| after the fix | 0 s | 5 s |

The test expects `[0, 5]`; on the code before the fix it fails with `actual: [ 30, 35 ]`.

## The timestamps of #923 and #394

Read by the second from the issues' comments (UTC, 2026-11-07), and given on #2832 — BOBL-tech/mirrorscreen is
private, and no cook of this ticket could read it:

| ticket | opened | on the rail (manager's comment) | first `brigade:prise` | rail → claim | closed |
|---|---|---|---|---|---|
| #394 | 2026-07-09T12:09:27Z | 13:32:40 | 13:36:23 (`parade-box/claude`) | about 3.7 min | 13:41:52 (PR #1129) |
| #923 | 2026-10-06T15:47:30Z | 13:33:08 | 13:39:01 (`parade-box/claude`) | about 5.9 min | 13:43:33 (PR #1130) |

Both were put on the rail by the manager of `parade-box/claude` (`fire`, `model:sonnet`, `effort:low` for #923)
within 28 s, and the claim wait counts from the rail, not from their filing months earlier.

What these timestamps show, read against the code:

- **The 30 s corrected above is not what these two tickets waited.** They were claimed on the box, whose loop
  has honoured the manager's "a turn at once" since #2796 (`presser: () => station.presser?.(true)`, called by
  `manager.ts` as soon as it lays `fire`) and a merge's, a delivery's or a given-back cook's since #2802. The fix
  above corrects the computer's station only; it explains none of their 3.7 and 5.9 min.
- **A turn ran at once and took neither ticket.** On the box, a turn follows the manager's labels at once, or
  right after the running turn: turns are short, since cooks, reviews, merges and gates run outside them
  (#2329). A turn skips a calibrated, free ticket only when something holds it (`tour` in
  `brigade-github.ts`): every place taken (`enVol.size + aRendre.size >= places`, `places` being the station's
  `cooks` capped by `plafondDesCoeurs`), 5 deliveries in pass (`PASS_MAX`), an open dependency, a held zone, a
  wait after a suffered stop, or a guard (`gardes.retenue`: the chef's stop, the breaker, the Max quota, the
  arbiter giving the account's places to other projects).
- **The two claims came one at a time, about 2.6 min apart, in the rail's order** (`prio:`, then the lowest
  number: #394 before #923). If a place had been free at 13:32:40, #394 would have been claimed then. The pattern
  — nothing taken for 3.7 min, then one ticket, then the next one when #394's cook was likely delivering (it
  closed at 13:41:52) — fits a station whose places were all taken, freed one at a time. It does not say which
  hold it was: the station's own cooks filling its places, or the arbiter giving the places to another project.

## What this diagnosis does not establish

- **Which hold kept #394 and #923 from their claim is not read.** It is written in the box's journal of the
  mirrorscreen project (`station.held` with its reason, `station.released`, `cook.launched` and the cooks' ends
  between 13:30 and 13:40 UTC), and the box's places for mirrorscreen (`cooks` of its station,
  `plafondDesCoeurs` of the machine) and whether it has an arbiter (`BRIGADE_ARBITER_PORT`). A cook's sandbox
  cannot read the box's state of another project. So the cause of these tickets' wait is not named, and not
  corrected, here.
- **If it was the arbiter, one more delay is plausible but not shown:** a project the arbiter refuses is not
  woken when another project frees a place — nothing in `arbitrage.ts` presses it — so its next try comes at its
  interval (2 min) or a pressed turn (30 s).
- **Other parts of "waiting for a claim" are left as they are**, and none was measured on these tickets: the
  qualification wait until the manager lays `fire` (it is counted under the same loss); a ticket fired by the
  manager of another station, which reaches the computer's station only at its next turn, up to its 2-minute
  interval (`INTERVALLE_MS`) — #2796 presses only the station that runs the manager.

No lost-time measure changes: `lostTimeMaxMin` and the computation of the three losses are untouched.

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

The computer's station (`runtime/src/station-ordinateur/servir.ts`) serves BOBL-tech/mirrorscreen: #2815 and
#2820 corrected two causes of claim wait there already (its drain at every ready release, then a restart
request nobody played — `runtime/src/station-update/README.md`, `docs/runtime/station.md`).

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

## What this diagnosis does not establish

- **The timestamps of #923 and #394 were not read.** BOBL-tech/mirrorscreen is private and the cook that wrote
  this had no GitHub access: their filing, `fire` and first claim, and how much of their 6 and 3.8 min the
  30 s above explains, are not shown here.
- **Other parts of "waiting for a claim" are left as they are**, and none was measured on these tickets: the
  qualification wait until the manager lays `fire` (it is counted under the same loss); a ticket fired by the
  manager of another station, which reaches the computer's station only at its next turn, up to its 2-minute
  interval (`INTERVALLE_MS`) — #2796 presses only the station that runs the manager; and a ticket that waits
  for a free place (`plafondDesCoeurs`), a dependency, a held zone or a pass place.

No lost-time measure changes: `lostTimeMaxMin` and the computation of the three losses are untouched.

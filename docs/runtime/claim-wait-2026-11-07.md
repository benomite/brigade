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

## The timestamps of #923 and #394

Read by the second from the issues' comments (UTC, 2026-11-07), and given on #2832 — BOBL-tech/mirrorscreen is
private, and no cook of this ticket could read it:

| ticket | opened | on the rail (manager's comment) | first `brigade:prise` | rail → claim | closed |
|---|---|---|---|---|---|
| #394 | 2026-07-09T12:09:27Z | 13:32:40 | 13:36:23 (`parade-box/claude`) | about 3.7 min | 13:41:52 (PR #1129) |
| #923 | 2026-10-06T15:47:30Z | 13:33:08 | 13:39:01 (`parade-box/claude`) | about 5.9 min | 13:43:33 (PR #1130) |

Both were put on the rail by the manager of `parade-box/claude` (`fire`, `model:sonnet`, `effort:low` for #923)
within 28 s, and the claim wait counts from the rail, not from their filing months earlier.

## The cause named

**A project the arbiter refuses a place is not woken when a place frees.** On the box, a turn skips a
calibrated, free ticket only when something holds it (`tour` in `runtime/src/brigade-github.ts`): every place
taken (`enVol.size + aRendre.size >= places`, `places` being the station's `cooks` capped by
`plafondDesCoeurs`), 5 deliveries in pass (`PASS_MAX`), an open dependency, a held zone, a wait after a
suffered stop, or a guard (`gardes.retenue`: the chef's stop, the breaker, the Max quota, the arbiter giving the
account's places to other projects).

Of the two holds that end when a place frees, the code wakes the station for one only:

- **Its own places full.** A cook that delivers (`station.presser(true)`, #2333) or is given back
  (`if (liberee) station.presser?.(true)`, #2802) frees its place and brings a turn at once: the next ticket of
  the rail is claimed then.
- **The arbiter's refusal** (`station.held`, reason `arbiter`). The place frees in another project's runtime,
  which tells the arbiter at the end of its own turn. The arbiter could not tell the refused project
  (`runtime/src/arbitre.ts` answered only the requests a runtime made), and nothing in
  `runtime/src/github-seul/garde-fous/garde-fous.ts` or `brancherBrigadeGithub` pressed it: it asked again at
  its next turn, up to its interval (2 minutes, the default of `brancherBrigadeGithub`) after the place freed.
  That wait is counted in full as the ticket's wait for a claim.

The timestamps fit this hold: nothing taken for 3.7 min after both tickets were on the rail, then one ticket at
a time, in the rail's order (`prio:`, then the lowest number: #394 before #923), 2 min 38 s apart, on a station
that had pressed itself at once when the manager laid `fire` (#2796). They do not prove it (see below).

### The fix, at its source

The arbiter now holds the request of a refused project until a place opens for it:

- `ouvrirArbitre(...).attendre(projet, delaiMs, signal?)` (`runtime/src/arbitre.ts`): after every word it
  hears (`dire`, `demander`, `quitter`), the arbiter replays its rule (`decider`) for each project waiting, and
  answers `true` to the ones that would now pass; `false` after `delaiMs`, when a newer wait of the same project
  replaces it, when the request is abandoned, or when the arbiter closes. On its port:
  `POST /projets/<projet>/attendre`, answering `{ libre }` within `ATTENTE_DE_PLACE_MS` (2 minutes, the
  station's interval: its next turn asks again anyway).
- `joindreArbitre(...).attendreUnePlace(projet)` (`runtime/src/arbitrage.ts`) is the runtime's side, and
  `gardesDuTour(...).attendreUnePlace()` holds one wait at a time, only while the station is held by the
  arbiter. An arbiter that does not answer the wait is said in the log, and nothing is pressed: the next turn asks again, as
  before.
- The station's turn (`runtime/src/brigade-github.ts`), when the arbiter refuses, starts that wait, and when a
  place opens presses a turn at once (`station.presser(true)`), as a freed place of its own does.

No setting changes: the number of places per project (`cooks`, `plafondDesCoeurs`) and the arbiter's rule are
the same.

### The check

`runtime/test/github-seul/garde-fous/garde-fous.test.ts`, test *"a project the arbiter refused is woken when a
place frees: its ticket is claimed at once, not at the next interval (#2832)"*, runs the box's loop
(`brancherBrigadeGithub`, interval 1 minute) on the real station turn, guards and arbiter rule, with GitHub and
`claude` faked. Another project holds the account's only place; the project's ticket is held (`arbiter`). The
other project gives its place back, and the test measures the milliseconds between that instant — the ticket
becoming claimable — and its claim, and requires under 2 s:

```sh
cd runtime && node --test --test-name-pattern=2832 test/github-seul/garde-fous/garde-fous.test.ts test/arbitre.test.ts
```

Before the fix it fails: `ms between the place freeing and the claim: none within 2 s — the next turn is at the
interval, 60 s`. After it, the claim comes within about a tenth of a second (it prints the measure). The tests of
`runtime/test/arbitre.test.ts` tagged #2832 check the wait itself: woken when the place frees, not by a word
that frees nothing, false at its term, replaced by a newer one, released when the runtime hangs up, and over
the port.

## A second cause, corrected on the computer's station

This one is not what #923 and #394 waited (they were claimed on the box), but it is the same loss on the
other station that serves the project. A ticket becomes claimable on a station's turn when a fact frees what held it: a cook given back (its place),
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

### Its check

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

- **The box's journal of mirrorscreen was not read**, and will not be: a cook's sandbox cannot reach it. So the
  hold that kept #394 and #923 (`station.held` and its reason, `station.released`, `cook.launched` and the cooks'
  ends between 13:30 and 13:40 UTC), the box's places for mirrorscreen (`cooks`, `plafondDesCoeurs`) and whether
  it has an arbiter (`BRIGADE_ARBITER_PORT`) are not shown. The cause named above is the one the code shows
  between the two holds the timestamps fit; how much of their 3.7 and 5.9 min it explains is not measured. If
  the box has no arbiter, their wait was their own places full, which the station already ended at once (#2802):
  it was the time its running cooks took, and the number of places is a setting the chef decides.
- **Other parts of "waiting for a claim" are left as they are**, and none was measured on these tickets: the
  qualification wait until the manager lays `fire` (it is counted under the same loss); a ticket fired by the
  manager of another station, which reaches a station only at its next turn, up to its 2-minute interval
  (`INTERVALLE_MS`) — #2796 presses only the station that runs the manager; a weight changed or a project
  removed by the chef's command, which the arbiter reads at the next word it hears, not at once.
- **The median lost time after delivery** is to be read on the next recent tickets of the project: it is not
  measured here.

No lost-time measure changes: `lostTimeMaxMin` and the computation of the three losses are untouched.

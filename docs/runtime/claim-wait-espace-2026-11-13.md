# Claim wait on BOBL-tech/espace — diagnosis (#3448)

*Ticket #3448, filed by the station from BOBL-tech/espace's recorded ticket times.* The median lost time of
the project's 11 recent tickets is 15 min, over its threshold of 2 min (`lostTimeMaxMin`). Waiting for a claim
is 283 of the 363 min lost (78%), and #955 alone is 193 of those 283 min.

**Read this as a partial diagnosis.** Everything below comes from the ticket's Evidence section (the
timestamps of the 11 tickets and 40 of the 967 journal events of the window) and from the code. The cook of
#3448 could not read the station's journal, its GitHub call counter (`<BRIGADE_STATION_DIR>/appels-github/`)
or its service log, so the 927 events that were not cited are unknown, and the cause of most of #955's wait
is not established.

## What the claim gate waits for

A fired ticket is claimed at the station's next turn (`tour` in `runtime/src/brigade-github.ts`) unless
something holds it: every place taken (`enVol.size + aRendre.size >= places`), 5 deliveries in pass
(`PASS_MAX`), a missing capability, an incomplete calibration (`model:`, `effort:`), an open dependency, a
wait after a stop, a held zone, or a guard (`gardes.retenue`: the chef's stop, the breaker, the Max quota, the
arbiter). While GitHub's limit holds, no kitchen call leaves the station (`prendre` in
`runtime/src/limite-github.ts`): no turn and no manager judgement happen for any project.

On the box, `places` is `Math.min(cooks, plafondDesCoeurs(availableParallelism()))`
(`runtime/src/station/cuisine.ts`), and `plafondDesCoeurs(c) = max(1, floor((c - 2) / 2))`
(`runtime/src/projections/stations.ts`): the box has 8 cores (`nproc` on `parade-box`), so at most 3 cooks.

## Each long claim wait, from the evidence

| ticket | claim wait | what the timestamps and the cited events show |
|---|---|---|
| #955 | 192.6 min | Fired by its split at 09:46:23 (2026-11-12), claimed at 12:59:01. The runtime restarted for an update at 12:16:42. At 12:50:09 the kitchen was held since 12:19:12 with #950 and #955 waiting, cause `github-limit` (`limit: null`), back at 12:54:38; the claim came 4.4 min after. **Nothing cited says what held it from 09:46 to 12:16.** |
| #984 | 20.6 min | Fired at 10:04:52 (2026-11-13), within 3 s of its filing. No event at all is cited between its filing and 10:22:30, when the kitchen was found held since 09:51:42, cause `github-limit`, back at 10:23:42. The manager judged it at 10:24:43 and labelled `model:sonnet`, `effort:medium` at 10:24:45; claimed at 10:25:29. |
| #987 | 19.1 min | Fired at 11:07:06. No event is cited between 11:07:06 and 11:20:50, when the runtime stopped for an update; at its start (11:20:57) a hold that had lasted since 10:30:24 was lifted (`nothing-waits`). Claimed at 11:26:12. The cause of the hold from 10:30 to 11:20 is not cited. |
| #997 | 16.9 min | Fired by its split at 11:32:33, claimed at 11:49:03. #987, #989 and #993 were claimed at 11:26:12, 11:27:13 and 11:33:45, #996 at 11:38:34 about when #989's first cook was given back: three cooks at once, the box's 3 places. |
| #974 | 14.7 min | Fired at 14:43:59 (2026-11-12), within 2 s of its filing, without its calibration. The manager judged it at 14:57:10 and 14:57:19, and labelled it at 14:57:21; claimed at 14:58:39. The station ran `0.20261112.120608+ga5f7ded`, which predates #3422 (a new issue judged before the rest of the manager's turn). |
| #996 | 8.2 min | Fired at 11:32:29, claimed at 11:38:34: the same three places as #997. |

So, from what is cited:

- **GitHub's limit** held the whole kitchen at the end of #955's wait and through most of #984's (about
  32 min with nothing served, the pause ending at 10:23:42). Which limit, and which calls brought it, is
  not in the evidence: `limit: null` is the pause the station sets without a named limit
  (`signauxDeLaStation` in `runtime/src/retenue/brancher.ts`).
- **The box's 3 places** made #996 and #997 wait 5 and 16 min while 5 tickets were fired within 8 min.
- **A ticket fired before the manager's judgement** (#974, #984: `fire` within seconds of filing) is not
  claimable until the manager labels its calibration; that wait counts as a claim wait, not as the
  manager's judgement, which the measure ends at `fire` (`marquesDuDepot` in
  `runtime/src/temps-ticket/mesure.ts`). #974's 13 min are the manager's turn that #3422 already reordered;
  #984's 20 min are the GitHub pause.
- **Not established**: what held #955 from 09:46 to 12:16, and #987's kitchen from 10:30 to 11:20.

## What `limit: null` narrows

Both holds name `github-limit` with `limit: null`. `signauxDeLaStation` (`runtime/src/retenue/brancher.ts`)
names the limit from the station's limits file (`limiteDuCompteDeLaStation`, `runtime/src/github-limite.ts`)
while its `backAt` is ahead, and falls back to the pause on the call counter (`pauseDeLaStation`) with
`limit: null` otherwise. A refusal of a call made through `runtime/src/github.ts` writes both: the pause
(`constaterLimite`) and the named limit (`limites.constater`, its end read by `lireLaLimite`: `retry-after`,
else `x-ratelimit-reset`, else the pause's end). So `limit: null` means one of two things, and the evidence
does not say which:

- the pause was set by a call that writes no named limit: the gist channel (`runtime/src/appairage/canal.ts`)
  and the breaker issue (`lancerGhApi`, `runtime/src/breaker-issue.ts`) call `constaterLimite` only;
- or the named limit had ended while the pause still held: `lireLaLimite` takes `x-ratelimit-reset`, the
  hourly reset of the primary quota that GitHub sends on every response, even for a secondary limit.

The two ends differ in kind. 10:23:42.301 has milliseconds: a pause computed from an instant (`retry-after`,
or the 60 s default doubled up to 15 min, `RECUL_MAX_MS`), not a reset read from GitHub. 12:54:38.000 is
whole seconds: a reset epoch (`x-ratelimit-reset` with the quota at zero, or, before the fix below, the latest
reset of any exhausted resource that `gh api rate_limit` lists, `finDeFenetreDite` in `runtime/src/limite-github.ts`).

## What the station corrects (#3448)

The manager's answer on #3448 asked for the part the station controls to be corrected, without the box's logs.
Two parts of a claim wait under GitHub's pause are decided by the station's code, and both made it longer than
GitHub's own limit required:

- **The turn after the pause came at the interval, not at the pause's end.** A GitHub-only turn stopped by the
  pause (`LimiteGitHubAtteinte`) programmed its next turn at the interval (`brancherBrigadeGithub`, 2 minutes),
  whatever the pause's end: a ticket claimable once the pause was over waited up to 2 more minutes. The loop now
  takes the next turn at the pause's end when that comes before the interval, never later than the interval, and
  never sooner than 5 s (`REPRISE_MIN_MS`, for a pause already over when it is said). #955 was claimed 4.4 min after
  the 12:54:38 the hold announced; how much of it was this interval is not shown by the evidence.
- **A refusal without a usable header paused until the reset of any exhausted resource.** When the refusal carried
  neither `retry-after` nor a primary quota at zero, `constaterLimite` asked `gh api rate_limit` and took the latest
  reset of every resource at zero — `graphql` or `search`, which the chef's Mac and the app spend on the same account,
  held the kitchen's REST calls up to their own reset, an hour at most. A secondary limit is not among the
  resources `rate_limit` lists; for one without `retry-after`, GitHub's guidance is to wait at least a minute and
  back off, which the 60 s doubled (#2436) already does. The pause now follows only the
  resource the refused call spends (its `x-ratelimit-resource`, `core` by default), else the 60 s doubled up to 15
  min (#2436) as before. Whether this is what set 12:54:38 is **not proven**: that end, in whole seconds, is a reset
  epoch, which an `x-ratelimit-reset` with the primary quota at zero also gives.

No measure changes: `lostTimeMaxMin`, the losses and their computation are untouched, and so are the pause's
other ends (`retry-after`, the primary reset) and the pacing of calls.

### The checks

```sh
cd runtime && node --test test/brigade-github-pause.test.ts
cd runtime && node --test --test-name-pattern=3448 test/github-limite.test.ts
```

`test/brigade-github-pause.test.ts` runs the box's loop on a simulated clock with the real call counter: a pause
that ends 50 s after a turn brings the next call to GitHub at 50 s; before the fix it came at the interval, 120 s
(`actual: []`, `expected: [ 50 ]`). A pause longer than the interval keeps the interval while it lasts, and the
last turn comes at its end (300 s, not 360 s). In `test/github-limite.test.ts`, a 403 secondary refusal with core
at 4,000 and `graphql` and `search` at zero pauses 60 s; before the fix, 50 min.

## What the journal now says of a hold by GitHub's limit

The second thing the manager asked: that the next lost-time ticket carries what this one lacked, so its cook names
the cause from the ticket alone.

- The station's counter (`<BRIGADE_STATION_DIR>/appels-github/compteur.db`) keeps each pause that starts in a
  `pauses` table, with the status, `x-ratelimit-resource` and `retry-after` of the refusal that set it, for an hour
  after its end (`suspendre`, `pausesDeLaStation` in `runtime/src/limite-github.ts`).
- A `kitchen.held` whose cause is `github-limit` carries `pauses`: how many pauses in the last hour, the minutes
  GitHub refused a call, the last pause and its refusal, and the last 5 calls counted before it, by project and
  kind (`espace issues`, `station gist write`).
- Every `kitchen.held` carries `skips`, the claim gate's lines for the claimable tickets it did not claim, when
  those lines are not already the cause. Under GitHub's limit they were written nowhere.
- The Evidence of a lost-time ticket cites a `kitchen.held` line up to 1,500 characters (`LONGUEUR_D_UNE_RETENUE`
  in `runtime/src/preuve-mesure.ts`): cut at 300, as the other events are, it stopped before these fields.

`test/retenue/pauses-au-journal.test.ts` plays the chain: calls counted, a refusal, the hold written to the journal,
and the Evidence section citing it whole.

## What remains unverified

- **Which limit GitHub set**, and which calls brought it, on 2026-11-12 from 12:19 and on 2026-11-13 from 09:51:
  the box's journal, service log and counter were not read, and the Evidence of #3448 does not hold them. The next
  hold will say it in its `kitchen.held` line.
- **What held #955 from 09:46 to 12:16**, and #987's kitchen from 10:30 to 11:20 on 11-13: nothing cited says.
  The `nothing-waits` lift at 11:20:57 is the hold observer starting with an empty view at the restart (the GitHub
  turn has not run yet, `lireLaCuisine`), not a ticket served.
- **The median lost time after this delivery** (the ticket asks for 2 min or under): it can only be measured on
  BOBL-tech/espace's next tickets once the station runs this code. The corrections above remove the wait the
  station added after a pause and a pause longer than the limit; the box's 3 places (#996, #997) and the time to the
  manager's labels (#974) are not changed here.

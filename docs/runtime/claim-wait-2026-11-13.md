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
whole seconds: a reset epoch (`x-ratelimit-reset` with the quota at zero, or the latest reset of any exhausted
resource that `gh api rate_limit` lists, `finDeFenetreDite` in `runtime/src/limite-github.ts`).

## What is missing to name the cause

The station's journal and service log for 2026-11-12 09:46–12:59 and 2026-11-13 09:51–11:26 (the
`station.held` lines, the claim gate's skips, the `GitHub limit reached` lines), and the call counter of
`parade-box` for those hours (`<BRIGADE_STATION_DIR>/appels-github/`: its `refus` and `pause` tables, and which
project and kind of call were last counted before each pause). The two holds and #955's wait are where most of the 283 min are, and no
correction of them can be checked against the code without these.

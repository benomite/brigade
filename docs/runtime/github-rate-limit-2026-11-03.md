# Diagnosis: the GitHub limit hit on 2026-11-03 from about 15:22 to 15:54

Ticket #2143, under epic #2137.

**The limit hit was most probably a secondary limit — writes per minute or concurrent requests, not decided between the two — and not the primary hourly quota.** It is not the primary one for certain: `core` still had 4653 of 5000 calls left at 15:50, while the station was paused. Which secondary limit, and which calls tripped it, cannot be settled from what the box keeps; the sections below say what is established, what is only probable, and why.

## Limit of this diagnosis

The raw evidence of the incident is not available where this note was written: the station's counter (`<BRIGADE_STATION_DIR>/appels-github/compteur.db`), the station log and the GitHub call history of the chef's account were not on the workstation of the cook that wrote it, so no log line of 15:22 is quoted. Everything below comes from the runtime code and the incident as the ticket reports it. Anyone who can read the station's journal for 15:15–15:55 should complete the "To read to settle it" section.

## Established

- **The refusal was GitHub's, not the box's own hold.** The `status` line `GitHub is rate-limiting calls, back around 15:54` is written only by `direLaLimite` (`runtime/src/limite-github.ts`), from a pause set by `constaterLimite` after `refusPourLimite` saw a 429, or a 403 carrying `retry-after`, `x-ratelimit-remaining: 0` or "rate limit" in its message. The box's own hold at the gestures' reserve (a tenth of the quota, `RESERVE_DES_GESTES`) says another line, `the box holds its own calls to keep the reserve for your gestures` (`direLaRetenue`), and it only starts at 500 calls left.
- **It was not the primary hourly quota.** `core` had 4653 of 5000 left at 15:50, well above the reserve of 500. A refusal on `core` exhaustion would have carried `x-ratelimit-remaining: 0`.
- **Every project stood still at once because the pause is shared.** `suspendre` writes it into the station's one counter, read by the station and all its projects: a refusal seen by one project stops the kitchen calls of all (`prendre` throws `LimiteGitHubAtteinte` for every `cuisine` call while the pause lasts). Nothing in the account's quota needs to be low for that.
- **The end of the pause comes from the refusal's headers.** `constaterLimite` takes, in this order, `retry-after`, else `x-ratelimit-reset`, else `gh api rate_limit` (a resource at 0), else 60 s.

## Probable, not established

- **A secondary limit.** Given the two points above, only GitHub's secondary limits remain (writes per minute, concurrent requests, or the content-creation limit). The runtime holds no counter of its own against them: `limite-github.ts` regulates only the hourly quota.
- **The 32-minute length comes from the code's reading of the headers, not from GitHub's penalty.** If the secondary refusal had no `retry-after`, `constaterLimite` used `x-ratelimit-reset`, which is the end of the *hourly* window of `core` — up to an hour away even though a secondary limit usually lifts within a minute or a few. The pause would then have outlasted the real limit. This is consistent with `back around 15:54` but unproven: neither the headers of the refusal nor the reset time of the account's window at that hour are kept. (A `retry-after` of that size is possible too, since GitHub lengthens it when calls keep coming.)
- **Which calls.** The calls the runtime can emit in volume, by kind (`LECTURES` in `limite-github.ts`):
  - *Writes, `POST`/`PATCH`*: the Kitchen board issue of each project (`tableau/publication/client.ts`, one `PATCH` per refresh whose body changed), the station's gist (`appairage/canal.ts`, `PATCH`, never closer than `ECART_MINIMAL_MS` = 60 s and at least one per `BATTEMENT_MS` = 5 min), comments and merges of the pass and the manager (kind `gesture` or `pull-requests`/`issue-comments`). Each project writes at most a few of these per minute, so a number of projects in the tens, all ticking on the same minute, could by itself reach a per-minute write limit. The count is a bound from the code, not a measure.
  - *Reads*: each project's runtime ticks every minute (`BRIGADE_STATION_TICK_S`, default 60 s, `station/main.ts`) and polls its issues, then the comments, events and PRs of the tickets in play. Every project of the station ticks on the same schedule, so the reads of all projects leave in a burst; if the cooks' `gh` calls overlap, those are concurrent requests. Conditional reads answering 304 cost no quota, but they are still requests for the concurrency limit.
- **Rates in the 15:22 window.** No per-minute count by call type and project is established. The only per-project and per-kind count that exists, `repartition()` over the sliding hour (`status`: `most calls: project <p> (n), kind <k> (m)`; `faits`: `appelsGithub`), is a snapshot and was not kept for 15:22.

## Why the box cannot answer today

1. The log writes the pause once (`GitHub a atteint sa limite d'appels`), with the resumption time, but **not the status, the headers (`retry-after`, `x-ratelimit-reset`, `x-ratelimit-resource`) nor the `message` of the refusal**, which are what tell the primary limit from a secondary one, and the writes from the concurrency.
2. The counter keeps calls only for the last hour (`FENETRE_MS`) and without second-level history of what was refused; the call that tripped the limit is not recorded.
3. The `status` line gives the end of the pause in the box's local time, not the cause.

## To read to settle it

- The station journal around 15:22 (`journalctl` for the station unit): the first `GitHub a atteint sa limite d'appels` line and what ran just before it.
- GitHub's side: the account's REST usage for the hour (`gh api rate_limit` at the next window shows `core.used`), and the audit/API history if available.
- Any copy of `compteur.db` taken before 16:22: `SELECT projet, lecture, count(*) FROM appels WHERE instant BETWEEN <15:15> AND <15:25> GROUP BY projet, lecture` gives the calls per project and kind, to bucket by minute.

## Follow-up the code would need

Keeping the status, the three headers and the `message` of a refusal in the log line, so the next incident is settled from the log. This ticket changes no code.

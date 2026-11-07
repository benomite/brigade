# Diagnosis: the GitHub limit hit on 2026-11-03 from about 15:22 to 15:54

Ticket #2143, under epic #2137; its split of the calls feeds #2145 (at most 30 calls per served ticket, none while nothing changes).

**Read this as a diagnosis of the day.** The incident happened while the Kitchen board still existed. The board was removed with the old state path (#2061): the GitHub-only path publishes and reads no board issue, so the rows below marked *removed (#2061)* no longer exist, and neither do the files they name (`tableau/publication/`, `tableau/gestes/`). What the runtime still does each tick is the `fire` list, the open list and the pass's reads.

**The limit hit was, most probably, GitHub's secondary limit on concurrent requests — not the secondary limit on writes per minute, and not the primary hourly quota.** The primary quota is excluded by the numbers (`core` had 4653 of 5000 left at 15:50, the pause was still on). Writes are excluded by the code: the runtime emits only a handful of writes per minute for the whole box (see "Rate in the 15:22 window"), far under any write limit. What the code does produce is bursts of simultaneous reads, because every project ticks on the same 60-second schedule and some reads fan out in parallel (`ci()` and `ciDeLaBase()`). That choice is an inference from the code and the chef's figures; no log line of the incident was available to confirm it (see "Limit of this diagnosis").

## Limit of this diagnosis

The station journal, the counter (`<BRIGADE_STATION_DIR>/appels-github/compteur.db`) and GitHub's own call history were not readable from the workstation where this note was written, so no log line of 15:22 is quoted. What is used: the code (paths below) and the figures the chef gave on the ticket (2026-11-03): 1,327 calls in an hour on the box, 491 of them for brigade, about 13 tickets on the rail. Every number marked *derived* is computed from these and from the code's cadences, not measured.

## Established

- **GitHub refused, not the box.** The `status` line `GitHub is rate-limiting calls, back around 15:54` is written only by `direLaLimite` (`runtime/src/limite-github.ts`), from a pause set by `constaterLimite` after `refusPourLimite` saw a 429, or a 403 with `retry-after`, `x-ratelimit-remaining: 0` or "rate limit" in the message. The box's own hold at the gestures' reserve (500 calls left) writes another line (`direLaRetenue`).
- **Not the primary quota.** 4653/5000 left at 15:50, well above the reserve of 500, and a primary refusal carries `x-ratelimit-remaining: 0`.
- **Every project stopped because the pause is shared.** `suspendre` writes it in the station's single counter; `prendre` then throws `LimiteGitHubAtteinte` for every kitchen call of every project until `jusqua`.
- **How the end of the pause is chosen** (`constaterLimite`): `retry-after`, else `x-ratelimit-reset`, else `gh api rate_limit`, else 60 s.

## What is only probable

- **Concurrency rather than writes** (the reasoning, from the code):
  - Writes per tick are rare. The only periodic writes are the Kitchen board `PATCH` of each project (removed with the board, #2061: it was written only when the rendered body changed) and the station's gist `PATCH` (`appairage/canal.ts`, never closer than `ECART_MINIMAL_MS` = 60 s). The other writes are events: comments, labels, merges of the pass and the manager (~20 per served ticket, the chef's figure). With 13 tickets on the rail that is a few per minute for the box, not tens.
  - Reads are the bulk and they cluster. Each project's runtime fires its tick every 60 s (`runtime.ts`, `intervalleTickMs`), all started by the same station within seconds of each other, so all projects' polls leave in the same burst. `ci(sha)` runs two reads in parallel (`Promise.all`), and `ciDeLaBase` runs `ci` for each of 10 commits in parallel (`github.ts`): 20 simultaneous requests for one call, from the pass's `excuserLesJobsSansVert` (`pass.ts`).
  - So the shape of the traffic (22 counted calls a minute on average, but not spread: the burst is at the tick) fits a concurrency limit; it does not fit a write limit. The number of projects of the account was not given; the burst size scales with it, and with the chef's other clients (Mac, app) which share the account and are not counted by the box.
- **The 32-minute length.** `retry-after`, if GitHub sent it, is what the code used; GitHub lengthens it when calls keep coming. If the refusal carried only `x-ratelimit-reset`, the pause ran to the end of the hourly window of `core`, up to an hour away, even though the secondary limit itself lifts sooner. The order of preference in `constaterLimite` is verified in the code; which header GitHub sent is not recorded. A lead, not a fact.

## The calls, by kind and reason (derived from the code)

"Reason": **tick** = emitted by the 60-second tick whether or not anything changed; **event** = emitted because the journal or GitHub changed. "ETag": a conditional read (`If-None-Match`) that GitHub answers 304 while nothing changed: GitHub does not count it in the quota, and the box takes it out of its counter (`rendre`), so it is **not** among the 1,327 / 491, but it is still a request (for the concurrency limit). `lireSousCondition` keeps the answer per process, bounded to 32 MB; restarting a project loses it.

| Call | Nature | Reason | ETag | Code |
|---|---|---|---|---|
| Open issues labelled `fire` (`issues?labels=fire&state=open&per_page=100`) | read | tick, per project | yes (one page; beyond 100 issues the poll becomes unconditional) | `github.ts` `tickets`/`sonder`, `alimenter.ts` `sonder` on `tick` |
| Open issues of the repo, PRs included, for the board's "before the rail" | read | tick, per project | yes (same rule) | `github.ts` `ouvertes` (the board's own reader, `publier.ts`, was removed in #2061) |
| The board issue (`issues/<n>`), or by label when lost | read | tick, per project | yes | removed (#2061) |
| Comments of the board issue, `?since=<writtenAt>` | read | tick, per project (the chef's gestures) | yes, but the path carries `since`: a rewrite of the board changes the path and costs one full read | removed (#2061) |
| Comments of a `fire` issue | read | event: only when its `updated_at` moved (or its fiche is not stable) | yes | `alimenter.ts` `lireFiche`, `github.ts` `commentaires` |
| Events of an issue held at 86 | read | event: when its `updated_at` moved | yes | `alimenter.ts`, `github.ts` `retraitsDeFire` |
| PR of a branch, then its detail | read | per tick for each ticket in pass, plus on log events | yes | `pass.ts` `prDeBranche`, `github.ts` |
| CI of a commit: check-runs + status | 2 reads | per tick for each ticket in pass while it waits for CI | yes, but while CI runs the answer changes: 200, counted | `pass.ts` (`github.ci(sha)`), `github.ts` `ci` |
| CI of the base: 10 commits × `ci` | 20 reads in parallel | event: when a red check must be excused | yes | `pass.ts` `excuserLesJobsSansVert`, `github.ts` `ciDeLaBase` |
| Issues since an instant (`state=all&since=<instant>`) | read | event, but **retried on every tick** while a kitchen fix or a breakdown is not found | **no** (the path changes with `instant`; comment in `github.ts` `issuesDepuis`) | `pass.ts` (`ouvrirLeFixDeLaCuisine`, fix lookup), `decoupage.ts`, `budget-des-gates.ts`, `breaker-resume-github.ts` |
| Job log of a check | read | event | no | `github.ts` `journalDuCheck` |
| Last page of a full list (comments, events with 100 entries) | read | whenever the list is read | no (`pleine`) | `github.ts` `dernierePagePleine` |
| Any list over 100 items | read | tick | first page and later pages: no | `github.ts` `sonder`, `feuilleter` |
| Board `PATCH`/`POST`, pin | write | event: only on a changed body | n/a | removed (#2061) |
| Gist `PATCH` (presence, rail) | write | tick (every 60 s at the closest, 5 min without change) | n/a | `appairage/canal.ts`, `presence.ts` |
| Comments, labels, merge, close, PR creation | write | event (~20 per served ticket) | n/a | `github.ts`, `pass.ts`, `station.ts` |

**The reads repeated each minute without an ETag** (the chef's question): none among the steady polls above, they are all conditional. The ones that are not: `issuesDepuis` (`since=`), retried on each tick while the thing it looks for is not found; the logs of a check; a full last page; and every list that grows past 100 items (a poll that is then unconditional on all its pages). The pass and the manager read CI and PR at every tick; those are conditional, but a running CI changes the answer, so the 304 turns into a counted 200.

## Rate in the 15:22 window (derived)

- **Counted calls, box:** 1,327 / 60 ≈ **22 per minute**; brigade 491 / 60 ≈ **8 per minute**, the other projects 836 / 60 ≈ 14 per minute.
- **Per ticket:** 491 / 13 ≈ **38 counted calls per ticket per hour** (the chef's "about 40"). A served ticket should cost ~20 writes (chef); the rest, ~18, is reads. A waiting ticket should cost nothing, but the counted reads are tied to the repo, not to a ticket: any change to any issue (a comment, a label, a board rewrite) makes the `fire` list and the open list (two calls) and the comments of the changed issue (one call per page) answer 200 instead of 304. A busy repo thus charges its waiting tickets in proportion to the activity of the others.
- **Steady state, nothing changing** (derived from the table): per project, 4 conditional reads per tick (`fire` list, open list, board, board comments) = 240 requests an hour, none counted (all 304); plus 3 per ticket in pass (PR, check-runs, status), also conditional. That is the traffic the concurrency limit sees and the counter does not: with the tick aligned, one project sends its 4 reads (7–10 with a ticket in pass) in the same second; N projects, N times that; and `ciDeLaBase` adds 20 at once.
- **Writes:** board and gist `PATCH` ≤ 1 per minute each in the worst case; events on top, ~20 per served ticket — a few per minute on the whole box. **Writes per minute are therefore ruled out as the cause (derived).**

## What remains to measure

1. The station journal near 15:22: the first `GitHub a atteint sa limite d'appels` line, and which project and call preceded it.
2. A copy of `compteur.db` taken before 16:22: `SELECT projet, lecture, count(*) FROM appels WHERE instant BETWEEN <15:15> AND <15:25> GROUP BY projet, lecture` gives the real count per project and kind (it does not count the 304s: they are removed).
3. The number of projects served by the station and of the chef's other clients on the account.
4. The status, `retry-after`, `x-ratelimit-reset`, `x-ratelimit-resource` and `message` of the refusal. The log writes none of them today; keeping them in the pause line would settle the next incident from the log. This ticket changes no code.

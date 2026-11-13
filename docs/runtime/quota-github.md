# The GitHub quota of an account

Every station and project of one account reads the same GitHub quota. This page says what that
sharing means, the two kinds of limit GitHub sets, what the kitchen holds and what it lets through,
what the chef sees, and the fields the station publishes. It describes the code as it is today.

*Code: `runtime/src/limite-github.ts` (the counter, the reserve, the pace), `runtime/src/github-limite.ts`
(which limit GitHub named), `runtime/src/etat.ts` (`faits`, `status`), `app/src/budget-github.ts` (the
app's own pause). Background: [`station-machine.md`](station-machine.md), section "The calls to GitHub".*

## One quota per account, shared by the whole station

The quota is kept **per account**: the machine's `gh` (the account the chef's Mac shares), and each
role identity, whose App has its own quota. Every process of a station — the station itself and the
projects it serves, and any runtime or command started with its environment — reads the same counter,
`<BRIGADE_STATION_DIR>/appels-github/compteur.db`. They keep the same pace, and a transaction decides
between two processes taking the last call at the same instant.

A process outside any station (the dev workstation, a test) counts alone, in memory.

The consumption grows with the number of projects; the pace does not get divided among them.

## The two limits

**The core quota.** GitHub gives each account 5,000 REST calls per hour (resource `core`). Every
`gh api -i` response says what is left (`x-ratelimit-remaining` of `x-ratelimit-limit`, until
`x-ratelimit-reset`), and the counter keeps it. When the quota is low, the box confirms with
`gh api rate_limit`, which GitHub does not count, at most once a minute before it decides on it.

**The secondary limits.** GitHub also caps bursts, which the hourly quota does not show:

- *writes*: about 80 writes a minute and 500 an hour. The box paces its own writes at 60 a minute and
  450 an hour (`ECRITURES_PAR_MINUTE`, `ECRITURES_PAR_HEURE`). A write over that budget is not sent,
  not counted, and waits in the queue until it can go.
- *points*: 900 points a minute for the REST API (a read costs 1, a write 5, a 304 costs nothing against
  the hourly quota). The box uses half of it, 450 points a minute for the station's projects
  (`POINTS_PAR_MINUTE`); the other half stays with the chef's app and gestures. A request over that
  budget waits, and so does every later request of its account, reads included.
- *concurrency*: the box keeps at most four requests in flight (`REQUETES_EN_VOL`).

## The kitchen is held at the reserve, and the chef's gestures are never held

A tenth of the quota is the **reserve of the chef's gestures** (`RESERVE_DES_GESTES`, 500 of 5,000).

- **Kitchen calls** — polls, the pass, the manager, the heartbeat — are held only at the reserve. Above
  it, nothing holds them. At the reserve, the kitchen waits for the end of the window, then resumes by
  itself. A held call is not sent and not counted; the caller treats it as a wait and the log says it
  once: `quota GitHub bas : N appels restants sur 5000, gardés pour les gestes du chef — la cuisine
  attend la fin de la fenêtre`.
- **The chef's gestures** — removing a ticket from the rail, merging, choosing, answering a card, the
  pass's comments — are never held by the box. They are sent and counted, and they may spend the
  reserve. They fail only if GitHub itself refuses.

## When GitHub refuses: one pause for the account

When GitHub refuses a call (a 429, or a 403 saying "rate limit"; a 403 on a forbidden merge is an
ordinary refusal), the station stops every kitchen call of the account and records a pause on the
shared counter, visible to all its processes. The pause ends at the first of: `retry-after`, then
`x-ratelimit-reset`, then the reset `gh api rate_limit` gives for the resource the refused call spent
(`x-ratelimit-resource`, `core` by default), then 60 seconds. A pause that comes back within 15 minutes
of the previous one's end is longer, up to 15 minutes, so that resuming every project at once does not
set the secondary limit off again.

Two details:

- The refusal names its limit kind for the chef's reading: `primary` (the hourly quota at zero),
  `secondary-writes`, or `secondary-concurrency`. The kind is shown; it does not decide which calls
  are held. The pause holds the account's kitchen calls, whatever the kind.
- A refusal on another resource (`graphql`, `search`) does not set the time of the REST calls: the
  reset used is the one of the resource the refused call spent.

Calls the chef makes by gesture are not held during the pause either: they are sent, and GitHub decides.

## The heartbeat never stops the kitchen

The station's heartbeat is a kitchen call, so it is held at the reserve like the others, and it is not
held otherwise. A held heartbeat waits for the end of the window, as the other kitchen calls do.

A pause freezes the heartbeat record, and the app would read the station as dead. So when a pause starts,
the station writes its record once more, outside the pause, with the limit and its end; the next write,
once the limit is lifted, clears it (`runtime/src/enregistrement-station/enregistrer.ts`).

## A quota pause resolves by itself

Nothing needs to be done. At the reserve, the kitchen resumes at the end of the window. After a refusal,
the entry naming the limit stays until its `backAt` has passed **and** a call of that account succeeds
(an HTTP status below 400); then it is removed.

## What the chef sees

- **`status`**, `github` line: during a pause held at the reserve, `the box holds its own calls to keep
  the reserve for your gestures, back around HH:MM`. When GitHub itself refused, the line says which
  limit it named, since when, and back around when (`GitHub is rate-limiting calls: secondary limit
  (writes per minute), since HH:MM, back around HH:MM`).
- **The app**: a line in each project's alert band, in the chef's local time, naming the limit in plain
  words. The band of every project of the account says it, because each one receives the same entry.
- **The app's own pause** (`app/src/budget-github.ts`): the app reads GitHub with the chef's token, and
  keeps its reads to 1,000 counted requests an hour. Below 20% of the GitHub budget left, or after a
  refusal for going over, its reads stop until the time GitHub gives (`x-ratelimit-reset` or
  `retry-after`, else a minute). Each project keeps its last rail read meanwhile. This pause belongs to
  the app and is separate from the station's.

## The fields the station publishes

These are the fields that exist today; nothing else is published for the GitHub quota.

| Field | Where | What it holds |
|---|---|---|
| `faits.limiteGithub` | `runtime/src/etat.ts` | The instant (ISO) when the kitchen's calls resume after a hold or a pause; absent when calls pass |
| `faits.github` | `runtime/src/etat.ts`, from `github-limite.ts` | `{ limit, since, backAt }`: the limit GitHub named (`primary`, `secondary-writes`, `secondary-concurrency`), its date, its return time (ISO); absent when calls pass |
| `status`, `github` line | `runtime/src/etat.ts` | The text of the two entries above |
| `quotaUntil`, `quotaReason` | `runtime/src/projections/stations.ts` | **Not the GitHub quota.** The Max quota of the `claude` connection, which takes the station to `86` (see [`station-cook.md`](station-cook.md)) |

The per-account counter itself (the calls of the hour, the points, the writes) is in
`appels-github/compteur.db`; the refusals and pauses are in `appels-github/limites.db`.

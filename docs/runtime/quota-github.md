# The GitHub quota of an account

Every station and project of one account reads the same GitHub quota. This page says what that
sharing means, the two kinds of limit GitHub sets, what the kitchen holds and what it lets through,
how a pause resolves, what the chef sees, and the fields the station publishes. It describes the code
as it is today, and says where the chef's view is not built yet.

*Code: `runtime/src/limite-github.ts` (the counter, the reserve, the pace, the pauses),
`runtime/src/github-limite.ts` (the kind of limit GitHub named, the entry on the account),
`runtime/src/appels-github/quota-github.ts` (the `quotaGithub` field), `runtime/src/etat.ts` and
`runtime/src/status.ts` (`status`), `runtime/src/enregistrement-station/enregistrer.ts` (the heartbeat),
`app/src/budget-github.ts` and `app/src/alertes.ts` (the app). Background:
[`station-machine.md`](station-machine.md), section "One station per machine".*

## One quota per account, shared by the whole station

The quota is kept **per account**: the machine's `gh` (the account the chef's Mac shares), and each
role identity, whose App has its own quota. Every process of a station (the station itself, the
projects it serves, and any runtime or command started with its environment) reads the same counter,
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
- *points*: 900 points a minute for the REST API (a read costs 1, a write 5; a 304 costs nothing against
  the hourly quota). The box uses half of it, 450 points a minute (`POINTS_PAR_MINUTE`); the other half
  stays with the chef's app and gestures. A request over that budget waits.
- *concurrency*: the box keeps at most four requests in flight (`REQUETES_EN_VOL`).

## The kitchen is held at the reserve, and the chef's gestures are never held

A tenth of the quota is the **reserve of the chef's gestures** (`RESERVE_DES_GESTES`, 500 of 5,000).

- **Kitchen calls**: polls, the pass, the manager, the heartbeat. They are held only at the reserve.
  Above it, nothing holds them. At the reserve, the kitchen waits for the end of the window, then resumes
  by itself. A held call is not sent and not counted. The log says it once: `quota GitHub bas : N appels
  restants sur 5000, gardés pour les gestes du chef — la cuisine attend la fin de la fenêtre`.
- **The chef's gestures** (removing a ticket from the rail, merging, choosing, answering a card, the
  pass's comments) are never queued or held by the box. They are sent and counted, and may spend the
  reserve. They fail only if GitHub itself refuses.

## When GitHub refuses: a pause on the account, by kind of call

When GitHub refuses a call (a 429, or a 403 saying "rate limit"; a 403 on a forbidden merge is an
ordinary refusal), the station records a pause on the shared counter, visible to all its processes.
Its end is the first of: `retry-after`, then `x-ratelimit-reset`, then the reset `gh api rate_limit`
gives for the resource the refused call spent (`x-ratelimit-resource`, `core` by default), then 60
seconds. A pause that comes back within 15 minutes of the previous one's end is longer, up to 15
minutes, so that resuming every project at once does not set the secondary limit off again.

**What a pause holds depends on the limit that refused:**

- **The hourly quota** (`primary`, the `core` quota at zero): the pause holds **every kitchen call** of
  the account, whatever its kind.
- **A secondary limit** (`secondary-writes` or `secondary-concurrency`, in `github-limite.ts`): the pause
  holds only the calls **of the kind that was refused**. The kind is the call's read category
  (`issue-comments`, `pull-requests`, `issues`, `gist`, `other`). The other kinds keep going.

A pause is recorded once per kind in the station's log, when it starts and when calls resume
(`brigade : GitHub calls resumed`, `#2436`, `#3481`).

Calls the chef makes by gesture are not held during a pause: they are sent, and GitHub decides.

A refusal on another resource (`graphql`, `search`) does not set the time of the REST calls: the reset
used is the one of the resource the refused call spent.

## The heartbeat never stops the kitchen

The station's heartbeat is a write of its record to the gist. It is a kitchen call: at the reserve it is
held like the others, and it waits for the end of the window.

A refusal of the heartbeat stops nothing else. A pause of the gist's kind holds only the gist writes, and
the kitchen goes on (`runtime/src/enregistrement-station/enregistrer.ts`). The only pause that holds the
kitchen is the hourly quota's, and it holds the kitchen because GitHub refuses every call then, not because
of the heartbeat.

A pause freezes the heartbeat record, and the app would read the station as dead. So when a pause starts,
the station writes its record once more, outside the pause, with the limit and its end (`heldBy`). The
next write, once the limit is lifted, clears it. If GitHub refuses that write too, it is tried again
outside the pause, a few times at most.

## A quota pause resolves by itself

Nothing needs to be done. At the reserve, the kitchen resumes at the end of the window. After a refusal,
the entry naming the limit on the account stays until its return time (`backAt`) has passed, and the
first successful call of that account after it (an HTTP status below 400) removes it
(`runtime/src/github-limite.ts`, `runtime/src/github.ts`).

## What the chef sees

- **`status`, `github` line**, from `runtime/src/etat.ts`:
  - at the reserve: `the box holds its own calls to keep the reserve for your gestures, back around HH:MM`;
  - when GitHub refused: `GitHub is rate-limiting calls: <limit>, since HH:MM, back around HH:MM`, where
    `<limit>` is `primary limit (hourly quota)`, `secondary limit (writes per minute)` or `secondary limit
    (concurrent requests)`.
- **The app's alert band**, in the chef's local time (`app/src/alertes.ts`): `GitHub is rate-limiting
  calls, back around HH:MM`. Each project of the account says it, since each receives the same entry.
- **The app's own pause** (`app/src/budget-github.ts`): the app reads GitHub with the chef's token. When
  less than 20% of the hourly GitHub budget is left (`SEUIL_DU_BUDGET`), or after a refusal for going over,
  its reads stop until the time GitHub gives (`x-ratelimit-reset` or `retry-after`, else a minute). Each
  project keeps its last rail read meanwhile. This pause belongs to the app and is separate from the
  station's.

**Not built yet.** The `quotaGithub` fields below are published in the station's state, but the app does
not read them yet: no file under `app/src/` reads `quotaGithub` or `parStationEtProjet`. So there is, for
now, no gauge on the Stations tab, no breakdown of the calls per station and per project, and no "Start
the station" action for a stopped station. These are not described here as shown; they wait for the app's
ticket.

## The fields the station publishes

Each write of the station's state carries `quotaGithub`, from `runtime/src/appels-github/quota-github.ts`.
It is read from the station's counter; the quota changes with every call, so it never causes a write itself.

| Field | What it holds |
|---|---|
| `limite` | `core` (the hourly quota), or `ecriture` while a pause set by a secondary limit of GitHub holds |
| `pauseJusqua` | The end of the pause in progress (ISO). `null` with no pause, or when GitHub gave no end |
| `utilise` | For `core`: what GitHub said of the account's quota, used (`plafond` minus `restant`); `null` until it says it. For `ecriture`: the writes the box counted this hour |
| `maximum` | For `core`: the quota GitHub said (`plafond`). For `ecriture`: the box's own hourly budget of writes (450, not GitHub's 500) |
| `renouvellement` | For `core`: when GitHub's window resets (ISO). For `ecriture`: when the oldest counted write leaves the hour; `null` without a write |
| `parStationEtProjet` | The hour's calls, one line per project and kind of call: `{ station, projet, type, nombre }`, the biggest first |

The other fields the station publishes about GitHub, with their sources:

| Field | Where | What it holds |
|---|---|---|
| `faits.limiteGithub` | `runtime/src/etat.ts` | The instant (ISO) when the kitchen's calls resume after a hold; absent when calls pass |
| `faits.github` | `runtime/src/faits.ts`, from `github-limite.ts` | `{ limit, since, backAt }`: the limit GitHub named, since when, and when it returns (ISO); absent when calls pass |
| `status`, `github` line | `runtime/src/etat.ts` | The text of the entries above |
| `quotaUntil`, `quotaReason` | `runtime/src/projections/stations.ts` | **Not the GitHub quota.** The Max quota of the `claude` connection, which takes the station to `86` (see [`station-cook.md`](station-cook.md)) |

The per-account counter (the calls of the hour, the points, the writes) is in
`appels-github/compteur.db`; the refusals and the entries on the account are in `appels-github/limites.db`.

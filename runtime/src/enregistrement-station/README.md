# The station's registration under its GitHub account

*Ticket #1705, epic #1702.* Code: `contrat.ts` (the contract), `enregistrer.ts` (the station's side),
`stations-du-compte.ts` (the reader).

A station registers itself under the GitHub account its machine's `gh` is signed in to, the one signed
in at install time. It needs no pairing code and no gesture. The app, signed in to the **same account**,
lists that account's gists and finds the station there. This page is the contract that the app
(#1706, the station list and the project picker) and the station (#1707, serving the chosen projects)
build on.

## Where

One **secret gist** per station, owned by the account of the machine's `gh`. That ownership is what
puts the station "under" the account. A station is registered when one of the account's gists holds
the file **`brigade-enregistrement.json`**. The gist's description is
`brigade — station <name> (registration)`, for whoever looks at the account's gists by hand. The
reader never relies on it: it relies on the file.

The **gist id is the station's identity**: the app recognizes the station by it, and writes the
station's selection into the same gist.

This gist is separate from the gist of the station's presence and pairing (`runtime/src/appairage/`).
Neither one reads the other.

| File | Written by | Content |
|---|---|---|
| `brigade-enregistrement.json` | the station only | its registration, below |
| `brigade-selection.json` | the app only | the projects chosen for this station, below |
| `brigade-projets-suivi.json` | the station only | where each chosen project stands (#1707, `../projets-station/`) |

A gist write (`PATCH /gists/<id>`) replaces only the files it names. The station never names
`brigade-selection.json`, and the app never names `brigade-enregistrement.json`, so neither can erase
what the other wrote.

## What the station publishes

`brigade-enregistrement.json`:

```json
{
  "brigade": "station-registration",
  "format": 1,
  "name": "box",
  "platform": "linux",
  "machine": "Linux 6.1.0",
  "version": "1.4.0",
  "registeredAt": "2026-10-26T09:00:00.000Z",
  "lastSeen": "2026-10-26T09:42:00.000Z",
  "refreshMs": 120000,
  "stoppedAt": null
}
```

- `brigade`: always `station-registration`. `format`: `1`. A reader skips, as unreadable, a format
  higher than the one it knows.
- `name`: the station's name. It is `BRIGADE_STATION_NOM`, or else the machine's host name, the same
  name as on its presence.
- `platform`: `linux`, `macos` or `windows`. On any other system, Node's raw `process.platform`.
- `machine`: the system and its release, as a list shows them (`Linux 6.1.0`, `macOS 24.1.0`,
  `Windows 10.0.26100`).
- `version`: the runtime version it runs (`BRIGADE_STATION_VERSION`, set by its package; by default,
  the fingerprint of its code).
- `registeredAt`: the instant of its first registration. It does not move while the station keeps
  its gist.
- `lastSeen`: the instant of its last write, which is its sign of life.
- `refreshMs`: the period between two writes, `120000` (2 min).
- `stoppedAt`: the instant of its clean stop, or `null` while it runs.

The account is not written in the file. It is the gist's owner (`owner.login` in GitHub's answer).

## When it writes: registration and refresh

- **At start-up**, the station writes at once. With no gist yet, it creates one, and its service log
  says `brigade : station enregistrée sous le compte GitHub de sa machine — l'app connectée au même
  compte la voit (gist <id>)`. That log line stays in French until the runtime is translated.
- **Every `refreshMs` (2 min)**, it rewrites the file with a new `lastSeen` and `stoppedAt: null`.
  That is 30 gist writes an hour, which go through the station's GitHub call counter
  (`limite-github.ts`) like every gist call.
- **A failed write** is retried every minute (`NOUVEL_ESSAI_MS`). The service log says the failure
  once, and says once when GitHub answers again. This covers the install flow: the installer starts
  the station *before* the GitHub sign-in, so the first writes fail with no account. The station
  registers itself at the first retry after the sign-in, within a minute, with no command to run.
  When GitHub's limit is reached, it waits for the end of the window.
- **What it keeps** from one run to the next is in `<BRIGADE_STATION_DIR>/enregistrement.json`: its
  gist and `registeredAt`. A restart therefore reuses the same gist, and so the same station for the
  app. **A gist deleted** on GitHub is replaced by a new one at the next write. That new gist is a new
  station for the app, with an empty selection.
- **A lost state directory** gives a new registration too. The old one stays on the account, shown
  unavailable, until its gist is deleted.

## Freshness: available or not

The reader judges, at the instant it reads (`disponible` in `contrat.ts`):

> **available** ⇔ `stoppedAt` is null or older than `lastSeen`, **and**
> `now − lastSeen ≤ 2 × refreshMs + 30 s`

- **A clean stop** (SIGTERM or SIGINT, the signals the station handles; `systemctl stop` and launchd send SIGTERM) writes
  `stoppedAt` at once. The station is **unavailable at the app's next read**.
- **A brutal stop** (machine off, process killed, network lost) writes nothing. The station becomes
  unavailable when its last sign of life is older than `2 × 120 s + 30 s = 270 s`. That is
  **at most 4 min 30 s** after its last write.
- **A restart** writes at once, with a new `lastSeen` and `stoppedAt: null`. The station is
  **available again at the app's next read**.

## How the app reads it

`stations-du-compte.ts` reads the stations with the `gh` of the computer it runs on. The app imports
`lireLesStationsDuCompte`, or runs `node runtime/src/enregistrement-station/stations-du-compte.ts`
(`BRIGADE_GH_BIN` names the `gh`). The command prints one JSON line, and exits with code 0 when the
stations are listed, 1 otherwise. The reader lists `/gists` page by page and keeps the gists that hold
`brigade-enregistrement.json`. It then reads each one with `/gists/<id>`, because a list carries no
file content. The answer is one of three states, never an empty list without a reason:

- `listed`: `stations`, sorted by name, each with `id` (the gist), `name`, `platform`, `machine`,
  `version`, `account` (the gist's owner, or null), `available`, `registeredAt`, `lastSeen`,
  `stoppedAt`, `refreshMs` and `selection` (the selected repositories, or `null` before the app
  writes any). `unreadable` lists the registrations the reader cannot read, with the reason. With no
  station, `reason` says why, in one sentence.
- `sign-in-required`: this `gh` is signed in to no account, or GitHub refuses its token. It carries
  `reason` and `action`, the sign-in command (`gh auth login --hostname github.com --web
  --git-protocol https`).
- `unavailable`: any other failure. It carries `cause` (`gh-missing`, `network`, `timeout`,
  `rate-limit`, `github`), `reason`, `link` when a page fixes it, and `detail`, what `gh` said.

The last two states, and their wording, are those of the paired stations' reader
(`appairage/stations-du-chef.ts`), whose `gh` failure judgment this reader reuses.

## The selection the app writes

`brigade-selection.json` is written by the app (#1706) into the station's registration gist. The
station reads it every 30 s and serves exactly those projects (#1707,
[`../projets-station/README.md`](../projets-station/README.md)). It answers with its tracking of
each project, `brigade-projets-suivi.json`, in the same gist.

```json
{
  "brigade": "station-selection",
  "format": 1,
  "repositories": ["acme/shop", "acme/site"],
  "updatedAt": "2026-10-26T09:45:00.000Z"
}
```

- `repositories`: the `<owner>/<repo>` the station must serve. The list is the whole selection, and
  an empty list means "serve nothing". The app writes the whole file at each change.
- `updatedAt`: the instant the app wrote it.
- `selectionLue` (`contrat.ts`) reads it, removes duplicates, and returns `null` for an unreadable
  file or a format it does not know. The reader's `selection` field is what this function returns.

## Not done here

- The pairing by code (`runtime/src/appairage/`) still runs alongside, and still prints its code in
  the service log. The app stops needing it once it reads this registration (#1706). Removing it is
  left to a later ticket.
- Serving the selection is done by `runtime/src/projets-station/` (#1707).

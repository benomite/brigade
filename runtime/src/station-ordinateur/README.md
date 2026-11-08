# A computer's station serves its chosen projects straight from GitHub

*Ticket #2357, epic #2356.* Code: `projets-servis.ts` (the served-projects list), `servir.ts` (the
turn), `cli.ts` (the command that reads and writes the list). Wired in `station/main.ts`.

A computer's station (the chef's MacBook, say) used to ask for work through a GitHub claim
relayed to the project's log by another station (a relay deleted by #2061). On the GitHub-only state
no log reads that claim any more, so it cooked nothing. Now it serves the projects of its own list
the way the box serves its own: for each one it clones the project into its own places and runs
the box's GitHub-only turn (`brigade-github.ts`, `stationDuDepot`) under its own name — it takes,
cooks, reviews and merges the tickets, with no relay through another station and no project log.

## The served-projects list

Stored in the station's local state: `<BRIGADE_STATION_DIR>/projets-servis.json`.

```json
{ "brigade": "projets-servis", "format": 1, "depots": ["acme/shop"] }
```

- **A fresh install has no file**: the list is empty, and the station serves nothing. Its service log
  says so once: `brigade : station <machine>/claude — no project is chosen for this station: it serves none`.
- **Read and write it** through `lireProjetsServis`, `ajouterProjetServi`, `retirerProjetServi`
  (the app's chooser will use them), or the command:

  ```sh
  BRIGADE_STATION_DIR=<dir> node runtime/src/station-ordinateur/cli.ts list            # → []
  BRIGADE_STATION_DIR=<dir> node runtime/src/station-ordinateur/cli.ts add acme/shop   # → ["acme/shop"]
  BRIGADE_STATION_DIR=<dir> node runtime/src/station-ordinateur/cli.ts remove acme/shop
  ```

  Each prints the resulting list as JSON. A repository that gives no project name, or an unreadable
  file, is refused (exit code 2) and nothing is written. Each write replaces the file at once, so the
  list survives a station restart.

## The turn

Every **2 minutes** (the box's interval), and at once on `SIGHUP`, the station rereads the list:

- **a project added** is cloned into the station's places (`lieuxDuProjet`, the same atelier as its
  other projects), its integration branch is read on the clone (`.claude/brigade/projet.json`, the
  “Branche d'intégration” line of its `CLAUDE.md`, or else the repository's default branch), and its
  GitHub-only turn opens: `serves acme/shop from GitHub only, under its own name …`;
- **a project removed** takes no new ticket from that turn on; its cooks in flight finish and deliver;
- **each served project** then runs one GitHub-only turn. The log says it under the station's name,
  `brigade : station mac/claude — GitHub-only turn on acme/shop: cooking #7`, whenever what it says
  changes.

The station's name is `<machine>/claude`, the one its claims and verdicts carry on the issues. Its
claims are on GitHub (`github-etat/prise.ts`): two stations never take the same ticket. After a
fact of the pass, the next turn comes within 30 s, as on the box; after one that makes a ticket
claimable or a delivery to review — a merge, a delivery, a cook given back — it comes at once, as on the
box too (#2802). The
loop used to drop that "at once" and wait the 30 s: every ticket so freed waited that much more for its
claim, after the end of the running turn if the fact fell during it (#2832,
[diagnosis](../../../docs/runtime/claim-wait-2026-11-07.md)).

A project that cannot be served this turn (clone failed, no integration branch, the sandbox not
usable on this Mac) is said once, and tried again at the next turn. A project this station already
serves through a kitchen of its configuration (`station/station.ts`) is not served a second time.

## What it does not have

The box's GitHub-only turn also holds the old path's guardrails — stop, breaker, quota, arbiter —
which read a project log (`github-seul/garde-fous/`). There is no log here, so they do not apply;
each cook is still held under its caps (`superviseur.ts`, `BRIGADE_MAX_MINUTES` and the like). On a
Mac, each `claude` runs in Claude Code's sandbox, as in a local kitchen (`bac-a-sable/local.ts`).

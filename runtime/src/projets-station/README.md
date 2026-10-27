# The station serves the projects chosen in the app

*Ticket #1707, epic #1702.* Code: `source.ts` (where the station reads what to serve), `selection.ts`
(the selection turned into the station's request). The contract it reads is in
[`../enregistrement-station/README.md`](../enregistrement-station/README.md).

The app, signed in to the same GitHub account as the station's machine, writes
`brigade-selection.json` in the station's registration gist: the whole list of repositories
(`<owner>/<repo>`) the station must serve. The station reads it there and serves exactly those
projects. Nothing is edited by hand, and the station is not restarted.

## The delay

The station rereads the selection **every 30 s** (`CADENCE_MS` of `projets/tenir.ts`), and at once on
`SIGHUP`. So:

- **A ticked repository** is taken in hand within **30 s** of the app's write. The station clones it,
  writes the project's decisions and opens its "Préparer le dépôt" ticket, then writes its line in its
  configuration. It serves it as soon as that is done: the clone's time, plus at most 2 s for the
  station to reread its configuration.
- **An unticked repository** leaves the station's configuration within **30 s**. Its kitchen closes
  at the station's next reread of its configuration (2 s): no cook leaves for it any more. Its state
  and its clone stay on the machine, so ticking it again picks up where it was.
- **A repository that declares no integration branch** (no `.claude/brigade/projet.json`, no
  "Branche d'intégration" line in its `CLAUDE.md`) is served on its default branch. That branch is
  read on its clone, so it is named at the read that follows the clone: **30 s** more.

## What the station makes of a repository

The selection carries repositories only. For each one, the station builds the same request as the
app's former "add a project" flow (`projets/demande.ts`), and `projets/tenir.ts` prepares and serves
it in the same way:

- **its name** is the one the app derives from the repository (`nomDuDepot`: the repository's name,
  lower case, with dashes). Two chosen repositories with the same name: the first in the list is
  served, the other is not, and the service log says so;
- **the station is its main station**: it runs its manager and its pass;
- **its cap of cooks** is the one derived from the machine's cores, `max(1, ⌊(cores − 2) / 2⌋)`
  (#1079);
- **the manager and reviewer calibration** is `sonnet` / `medium`, the measured starting value the
  app proposes too. A calibration the repository declares wins over it. The chef changes either with
  `station -- manager-modele …` and the like, as any decision.

These are written to the project's log once, as the chef's decisions. A decision already there is
never overwritten.

## Where the station answers

Its tracking of each project (`brigade-projets-suivi.json`: served, being prepared, refused and
why) goes into the same registration gist, next to the selection. The station writes only that file
and its registration there. It never writes `brigade-selection.json`.

## With no selection

- **The app has written no selection, or an empty one**: the station serves no project from the
  app. Its service log says it, and says it again every hour while that lasts, so that the service's
  status (`systemctl status`, or the service log on any system) always shows it:
  `brigade : station — aucun projet n'est choisi pour elle dans l'app : elle n'en sert aucun. Coche ceux qu'elle doit servir dans l'app, connectée au même compte GitHub que cette machine`
  (French until the runtime is translated). Its tracking in the gist lists no project.
- **A station paired by code** (`appairage/`) that has no selection keeps serving what the app asks
  through its pairing gist (`brigade-projets.json`), as before. Once the app writes a selection, the
  selection decides what the station is the main station of; the projects added to it from a
  project's page ("+ station": a line of the pairing request that does not call it the main
  station) are still read there, and the station joins their kitchen (#1830, `projets/rejoindre.ts`).
- **A station not registered yet** (its `gh` not signed in) changes nothing until its registration
  exists.
- **An unreadable selection** (not JSON, a format this station does not read) changes nothing to what
  the station serves. The service log says it once.

Lines written by hand in the station's configuration, outside the block the station holds, are never
touched: they are served whatever the selection says.

## Existing files touched

- `projets/tenir.ts`: the `source` option, so the request can come from somewhere else than the
  pairing gist (`demandeDeLAppairage` stays the default). The remedies answer in the gist the request
  was read from.
- `station/main.ts`: the station's request comes from `sourceDesProjets`.

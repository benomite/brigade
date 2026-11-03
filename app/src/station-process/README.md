# The station process, replaced on its own (#2190)

On a computer, the app runs this computer's station (`app/src/poste/station.ts`). The supervisor
here (`superviseur.ts`, `tenirProcessDeStation`) holds that process and can replace it with
another station release, with no reinstall, no Gatekeeper prompt and no app restart. The window,
the Second tabs, the shells and their `claude` sessions are processes of the app, not of the
station: a restart neither stops nor reattaches them.

## The contract with the station's updater (#2189)

| What | Where | Who writes it |
|---|---|---|
| The releases folder | the `BRIGADE_STATION_VERSIONS` variable the station receives — a folder in the app's user data, never inside the app bundle | the app |
| Release `X` | `<BRIGADE_STATION_VERSIONS>/<X>/`: a runtime folder, with `src/station/main.ts` and a `package.json` whose `version` is `X` | the station's updater, once downloaded and complete |
| The restart request | `<BRIGADE_STATION_DIR>/redemarrage`, `{"version":"X"}`, written in one go (write a temporary file, then rename) | the station's updater, once its cooks are drained |
| The outcome | `<BRIGADE_STATION_VERSIONS>/etat.json`: `{ retenue, ratees, derniere }` | the app |

- **The request carries a version, never a path.** The app only starts what is under its releases
  folder; a version that is not a plain release number (`../…`) is ignored, and said.
- The app that runs the station reads the request about every two seconds, deletes it, and
  restarts the station on `X`. Requests are not queued: one that arrives during a restart waits
  for the next look.
- **A release is kept** when the station says it is in service in `X` (`en-service`, written by
  `runtime/src/mise-a-jour/en-service.ts`: version `X`, a new and live pid, `depuis` after the
  restart) and still serves the projects the previous release served — the box's rule
  (`runtime/src/mise-a-jour/mettre-a-jour.ts`). It then becomes `retenue`, and the app reopened
  starts on it, unless its own bundle carries a newer runtime.
- **Otherwise the previous release runs again** — it refused to start (code 2), it died right
  after its launch, or it did not say it was in service within two minutes. `derniere` reads
  `{"quoi":"revenue","visee":"X","restauree":"<previous>","motif":"…","retour":null}` (`retour`
  says why the previous one did not start either), and `X` goes into `ratees`: it is not tried
  again, a later release is.
- A request that is not played — already on `X`, `X` failed before, `X` not downloaded — leaves the
  running station untouched; `derniere` reads `{"quoi":"refusee","visee":"X","motif":"…"}`.

`derniere`, `retenue` and `ratees` are what the station screen (#2191) can show.

## Not done here

`app/src/main.ts` still calls `tenirStationLocale` directly: the supervisor has the same surface
(`etat`, `tourne`, `arreter`) plus `version()`, `redemarrer(X)` and `etatDesVersions()`, and takes
`embarque` (the bundle's runtime entry point) and `versions` (the releases folder) in place of
`principal`.

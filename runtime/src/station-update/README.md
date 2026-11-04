# The computer's station updates itself

*Ticket #2189, epic #2182.* Code: `mettre-a-jour.ts` (the updater), `releases.ts` (where the versions
are), `archive.ts` (extracting and checking a release), `statut.ts` (what it keeps on disk),
`main.ts` (the `status` command).

The box already takes each `station-<version>` release through `brigade-station-mise-a-jour.timer`
(`../mise-a-jour/`): apt installs the package and restarts the station. The station the app runs on a
computer has no apt and no systemd. It updates itself: it downloads the release into its own
directory, so the app is not reinstalled, then asks the app to restart it on that release.

## When it runs

Only on the computer's station:

| Environment | What the updater does |
|---|---|
| `BRIGADE_MISE_A_JOUR_DIR` set | nothing: this is a box, its systemd unit updates it |
| `BRIGADE_MISE_A_JOUR_SOURCE` unset | nothing: nothing says where the versions are |
| `BRIGADE_MISE_A_JOUR_SOURCE` set, `BRIGADE_STATION_RELANCE` unset | it checks and reports `behind`; it downloads nothing and never drains |
| both set, `BRIGADE_STATION_RELANCE=app` | it checks, downloads, drains and asks for its restart |

`BRIGADE_MISE_A_JOUR_SOURCE` is the box's: `github:<owner>/<repo>` (the releases `station-<version>`,
neither draft nor prerelease) or the path of a directory (one sub-directory per version, the archive
inside). `BRIGADE_STATION_RELANCE=app` is the app's promise that it honours the restart request below:
an app that does not set it never sees its station stop taking tickets.

Cadence: the box's — a first check two minutes after start, then ten minutes after each check, give or
take a minute (`tenirLaMiseAJour`).

## What it downloads

The release's runtime for the platform, as `publier-station.yml` publishes it:
`brigade-station-mac.tar.gz` on macOS, `brigade-station-windows.zip` on Windows (Linux has none: the box
takes the Debian package). Its sha256 is checked against the digest GitHub publishes, it is extracted
by `tar`, and it is kept only if its `runtime/package.json` says the release's version and it carries
`runtime/src/station/main.ts`. It lands in

```
<BRIGADE_STATION_DIR>/station-update/releases/<version>/runtime/
```

Only the target release and the running one (if it came from there) are kept. A check or a download
that fails — network down, a bad digest, an archive that does not extract, a runtime of another
version — leaves the running station untouched: no drain, no request; `check` says why, and the next
check tries again.

## Draining: no cook is cut

Once the release is ready, the station drains: it takes no new ticket (`retenue()` is true, and
`retenirLaPrise` makes a GitHub-only station's claim say "not taken" without writing on the issue), and
waits until no cook is in flight (`enVol()` is empty). Then it asks for its restart, once.

A ticket the station still holds without a cook (one whose cook failed to hand it back, for example)
is handed back on GitHub by the restarted station at its first round, exactly as after a box update
(`../brigade-github.ts`, the first round's `taken` without a cook here).

## The restart request

Once drained, the station writes

```
<BRIGADE_STATION_DIR>/station-update/restart.json
{ "version": "<release>", "runtime": "<…>/releases/<release>/runtime",
  "main": "<…>/releases/<release>/runtime/src/station/main.ts", "from": "<running version>", "at": "<ISO instant>" }
```

and prints one line on its output, which the app already reads:

```
brigade: station update — restart with release <release>: <main>
```

(`LIGNE_DE_RELANCE` matches it.) The file is authoritative; the line is the nudge. The app then stops
the station as it does on close (its input closed) and launches `main` instead of its bundled entry
point, with the same environment. If the new station does not start, the app relaunches `from`. A
station that starts removes any earlier `restart.json`.

## The status

`<BRIGADE_STATION_DIR>/station-update/status.json`, rewritten at each change, and printed by
`node src/station-update/main.ts status`:

| Key | Meaning |
|---|---|
| `stationVersion` | the running version (its runtime's `package.json`) |
| `latestStationVersion` | the newest published version at the last successful check; `null` before any |
| `behind` | `latestStationVersion` is newer than `stationVersion` |
| `checkedAt` | the last check |
| `check` | why the last check or download failed; `null` when it worked |
| `held` | why a newer release waits without failing (nothing restarts this station) |
| `ready` | the release downloaded and checked |
| `draining` | `{ since, cooks }` while draining: the tickets whose cooks are still in flight |
| `restart` | the restart request, once made |

A station restarted on the release says its new version at once: `behind` turns false.

A running version that is not a station release's (`0.<YYYYMMDD>.<HHMMSS>+g<commit>`) is behind any
published release: the runtime the app bundles carries the app's version (`1.0.82`), a clone's says
`0.0.0`, and a station release is published at every runtime change the app could bundle.

## Still to wire

The updater is a module: the station's entry point (`../station/main.ts`) opens it with
`ouvrirLaMiseAJour({ racine, env, enVol, dire })`, gives it its cooks in flight across its kitchens,
and wraps each kitchen's claim with `retenirLaPrise(prise, miseAJour.retenue)`. The app side (reading
the request, relaunching on `main`, showing `behind`) is the app's tickets.

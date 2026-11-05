# scripts/app-release — does this merge publish a new app version?

`decider.ts` takes the files a merge changed and the existing app tags, and says whether the app changed and which `app-v<version>` tag the merge publishes.

```
git diff --name-only <before> <after> | node scripts/app-release/decider.ts --tag app-v1.2.3 --tag app-v1.2.2
```

Output (lines a workflow can append to `$GITHUB_OUTPUT`):

```
changed=true
tag=app-v1.2.4
```

or just `changed=false`.

**The rule.** The app changed when at least one changed file is under `app/` and not under `app/test/`. `runtime/`, `docs/`, `evals/`, `scripts/` and `app/test/` alone do not count.

**The version.** The patch number of the highest `app-v<major>.<minor>.<patch>` tag, plus one. The format and the comparison are the app's own update check (`app/src/mise-a-jour/flux.ts`, imported by the script and its tests). With no such tag, the starting version is `1.0.0` (`VERSION_DE_DEPART`). Minor and major bumps are made by pushing the tag by hand.

**Tests.** `npm --prefix scripts/app-release test` (Node 26, nothing to install).

## Packages and release notes — `paquets.ts`

`paquets.ts` knows the packages of a release and the platform of each: the app (`Brigade-<v>-mac-arm64.dmg`, `Brigade-<v>-windows-x64-setup.exe`, and on the unsigned path `Brigade-<v>-android.apk`) and the station (`installer-station.sh`, `brigade-station-linux-amd64.deb`, `brigade-station-mac.tar.gz`, `installer-station.ps1`, `brigade-station-windows.zip`; the station runs on Linux and macOS, both installed by `installer-station.sh`, and on Windows, installed by `installer-station.ps1`). The station's `installer-station.sh`, `installer-station.ps1`, `brigade-station_amd64.deb`, `brigade-station-mac.tar.gz` and `brigade-station-windows.zip` keep their names, which the install command, the script and the running stations read, so the `.deb` is published twice.

```
node scripts/app-release/paquets.ts notes --produit app --version 1.0.3 [--signe] [--commit <sha>]   # dry run: prints the release notes
node scripts/app-release/paquets.ts renommer --version 1.0.3 --dossier <dir>                         # build names -> release names
```

The notes are a table: package, platform, what it is, and the steps to open it when unsigned (Gatekeeper on Mac, SmartScreen on Windows, the executable bit on Linux, unknown apps on Android). `publier-app` and `publier-station` run it and hand the output to `gh release create --notes-file`.

## Publishing — `publier.sh`

`publier-app` hands the renamed files to `publier.sh <app-v…> <notes.md> <file>...`, run in their folder with `GH_TOKEN`, `GH_REPO` and `GITHUB_SHA`. With no release for the tag, `gh release create` makes it on `GITHUB_SHA`, as latest. A release already there is completed and published, whether it is published (a re-run: its files and notes are replaced) or a draft (an earlier attempt whose draft `gh` could not delete). A refused attempt is tried again, 4 times with a pause of 30 s doubled each time (`BRIGADE_PUBLIER_ESSAIS`, `BRIGADE_PUBLIER_PAUSE`). The last failure writes `gh`'s own error as an `::error::` annotation: the run page shows annotations without signing in, while a job's log needs admin rights on the repository (#2521).

**Tests.** `npm --prefix scripts/app-release test` plays it against a fake `gh`.

## Retention

The releases page keeps the 5 latest app releases and the 5 latest station releases, tags included. `garder-les-dernieres.sh <app-v|station-> <n> [--simuler]` deletes the older ones (`gh release delete --cleanup-tag`); `publier-app` and `publier-station` run it after each publication, and the `retention-releases` workflow (run by hand) purges the backlog. A box more than 5 versions behind cannot reach the next one: it must be reinstalled from the page.

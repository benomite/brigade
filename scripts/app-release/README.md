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

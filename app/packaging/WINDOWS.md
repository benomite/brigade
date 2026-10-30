# The Windows installer

A single `.exe` for Windows x64. Opened on a PC with no Node and no clone of the repository, it
installs the app for the current account, with no administrator rights, adds a **Brigade** entry to
the Start menu and an uninstaller, and the app opens on its main screen. Like the Mac app, it
carries the runtime of its station and the `node.exe` that runs it. The Mac `.dmg` is described in
[`README.md`](README.md). This page covers what the installer carries, how it is built and how to
try it.

The installer is **not signed** (#1157). The installed app **updates itself** from the `app-v<version>`
releases that carry this installer and its `latest.yml` (#1156, [`docs/app.md`](../../docs/app.md),
"Updating it"). The [`publier-app`](../../.github/workflows/publier-app.yml) workflow builds and
attaches both on every merge on `main` that changes the app, next to the Mac's files
([`README.md`](README.md), "Publier").

## Build

From a clone, on Linux, macOS or Windows, with Node 26 and network access, one command:

```sh
node app/packaging/windows.ts
```

It writes **`app/packaging/construit/Brigade-<version>-x64-setup.exe`** (ignored by git), with
`latest.yml` next to it, and prints its path:

```
brigade: Windows installer built — app/packaging/construit/Brigade-0.20261021.064841+g0b93978-x64-setup.exe (version 0.20261021.064841+g0b93978, x64, not signed; updater metadata app/packaging/construit/latest.yml)
```

Nothing else needs to be installed first. If one of the app's dependencies is missing (a clean
clone), the command installs them (`npm ci --ignore-scripts` in `app/`, without the Electron binary).
Then it downloads what it bundles, and checks each download:

| What | From | Checked against |
|---|---|---|
| Electron for win32-x64, at the version the app declares | GitHub, through `@electron/get` (Electron's cache keeps it) | the checksums shipped in Electron's npm package |
| the official `node.exe` for win-x64, at the version of the `node` running the command | nodejs.org (`win-x64/node.exe`) | its `SHASUMS256.txt` |
| NSIS 3.12, which writes the installer: `makensis` built for Linux, macOS and Windows, and the Windows files it assembles (including the WinShell plugin) | the `nsis@2.0.2` release of `electron-userland/electron-builder-binaries` on GitHub | the SHA-256 pinned in `windows.ts` (`NSIS`) |

The build takes a few minutes: most of the time goes to the LZMA compression of about 400 MB.

| Option (`node app/packaging/windows.ts <option>`) | Without it |
|---|---|
| `--version <v>` | `0.<YYYYMMDD>.<HHMMSS>+g<commit>`: the date (UTC) and hash of the commit built, as for the `.dmg`. Up to three numbers separated by dots, then optionally `+` and anything |
| `--sortie <folder>` | `app/packaging/construit/` |
| `--electron <zip or folder>` | Electron for win32-x64, downloaded (above). A folder must hold `electron.exe` at its root |
| `--node <node.exe>` | the official `node.exe`, downloaded (above). A given one must be a Windows x64 executable |
| `--nsis <.tar.gz or folder>` | the NSIS bundle, downloaded (above). Use `nsis-bundle-3.12.tar.gz` or its extracted `nsis-bundle/` folder |

Exit codes: 0 built, 1 the build failed (the message names the step), 2 refused (an invalid option,
a missing or wrong `--node`). On a refusal, nothing is written.

**The name and location are deterministic.** For a given `--version`, the installer is always
`<sortie>/Brigade-<version>-x64-setup.exe`, and `latest.yml` sits next to it. CI picks it up by that
name. The `installeur` job of [`app-windows`](../../.github/workflows/app-windows.yml) builds it with
`--version 0.0.1`.

## What it installs

The app goes into `%LOCALAPPDATA%\Programs\Brigade` (silently, `/D=<folder>` installs it
elsewhere):

| Path in the installed folder | What |
|---|---|
| `Brigade.exe`, its DLLs, `.pak` files, `locales/` | the official Electron for win32-x64, as is, with `electron.exe` renamed `Brigade.exe` |
| `resources/app/` | `src/`, the app's `package.json` (named `Brigade`, at the built version, without scripts or dev dependencies) and its production dependencies. node-pty keeps only its win32-x64 build, without debug symbols (`.pdb`) |
| `resources/runtime/` | `src/` and `package.json` of the runtime, at the built version |
| `resources/node/bin/node.exe` | the `node` that runs the station |
| `Uninstall Brigade.exe` | the uninstaller |

It also adds:

- **a Start menu shortcut**, `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Brigade.lnk`, to
  `Brigade.exe`. It carries the AppUserModelID the app gives itself (`process.execPath`,
  `app/src/main.ts`). Windows shows an app's notifications only when a Start menu shortcut carries
  that ID.
- **an entry in Settings → Apps → Installed apps**, through the key
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.github.benomite.brigade`: name,
  version, publisher, size, and the uninstall command (`QuietUninstallString` adds `/S`).

The installed app finds everything through `app/src/emplacements.ts`, unchanged. It knows it is
installed because its sources are `resources\app\src`. It runs the station with
`resources\node\bin\node`: Windows adds `.exe` to that name when it launches it. That folder goes
last on the PATH the app passes to what it runs. Projects and settings are those of
`~/.config/brigade/`, as for the app launched from the repository.

Installed over a previous version, the installer first removes what it installs (each top-level
entry of the folder, by name), then copies the new one, so no file of the old version is left.
The app must be closed first: Windows does not let a running `.exe` be replaced.

**The uninstaller** (`Uninstall Brigade.exe`, or *Uninstall* in Installed apps, `/S` for a silent
run) removes the Start menu shortcut, each entry the installer laid, itself, the folder if it is now
empty, and the uninstall key. It never removes the folder as a whole, so an install placed elsewhere
with `/D=` takes nothing else with it. It does not remove the chef's projects and settings
(`~/.config/brigade/`): they do not belong to the app.

## Try it

The tests (`app/test/packaging/windows.test.ts`) need no network and no Windows. They check:

- the folder the installer copies: Electron renamed, the app and its production dependencies,
  node-pty for win32-x64 only, the runtime, `node.exe`;
- that the installed app finds its runtime and its `node.exe` there;
- the zip extraction of Electron;
- the NSIS script: per-account install, the shortcut and its ID, the uninstall key, and the entries
  removed;
- the command's refusals.

They do not run Windows. Set `BRIGADE_NSIS=<extracted nsis-bundle/>` to have the real `makensis`
also compile a script.

What only a Windows machine proves is checked by `app/packaging/essai-windows.ts`, played by the
`installeur` job of `app-windows` on every PR that touches `app/`:

```sh
node app/packaging/essai-windows.ts app/packaging/construit/Brigade-<version>-x64-setup.exe --capture essai.png
```

On a machine where Brigade is not installed, it runs these steps:

1. It runs the installer with `/S`.
2. It checks the installed files, the Start menu shortcut and where it points, and the uninstall key.
3. It opens the shortcut's target with no `node` on the PATH, on a fresh projects file, with
   `--remote-debugging-port`. Over the DevTools protocol, it waits until the view is loaded, its
   bridge is there and one of its screens is visible. `--capture` saves a picture of the window.
4. It closes the app, runs the uninstaller with `/S`, and checks that the folder, the shortcut and
   the key are gone.

It exits 0 when all of this holds. Otherwise it exits 1 and names the check that failed. The run
keeps the capture and the installer as artifacts for a week (`installeur-windows`).

By hand, on a PC with neither Node nor a clone, ideally a fresh account:

1. Copy the installer to the PC and open it. Windows SmartScreen warns about an unsigned app:
   *More info* → *Run anyway* (signing is #1157).
2. *Open Brigade* on the last page, or **Brigade** in the Start menu. The app opens on its main
   screen. Whether this PC then cooks as a station depends on the runtime running on Windows
   (#1153), not on the installer.
3. Settings → Apps → Installed apps → Brigade → *Uninstall*. The app and its Start menu entry are
   gone.

To read what the app and its station say, run `%LOCALAPPDATA%\Programs\Brigade\Brigade.exe` from a
terminal.

## What later tickets plug in

The build runs three separate steps in `windows.ts`: `assembler` lays out the folder, `scriptNsis`
writes the script, then `makensis` compiles it.

- **Signing (#1157).** Sign `Brigade.exe`, `resources\node\bin\node.exe` and node-pty's binaries in
  the assembled folder, before `makensis` packs them. Sign the uninstaller from the script with
  NSIS's `!uninstfinalize`, and the installer once it is written. The installer's name and location
  do not change.
- **Updates (#1156, done).** `latest.yml` is written next to the installer, in the format an
  electron-updater style updater reads: version, name, sha512 and size. The installed app reads it
  on the `app-v<version>` release, downloads the installer and runs it silently with
  `/S /D=<its folder>` once it has quit (`app/src/mise-a-jour/windows.ts`). The `publier-app`
  workflow attaches `Brigade-<version>-x64-setup.exe` and `latest.yml` to the same `app-v<version>`
  release as the `.dmg`. Signing goes in its "Signature (Windows)" step, before the release is
  published, and must rewrite `latest.yml` for the signed installer. The installer's name and
  location do not change.

The installed `Brigade.exe` keeps Electron's icon and version resource: nothing in the build
rewrites a Windows resource.

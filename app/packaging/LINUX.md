# The Linux AppImage

A single file for Linux x64, `brigade-<version>-linux-x64.AppImage`. Made executable, it opens the
app with nothing to install, no clone of the repository, and no Node on the machine. Like the Mac
app and the Windows installer, it carries the runtime of its station and the `node` that runs it.
The Mac `.dmg` is described in [`README.md`](README.md), the Windows installer in
[`WINDOWS.md`](WINDOWS.md).

The AppImage is **not signed**, and the app does not update itself from it: a newer version is
downloaded from the releases page and replaces the file.

## Build

On a Linux x64 machine, from a clone, with Node 26, network access, `mksquashfs` (the
`squashfs-tools` package) on the PATH, and what `node-gyp` needs to compile node-pty (`make`, a C++
compiler, `python3`; on Debian or Ubuntu, `build-essential`):

```sh
node app/packaging/linux.ts
```

It writes **`app/packaging/construit/brigade-<version>-linux-x64.AppImage`** (ignored by git), and
nothing else, and prints its path:

```
brigade: Linux AppImage built — app/packaging/construit/brigade-1.2.3-linux-x64.AppImage (version 1.2.3, x64, not signed)
```

If one of the app's dependencies is missing (a clean clone), the command installs them
(`npm ci --ignore-scripts` in `app/`, without the Electron binary). Then it downloads what it
bundles, and checks each download:

| What | From | Checked against |
|---|---|---|
| Electron for linux-x64, at the version the app declares | GitHub, through `@electron/get` (Electron's cache keeps it) | the checksums shipped in Electron's npm package |
| the official `node` for linux-x64, at the version of the `node` running the command | nodejs.org (`node-v<version>-linux-x64.tar.gz`) | its `SHASUMS256.txt` |
| the AppImage runtime (type 2) for x86_64, release `20251108` | the `AppImage/type2-runtime` release on GitHub | the SHA-256 pinned in `linux.ts` (`RUNTIME_APPIMAGE`) |

node-pty ships no build for linux-x64. The command compiles it in the app's tree with
`npm rebuild node-pty`, which runs `node-gyp`. node-pty is a Node-API module, so the build loads in
the app's Electron as it is.

| Option (`node app/packaging/linux.ts <option>`) | Without it |
|---|---|
| `--version <v>` | `0.<YYYYMMDD>.<HHMMSS>+g<commit>`: the date (UTC) and hash of the commit built, as for the `.dmg`. Up to three numbers separated by dots, then optionally `+` and anything |
| `--sortie <folder>` | `app/packaging/construit/` |
| `--electron <zip or folder>` | Electron for linux-x64, downloaded (above). A folder must hold `electron` at its root |
| `--node <binary>` | the official `node`, downloaded (above). A given one must be a Linux x64 binary |
| `--pty <pty.node>` | node-pty compiled by `npm rebuild` (above). A given one must be a Linux x64 binary |
| `--appimage-runtime <file>` | the AppImage runtime, downloaded (above). A given one must be a Linux x64 binary |

Exit codes: 0 built, 1 the build failed (the message names the step), 2 refused (an invalid option,
a missing or wrong `--node`, `--pty` or `--appimage-runtime`, a machine that is not Linux x64). On a
refusal, nothing is written.

**The name and location are deterministic.** For a given `--version`, the AppImage is always
`<sortie>/brigade-<version>-linux-x64.AppImage`. It is also the name the release carries
(`scripts/app-release/paquets.ts`).

## What it carries

An AppImage is the AppImage runtime, an executable that mounts what follows it, followed by a
squashfs of a folder (the AppDir). Its AppDir:

| Path | What |
|---|---|
| `AppRun` | what the AppImage runs: `brigade --no-sandbox`, with the arguments it was given |
| `brigade`, its `.so` and `.pak` files, `locales/` | the official Electron for linux-x64, with `electron` renamed `brigade`, without `chrome-sandbox` |
| `brigade.desktop`, `brigade.png`, `.DirIcon` | its desktop entry and its icon (`icones/Brigade-1024.png`) |
| `resources/app/` | `src/`, the app's `package.json` (named `Brigade`, at the built version, without scripts or dev dependencies) and its production dependencies. node-pty keeps its JavaScript and its `pty.node` for linux-x64, under `prebuilds/linux-x64/`, where node-pty loads it and where the app looks for it (`app/src/pty.ts`) |
| `resources/runtime/` | `src/` and `package.json` of the runtime, at the built version |
| `resources/node/bin/node` | the `node` that runs the station |
| `resources/plugin/commands/` | `dev.md` and `ask.md` from `commands/` (`app/src/plugin-app.ts`) |

**No Chromium sandbox.** Mounted by FUSE, the AppDir belongs to root: Chromium's SUID sandbox helper
(`chrome-sandbox`) cannot be setuid there, and where unprivileged user namespaces are refused
(Ubuntu 24.04), Electron would refuse to start. `AppRun` therefore starts the app with
`--no-sandbox`, and `chrome-sandbox` is not carried.

The app finds everything through `app/src/emplacements.ts`, unchanged: it knows it is installed
because its sources are `resources/app/src`, and it runs the station with `resources/node/bin/node`.
Projects and settings are those of `~/.config/brigade/`, as for the app launched from the repository.

## Run it

```sh
chmod +x brigade-<version>-linux-x64.AppImage
./brigade-<version>-linux-x64.AppImage
```

The AppImage runtime mounts the file with FUSE. Where FUSE is missing, `--appimage-extract-and-run` extracts it to a temporary folder and
runs it from there. Electron needs the desktop libraries of the machine (GTK 3, NSS, ALSA…), which a
desktop Linux has.

## Try it

The tests (`app/test/packaging/linux.test.ts`) need no network, no compiler and no screen. They
check the AppDir (Electron renamed, `AppRun`, the desktop entry, the app and its production
dependencies, node-pty for linux-x64 only, the runtime, `node`), that the installed app finds its
runtime and its `node` there, the compilation of node-pty and its failures, the single file written
(the runtime followed by the squashfs), and the command's refusals.

What only a Linux machine with a screen proves is checked by `app/packaging/essai-linux.ts`:

```sh
node app/packaging/essai-linux.ts app/packaging/construit/brigade-<version>-linux-x64.AppImage --capture essai.png
```

It checks that the file is an executable for Linux x64, runs it with no `node` on the PATH, on a
fresh projects file, with `--remote-debugging-port`, and waits over the DevTools protocol until the
view is loaded, its bridge is there and one of its screens is visible. `--capture` saves a picture of
the window. It exits 0 when all of this holds; otherwise it exits 1 and names the check that failed.
On a machine without a display, run it under `xvfb-run`.

## Publish

The [`app-release-linux`](../../.github/workflows/app-release-linux.yml) workflow runs after each
successful run of `publier-app` on `main`. It finds the `app-v<version>` release that run published
(none when the app did not change: it then builds nothing), checks out its tag, builds the AppImage
on an `ubuntu-24.04` runner with `--version <version>`, tries it with `essai-linux.ts` under
`xvfb-run`, and attaches it to the release next to the Mac and Windows files
(`gh release upload --clobber`). The run keeps the capture and the AppImage as artifacts for a week
(`app-linux`). Run by hand (`workflow_dispatch`), it completes the release named by its `tag` input,
or the latest app release.

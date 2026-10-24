# Installing the brigade app on your Mac

The brigade app is a window for your Mac: your projects in an icon bar, and a terminal in each.
It installs like any other app, without cloning the repo and without `node` or `npm`.

## What you need

- An **Apple Silicon** Mac (M1 chip or newer). Intel Macs are not covered for now.
- The tools the app calls on the Mac: `claude` (Claude Code) and `gh` (GitHub CLI), installed
  and logged in as usual. The app finds them through the `PATH` of your login shell.

Windows, mobile and Intel Macs are not covered yet.

## Where to download it

On the repo's releases page, **<https://github.com/benomite/brigade/releases>**. Take the latest
**"Brigade (Mac)"** release and download the **`Brigade-<version>-mac-arm64.dmg`** file attached to
it.

## Install

1. Open the downloaded `.dmg`.
2. Drag **Brigade** into the **Applications** folder.
3. Open Brigade from Applications.

The app is signed by an identified developer and notarized by Apple: it opens without the
"unidentified developer" alert.

## Your projects and settings

The app reads **`~/.config/brigade/`** as is: the projects and settings you already have, with
the app launched from the repo, show up identically. Nothing in it is moved, nothing is
rewritten.

## Updates

The installed app does not update itself. A new version is published as a new release: to
update, download the new `.dmg` and drag it into Applications, replacing the old one.

## Going further

The full tour of the app (the spaces, the home screen, the stations, adding a project) is in
[`app.md`](app.md), "Launching the app". The detail of what the `.dmg` carries and how it is built is
in [`app/packaging/README.md`](../app/packaging/README.md).

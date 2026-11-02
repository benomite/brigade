# Tutorial: install brigade on a Mac

This guide takes you from a bare Mac to the brigade app installed, opened and ready to run the **station** of your Mac. Your first ticket is the job of [`premier-projet.md`](premier-projet.md). Words (*station*, *cook*, *rail*…) are those of [`docs/glossary.md`](../glossary.md).

> **What was checked.** On an Apple-silicon Mac running macOS 26.6, release `app-v1.0.62` was downloaded (`Brigade-1.0.62-mac-arm64.dmg`, about 195 MB), its `.dmg` found to hold **Brigade** and the **Applications** shortcut, and the app inspected: arm64, ad hoc signature, Gatekeeper `rejected`. That Mac was **not clean** (`git`, `gh`, `claude` were there) and nobody went through the Gatekeeper dialogs. Steps 1–3 and the first-launch screens (6, 7) come from [`docs/installation.md`](../installation.md) and the release notes. If a screen differs, trust the screen and open an issue on [benomite/brigade](https://github.com/benomite/brigade).

## Prerequisites

- A **Mac with Apple silicon** (M1 or newer). Intel is not covered.
- A **GitHub account** and a **Claude Max subscription**: cooks run on your Max quota. An API key does not fit — the station refuses to start if `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` is set.
- `git`, `gh` (GitHub CLI) and `claude` (Claude Code), found through your login shell's `PATH`. No `node` or `npm` needed: the app carries its own.

## Steps

### 1. Check your tools

In **Terminal**, run `git --version; gh --version; claude --version`.

**You see**: one version line per tool. A `command not found` names a tool to install.

### 2. Install the missing ones

- `git`: `xcode-select --install`, or <https://git-scm.com/downloads>.
- `gh`: <https://cli.github.com>.
- `claude`: as Claude Code's own documentation says. Then reopen Terminal.

**You see**: step 1 now prints three versions.

### 3. Log in

Run `gh auth login`, then `claude` (use your **Max** account), and leave it with `/exit`.

**You see**: `gh auth status` says logged in, and `claude auth status` answers `"loggedIn": true`.

### 4. Download the app

On the **[releases page](https://github.com/benomite/brigade/releases/latest)**, the release marked “Latest” is the app, named **“Brigade `<version>`”** (tag `app-v<version>`). Download **`Brigade-<version>-mac-arm64.dmg`**.

**You see**: a file of about 190 MB in `Downloads`.

### 5. Install it

Open the `.dmg`, drag **Brigade** onto **Applications**, eject the image.

### 6. Open it the first time

The build is **unsigned** and Gatekeeper rejects it. Right-click **Brigade** in Applications, choose **Open**, then **Open** again. On **macOS 15 and later**, also go to **System Settings > Privacy & Security**, click **Open Anyway** next to the message about Brigade, and confirm.

**You see**: the Brigade window, on a first-run screen asking for your GitHub account and the project. Afterwards the app opens normally.

### 7. If a tool is reported missing

For `The GitHub CLI (gh) is not installed…` or `Git is not installed…`, install it (step 2), then **quit and reopen Brigade**: it reads the `PATH` at launch.

## What you get

- `Brigade.app` in `/Applications`; settings and projects live in `~/.config/brigade/`.
- **No daemon.** Once a project is added and started, this Mac plays a **station** — only while the app is open, under your `gh` and `claude`.
- Nothing else: no `node`, no service.

To check: `ls -d /Applications/Brigade.app`, the window shows the first-run screen, and `gh auth status` and `claude auth status` both say logged in.

## Next

- [`premier-projet.md`](premier-projet.md): add a project and cook its first ticket.
- [`docs/installation.md`](../installation.md): the Windows variant and troubleshooting.

## Updating

The app does not update itself: download the new `.dmg` and drag **Brigade** over the old one.

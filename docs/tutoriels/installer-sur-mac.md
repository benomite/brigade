# Tutorial: install brigade on a Mac

This guide takes you from a Mac with nothing on it to the brigade app installed, opened, and running
the **station** of your Mac. It stops there: your first ticket is the job of
[`premier-projet.md`](premier-projet.md). Brigade lives in
[benomite/brigade](https://github.com/benomite/brigade); the words (*station*, *cook*, *rail*…) are
those of [`docs/glossary.md`](../glossary.md).

> **What was checked, and what was not.** On a Mac with Apple silicon (M-series) running
> macOS 26.6, the release `app-v1.0.62` was downloaded (step 4: `Brigade-1.0.62-mac-arm64.dmg`,
> about 195 MB), its `.dmg` opened and found to hold **Brigade** next to the **Applications**
> shortcut (step 5, copied to a scratch folder rather than to Applications), and the app inside it
> inspected: arm64, ad hoc signature, and Gatekeeper answers `rejected` (step 6). The Mac was **not a
> clean one**: `git`, `gh` and `claude` were already installed there, and nobody opened the app
> through the Gatekeeper dialogs. So the steps that depend on a bare machine (1 to 3, installing the
> tools) and the screens of the first launch (6 and 7) are written from
> [`docs/installation.md`](../installation.md) and the release notes, not from a recorded run from a
> clean state. If a screen differs from what is written here, trust the screen and open an issue on
> [benomite/brigade](https://github.com/benomite/brigade).

## Prerequisites

- A **Mac with Apple silicon** (M1 or newer). Intel Macs are not covered.
- A **GitHub account**, and a **Claude Max subscription**: every cook runs on your Max quota. An API
  key does not fit — the station refuses to start if `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`
  is set in its environment.
- Three tools the app calls, found through the `PATH` of your login shell: `git`, `gh` (the GitHub
  CLI) and `claude` (Claude Code). The next section installs them if you lack them.
- You do **not** need `node` or `npm`: the app carries its own.

## Steps

### 1. Check which tools you already have

Open **Terminal** (Spotlight: `Terminal`) and run:

```sh
git --version; gh --version; claude --version
```

**You see**: one version line per tool. A `command not found` (or, for `git`, the macOS offer to
install the command line developer tools) names a tool to install in the next step.

### 2. Install the missing tools

- `git`: run `xcode-select --install` and accept the dialog, or download it from
  <https://git-scm.com/downloads>.
- `gh`: download it from <https://cli.github.com>.
- `claude`: install Claude Code as its own documentation says, then reopen Terminal.

**You see**: the command of step 1 now prints three version lines.

### 3. Log in to GitHub and to Claude

```sh
gh auth login
claude
```

Follow each login in your browser; for Claude, use your **Max** account. Leave `claude` with `/exit`.

**You see**: `gh auth status` says you are logged in, and `claude auth status` answers
`"loggedIn": true`.

### 4. Download the app

Open the **[releases page](https://github.com/benomite/brigade/releases)**. Take the most recent
release named **“Brigade `<version>`”** (tag `app-v<version>`) — not a “Station” release, even if it
carries the “Latest” mark. Download **`Brigade-<version>-mac-arm64.dmg`** from its files.

**You see**: a file of about 190 MB in your `Downloads` folder.

### 5. Install the app

Open the `.dmg`, then drag **Brigade** onto the **Applications** shortcut shown in the same window.
Eject the disk image.

**You see**: **Brigade** in your **Applications** folder.

### 6. Open it the first time

The build is **unsigned** (signed ad hoc, no Apple developer identity): Gatekeeper rejects it, which
was confirmed on macOS 26.6 (`spctl` answers `rejected`). To open it:

1. In **Applications**, right-click **Brigade**, choose **Open**, then **Open** again.
2. On **macOS 15 and later** that is not enough: open **System Settings > Privacy & Security**,
   scroll to the message about Brigade and click **Open Anyway**, then confirm.

**You see**: the Brigade window. With no project yet, it opens on a first-run screen asking for
your GitHub account and the project to work on. Opened this way once, the app opens normally
afterwards.

### 7. Reopen it if it says a tool is missing

If the screen says `The GitHub CLI (gh) is not installed on this computer…` or `Git is not
installed…`, install the tool (step 2) and **quit and reopen Brigade**: it reads your login shell's
`PATH` when it launches.

## What you get at the end

- **The app**, `Brigade.app`, in `/Applications`, open on its first-run screen. Its settings and
  projects live in `~/.config/brigade/`, outside the app.
- **No daemon.** Once you add a project and start its kitchen, this Mac plays a **station** — but only
  while the app is open: close the app and the cooks stop. It works under your account, with your
  `gh` and your `claude`.
- Nothing else is installed: no `node`, no service, no background process.

To check it:

- `ls -d /Applications/Brigade.app` prints the path.
- The Brigade window is open and shows the first-run screen (or, once you have a project, its
  icon bar).
- `gh auth status` and `claude auth status` both say you are logged in.

## Next

- [`premier-projet.md`](premier-projet.md): add a project and cook its first ticket.
- [`docs/installation.md`](../installation.md): the same path with the Windows variant and a
  troubleshooting section.

## Updating

The unsigned app does not update itself. To update, download the new `.dmg` and drag **Brigade**
over the old one in Applications.

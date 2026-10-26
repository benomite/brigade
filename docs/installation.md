# Install brigade and cook your first ticket

This guide takes you from nothing to a first ticket of **your own project**, cooked and delivered
as a pull request. It is written for someone who has never installed brigade: you need nothing but
this page. The words (*cook*, *rail*, *station*, *pass*, *served*…) are those of
[`glossary.md`](glossary.md).

Brigade is a team of agents that works your GitHub tickets. You write a ticket and put the label
`fire` on it; a **cook** (a `claude` session) works it in its own worktree and opens a pull request;
the **pass** judges that pull request and merges it. The app shows all of it.

> **Status.** Every command, menu name and screen text below was checked against the code (the
> list is at the end, "What was checked"). The path has **not** been replayed end to end on a clean
> machine by a person: if a screen differs from what is written here, trust the screen, and open an
> issue on [benomite/brigade](https://github.com/benomite/brigade).

## What you need

| What | Why |
|---|---|
| **A GitHub account**, and a repository on it that you can push to and merge in (your own, or one of an organization where you are an owner). For a first run, use a **throwaway repository** with a `README.md` on its default branch | the cooks push branches there; the pass merges there |
| **A Claude Max subscription** | every cook, every judgment of the manager and every review runs on your Max session: your quota is what gets consumed. **An API key does not fit**: the station refuses to start if `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` is set in its environment |
| **Your own machine** — see the table below | it runs the app, and the station that makes the cooks work |
| **`git`, `gh` (the GitHub CLI) and `claude` (Claude Code)** installed on that machine | the app finds them through your shell's `PATH`; `gh` and `claude` must be logged in (steps below) |

Supported systems:

| System | What you install | Section |
|---|---|---|
| **Mac**, Apple silicon (M1 or newer) | the app, a `.dmg` | [On a Mac](#on-a-mac) |
| **Windows**, 64-bit (x64) | the app, a `.exe` installer | [On Windows](#on-windows) |
| **Linux**, Debian 12 or newer and derivatives (Ubuntu…), with systemd | the **station** (the part that cooks), a `.deb`. There is no Linux desktop app: you drive it from the app of a Mac or a Windows PC | [On Linux](#on-linux) |

Not covered: Intel Macs, 32-bit or ARM Windows, a desktop app on Linux. (An Android app exists in
the releases; it only drives, it does not cook, and is not part of this guide.)

## Get the packages

All packages are on the repository's releases page, **<https://github.com/benomite/brigade/releases>**.
Each release says, in a table, which platform each file is for and how to open it when it is
unsigned.

- The **app** is in the releases named **“Brigade `<version>`”** (tag `app-v<version>`). Take the
  most recent one. Its files carry the platform in their name:
  `Brigade-<version>-mac-arm64.dmg`, `Brigade-<version>-windows-x64-setup.exe`.
  These releases are not marked “Latest”: that mark belongs to the station's releases. Scroll to the
  newest “Brigade” one.
- The **station** is in the releases named **“Station `<version>`”**:
  `brigade-station-linux-amd64.deb` and `installer-station.sh` (Linux and macOS), and
  `installer-station.ps1` (Windows), with the runtimes these scripts set up.

The builds are **unsigned** (the table of the release says so): your system warns you the first time
you open one. The steps are in each section below, and they are the same as in the release notes.

## On a Mac

1. **Download** `Brigade-<version>-mac-arm64.dmg` from the [releases page](https://github.com/benomite/brigade/releases)
   (a “Brigade” release).
2. **Install it**: open the `.dmg`, drag **Brigade** into **Applications**.
3. **Install the tools** the app calls, if you do not have them: `git`, `gh` (<https://cli.github.com>)
   and `claude` (Claude Code). Log in to Claude with your Max account: run `claude` once in Terminal
   and follow its login. You do not need `node` or `npm`: the app carries its own.
4. **Open it the first time, because it is unsigned.** Gatekeeper blocks it. In **Applications**,
   **right-click Brigade, choose Open, then Open again**. On **macOS 15 and later**, that is not
   enough: open **System Settings > Privacy & Security** and click **Open Anyway**. Once opened this
   way, it opens normally afterwards.
5. Go to [Your first ticket](#your-first-ticket).

The app reads and writes `~/.config/brigade/` (your projects and settings). It does not update
itself to an unsigned build: to update, download the new `.dmg` and drag it over the old one.

## On Windows

1. **Download** `Brigade-<version>-windows-x64-setup.exe` from the [releases page](https://github.com/benomite/brigade/releases)
   (a “Brigade” release).
2. **Install the tools** the app calls, if you do not have them: **Git for Windows**
   (<https://git-scm.com/downloads>), `gh` (<https://cli.github.com>) and `claude` (Claude Code).
   Git for Windows matters twice: the app opens **its `bash`** in its terminals when it finds it
   (otherwise PowerShell), and `claude` itself asks for it. Log in to Claude with your Max account:
   run `claude` once and follow its login. You do not need `node` or `npm`.
3. **Run the installer, because it is unsigned.** Windows **SmartScreen** warns about an unknown app:
   click **More info**, then **Run anyway**. The installer installs the app for your account only,
   with no administrator rights, into `%LOCALAPPDATA%\Programs\Brigade`, and adds **Brigade** to the
   Start menu.
4. **Open Brigade** from the Start menu.
5. Go to [Your first ticket](#your-first-ticket).

A shell in the app's terminals ends with its terminal on Windows (there is no `tmux` there): the app
says so.

The app runs this PC's station while it is open. To keep the station running when the app is
closed, one PowerShell command installs it under your account, with its GitHub and Claude
connections: `irm https://github.com/benomite/brigade/releases/latest/download/installer-station.ps1 | iex`
— the detail is in [`installation-station.md`](installation-station.md#on-windows).

## On Linux

Linux runs the **station**: the service that makes the cooks work. It is installed on a Debian 12+
(or Ubuntu) machine with systemd — a real machine or a VM, not a container —, `amd64` or `arm64`,
where you have `sudo` once, with `/var/lib` on a local disk (`df -T /var/lib` shows neither `nfs`
nor `cifs`). The app that you look at it with is the one of a Mac or a Windows PC.

1. **Download.** The command below downloads `brigade-station` from the latest **Station** release
   for you. To do it by hand, take `brigade-station-linux-amd64.deb` or `installer-station.sh` from
   the [releases page](https://github.com/benomite/brigade/releases).
2. **Run it.** The `.deb` has no executable bit to set: `sudo apt install ./brigade-station-linux-amd64.deb`.
   For the script, make it executable first — `chmod +x installer-station.sh` — then run
   `sudo ./installer-station.sh`. Or in one command, on the server:

   ```sh
   curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh | sudo sh
   ```

   (`wget -qO-` in place of `curl -fsSL` if you have no `curl`.) It installs the package and what it
   depends on (`git`, `gh`, `bubblewrap`…), creates a `brigade` account and starts the
   `brigade-station` service. Allow one to two minutes.
3. **What you should see**: `Active: active (running)`, then
   `brigade : station installée et active — <version>`. (The installer's messages are in French.)
   If it stops on `brigade : installation refusée — …`, that line says why; fix it and rerun the
   same command.
4. **Connect it to GitHub, then to your Claude Max subscription** — the only things it asks you,
   once each. For GitHub, the command runs `gh auth login --web` under the station's account: type
   the code it shows on `https://github.com/login/device`, then it runs `gh auth setup-git` itself.
   For Max, it shows a link: open it in a browser (on any machine), log in with your Max account,
   then paste the code the page gives you into the server's terminal. The token is stored, never
   displayed. Rerunning the command redoes neither connection once made.

The detail, and everything else the station puts on the machine, is in
[`installation-station.md`](installation-station.md). Then **go to a Mac or a Windows PC**, install
the app there as above, and follow [Your first ticket](#your-first-ticket): the app lists the
stations you have paired with your GitHub account, the server's among them, and you hand your
project to it ("choose its machine", below). A server is always on, so it keeps cooking when the
app is closed; a Mac or a PC's own station stops with the app.

## Your first ticket

You now have the app open. This part is the same on Mac and Windows. It uses **this computer as the
station**: once open, the app starts the machine's station, under your account, with your `gh` and
your `claude`. (To use a Linux server instead, pick it at step 3.)

### 1. Open the app: the first-run screen

With no project yet, the app opens on a first-run screen instead of “All projects”. A sentence at
the top says what is expected of you, then:

- **Your GitHub account** — placeholder `your-github-login`;
- **The project to work on** — placeholder `owner/repo, or the path of a folder on this computer`;
- a button **open this project**, and below it `add a project from a folder instead`.

Nothing is prefilled: these two are yours.

**Connect GitHub, if the top sentence asks.** If you see `This computer is not signed in to GitHub,
so brigade cannot read the stations you have paired.`, click the button under it. The app runs
`gh auth login --web` for you and shows `Type the code ABCD-1234 on the GitHub page that opened in
your browser.` (the button `open the GitHub page again` reopens the page). Type the code on GitHub,
authorize, and the app reads your stations again.

### 2. Connect your project

Type your GitHub login and your repository as `owner/repo` (a bare name is completed with your
login; a `https://github.com/…` address works too), then click **open this project**. For a project
already cloned on this computer, type its folder path instead (`~/…`, `/…` or `C:\…`).

**You see**: `Looking for a local copy of owner/repo.` then `Cloning owner/repo into <folder> — 40%.`
The clone goes under `~/.local/share/brigade/projects/<name>` (or `BRIGADE_PROJECTS_DIR`). Then the
project appears in the icon bar and its **space** opens, with the tabs **Rail** and **Cooks**.

### 3. Say where it cooks, and start the kitchen

A new project has no station yet: the space says `No station cooks <project> yet.` Click
**choose its machine**. One card opens: `Choose the machine that runs <project>'s kitchen.` Choose
this computer (it says `stops when you close the app on this computer`) or a paired server
(`always on: it keeps cooking while your computer sleeps`, recommended when you have one). The
number of cooks at a time is preset from the machine's cores; the manager and reviewer calibration
sits under **Advanced settings**, preset to `sonnet` / `medium`. Keep both for a first run, then
click **Start the kitchen on `<station>`**.

If the machine has no sandbox, the project's page warns that its cooks run without one and offers
**choose another station** and **continue without sandbox**. For a first run on your own repository,
**continue without sandbox** is yours to decide.

### 4. Wait for the project to be prepared

The project's page shows four steps: **Repository**, **Cooking machine**, **Repository
preparation**, **First ticket**, each `done`, `now` or `to come`. The station prepares the
repository with a ticket of its own (shown with its number and a state: `in progress`, `failed`,
`to review`, `merged`). If a GitHub App must be authorized on the repository, an **authorize on
GitHub** button opens its page: one click. When it ends, the page says:

> `<project> is ready: post your first ticket with the fire label`

### 5. Create the ticket

On GitHub, in your repository, open a new issue — something small, for example the title
`Add a CONTRIBUTING.md` and the body `Create a CONTRIBUTING.md with a three-line "how to propose a
change" section.` — and put the label **`fire`** on it (create the label if the repository does not
have it: `fire` is what puts a ticket on the rail). The button **post the first ticket** in the app
opens the new-issue page for you.

**You see**: within a minute or so, the ticket as a card in the **Rail** tab of the app.

### 6. Watch the cook

- The card moves to **Taken**, with the cook's name and the time since it was taken.
- Open **Cooks**: the station's block shows its state and the ticket in flight; a click on the card
  opens its sheet.
- The cook works in its own worktree, pushes a branch and opens a pull request.

**You see**: the card leaves **Taken** for **Pass** once the pull request is open.

### 7. The pass, and the PR

The pass runs the repository's gates and a review on the pull request and writes its verdict on the
issue. A green delivery is merged by the pass itself when the project switch is on (`project on` at
the head of the space). If the pass escalates, or the switch is off, the delivery waits in **TODO**
with buttons: `merge the PR` (recommended), `send back to the kitchen`, `remove from the rail`.

**You see**: the card in **Served**, the pull request merged, the issue closed, and `served 24 h` on
the project's tile. That is your first ticket, cooked.

## Troubleshooting

### Missing configuration messages

The station and the runtime refuse to start rather than guess, and name what is missing. On the
station (written in French in its log, which is the terminal that started the app, or
`journalctl -u brigade-station` on Linux):

| The message says | What it means | What to do |
|---|---|---|
| `brigade : refus de démarrer la station — BRIGADE_STATION_DIR n'est pas défini` | the station has no directory | with the app or the `.deb`, this is set for you: update to the latest release. Setting it by hand is only for a station you start yourself |
| `BRIGADE_REPO_DIR n'est pas défini` | the station has no clone to serve | same: it comes from the project's line in the station's configuration, not from you |
| `BRIGADE_BASE_BRANCH n'est pas défini — ni la configuration ni le dépôt du projet … ne disent sa branche d'intégration` | brigade does not know the integration branch | the repository has not been prepared yet (step 4 above, the `/brigade:init` result merged), or name the branch in the project's `CLAUDE.md` line “Branche d'intégration” |
| `ANTHROPIC_API_KEY est défini : la station ne pilote claude que par la connexion Max de la machine… retirer la variable` (same for `ANTHROPIC_AUTH_TOKEN`) | an API key is in the environment | remove the variable (`unset ANTHROPIC_API_KEY`, and from your shell profile), reopen the app |
| `This project has no known GitHub repository, so it cannot be opened from here.` or `“x” is not a GitHub repository written as <owner>/<name>` | the first-run form got something it cannot read | type the repository as `owner/repo` |
| `Type the project to work on…` / `Type your GitHub account too, or the project as owner/repo` | a field is empty | fill the two fields |

When a project is served from a box, the runtime needs its own variables (`BRIGADE_STATE_DIR`,
`BRIGADE_PROJECT`, `BRIGADE_GITHUB_REPO`, `BRIGADE_REPO_DIR`, `BRIGADE_BASE_BRANCH` and the manager
and reviewer calibration) and names the missing one; that is the station's business, not this guide's: [`installer.md`](installer.md).

### Claude authentication

- **Check it**: `claude auth status` should answer `"loggedIn": true`. If not, `claude /login`
  (or `claude auth login`) and log in with your **Max** account.
- **In the app**, a station whose Max connection is lost shows `Max connection lost` (`EXPIRED` in the
  station's status): nothing cooks until it is restored. Click **log in**: for the station of this
  computer, the app runs `claude auth login` and opens the login page in your browser; the kitchen
  resumes by itself within the minute.
- **On a Linux station**, the connection belongs to the `brigade` account: `sudo -u brigade claude
  /login`, or rerun the installer command, which redoes only the connection.
- **An API key never fits.** See the table above; cooks are billed to your Max quota only.

### GitHub authentication

- **Check it**: `gh auth status`. If not logged in: `gh auth login`, or the app's button on the
  first-run screen (`This computer is not signed in to GitHub…`).
- `The GitHub CLI (gh) is not installed on this computer…` → install it from <https://cli.github.com>
  (the screen has a **get the GitHub CLI** button). `Git is not installed…` → <https://git-scm.com/downloads>
  (**get Git**). Reopen the app after installing: it takes the `PATH` of your login shell at launch.
- `GitHub denies <you> access to <owner/repo>, so it cannot be cloned` → you are not a collaborator
  of that repository, or it does not exist under that name. Ask an owner for access, or check the
  spelling.
- `GitHub cannot be reached from this computer…` → the network; `GitHub is limiting this account's
  calls for now…` → wait for the window to end.
- A station that cannot fetch from the repository says so in a red block on the project's page, with
  the command to run (`gh auth setup-git`), under the account that runs the station.
- Branch protection is a step of the guided installation of a project on a box (**Protect the
  integration branch**, `installer.md`); it is not needed for the walkthrough above.

### Nothing happens after the label

The rail carries open issues that have the label `fire`; removing it takes the ticket off. Check the
project switch (`project on`), that the kitchen is not stopped (`KITCHEN STOPPED` banner), and that
the app is still open if the station is this computer's.

## Going further

- Every screen: [`app.md`](app.md). The same walkthrough, with more detail on each state:
  [`tutoriels/premier-projet.md`](tutoriels/premier-projet.md).
- A server station, in detail: [`installation-station.md`](installation-station.md). The one-command install, on one screen:
  [`installer.md`](installer.md).
- What the runtime does once it runs: [`runtime/`](runtime/README.md).

## What was checked

For the PR description. Each item was read in the code or the release, on branch `v2` at
`d316942`; nothing was run on a clean machine.

| In this guide | Checked against |
|---|---|
| Package names `Brigade-<v>-mac-arm64.dmg`, `Brigade-<v>-windows-x64-setup.exe`, `brigade-station-linux-amd64.deb`, `installer-station.sh`; “Brigade” vs “Station” releases; the app release is not “Latest” | `scripts/app-release/paquets.ts`; `gh release list` and the notes of `app-v1.0.19` |
| Unsigned-app steps for Mac, Windows, Linux (`chmod +x`, `sudo ./installer-station.sh`, `apt install ./…deb`) | `OUVERTURE` in `scripts/app-release/paquets.ts`, same text as the published release notes |
| No Linux desktop app; node-pty not shipped compiled on Linux | `paquetsDeLApp`, `docs/app.md` “For app developers”, `app/packaging/README.md` |
| Apple silicon only; the app carries its own `node`; `~/.config/brigade/` | `docs/installation-mac.md`, `app/packaging/README.md` |
| Windows install path, Start menu, no admin rights; Git for Windows `bash` else PowerShell; no persistent shell | `app/packaging/WINDOWS.md`, `app/src/plateforme.ts` |
| Station one-liner, Debian 12+, systemd, `/var/lib` not nfs/cifs, Max connection by link and code | `docs/installation-station.md` |
| First-run screen labels and placeholders (`Your GitHub account`, `your-github-login`, `The project to work on`, `owner/repo, or the path of a folder on this computer`, `open this project`, `add a project from a folder instead`), accepted inputs | `app/src/vue/premier-lancement.js` (`lireLeProjet`) |
| Sign-in sentence, the code sentence, `open the GitHub page again`, `gh auth login --web` | `app/src/vue/premier-lancement.js`, `app/src/connexion-github.ts`, `runtime/src/appairage/stations-du-chef.ts` |
| Clone progress sentences and the folder `~/.local/share/brigade/projects/<name>`, `BRIGADE_PROJECTS_DIR` | `runtime/src/projets/copie-locale.ts` |
| `No station cooks … yet.`, `choose its machine`, `Start the kitchen on …`, `Advanced settings`, `sonnet` / `medium` | `app/src/vue/vue.js`, `docs/app.md` “Where a project cooks” |
| Four onboarding steps, their states, `continue without sandbox`, `choose another station`, `post the first ticket`, the `is ready: post your first ticket with the fire label` sentence | `app/src/vue/onboarding/parcours.js` |
| The rail = open issues with `fire` | `docs/runtime/journal-et-rail.md` |
| Rail columns **Taken**, **Pass**, **Served**, **TODO**, `merge the PR`, `served 24 h`, `project on` | `docs/app.md`, `docs/glossary.md` |
| The station's own refusals (`BRIGADE_REPO_DIR`, `BRIGADE_BASE_BRANCH`, the API-key refusal) | `runtime/src/station.ts` (`configStation`), `runtime/src/station/main.ts` |
| Max connection lost: `log in` runs `claude auth login`; `claude auth status` | `docs/app.md` “Stations”, `docs/runtime/station-cook.md` |
| GitHub failure sentences (not installed, denied, network, rate limit) and their buttons | `runtime/src/projets/copie-locale.ts`, `runtime/src/appairage/stations-du-chef.ts`, `boutonDeLaPage` |

**Not checked, because it needs a real machine**: the exact look of macOS 15's “Open Anyway” pane,
the SmartScreen dialog, and a full cook on an empty throwaway repository.

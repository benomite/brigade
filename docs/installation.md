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
| **Your own computer** — a Mac or a Windows PC, see below | it runs the app, and the station that makes the cooks work |
| **`git`, `gh` (the GitHub CLI) and `claude` (Claude Code)** installed on that machine | the app finds them through your shell's `PATH`; `gh` and `claude` must be logged in (steps below) |

Supported systems:

| System | What you install | Section |
|---|---|---|
| **Mac**, Apple silicon (M1 or newer) | the app, a `.dmg` | [On a Mac](#on-a-mac) |
| **Windows**, 64-bit (x64) | the app, a `.exe` installer | [On Windows](#on-windows) |

Not covered: Intel Macs, 32-bit or ARM Windows, Linux.

## Get the packages

All packages are on the repository's releases page, **<https://github.com/benomite/brigade/releases>**.
Each release says, in a table, which platform each file is for and how to open it when it is
unsigned.

- The **app** is in the releases named **“Brigade `<version>`”** (tag `app-v<version>`). Take the
  most recent one. Its files carry the platform in their name:
  `Brigade-<version>-mac-arm64.dmg`, `Brigade-<version>-windows-x64-setup.exe`.
  Scroll to the newest “Brigade” one: other releases of the repository may carry the “Latest” mark.

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

The app keeps your projects and settings for you. It does not update
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

The app runs this PC's station while it is open: the cooks work as long as the app does.

## Your first ticket

You now have the app open. This part is the same on Mac and Windows. It uses **this computer as the
station**: once open, the app starts the machine's station, under your account, with your `gh` and
your `claude`.

### 1. Open the app: the first-run screen

With no project yet, the app opens on a first-run screen instead of “All projects”. A sentence at
the top says what is expected of you, then:

- **Your GitHub account** — placeholder `your-github-login`;
- **The project to work on** — placeholder `owner/repo, or the path of a folder on this computer`;
- a button **open this project**.

Nothing is prefilled: these two are yours.

**Connect GitHub, if the top sentence asks.** If you see `This computer is not signed in to GitHub,
so brigade cannot read the stations you have paired.`, click the button under it. The app runs
`gh auth login --web` for you and shows `Type the code ABCD-1234 on the GitHub page that opened in
your browser.` (the button `open the GitHub page again` reopens the page). Type the code on GitHub,
authorize, and the app reads your stations again.

### 2. Connect your project

Type your GitHub login and your repository as `owner/repo` (a bare name is completed with your
login; a `https://github.com/…` address works too), then click **open this project**.

**You see**: `Looking for a local copy of owner/repo.` then `Cloning owner/repo into <folder> — 40%.`
Then the project appears in the icon bar and its **space** opens, with the tabs **Rail** and **Cooks**.

### 3. Say where it cooks, and start the kitchen

A new project has no station yet: the space says `No station cooks <project> yet.` Click
**choose its machine**. One card opens: `Choose the machine that runs <project>'s kitchen.` Choose
this computer (it says `stops when you close the app on this computer`). The
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

### The first-run form does not accept what you typed

| The message says | What to do |
|---|---|
| `This project has no known GitHub repository, so it cannot be opened from here.` or `“x” is not a GitHub repository written as <owner>/<name>` | type the repository as `owner/repo` |
| `Type the project to work on…` / `Type your GitHub account too, or the project as owner/repo` | fill the two fields |
| A message saying the station refuses to start because `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` is set | an API key is in your environment: remove the variable (and from your shell profile), reopen the app |

### Claude authentication

- **Check it**: `claude auth status` should answer `"loggedIn": true`. If not, `claude /login`
  (or `claude auth login`) and log in with your **Max** account.
- **In the app**, a station whose Max connection is lost shows `Max connection lost` (`EXPIRED` in the
  station's status): nothing cooks until it is restored. Click **log in**: for the station of this
  computer, the app runs `claude auth login` and opens the login page in your browser; the kitchen
  resumes by itself within the minute.
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
  what to do.

### Nothing happens after the label

The rail carries open issues that have the label `fire`; removing it takes the ticket off. Check the
project switch (`project on`), that the kitchen is not stopped (`KITCHEN STOPPED` banner), and that
the app is still open if the station is this computer's.

## Going further

- Every screen: [`app.md`](app.md). The same walkthrough, with more detail on each state:
  [`tutoriels/premier-projet.md`](tutoriels/premier-projet.md).
- What the runtime does once it runs: [`runtime/`](runtime/README.md).

# Install brigade and cook your first ticket

This guide takes you from nothing to a first ticket of **your own project**, cooked and delivered
as a pull request. You need nothing but this page. The words (*cook*, *rail*, *station*, *pass*,
*served*…) are those of [`glossary.md`](glossary.md).

> **Status.** Every command, menu name and screen text below was checked against the code, but the
> path has **not** been replayed end to end on a clean machine by a person: if a screen differs,
> trust the screen, and open an issue on [benomite/brigade](https://github.com/benomite/brigade).

## What you need

| What | Why |
|---|---|
| **A GitHub account**, and a repository you can push to and merge in. For a first run, use a **throwaway repository** with a `README.md` on its default branch | the cooks push branches there; the pass merges there |
| **A Claude Max subscription** | every cook, judgment and review runs on your Max session. **An API key does not fit**: the station refuses to start if `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` is set in its environment |
| **Your own computer**: a Mac (Apple silicon, M1 or newer) or a Windows PC (64-bit x64) | it runs the app, and the station that makes the cooks work |
| **`git`, `gh` (the GitHub CLI) and `claude` (Claude Code)** on that machine | the app finds them through your shell's `PATH` |

Not covered: Intel Macs, 32-bit or ARM Windows, Linux.

## Get the packages

Everything is on the **[releases page](https://github.com/benomite/brigade/releases/latest)**. Take the
most recent release named **“Brigade `<version>`”** (tag `app-v<version>`) — the one marked
“Latest”: its files are `Brigade-<version>-mac-arm64.dmg` and
`Brigade-<version>-windows-x64-setup.exe`. The builds are **unsigned**, so your system warns you the
first time you open one; the steps are below.

## On a Mac

1. **Download** `Brigade-<version>-mac-arm64.dmg` from the releases page.
2. **Install it**: open the `.dmg`, drag **Brigade** into **Applications**.
3. **Install the tools**, if you do not have them: `git`, `gh` (<https://cli.github.com>) and
   `claude`. Log in to Claude with your Max account: run `claude` once in Terminal and follow its
   login. You do not need `node` or `npm`.
4. **Open it the first time.** Gatekeeper blocks it. In **Applications**, **right-click Brigade,
   choose Open, then Open again**. On **macOS 15 and later**, also open **System Settings > Privacy
   & Security** and click **Open Anyway**. It opens normally afterwards.
5. Go to [Your first ticket](#your-first-ticket).

The app does not update itself: download the new `.dmg` and drag it over the old one.

## On Windows

1. **Download** `Brigade-<version>-windows-x64-setup.exe` from the releases page.
2. **Install the tools**, if you do not have them: **Git for Windows**
   (<https://git-scm.com/downloads>; the app opens its `bash` in its terminals, and `claude` asks for
   it), `gh` (<https://cli.github.com>) and `claude`. Log in to Claude with your Max account: run
   `claude` once and follow its login. You do not need `node` or `npm`.
3. **Run the installer.** Windows **SmartScreen** warns about an unknown app: click **More info**,
   then **Run anyway**. It installs for your account only, with no administrator rights, and adds
   **Brigade** to the Start menu.
4. **Open Brigade** from the Start menu.
5. Go to [Your first ticket](#your-first-ticket).

The cooks work as long as the app is open.

## Your first ticket

Same on Mac and Windows. **This computer is the station**: the app starts it under your account,
with your `gh` and your `claude`.

### 1. Open the app: the first-run screen

With no project yet, the app opens on a first-run screen: `Welcome to brigade.`, then **Add a project**
and its first step, **Your GitHub account**. You never type your GitHub login: the app reads the
account this computer's `gh` is connected to and says `Connected to GitHub as <login>.` Below it, one
field, **The project to work on** (`owner/repo, or the path of a folder on this computer`), and a
button **open this project**. Nothing is prefilled.

**Connect GitHub, if the account step asks.** With no account connected, the step shows one button,
**connect to GitHub**. The app runs `gh auth login --web` and shows `Type the code ABCD-1234 on
the GitHub page that opened in your browser.` (`open the GitHub page again` reopens it). Type the
code, authorize, and the step says which account is connected. **switch GitHub account** does the
same with another account, and the step reads the account again afterwards.

### 2. Connect your project

Type your repository as `owner/repo` (a bare name is completed with the connected account; a
`https://github.com/…` address works too), then click **open this project**.

**You see**: `Cloning owner/repo into <folder> — 40%.` Then the project appears in the icon bar and
its **space** opens, with the tabs **Rail** and **Cooks**.

### 3. Say where it cooks, and start the kitchen

The space says `No station cooks <project> yet.` Click **choose its machine**, choose this computer
(`stops when you close the app on this computer`). Keep the preset number of cooks and the
`sonnet` / `medium` calibration under **Advanced settings**, then click **Start the kitchen on
`<station>`**.

If the page warns that the machine has no sandbox, **continue without sandbox** is yours to decide
for a first run on your own repository.

### 4. Wait for the project to be prepared

The project's page shows four steps, each `done`, `now` or `to come`: **Repository**, **Cooking
machine**, **Repository preparation**, **First ticket**. The station prepares the repository with a
ticket of its own. If a GitHub App must be authorized, click **authorize on GitHub**. When it ends,
the page says:

> `<project> is ready: post your first ticket with the fire label`

### 5. Create the ticket

On GitHub, open a new issue in your repository, something small (title `Add a CONTRIBUTING.md`,
body `Create a CONTRIBUTING.md with a three-line "how to propose a change" section.`), and put the
label **`fire`** on it, creating the label if needed. The button **post the first ticket** opens the
new-issue page for you.

**You see**: within a minute or so, the ticket as a card in the **Rail** tab.

### 6. Watch the cook

The card moves to **Taken**, with the cook's name. Open **Cooks** to see the ticket in flight; a
click on the card opens its sheet. The cook works in its own worktree, pushes a branch and opens a
pull request.

**You see**: the card leaves **Taken** for **Pass** once the pull request is open.

### 7. The pass, and the PR

The pass runs the gates and a review on the pull request and writes its verdict on the issue. A
green delivery is merged by the pass itself when the project switch is on (`project on`). If the
pass escalates, or the switch is off, the delivery waits in **TODO** and you merge its PR on GitHub (the app has no merge button); the buttons are
`send back to the kitchen` and `remove from the rail`.

**You see**: the card in **Served**, the pull request merged, the issue closed, and `served 24 h` on
the project's tile. That is your first ticket, cooked.

## Troubleshooting

- **The form refuses what you typed**: type the repository as `owner/repo`, and fill both fields.
- **The station refuses to start because `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` is set**:
  remove the variable (and from your shell profile), reopen the app.
- **Claude**: `claude auth status` should answer `"loggedIn": true`; if not, run `claude auth login`
  with your **Max** account. A station showing `Max connection lost` cooks nothing until you click
  **log in**; the kitchen then resumes within the minute.
- **GitHub**: `gh auth status`; if not logged in, `gh auth login` or the app's first-run button.
  `The GitHub CLI (gh) is not installed…` → <https://cli.github.com> (**get the GitHub CLI**);
  `Git is not installed…` → <https://git-scm.com/downloads> (**get Git**); reopen the app afterwards.
  `GitHub denies <you> access to <owner/repo>…` → you are not a collaborator, or the name is wrong.
  A station that cannot fetch from the repository says so in a red block, with what to do.
- **Nothing happens after the label**: check the project switch (`project on`), that no
  `KITCHEN STOPPED` banner shows, and that the app is still open.

## Going further

Every screen: [`app.md`](app.md); the same walkthrough in more detail:
[`tutoriels/premier-projet.md`](tutoriels/premier-projet.md); the runtime: [`runtime/`](runtime/README.md).

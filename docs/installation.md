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
3. **Install the tools**, if you do not have them. `git` you install yourself. For `gh` and
   `claude`, the app's first screen offers **install gh** and **install claude**: see
   [If a tool is missing](#if-a-tool-is-missing). Or install them yourself, as before: `gh`
   (<https://cli.github.com>) and `claude`. Log in to Claude with your Max account: the **log in**
   button of the app does it, or run `claude` once in Terminal and follow its login. You do not
   need `node` or `npm`.
4. **Open it the first time.** Gatekeeper blocks it, because the build is unsigned. In
   **Applications**, **right-click Brigade, choose Open, then Open again**. On **macOS 15 and
   later**, also open **System Settings > Privacy & Security** and click **Open Anyway**. It opens
   normally afterwards.
   **If macOS says Brigade is “damaged and can't be opened. You should move it to the Trash”**, the
   app is not damaged: Gatekeeper is refusing a download it has put in quarantine. Do not move it to
   the Trash. Open **Terminal** and run `xattr -dr com.apple.quarantine /Applications/Brigade.app`,
   then open Brigade again.
5. Go to [Your first ticket](#your-first-ticket).

The app updates itself. When a newer version is out, a line at the top of the app says so and
downloads it: once it is downloaded, click **Update now**, or it installs at the next launch. If it
cannot update itself, the line gives a **Download** link to the package for your computer: install
it over the old one.

## On Windows

1. **Download** `Brigade-<version>-windows-x64-setup.exe` from the releases page.
2. **Install the tools**, if you do not have them. **Git for Windows**
   (<https://git-scm.com/downloads>; the app opens its `bash` in its terminals, and `claude` asks for
   it) you install yourself. For `gh` and `claude`, the app's first screen offers **install gh** and
   **install claude**: see [If a tool is missing](#if-a-tool-is-missing). Or install them yourself,
   as before: `gh` (<https://cli.github.com>) and `claude`. Log in to Claude with your Max account:
   the **log in** button of the app does it, or run `claude` once and follow its login. You do not
   need `node` or `npm`.
3. **Run the installer.** The build is unsigned, so Windows **SmartScreen** warns about an unknown
   app (“Windows protected your PC”): click **More info**, then **Run anyway**. It installs for
   your account only, with no administrator rights, and adds **Brigade** to the Start menu.
4. **Open Brigade** from the Start menu.
5. Go to [Your first ticket](#your-first-ticket).

The cooks work as long as the app is open.

## Your first ticket

Same on Mac and Windows. **This computer is the station**: the app starts it under your account,
with your `gh` and your `claude`.

### 1. Open the app: the first-run screen

With no project yet, the app opens on a first-run screen: `Welcome to brigade. Add the first project its kitchen will
cook.`, then your GitHub account. You never type your GitHub login: the app reads the account this computer's `gh` is
connected to and says `Connected to GitHub as <login>.` Below it, one field, **The project to work on** (`owner/repo`),
and a button **open this project**. Nothing is prefilled.

**Connect GitHub, if the screen asks.** With no account connected, it shows one button, **connect to GitHub**. The app
runs `gh auth login --web` and shows `Type the code ABCD-1234 on the GitHub page that opened in your browser.` (`open
the GitHub page again` reopens it). Type the code, authorize, and the screen says which account is connected.
**switch GitHub account**, a small link under the account, does the same with another account, and the account is read again afterwards.

#### If a tool is missing

Before it signs you in or clones a project, the app checks `git`, `gh` and `claude`. When one is
missing, its screen names it (`The GitHub CLI is not installed on this computer.`), says why brigade
needs it, and keeps the written way to install it: a button **how to install …** that opens the
tool's official install page, and **I installed it**, which checks again. For `gh` and `claude` it
also shows an install button. Nothing is downloaded or installed before you click it.

- **install gh** downloads the archive of the latest GitHub CLI release for your computer from
  <https://github.com/cli/cli/releases> (macOS, Windows or Linux, x64 or arm64), and unpacks it into
  a folder of your account, with no Homebrew and no administrator rights: `tools/gh` in the app's
  data folder — `~/Library/Application Support/Brigade/tools/gh` on a Mac,
  `%APPDATA%\Brigade\tools\gh` on Windows, `~/.config/Brigade/tools/gh` on Linux. `gh` itself is
  in its `bin` folder. The app puts that `bin` folder first on its own `PATH`, at once and at each
  launch, then runs `gh --version`: when it answers, the GitHub step comes back.
- **install claude** runs the official install of Claude Code. When `npm` answers on the app's
  `PATH`, it runs `npm install -g @anthropic-ai/claude-code`, which writes into npm's global folder.
  Without `npm`, it runs the native installer: `curl -fsSL https://claude.ai/install.sh | bash` on a
  Mac or Linux, `irm https://claude.ai/install.ps1 | iex` in PowerShell on Windows, which puts
  `claude` in `~/.local/bin` (`%USERPROFILE%\.local\bin\claude.exe` on Windows); the app puts that
  folder on its own `PATH`. It then runs `claude --version`, and when it answers the screen ends on
  **log in**, the same login as the **log in** of a lost Max connection.
- While a button works, the screen says `Installing … on this computer…`. If it fails (a download
  refused, an installer that exits in error, a tool that does not answer), the screen says
  `The app could not install …` with the reason, keeps the link and **I installed it**, and offers
  the button again: install the tool yourself, as its page says, then click **I installed it**.
- On a computer where the app cannot install the tool (another system, or another processor), the
  screen says `The app cannot install … on this computer` and shows no install button: install it
  yourself as its page says.
- **Git** has no install button: its screen is the same as before.

**When the app's `PATH` differs from your account's.** The app does not change your account's
`PATH` or your shell profile. A `gh` installed by **install gh** is on the app's `PATH` only: the app
and what it launches find it, but a terminal opened outside the app does not (`gh: command not
found`). To use it there too, add its `bin` folder (above) to your `PATH` in your shell profile, or,
on Windows, to your account's `Path`. The other way round, a tool your terminal finds is not always
found by the app: the installed app reads the `PATH` of your login shell at launch on a Mac or Linux,
and your account's `PATH` on Windows, then adds a few known folders, `~/.local/bin` among them. A tool
installed by hand in a folder that neither names is not found: the screen keeps saying it is
missing. Add that folder to your shell profile (or your account's `Path`) and reopen the app.

### 2. Connect your project

Type your repository as `owner/repo` (a bare name is completed with the connected account; a
`https://github.com/…` address works too), then click **open this project**. Or click **pick one of your repositories
instead** (the **+** of the bar does the same): **Add a project** lists your repositories, most recently pushed first,
and one click on yours opens it.

**You see**: `Cloning owner/repo into <folder> — 40%.` Then the project appears in the icon bar and
its **space** opens, with the tabs **Rail** and **Cooks**.

### 3. Choose the station, and start the kitchen

The project's page asks `Who cooks <owner/repo>?`. This computer comes first, named **this
computer** and marked `recommended` when it can cook now; your other stations follow. Keep **this
computer**, then click **Start the kitchen on this computer**. If the page offers no station,
**choose its machine** first. If it warns that the machine has no sandbox, **continue without
sandbox** is yours to decide for a first run on your own repository.

**To cook on an always-on server instead**, click **Add a server** under the choices: the panel shows
one line to paste in a terminal on the server, with **copy**. When the server has checked in, the
panel names it: click its name, and it cooks the project. The same **Add a server** is on every
project's **Stations** tab, under its top line and under its `Who cooks <project>?` choice.

### 4. Wait for the project to be prepared

Before your own ticket moves, brigade prepares your repository: when it needs it, a cook works a
setup pull request in it, and it is merged. The project's page shows four steps, each `done`,
`now` or `to come`: **Repository**, **Cooking machine**, **Repository preparation**, **First
ticket**. If a GitHub App must be authorized, click **authorize on GitHub**. When it ends, the
page says:

> `<project> is ready: post your first ticket with the fire label`

### 5. Create the ticket

On GitHub, open a new issue in your repository, something small (title `Add a CONTRIBUTING.md`,
body `Create a CONTRIBUTING.md with a three-line "how to propose a change" section.`), and put the
label **`fire`** on it. If the label list does not offer `fire`, create a label named `fire`
yourself on GitHub, then put it on the issue. The button **post the first ticket** opens the
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

# The app

A window on your computer (Mac, Windows, Linux) or a phone (Android): your projects in an icon bar, and in each one the
kitchen's rail read from GitHub and a real terminal where the second runs. You no longer open a terminal, you no longer
move into a folder.

The app **adds nothing to the kitchen**. It reads GitHub with this computer's `gh` token, writes the chef's gestures
there (a comment, a label), and writes commands into the second's terminal. The code of `app/src` stays under 30,000
lines, binary assets (fonts, images) excluded: `app/test/taille-de-app-src.test.ts` counts them and fails above.

## The app is not the kitchen

**What cooks is the kitchen** (`runtime/src/kitchen/`), run by this computer's station or by a server's, with or without
the app. Closing the app stops nothing there, and stopping a kitchen does not close the app.

**The app runs this computer's station**: on a computer it finds the station of the machine running, or starts it
(`app/src/workstation/`, `app/src/station-background/`); the station lives on in the background when the app is closed and
survives an update of the app (`app/src/update-background/`). On a phone the app is a workstation: it drives, it does not
cook (`app/src/workstation/role.ts`). Projects cook on the stations that serve them; the app reaches no other machine.

## Where your projects are

One file, outside any repository: `~/.config/brigade/app.json` (`BRIGADE_APP_CONFIG` moves it). Per project: a name, a
folder, its repository and branch, its two colors and its tile's label. The app creates it (`{ "projets": [] }`), adds a
project to it, re-reads it as soon as it changes (`app/src/config.ts`, `app/src/tracking.ts`) and every time you come back
to its window. A file it cannot read is never written over: the app shows its path and the reason, and the bar keeps the
earlier projects. A project whose folder is gone stays in the bar, dashed.

## Connect GitHub, then add a project

- **Connect to GitHub** runs `gh auth login --web` (`app/src/connection-github.ts`): the screen shows the one-time code to
  type on the GitHub page that opens. Signed in, the account is read again.
- **Add a project** (the **+** at the foot of the bar, or the button of the Projects block) picks a repository: the list is
  the repositories of this computer's account, most recently pushed first, with a search field
  (`app/src/projects/github.ts`); a public repository is pasted as a link or `owner/name`. One click opens it: the app reuses
  a copy that exists or clones it into `~/Brigade/<name>` (`BRIGADE_PROJECTS_DIR`) — `app/src/local-copy.ts`,
  `app/src/first-launch.ts` — and writes the project into the projects file. A failure says why in one sentence, with
  `Try again`. Claude Code must be logged in on this computer before a project opens (`claude auth status`).
- **A project not set up for Brigade** says so on its page with one button, `Set up for Brigade`: a Claude Code session in
  the second, with the instructions of `app/src/setup/` and its script, writes the labels and a pull request you merge.
- **Remove from the app…** (Settings) asks `Yes, remove "<name>" from the app`, takes the project out of the projects file
  and touches nothing else (`app/src/removal.ts`).
- **A repository you cannot write to** opens read-only: the rail is read, no gesture is offered, and one line gives
  `how to get write access` and `fork it` (`app/src/read-only.ts`).

Code: `app/src/vue/addition-project/`, `app/src/vue/page-project/`, `app/src/vue/read-only/`.

## All projects

The app opens on **All projects** (the round **T** tile): one row per project with its state (cooking, waiting for the
chef, held, idle), what is going on in one sentence, and an `N awaiting you` pill; one click opens the project
(`app/src/home.ts`, `app/src/vue/home/projects/`). Under it, **Awaiting you** gathers the chef's cards from all projects,
each with its question and choices (`app/src/vue/cards-of-chef/`). With no project, the home offers the GitHub connection
and **Add a project**.

## The icon bar

A column of tiles: **T**, one tile per project, **+**.

- A project's tile carries a label of three characters at most, derived from the names and unique (`app/src/acronym.ts`); you
  can write your own in Settings. Its full name is on hover and at the top of the space.
- Tiles are rearranged by dragging; the order is written to `app.json`.
- Each tile carries the project's tab color, and the space its accent (see "A project's colors").

## A project's page

Its menu is **Rail · Stations · Agents · Know-how · Settings** (`app/src/vue/project/menu/menu.js`); Rail opens first and
the app reopens each project on the last tab you used. On a window under 720 px, and on the phone, a **Second** entry joins
them and the page is stacked.

### Rail

The rail is read from the project's GitHub repository alone, with this computer's `gh` token, at most once a minute, with
conditional reads (`app/src/board/read.ts`, `app/src/board/kitchen-board.ts`). It draws the kitchen's labels in columns:
**Backlog**, **Ready**, **Cooking**, **Pass**, **Parked**, **Served** (merged in the last 24 hours). Each column is in the
kitchen's order, priority then age; a card shows its number (opening the issue), its title, `parked for the chef`,
`try N/3` and its PR.

- **What waits for the chef** is the tickets parked for the chef (`parked:chef`) and the manager's questions. They are red
  cards with their question, one button per choice (the first is recommended), a free-text field with `send`, and `ask the
  second`, which writes a prepared message into the second without pressing Enter (`app/src/card-todo.ts`,
  `app/src/handover-second.ts`). A card parked for the chef has one field, `Answer`, which posts a comment and removes
  `parked:chef`, and `Open on GitHub`. The answer is a comment from the chef's `gh` account
  (`app/src/board-actions/answer-github.ts`). Cards assigned to someone else are under `Awaiting others`
  (`app/src/vue/cards-assigned/`). The TODO line above the columns says `2 wait for you` and unfolds; its entries answer to
  the keys `1`–`5` and Enter.
- **A ticket's sheet** opens on a click: priority, the issue, its PR, what its cook is doing as GitHub says it, and
  `ask the second`.
- **A failed reading keeps the last rail**, dimmed, and says why on one line; with no network the line reads `offline since
  <time>`. GitHub's rate limit pauses the app's reads: one line says `GitHub quota: N of M left — reading resumes at <time>`
  (`app/src/budget-github.ts`, `app/src/vue/cooks/github-pause.js`).
- **The keyboard is never taken**: while it is in a card, no reading redraws the rail under your hands.
- The app does not park or unpark a ticket, nor change its priority: the second does (`app/src/second/parking.ts`).

### Stations

One line at the top says who cooks the project and whether it works (`Cooked by <station> · online`, a move in progress,
`<station> is offline`, `No station cooks this project`), then one card per station that serves it with its state, its
engine, and what it holds (`app/src/vue/stations-tab/`). Gestures: `Cook it on this computer`, `Choose who cooks it`, `Add
a station`, `Stop cooking here` (this computer's list, `app/src/serve-here.ts`), and `Details` (the clone and worktrees
folders, the Claude connection). `Move to another station` is offered but refused: the runtime no longer carries a move
(#4712). A gauge shows the account's GitHub quota (`app/src/quota-github.ts`). Stations are read from their gists under your
GitHub account every 30 seconds (`app/src/stations/`).

### Agents

One line per agent at work, read from GitHub: a ticket `taken` has a cook, a ticket `in-pass` has the pass
(`app/src/team-of-the-box.ts`, `app/src/vue/agents/`).

### Know-how

The entries of `.brigade/know-how.md`, read from GitHub by section, each with its source ticket; **Edit** and **Remove**
propose the change by pull request (`app/src/vue/know-how/`).

### Settings

One page over the rail, one group, `project`. Every setting is one row (`app/src/vue/components/setting/`): a name, its
value, one control that applies as soon as it changes. The rows: the label in the bar, the two colors, `Menu bar` (`Notification
area` on Windows), the project sheet (`.brigade/fiche-projet.json`, eight items and `Save`,
`app/src/vue/card-project/`), and `Remove from the app…`. The project's own settings change by pull request
([reglages.md](reglages.md)).

## The second

Each project has a **second**: `claude` launched in the project's folder, in a real terminal on the right, with the second's
role appended to its system prompt (`app/src/second/role.md`, `app/src/second/launch.ts`) — nothing to type and nothing
written into the project's `.claude/`. It runs `claude --continue`, or `claude` when there is nothing to resume.

- **Hooks** the app gives it at each start: the chef's queue read from GitHub (`app/src/second/file.ts`), the command that
  parks or unparks a ticket (`app/src/second/parking.ts`), and the project's view when a message asks why things are blocked
  (`app/src/second/blockage-of-second.ts`).
- **The panel** is docked on the right, 360 px wide, folds and resizes, each project keeping its own
  (`app/src/vue/project/panel-second/`). Changing page, opening a shell or switching project never closes it.
- **`+ shell`** opens a persistent shell (`tmux`, or `screen`) on this computer; closing the app detaches from it and the
  next click brings it back (`app/src/persistence.ts`, `app/src/memories.ts`). `close shell N` closes it for good.
- **Buttons write, they do not send.** A button that carries a command into the second writes it without Enter: you read it
  and press Enter. The app does not read the terminal, so it writes after your typing and says so on the line under the
  tabs. A control character in what would be written refuses everything (`app/src/request.ts`, `app/src/input.ts`).
- Reloading the window (Cmd+R) keeps every terminal and their content; quitting stops the seconds and detaches the shells.
- A folder `claude` does not know yet asks for trust in the terminal itself.

## A project's colors

Each project has a **tab color** (its tile) and an **accent color** (its space), drawn from a palette of sixteen colors
no two of which look alike, nor like a state color (`app/src/colors.ts`, `app/test/colors.test.ts`). They are drawn when the
project enters the file and written to `app.json` (`couleurs`). Settings changes them with the palette or `other…`, and a
color of your own that looks too much like another is said and kept.

## The kitchen's state in the menu bar and the notification area

On a Mac the app puts an icon in the menu bar, on Windows in the notification area, with one line — `3 cooking · 1 for you`
— and, on click, a menu of the questions waiting and `Open brigade` (`app/src/menu-bar.ts`, `app/src/tray/`). The
`Menu bar` setting turns it off. When this computer runs the background station, a process of the app's own binary
(`--tray-fond`) keeps an icon with the app closed, with `Open brigade` and `Quit the station…`, which asks first
(`app/src/tray-background/`).

## Updating the app

- **Installed.** The app checks the published `app-v<version>` releases at launch and every fifteen minutes, downloads a
  newer version and installs it on **Update now** or at the next opening (`app/src/update/`: `flux.ts`, `state.ts`,
  `installation.ts` on a Mac, `windows.ts` on Windows). One line at the top of the window says `Brigade X is running — Y is
  out` with where the update stands and **Update now**; where the app cannot update itself (a failed update, Android), it
  ends with **Download**, the package of this device (`app/src/vue/update/banner.js`, `app/src/update/opinion.ts`).
- **From a clone.** `npm --prefix app start` first moves the clone to its origin branch (fast-forward only), sets up the
  dependencies and Electron if missing, and says so (`app/src/launch.ts`, `app/src/catch-up.ts`).

## On the phone

The Android app opens on **Sign in to GitHub** (the device flow, the token kept in the phone's vault) and then reads the
chef's projects, rail and TODO from GitHub alone, with no station (`app/src/read-github-phone.ts`,
`app/src/vue/connection-github.js`). It writes the chef's answers the way the desktop does
(`app/src/actions-github-phone.ts`), and a background poll every 15 minutes notifies a new card that awaits the chef, once,
and dismisses it when answered (`app/src/notifications-todo.ts`, `app/android/`). The phone adds no project: a project is
added from a computer.

## The skin

One visual language, dark, dressing the frame and never the content (`app/src/vue/tokens.css`).

- **Tokens**: every color, text size, spacing step and radius is a variable of `tokens.css`; nothing else writes one
  (`app/test/scales.test.ts`, `app/test/skin.test.ts`).
- **One button family** (`app/src/vue/components/button/`): recommended, secondary, quiet, danger; 32 px tall on a computer, 44
  px on a narrow screen. A tab, a tile, a switch and a row that opens an issue are not buttons of the family.
- **Vouchers and the awaiting card** (`app/src/vue/components/slip/`, `app/src/vue/components/card-wait/`): a ticket is a
  cream voucher, and what awaits the chef is the warm card with its question and its choices.
- **Two fonts, embedded** (`app/src/vue/fonts/`): Archivo for the interface, JetBrains Mono for what is copied as is.
  Nothing is requested from the network.
- The shape of a dot tells its state before its color; a state word the app does not know is shown as is, with no color.

## The Help menu

The Help menu has one entry, `Ask, share and propose ideas (GitHub Discussions)`, which opens the repository's discussions in
the browser (`app/src/help-community.ts`).

## Launching and building

- **From a clone:** `npm --prefix app start` (Node 26 and `npm`; nothing else to install first).
- **Installed:** `npm --prefix app run dist` builds the package of the machine it runs on — a `.dmg` (Mac, Apple Silicon), a
  Windows installer, a Linux AppImage; the Android APK is built by `app/packaging/android.ts`. What each carries and how it
  is built and tested: [`app/packaging/README.md`](../app/packaging/README.md),
  [`WINDOWS.md`](../app/packaging/WINDOWS.md), [`LINUX.md`](../app/packaging/LINUX.md). Every merge on `main` that changes the
  app publishes an `app-v<version>` release (`publier-app` workflow). The builds are not signed.
- The installed app reads `~/.config/brigade/` as it is, takes the `PATH` of your login shell (to find `claude` and `gh`)
  and carries its station's runtime and its own `node` (`app/src/locations.ts`).

## For app developers

| Action | Command |
|---|---|
| Tests | `npm --prefix app test` |
| Type check | `npm --prefix app run typecheck` |
| Tests and type check on Windows | the `app-windows` workflow (`.github/workflows/app-windows.yml`); a test that cannot run there is skipped with its reason, taken from `app/test/helpers/posix.ts` |
| Launch without consuming quota | `BRIGADE_CLAUDE_BIN="$PWD/app/test/aides/faux-claude.sh" BRIGADE_APP_CONFIG=<trial file> npm --prefix app start` |
| … and without your machine becoming a station | add `BRIGADE_APP_STATION=0` |

- **No build.** The main process is TypeScript run as is by Electron (its Node strips the types); the view is JavaScript
  checked by `tsc` (`// @ts-check`) that imports xterm.js through an import map — no bundler, no compilation step.
- **The size is capped**: `app/test/taille-de-app-src.test.ts` fails when `app/src` goes above 30,000 lines; the cap is
  counted like the kitchen's code (#4777), every file under `app/src`, binary assets such as fonts and images excluded.
- **No test launches Electron.** `main.ts` and the view only wire things up; the view is played against a fake document
  (`app/test/helpers/false-vue.ts`) and a fake bridge, and the skin is read rule by rule. What gets painted is seen by
  launching the app, or from the screens of `scripts/capture-ecran/`.
- **`BRIGADE_CLAUDE_BIN`** replaces `claude`, **`BRIGADE_GH_BIN`** replaces `gh`, **`BRIGADE_APP_CONFIG`** replaces the path
  of the projects file; none has to be set for real use. `BRIGADE_APP_STATION=0` keeps the open app from being a station.
- **A project whose kitchen cooks on this computer launches real cooks** as soon as the app is open and the project has a
  ticket ready, on your quota. To try without: use the stand-in `claude` above and a trial file whose projects have no
  station on this computer.
- **Shift+Enter inserts a line break** (the view writes `ESC` + `\r` into the second, a quoted line break into a shell), and
  Option/Cmd/Ctrl + arrow or ⌫ move and delete as in a terminal.
- **node-pty** is the only native module. It ships compiled for macOS and goes through N-API; on Linux the tests on a real pty
  are skipped and say so.

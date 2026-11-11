# The app

A window on the Mac: your projects in an icon bar, and in each one a real terminal where the
second runs. You no longer open a terminal, you no longer move into a folder.

**The project's menu is three entries, Rail · Stations · Settings** (#2485, #2921), next to the project name; **Rail is the
tab opened by default**. The Kitchen entry and its two sub-tabs (Health and Cooks) are gone: **the kitchen's figures sit in
the band at the top of the rail** (#3013, below), the only line between the tabs and the columns. **What the folded
line `Caps, closer and all projects` held** (#2921, `app/src/vue/projet/bandeau-sante/`) — the duration caps (#2490), the
closer (#2491), then the Cost and Closer rows of all projects — has left the Rail tab (#3013) and the Stations tab: it is
**a section of its own in Settings**, under the Kitchen group, titled `Caps, closer and all projects` and shown unfolded
(#3014), with the same values, readings and actions. Settings opens over the middle as before. Each block is mounted in its own file under `app/src/vue/projet/`
(`stations/`, `bandeau-sante/`, `rail/bande-rail.js`). **Stations lists the project's stations** (#2487), kept up to date by
the same readings as ever — and, under it, **`Add a station`**: one click opens, in the tab, the step *Who cooks <project>? Give it
to a station.* **This computer comes first**, as the recommended button, when its station does not serve the project yet;
then the stations paired with your account that the project is not chosen for — an offline one says so. Each choice is a
gesture the app already makes: this computer serves the project as its Settings box does, a paired station gets it in its
selection as on its home page; what each does is in its `?`. Once written, the step closes and one line says which machine
was given the project — the station joins the list once it takes it; a refusal stays in the step, in one line, its detail
in a hover; `cancel` closes without writing anything. The narrow screen, which sets nothing, and a project whose
repository the app does not know have no button. Under the list, **Station settings** sets each station (#2488, below), and under it, the **Local station** block shows what only
this computer's station has (see "This computer's station, on the Stations tab", #2489).

**Removed with the Kitchen tab (#2921)**: what only the Cooks sub-tab carried is gone from the app — the reliability of the
cooks, the closer's section and its launch, the raw reading of `station` and the app's reading of it every thirty seconds,
the gates' budget, the triage history, what the cooks learned, the calibration ceiling block (the same ceiling is a row of
Settings), the specializations, the notebook, the old Ticket times card (the strip's block replaces it), the cards of the
cooks in flight inside a station's line, and the narrow-screen Cooks page. A passage below that still describes one of
them as living "on Cooks" is history, not behaviour. A stored "cooks" or "health" tab reopens on Rail. The alert line's
"open Cooks" button now opens Stations.

What follows about the tabs (#1184) holds: only one is shown at a
time: **Rail** says where the project stands and what you have to decide — what awaits you and its action, the
whole kanban in its order — On the rail, Taken, Pass, Awaiting you, Waiting and Served (#2093, titled so since #2922) — with nothing about
execution; **Cooks** says what is running — the project's stations and their cooks in flight, its tickets and its
gates, and, folded, its calibration ceiling, its roles, what
its cooks learned and the raw reading of `station` (the machine and its saturation, the quota). One click switches from one to the other; **the app reopens each project on the
last tab you opened in it**, even after you quit it — a project never opened opens on Rail. **On the right, the
terminals, permanently**: the second, and beside it, at the same level, the shells you open — nothing you look at
in the middle hides them, and switching tabs neither cuts nor empties the conversation.
**No page of a worktree opens from the app** (#1846): you follow what a cook does on its ticket's sheet,
then its PR, and you try the built app once it is merged. The cap on cooks is set on each station's
line; the raw reading no longer carries the button that wrote `station cooks` into the second.
**The triage, day by day** sits folded
under the calibration ceiling (anchor `#triage-du-projet`): one line with the latest day's two numbers (`today: 2 decided alone · 1 sent
to TODO`), the days when opened; one line, nothing to open, when there is no day (`no day yet`) or every day is 0. The
Rail no longer carries it (#1458): it is the kanban, plus one alert line at the top when the stations hold tickets back
(repository access, refusal). Clicking it opens Cooks. Captures: `docs/captures/1457/`.
**On Cooks, one block per station of the project** (#1185, #1270), at the top of the tab, wherever it runs — the box, the Mac,
another computer (`remote`). **Every station serving the project is there, each once** (#1786): the stations of `facts`, then
those the journal declares that have not signed in yet, then those the app added to the project that the journal does not
declare yet — a station of the app is recognised by the name the journal gives it (`macbook/claude`), or else by its machine
name. **All of them are shown the same way** (#2715), in the order they are given: no role label, no ordering by role, no
special state, and no `move the kitchen` in the block (the gesture is at the top of the page). Each block
says **whether the station is reached** — `reached` in green (the station whose kitchen the app reads; a station GitHub
says is reached), `not reached` in grey, or `no word` in grey for a remote station nothing says anything of —,
**as `facts` sees it** when it says so (#1830, `presente`): a remote station that has not shown itself
reads `absent` in grey (on hover: since when the kitchen has not heard from it), whatever the app reads
of it on GitHub, and its state reads `not cooking` — never `reached · cooking`; once it has shown itself, `reached` (on
hover, its last request) and `cooking`. Then its state, a word of `facts` (`cooking`, `stopped`, `saturated`, `refused`, #1183)
and what it means (`by you, for 3 min · 1 cook finishing`, `its machine has no room`, the reason for a refusal),
and, at the bottom of the block, **the cards of the tickets in flight on that station, and only those** — the very cards of
the Rail kanban: a click (or Enter) opens the same sheet as the same card in Taken, its number opens the issue; a ticket
the rail read does not carry has a card with its number and its title. **Before them, a card for each agent the station
runs besides its cooks** (#1971) — the pass judging a delivery, the manager qualifying or splitting an issue, the triage, the
closer cleaning the project up, as `facts` gives them (`agents`): its role (what it is, on
hover), the station's tag (its short name, the full name on hover), its ticket and the rail's title, what it does
(`running the gates`, `review in progress`, `qualifying the issue`, `closing: cleaning up the project`…) and for how long
(the time on hover). Not paper like a cook's card: the kitchen's dark, a dashed outline and a left bar in the role's tint.
A runtime from before `agents` gives the pass alone, read from the rail's tickets in pass. A station that runs nothing at
all says `nothing running` in one line; one that runs only a pass or the manager shows its cards, and no such line. The
cards follow the next read: a pass that ends leaves the block. On the narrow screen, one line per agent above the cooks'.
Nothing in a block is command output. A block has **no button to stop or start the station**: a station takes as many tickets as it declares places,
and it is stopped on its own machine (stop its runtime there), or by removing `fire` from the tickets it should not take.
A station stopped by your "stop" of the whole kitchen, or that refuses the project: the resume is on the
banner, the action for a refusal in the block under the stations line. **On Rail, a single line at the top** says
what, on the cooks' side, asks for your action — a saturated station, a station that refuses the project, repository access
blocked —, all the causes on the same line, with `open Cooks`, which opens the Cooks tab; nothing shows it
when nothing asks for it. The modules are `app/src/cuisson.ts` and `app/src/vue/stations-de-cuisson.js`.
**A station that cannot cook says why in one line** (#1786, #1774), under its state: `not signed in yet` for a declared
station that has not announced itself (on hover: it takes no ticket until it does); for a station
added from the app, where it is stuck — `not received by the station`, `waiting for your authorization on GitHub`,
`refused`, `not reached` —, what you do about it on hover, `check again` (it rereads GitHub) and the authorization button
it waits for. **In each block, what the station provides** (`Provides code raisonnement`, then `edit`, below) and **its
cooks at once**: a settings row (`composants/reglage`, #2920) — its name and level, the cap its runtime gives, else the
number it declares; for a declared station, a number field that applies as soon as it changes (Enter, or leaving the field):
it sends the station's whole declaration with that cap in it, through the same gesture as its form (below), `applying…`
under the row meanwhile, then what was done or the refusal, the field back to the value in force. While the station's form
is open, the row is read-only — the form has the field —, and so it is without the declaration read. Without the declaration read, what it
provides comes from `facts` (`fournit`, what the journal declares of it, #1830), with no `edit`; only a station the
journal does not declare yet says `not declared yet`. An absent station says why: `not signed in
yet`, or `silent since <time>`. On a narrow screen, the blocks are read-only: no `edit`, no
`check again`. The block below, *what each station provides*, is no longer laid when the stations'
blocks are: it is only the fallback while `facts` does not give the stations.
**What each declared station provides** (#1509, epic #1506) — in its block since #1786, in a block of its own under the
stations otherwise: one row per station the project
declares, in the order of its declaration — its name, where it runs, its cooks cap (`3 cooks at once`) and its capabilities
(`code`, `raisonnement`, `navigateur-headless`…). Where it runs has three distinct words: `box station`; `this workstation`,
a station of a project whose kitchen runs here; and `remote`, a station another workstation plays (this computer does not
play it). What each means is on hover. The rows
come from `installation stations --json`, which the installation check reads (on opening, then every five minutes): before
the first read, one line says `not read yet`; a project that declares no station says `no station declared: no cook leaves
for this project`, never a blank. On a narrow screen, the block sits under the stations' lines. The module is
`app/src/vue/stations-declarees.js`.
**Each row has `edit`** (#1510) — so does each station's block (#1786): under the row, its form — two settings rows
(`composants/reglage`, #2920), each with its `this computer` level: `Cooks at once`, prefilled; `What it provides`, one checkbox per
capability (the boxes of "+ station", #1307): the ones it declares, ticked, then what the other stations provide and what
this computer can declare, unticked. Under the boxes (#1959), a field and `Add` take a capability that no box offers — the one a
ticket in WAITING awaits (``awaiting a station that provides `<capability>` ``): its name is typed (trimmed, inner spaces turned into
hyphens, the backquotes of a name copied from a card dropped), and it becomes a ticked box of the form, applied at once like
a ticked box; an empty name, one the runtime would not read, or one already in the form is refused in one line under the
field, and nothing is added or sent. Once applied, the station provides it, the other stations' forms offer it, and the
ticket that awaited it goes back on the rail on its own. The rule for the typed name is `runtime/src/capacite-libre/`; the
view applies the same one (`app/src/vue/capacite-libre/`), a test keeps them identical. **There is no Save button**: the
number applies when it changes (Enter, or leaving the field), each box as soon as it is ticked or unticked; each change
sends the station's whole declaration with that one value changed, and changes that station only, by the runtime's
single-station commands run through the project's station (`installation stations set`): the others stay as it wrote them.
The declaration lives on the project's main station, not in the repository: no change opens a pull request. While a change
runs, `applying…` reads under its row and the form's controls wait; then the row says what was done, or the refusal in one
line (the station's answer on hover), the control back to the value in force. The form stays open; `Close` folds it.
`Remove` is not in the form: it is on the station's line, next to `edit` (#2914). It asks first, inline under the line, its price in one line, then runs `installation stations remove`; the project's only station cannot be
removed. Then the stations are read again, and the rows follow; one line under the station's row says it was removed. It is the same on a
Windows workstation (`pc/claude`). The operation is `changerUneStation` in `app/src/service.ts`.
**Under the stations, the project's calibration ceiling** (#1284): how far the manager raises the model and the effort of a
ticket that stays red before passing it up to you. It shows the value in force (`opus / high`) and where it comes from —
`default`, `set by you`, or one of each —, read from `facts` (`plafondDeCalibrage`): the app does not know the default, it
reads it. Two lists, a model and an effort, and `set ceiling` change it in one gesture: it plays `station ceiling-modele
<model>` and `station ceiling-effort <effort>` — only the dimensions that change — where the project's kitchen runs, like a
station's button, says `setting…` until the runtime has answered, then rereads the box. No `sudo`, no restart, no file:
the manager reads it at its next reaction. Set by you, `back to the default` withdraws it (`station remove …`). Refused
by the runtime, a line says so, its output on hover. A runtime that does not give it shows nothing. The modules are
`app/src/plafond-de-calibrage.ts` and `app/src/vue/plafond-de-calibrage.js`.
**Since #1309, the ceiling is a project setting, changed by a pull request**: when the project's runtime gives its
settings (`setting`), the folded block holds the same row as Settings (see "The project's settings, changed by a pull
request"), and nothing is set on the box any more. The lists and `set ceiling` above remain only for a runtime that does
not give its settings yet.
**On a narrow screen — the phone (#1151), or a window under 720 px —, the menu gains a fifth entry** (#1186): after Settings,
**Second**, the conversation with the second, which takes the place of the middle instead of sitting on the right; one
tap switches from one to the other, and switching tabs neither cuts nor empties the conversation. The projects bar
moves to the top. **Cooks is read-only there**: the stations' lines, their state and their cooks — one line each, not
their cards — no project tile, no Taken and Pass, no stations
line to set up (`+ station`, `move the kitchen`, the sandbox), no reading of `station` and its cap: cooks are set up
where there is a computer. Rail shows the same columns and cards as on a wide screen, `open Cooks` line included, but
**stacked, full width, with TODO — what waits for you — first** (#1163): the page scrolls down, never sideways. A
switch's confirmation (`project`) opens under the project's header, full width, not 440 px wide under the
switch. The last tab opened is remembered; remembered on a wide screen, the conversation reopens the project on Rail.
On a wide screen, nothing changes. The threshold is `ECRAN_ETROIT` in `app/src/vue/vue.js`, and the same one in `vue.css`.
**A TODO card the runtime let in asks its question on the card itself** (#1281): a product choice or a design
validation (`attend[].carte` in `facts`, see `docs/runtime/manager.md`, "What enters TODO, and how you answer"). The
card says what is expected (`Validate its screen: answer its question.`), then the question, one button per choice — in
the runtime's order —, and a free-text field with its `send` button, inactive while empty. A design validation shows its
before and after captures under the question, read without a click like those of a delivery; a card without a screen
has no capture area. **Since #2061 no answer leaves the app**: a click on a choice, or `send`, says `nothing was posted:
a card of TODO is answered on its issue on GitHub — the station reads the issue, not the app` (`SANS_FAIT` in
`app/src/gestes-github.ts`), and the card stays as it is. No reading carries `attend[].carte` any more: TODO is the
`chef-todo` issues ("The chef's TODO, read from GitHub", below). The modules are `app/src/carte-todo.ts` and
`app/src/vue/carte-todo.js`.
**Every TODO card takes that one shape** (#1767, epic #1764, `runtime/src/carte-todo/forme.ts`): when `attend[].carte`
carries `resume` — what happens, in two plain sentences at most —, it heads the card in place of the expected line, then
the question, the captures, one button per choice and the free-text field. A card with a single gesture (merge a green
delivery by hand) has a null question: it shows that one button, filled, and no question. Every card closes on `ask the
second`, a small underlined word set back under the field, never one of its choices: it writes into the second a
request about the ticket with what is typed in the card's field, as the sheet's does, and the card is answered from its
choices without it.
**A ticket the kitchen took off the rail without serving it waits in Todo** (#2118): its card (`type` `abandon`) says
which ticket and why, and offers `Put it back on the rail`, `I take it in a dev session` and `Close it`; it stays until
you answer (`docs/runtime/manager.md`, "A ticket the kitchen takes off the rail without serving it"). Each choice's
price follows its gesture (`app/src/carte-todo.ts`): `drop` says the ticket stays off the rail, `close` that its issue is
closed — neither says a cook is launched. Since #2061 no reading carries that card: such a ticket is a `chef-todo` card
of kind `abandoned`, answered on its issue.
**A kitchen held by its breaker is resumed in one click, from the head of Todo** (#2140, epic #2134): while the
`kitchen` line of `status` says `breaker OPEN`, Todo opens on the breaker line — red, `breaker open: the latest launches
failed in a row, no cook goes any more`, what the station writes on hover — and its single button, `Resume`, recommended,
its price on hover. No command to copy, no ssh, no confirmation: the click posts one comment whose body is exactly
`/resume` on the repository's open issue labeled `brigade:breaker-open` (the station publishes it when the breaker opens,
#2138, and its watcher closes the breaker when it reads the comment, #2139), with the GitHub sign-in of
this computer's `gh` (`app/src/github/breaker-resume.ts`). While it is posted, the button waits and the line says
`requesting the resume on GitHub…`; posted, it says `Resume requested` (the comment's address on hover) and offers no
button to click twice, until the reading that no longer says the breaker open takes the line away. GitHub refusing, or no
labeled issue being open, the line says why in one line (`resume not requested: …`), GitHub's answer on hover, and gives
`Resume` back to try again. On Rail the alert band does not repeat the line; on the other tabs, where there is no Todo,
the band carries it with the same `Resume` (`app/src/vue/todo-breaker-line.js`). Captures: `docs/captures/2140/`.
**The main screen keeps only three things: the alert band, the rail and the terminals**; there is
nothing at the bottom of the window. The rest is behind a tab, at the top, next to the name of the
project: **Settings** (the state of the project, the backup and its age, the settings, the
manager, the reliability of its cooks and what it cost) — read for you, with nothing to type.
Its page opens **over the rail**, and the rail comes back as you left it when you close it.
**The cost of all projects is not in a project** (#1022): it applies to the whole, so it lives
at the app level, on its own page, opened from "All projects".
**In the alert band, each alert is one line and one control** (#907): the line says what
is wrong in one sentence, and its only button does the action (or writes the request into the second —
"ask the second"). Nothing else is written flat. **The price is in the confirmation, on click**:
an action that costs opens its confirmation under the line, which says its price in one line — a request to the
second too (`ask the second…`: "ask the second to lift it", what lifting will cost, and `yes, write
the request`, which writes it without sending it); an action without a price goes on click. **What the box says about it word
for word** and the reason **are behind "detail"**, at the end of the line: one click unfolds them below,
a second folds them back, and a re-read of the band does not fold them. The action itself is never
written there — no command to copy and no instructions: the only action shown is the button of the line.
**When GitHub limits the account's calls, every project of the account says it at once** (#2147): the box's `facts`
carries a `github` entry `{limit, since, backAt}` (the runtime's contract, #2144), shared by every project of the
account, and each project's band shows one yellow line — which limit in plain words, since when, back around what
time, at your local time: `GitHub is rate-limiting calls: too many writes per minute, since 15:22, back around 15:54`
(`the hourly quota is spent`, `too many requests at once` for the two others). GitHub's own name of the limit is behind
"detail". Nothing is asked of you, so the line has no button; it leaves by itself at the first `facts` without the
entry, with no reload. A limit name the app does not know still makes the line, without its plain words
(`app/src/vue/bandeau-limite-github.ts`).
**One switch for the whole project** (#1406), in place of the manager's switch
(#906): it is not a line of the band, it is at the head of the space, to the right of the tabs —
`project on`, green slider on the right, or `project off`, grey on the left —, always in view, and one
click toggles it. On, fired tickets are taken, the manager judges and splits, green deliveries are merged;
off, nothing new is (`brigade <projet> switch [on | off]`, `docs/runtime/exploitation.md`, "The project
switch"). A project added from the app starts **on**: the runtime sets it at its first start, nothing to
flip. Its state is read in the `manager` line, which the manager writes from the project switch it follows.
Switching off goes to the second; switching on opens its confirmation below, which says its price in one
sentence with the real number of issues the manager will judge (`it will judge the 23 open issues`, or
`it will judge 21 of the 23 open issues — 2 carry blocked-on-human`), what it commits to on hover. Off,
**the page says so in one line: the head of the rail is marked as stopped** — a hatched bar, `project off
— nothing new is taken, split or merged` —: running cooks finish, nothing new is taken; the kitchen it
holds makes no second line. The `manager` line of the box (`OFF since … (by chef) — the project switch is
off: …`) is now only on hover of the switch: the Manager page is gone from Settings (#1700), and the manager has
no switch of its own. Not yet read, or not read, the switch says neither (`project …`) and toggles nothing; a read that
fails makes its "unchecked" line in the band. On the bar, the tile of a project switched off keeps its
signal.
**"All projects" is the overview of
brigade**: one line per project, one per station, each with its pill and what is going on there in
a few words, and one click opens it — you do not act there, you look, then go where it is decided; a
**Cost** line there opens the cost of all projects.
**Cost, the check of a project and Settings follow the same rules**: no flat instructions
(the explanation of a tab, what a step of the installation is for and what happens if you skip it live
on hover of a "?" icon), each action is a button that says its word,
a read that fails fits on one line (the cause, the retry and the exit code on hover), and a
confirmation of a costly action says its price in one line, the rest and its source on hover.
**The log is no longer on screen** (the "log" button is gone, #3048). And at the head of the bar, the **All projects** screen: your projects and your
stations at a glance, the entry to the cost of all projects, and the health of Max and GitHub in one line.

**The app also says when its own code is behind.** It runs on the code of a clone, and a
clone nobody updates is an app that shows less than what is delivered: the **T** tile
turns yellow, its hover and the settings of each project say by how many commits its clone is
behind its origin (see
"The app's code: up to date, or behind"). And it moves to the new version of itself: at
its next opening, or right away with one click — with no terminal, no command to copy.

What is **a table of states is drawn**: a pill per project in the bar, a card
of five counters with its cooks in flight, the rail in five columns, and a banner when the kitchen is stopped. The
rest — the log, the station — stays text (see "What is drawn"); the state
of the manager is read from this text, and laid over it.

The app **adds nothing to the runtime** and doubles no action: what is set or
relaunched is done in its terminal. Its buttons **write** the command into the second, and do not
send it: you are the one who hits Enter (see "Buttons write, they do not send"). What
it shows of the box, it read by running for you the commands that exist.

**Two actions are the exception, because they commit nothing: turning off the manager, checking
the installation.** Those **go**: their command is sent into the second, and its output is
read in its thread, without you copying anything. And when the second is not free, they do not go
silently: the app says why, and that nothing went (see "A direct action really goes out — or says why it does not").

**Adding a project is declaring it in the app** (see "From the app"). What remains afterwards — priming the repo,
merging, checking — is followed in the project's space: the app opens the session there and checks for you (see
"After the add: the commissioning").

## The app is not the kitchen

**What works is on the box**, project by project, and runs without the app and without you.
**The app is the window on the Mac**: it reads, it displays, it writes commands into a
terminal. Closing it stops nothing on the box, and stopping a project's kitchen does not close the app.

**The app runs one station: this computer's.** It reads and drives, through it, the projects that cook on this
computer; for every project, it reads the rail from the project's GitHub repository and writes the chef's gestures
there (labels, comments). It launches no `ssh`, opens
no shell on another machine, and plays no station for a project's box.

Three words look alike, and do not mean the same thing:

| The word | What it designates | Where it is read |
|---|---|---|
| **All projects** | **a screen of the app**, the home: two blocks, your projects and this computer's station (#2638), at the head of the bar. It launches and stops nothing | the round **T** tile |
| a project's **kitchen** | **a state of the runtime, on the box**: `open`, `held`, `stopped`, `off`. It is what your "stop" stops, and it alone | the pill, the card, the `kitchen` line of `status`, the `KITCHEN STOPPED` banner |
| **`taken`** | **the step of a ticket**: a cook holds it, between `queued` and `in pass` — what the rail calls `taken`. It speaks of a ticket, not of the project | the ticket list of an epic, and `pass` |

The log says `kitchen.stopped` and `kitchen.resumed` for your "stop" and your "resume":
that is the project's kitchen, the state — not the screen.

## Telling where your projects are

A single file, outside the repo: `~/.config/brigade/app.json`. A name and a folder per project (and the repository
and branch it follows). **You do not have to write it to begin**: the app creates it, and you add a project in
it from the app. The runtime creates it too, on its first start (`{ "projets": [] }`: no path), and adds the keys a
file lacks without changing any value it has (`runtime/src/app-par-defaut.ts`). Where a project cooks is not in this
file: it is read from the project's issues on GitHub (the claim comments of its stations) and from the stations you
paired.

### On a new computer: your stations and their projects (#1434)

On first launch the file does not exist: the app creates it, empty (`{ "projets": [] }`). **As long
as it has no project, the app opens on the stations you have already paired and the projects each
carries** — in place of All projects, the round **T** still marked. They are read by the runtime
(`runtime/src/appairage/stations-du-chef.ts`, #1428), through this computer's `gh`:

```
Open one of your projects on this PC: one click, no folder to choose.
● Mac          online
  [brigade]
● parade-box   online
  [brigade] [parade] [cantine]
[add a project from a folder instead]
```

- **A project opens in one click, with no folder to choose.** The runtime's operation
  (`runtime/src/projets/copie-locale.ts`, #1429) reuses a copy that already exists, or clones the
  repository into the folder the app manages (`~/.local/share/brigade/projects/<name>`, or
  `BRIGADE_PROJECTS_DIR`). Each of its steps is said under the station, in its sentence —
  `Cloning benomite/parade into … — 42%.` —, and the other projects wait: one clone at a time.
  Opened, the project enters the projects file with its repository and the branch its origin points
  to, and its space opens.
- **A clone that fails says why in one sentence**, the runtime's — `GitHub denies chef-pc access to
  benomite/parade, so it cannot be cloned: …` —, under its station; what `gh` and `git` wrote is in
  the `?` hover. A button opens the page that lifts it when the runtime names one (`get Git`,
  `open the page on GitHub`), and `try again` replays it.
- **When this computer is not signed in to GitHub**, the account step of the add-a-project path (below)
  shows `connect to GitHub`, and the stations' sentence says why they wait: the button runs the runtime's
  sign-in action (`gh auth login --web`), without a terminal. The screen shows the one-time code to type, `Type the code A1B2-C3D4 on the
  GitHub page that opened in your browser.`, and the page opens — by `gh`, or by the app. Signed in,
  the stations are read again; a clone that was held for want of an account starts again by itself.
  The same button appears under a clone refused for that reason.
- **When the stations cannot be read** — no `gh`, no network, GitHub limiting the account —, the
  head says why in the runtime's sentence, its detail in the hover, with the button of the page that
  lifts it (`get the GitHub CLI`) and `read again`. With no station paired yet, the sentence says
  what to do. The screen is never blank.
- **The screen asks for your project, never for your account** (#1540, #2475): under the stations' sentence,
  one empty field, `The project to work on` (`owner/repo, or the path of a folder on this computer`), and
  `open this project`. An `owner/repo` (or a `github.com` address) is cloned by the runtime; a bare name is
  completed with the account the path says connected, and with none a sentence says so and nothing starts; a
  folder path opens **Add a project**, already filled. What was typed is kept between two renderings. No
  default names the chef's machines or projects.
- **A folder you already have** is still one click away: `add a project from a folder instead`,
  or the **+** at the foot of the bar, open **Add a project**. **T** opens All projects.

*Code: `app/src/premier-lancement.ts` and `app/src/connexion-github.ts` (main process),
`app/src/vue/premier-lancement.js` (the screen). Captures: `docs/captures/1434/`.*

### One add-a-project path, on first launch and on Add a project (#2475, epic #2473)

The first-launch screen and **Add a project** (the **+** at the foot of the bar) mount **the same path**:
the same card, the same steps, the same words. First launch only adds its welcome sentence,
`Welcome to brigade. Add the first project its kitchen will cook.`, above it.

```
Add a project
1  Your GitHub account   done
   Connected to GitHub as benomite.
   [switch GitHub account]
```

- **The account step** says the account this computer's `gh` is connected to, `Connected to GitHub as
  <login>.`, read by the main process (`gh api user --jq .login`, the question the runtime already asks a
  station's `gh`; a failure is read by the runtime's `echecDeGh`). **No field asks for a GitHub login**,
  anywhere in the path.
- **With no account connected**, the step shows one button, `connect to GitHub`, and nothing else to fill
  in. Clicked, it runs the same sign-in as everywhere (`gh auth login --web`): the code to type, `open the
  GitHub page again`. Signed in, the account is read again and the step says it.
- **`switch GitHub account`**, under a connected account, signs in with another account the same way (its
  hover says so); at the end — signed in, or not — the step reads the account again.
- **When the account cannot be read** — no `gh`, no network —, the step says why in one sentence, the detail
  in the hover, with the page that lifts it (`get the GitHub CLI`) and `read again`. On first launch the
  stations' gestures then do not offer the same page a second time.
- **The steps** are numbered, each with its state — `done`, `now` (under the accent line), `to come` — like
  the commissioning path of a new project. One file per step, under `app/src/vue/parcours-projet/`; the next
  steps (the project to pick, the recap) are registered in `ETAPES` (`parcours.js`). For now the project
  is added under the path: first launch keeps its stations and its project field, and **Add a project**
  keeps its folder form, `Add a project from a folder`.
- **The station step** (#2477), after the account: `The station that cooks it`. Until a project is added it
  says one line, `Once the project is added, pick here who cooks it.` Once **Add to the app** has added
  one, the screen stays on the path and asks **`Who cooks this project?`**: **this computer first**, as
  the recommended button (its hover: it stops when you close the app), then `or one of your stations:` —
  the stations paired with your account, one per machine, by name, each `online` or `offline` (an
  offline one takes the project once it is back, on hover). With no paired station, only this computer
  is offered; when the stations cannot be read, one line says so and this computer is still offered.
  One click gives the project to the machine, by the gestures the app already makes — this computer's
  station serves it as its Settings box does (`servirUnProjet`), a paired station gets it in its
  selection as its box on the home screen does (`choisirLesProjets`) —, then the project's page opens. A
  refusal stays in the step, in one line, its detail on hover, and nothing moves.

```
2  The station that cooks it   now
   Who cooks this project?
   [this Mac] ?
   or one of your stations:
   [atelier] offline ?
   [parade-box] online
```

*Code: `app/src/vue/parcours-projet/` (the path, its steps, the sign-in brick shared with the published rail
and the account's stations), `app/src/connexion-github.ts` (`lireLeCompteGitHub`). Captures:
`docs/captures/2475/`, `docs/captures/2477/`.*

### The age of the rail is always on screen (#2054)

The Rail tab reads the project's GitHub repository at most once a minute (#3007), with no gesture. At the end of the band at the top
of the tab (#2486, below), quietly, it says how old the rail shown is — `rail as GitHub said it less than a minute ago,
at 7:35 AM`. Since #2061 the
rail is read from GitHub itself, so that age is counted from the app's own reading. When GitHub cannot be read again,
the old columns are kept (#2151, below); offline, the last rail stays dimmed, marked `offline since` (#1818).

*Code: `ageDuRail` in `app/src/vue/vue.js`, `publieLe` in `app/src/tableau/rail.ts` and `app/src/faits.ts`.*

### The project's figures: one single line at the top of the Rail tab (#2486, #3013, epic #3010)

The Rail tab opens on **one single line of figures** between the tabs and the rail, as `docs/maquettes/app/Project.dc.html`
draws it (README decision 4), then the columns, which take the whole height left under it — each column runs down to the
bottom of the tab, and no block above them pushes them into an inner scroll. Each figure is its name, its value in bold,
then what the value is, in this order, each at most once:

- **Ticket time** — `Ticket time 14 min median`: the median of the recent tickets from the station's `resume`, with no
  cap (a ticket's size varies). On hover (or on the keyboard): the p75, the heaviest loss and the slowest phase with
  their medians, then the station's other figures (#2672) — lost time, vs estimate, main repairs — each with its
  threshold, and `— over it` when it is.
- **First try** — `First try 57% · goal 70%`: the station's `first try` figure against its threshold, in red under it;
  what weighs most on hover.
- **Cooks** — `Cooks 2 running`, their tickets and stations on hover; `none running` when none is. When the reading does
  not name them (the rail read from GitHub alone), the count is that of Taken — one cook per ticket —, and the hover says
  so.
- **Last merge** — `Last merge 4 min ago` (`3 d ago` past a day): the most recent `mergedAt` of the station's ticket
  records, the ticket and its time on hover.
- **Backlog** — `Backlog 18 issues`: a number, no bar and no gauge; each count of what is before the rail (#1836, below)
  in words on hover. A click unfolds the Backlog column.
- **The age of the rail** (#2054), at the end of the line.

**A figure without a value is not drawn at all**: no `no measure yet`, no `Not available yet`, no `?` helper and no title
with nothing under it. With nothing published but the running cooks, the line reads only `Cooks 3 running`. Before the
rail is read, there is neither Cooks nor Backlog. The figures are those the station publishes, never recomputed
(`app/src/vue/temps-ticket/resume.js`). The Ticket time and Blocked without a question blocks that stood above the rail
are gone (#3013), and so is the 24-hour histogram.

The signs that something is wrong — the alert line, a stale or offline reading, the idle-kitchen fault, the project
turned off — stay above the band. Before the rail is drawn, the band does not show: the tab says why, as before. An
empty rail is said by its **On the rail** column. A line narrower than its figures wraps a whole figure to the next line;
nothing is cut. Captures: `docs/captures/2486/`, `docs/captures/3013/`.

*Code: `app/src/vue/projet/rail/bande-rail.js` (the band), `bandeDuRail` in `app/src/vue/vue.js`. Test:
`app/test/vue/projet/rail/bande-rail.test.ts`.*

### Every setting of each station, on the Stations tab (#2488, epic #2484)

The **Station settings** block of the Stations tab has one card per station the project declares, in the order of the
declaration: its name and where it runs (`this workstation`, `box station`, `remote` — the words of Cooks), then four
lines, each the same row as in Settings — the setting's name and its **level** (`this computer`, from
`app/src/vue/niveaux.js`), the value in force, and its control:

- **cooks at once** — a number; **what it provides** — the capability boxes of "edit" on Cooks, and a field for one no
  box offers. There is no Save button (#2920): the number applies when it changes (Enter, or leaving the field), each box
  as soon as it is ticked or unticked, an added capability as soon as it is added. Each change sends the station's whole
  declaration with that one value changed, the same gesture as "edit" on Cooks (`changerUneStation`); `applying…` reads
  under its row and the controls wait meanwhile, then the row says what was done, or the refusal in one line (its detail on
  hover) with the control back to the value in force. The re-read declaration then shows the new values.
- **ordinary tickets** — `taken` or `not taken`, with the app's switch (`composants/interrupteur/interrupteur.js`, the same
  as the project switch at the head of the project space and the sandbox row below). On the station that runs on this computer, the switch is this computer's
  option, the same as Settings (`reglerOrdinaires`, its cooks limit kept): it writes at once, `applying…` under the row
  meanwhile, a refusal under it. On a box station, `taken`,
  greyed — a box station takes every ticket it can cook. On a remote station, what `facts` says of it, greyed, the
  reason on hover; `not said` when its main station does not say it.

Removing a station is not a row of this block (#2914): `Remove` sits on the station's own line, next to `edit`, in the
list above (`stations-declarees.js`), and nowhere else. It asks first, inline under the line, with what it costs in one
line (`Remove pc/claude from parade?`); confirmed, the station is removed from the declaration. The project's only station
cannot be removed, the reason on hover.

Each line is the app's settings row (`rangeeDeReglage`, `app/src/vue/composants/reglage/reglage.js`). Every one of these
settings lives on a station, none in the project's repository: no change opens a pull request. Nothing is stored by the
block: each change goes through the storage that already existed, and a reload of the app shows it as written. Captures:
`docs/captures/2488/`.

*Code: `app/src/vue/projet/stations/ReglagesStation.js`, `reglagesDesStations` in `app/src/vue/vue.js`. Test:
`app/test/vue/projet/reglages-station.test.ts`.*

### This computer's station, on the Stations tab (#2489, epic #2484)

At the bottom of the **Stations** tab, under **Station settings**, the **Local station** block shows what only this computer's station has, titled
with its name and `this Mac` (`this PC`), its lines in a card like those of **Station settings** above it. The other
stations have none of it. Each setting is the app's settings row (`composants/reglage`, #2920) —
its name with its level label (`this computer` for all of them, `app/src/vue/niveaux.js`), its value, what it implies on
hover, its one control, and under it what the control returned. A control applies as soon as it changes — no Save button —:
`applying…` under its row while the change runs, both sandbox controls waiting; a refusal in one line under the row that
changed, the control re-read at the value in force. None of them is kept in the repository: no change opens a pull request.

| Line | Value | Control |
|---|---|---|
| `clone folder`, `worktrees folder` | where the station keeps the project's clone and puts its cooks' worktrees (the runtime's `lieuxDuProjet`, read through `dossiersDeLaStation`) | none: the station chooses them |
| `sandbox · ordinary tickets`, `cooks at once` | `taken` / `not taken`, the cap or `no limit`; the sandbox unavailable, and why, under it | the checkbox and the number of Settings' **this computer** group — the same call, `reglerOrdinaires`, written to the projects file. Off a Mac, `none on this PC`; a project that does not cook here, one line that says so |
| `Claude connection` | `connected`, `lost`, `unknown` — as the station publishes it on GitHub | lost: `log in`, the button of the station's Max-connection breakdown (the same login as on the station's page) |

The sandbox's `ordinary tickets` is the same option as the `ordinary tickets` line of this computer's card in **Station
settings**: ticked in one, the other reads it at once. They are read when the tab opens, then every thirty seconds while it is re-laid; a reading that fails is one line, its
detail on hover. A device with no station (a phone, a workstation) says so in one line. The block is
`app/src/vue/projet/stations/StationLocale.js`. It has no `paired phones` line any more: the phone signs in to GitHub, no
station pairs it (#2500). Settings still shows its own **this computer** lines until a separate ticket
removes them.

### The station page, section Identity (#2642, epic #2497)

The **Identity** section of a station's page has one settings row per fact (#2920, `composants/reglage/reglage.js`) —
`name`, `machine`, `cores`, `version`, `updates` — each with its level label (`this computer`, from
`app/src/vue/niveaux.js`). The first four are read only: their rows have no control. What the station has not said reads `unknown`.
On this computer, a station that is behind shows **Update now** (recommended); up to date, the line says so. On another
station the section is read-only: the same lines, never a button.

*Code: `app/src/vue/station/page/sections/identite.js` (it reads `contexte.identite`, which the page shell supplies). Test:
`app/test/vue/station/identite.test.ts`.*

### Cards never vanish while GitHub holds them (#2151)

The chef's main screen does not lose a card because a reading went wrong:

- **A failed reading never empties a column.** When GitHub answers but does not give the rail — rate limit, a refusal,
  no answer in time —, the rail keeps the last reading that drew it,
  whole, and one line takes the place of its age: `The last reading of GitHub failed — the rail shows the 4:14 reading · read 4 min
  ago`, the reason of the last failure on hover when the second's panel is on screen. When GitHub limits the account's
  requests, the line says so in plain words: `GitHub limits this account's requests until 4:20 — the rail shows the 4:14
  reading`. The line goes with the first reading that draws the rail again. This holds for a project no station
  of this computer serves: the stations' gist (`not-served`, `rail-du-projet.ts`) no longer takes the place of its
  columns. The main process keeps its last facts and `status` too (`estRateeDuTableau` in `app/src/faits.ts`), so the
  cards' sheets and addresses still open. With nothing read before, the failure is said as before.
- **The TODO card the chef is answering does not move under his hands.** While the keyboard is in a TODO card — its
  field, its choices, its buttons —, no reading redraws the rail of that project: the card is not removed, re-rendered
  or moved, and what is typed stays where it is. What arrives meanwhile is kept and drawn when the keyboard leaves the
  card (at once when it goes outside the rail; at the next reading when it goes to another element of the rail, so the
  element just touched is not replaced). Answering — a choice, `send`, `ask the second` — ends the hold. If a reading
  shows the card left TODO meanwhile, the card says so beside the text, without erasing it: `resolved meanwhile: #21 is
  now in Taken — your text is kept here, nothing was sent`.
- **A typed text outlives its card.** When the card has left TODO and the chef had typed something, TODO keeps a
  resolved card at its foot: the ticket's number, what the card asked, what became of it, and the text, editable, with
  `dismiss` to forget it. An empty draft goes with its card, as before.
- **Each column that goes from cards to none is logged** by the main process (`app/src/colonnes-videes.ts`), on the
  app's standard error and in `rail-columns.log` next to the projects file (`~/.config/brigade/`): the column, the
  cards it held and where each one is now (another column, outside the columns, or not in the reading), the time of the
  reading that emptied it and of the state it read, the same for the reading before, and the count of every
  column now. Most lines are ordinary — a cook finishing empties Taken —; they are what explains the next time cards
  vanish while GitHub still holds them. A failed reading empties nothing, and logs nothing.

*Code: `surFaits`, `signePerime`, `garderLaCarteEnMain`, `poserLesCartesResolues` in `app/src/vue/vue.js`;
`app/src/colonnes-videes.ts`. Tests: `app/test/rail-sous-les-mains.test.ts`, `app/test/colonnes-videes.test.ts`.*

### The project opened there: its Rail and its Second never stay blank (#1435)

A project opened from that screen has neither a box nor a station on this computer. Its two tabs
still show something, always:

- **Rail** shows the project's one rail view (#2076): its rail read from its GitHub repository, like
  that of any project, whichever station serves it — On the rail, Taken, Pass, then Awaiting you (Todo) with each card that awaits
  you and its gestures, Waiting and Served. The app reads the repository of
  every project in the projects file, not only of those it knows a station serves: a project whose
  kitchen runs on another station has the same view as one served by this computer. The rail its
  station publishes in its gist (#1432) no longer draws columns of its own: until GitHub is read,
  it only says why. While it is read, one sentence says so. When it cannot be read, the head is the
  runtime's sentence, its detail in the hover: not signed in to GitHub, with `Sign in to GitHub` (the
  same action as the first-launch screen; signed in, the rail is read again); no `gh`,
  with `get the GitHub CLI`; anything else — no station serves the project, its station publishes no
  rail, GitHub refuses or is out of reach — with `read again`. When the rail is published but the
  repository is not read yet, the head says `Reading <project> on GitHub…`, then, if it
  cannot be read, `The rail is not drawn: <why>` — a repository GitHub does
  not show, GitHub refusing —, with `read again`, which reads both again; when and for which repository the rail was
  published is in its `?` hover. Cooks keeps its one line: no station serves the project on this
  computer.
- **Second** starts as the runtime plans it (#1433): the `claude` the PATH gives, and on Windows what
  launches it. When it cannot start, there is no terminal: its note says why in one sentence
  (`The second cannot start: claude and git are missing on this PC.`), and under it each missing
  tool by name, with `how to get <tool>`, which opens the page that explains it: the button carries
  the gesture, no command is written out to copy. Why the second needs the tool, and the runtime's
  sentence on how to get it, are in the `?` hover. `try again` checks the tools again and starts the
  second when they are there. When it starts but a tool is missing (`gh`, `git`), the terminal is
  there, and above it the sentence that says what will fail, then the tool and its button. Any other
  failure — the project's folder missing, a launch refused — is said in the note's one sentence,
  with `try again`.

*Code: `app/src/vue/rail-publie.js` and `app/src/vue/outils-du-second.js` (the screens), `poserRail` in
`app/src/vue/vue.js` (which view a project gets), `railDuProjet` and the rail's watches in `app/src/main.ts`, the
plan of the second in `app/src/terminaux.ts`. Captures: `docs/captures/1435/`.*

### The project view is the rail view (#1692)

A project has one view: the rail view, with its columns, its ticket cards, its TODO and its
gestures. It is fed from the project's GitHub repository (read with the token of this computer's `gh`, #1694, #2061),
with no other machine to reach; the app only has to be connected to GitHub. The screen #1588 added for a board read
from GitHub — a TODO column and the raw `status` sections, with `use the direct link` and its own decision buttons
(#1590) — is gone, and so are its bridge calls (`tableauDuProjet`, `ouvrirDuTableau`, `gesteAuTableau`) on the desktop
and the phone. The gestures of the card and the sheet that have a fact on GitHub are written there by the app itself
(`app/src/gestes-github.ts`): `remove from the rail` removes the `fire` label from the issue; `back to the kitchen` and
`it arrived` after WAITING remove `waiting` (#1740, below); the chef's comment is posted on the issue (see "A rail
card's history and discussion"). The others send nothing and say where to act instead (`SANS_FAIT`): a delivery is merged on its PR on GitHub, or
by the station's pass, and the app has no button for it; a TODO card's choice or text has nowhere to go. Since #2076, this is true of
every project, whichever station serves it: the repository of a project served by another station is read too, and its
rail is this same view, in the same order — the rail a station publishes in its gist only says why GitHub is not read
yet (#1435, above). Captures: `docs/captures/1695/` — `espace-projet-avant.png` (the screen removed) and
`espace-projet-apres.png` (the rail view of the same project), and `espace-projet-gestes-apres.png` (the
sheet of a TODO ticket whose decision is known, offering its gestures).

### The rail and its cooks, read from GitHub (#2220, #2061)

A project's stations take, cook, review and merge its tickets on GitHub. So the Rail and Cooks tabs are drawn from
the project's repository alone — nothing comes from a box —, at most once a minute per project, with this computer's
`gh` token (`app/src/tableau/lecture.ts`). Every read is conditional: a 304 costs nothing.

That token's hourly budget (5,000 requests) is shared with the chef's own `gh`, so the app keeps its own reads far below
it (#3007, `app/src/budget-github.ts`): when GitHub says less than 20% of the budget is left (`x-ratelimit-remaining`),
or refuses a read for going over the rate limit, the app sends no read for any project until the time GitHub gives
(`x-ratelimit-reset`, or `retry-after`; one minute when it gives none). Each project keeps its last rail meanwhile; one
never read says the reads are paused and until when. In `app/test/budget-github.test.ts`, six projects that each change
every three minutes, polled for eight simulated hours against a fake GitHub, cost at most 894 counted requests (every
answer but a 304) in any hour, under the 1,000 the test allows.

- **Rail**: every open issue labelled `fire`, all pages, in the column of the state its labels (`taken`, `in-pass`,
  `waiting`), its open pull request and the base's check-runs give (`etatDuTicket`, as the stations read it): On the
  rail, Taken, Pass (`base red` when the base is red), Waiting — in `prio:` order, then by number. A taken card says the
  station that holds it and since its claim; a card in pass, who cooked it and since its PR, and its PR number on its
  `right now` line; a queued card, since its issue was created.
- **Cooks** (#2358): every station of the project as GitHub tells it, the box and a computer by the same rule, in the
  same line — none is the main station, none carries "move the kitchen" or a stop button. A station of the project is
  one the app chose the repository for (`selection` of its registration gist), or one holding a claim comment on an
  issue (`<!-- brigade:prise station=… -->`,
  the earliest claim wins, a release comment or the removal of `taken` or `fire` drops it — `app/src/vue/cooks/prises.ts`
  says it as the runtime's `prise.ts` does); its name is the one of its claims, `<machine>/claude`. Its sign of life is
  the `lastSeen` it rewrites in its registration gist every two minutes, read by the main process at that pace
  (`app/src/vue/cooks/signes-de-vie.ts`). Each line says:
  - **cooking**, `reached` — it holds a ticket: its cooks are the cards of the tickets it holds, taken or in pass with
    their PR, within one reading of the board;
  - **idle**, `reached` — it holds none, and its sign of life is fresh (at most two missed refreshes, the registration
    contract's rule);
  - **not reached**, and `last sign of life <date> UTC` on screen — it holds none and has gone silent, or stopped.
    "open Brigade on that computer" is in the hover.
  A station holding a ticket with a silent sign of life is still `cooking` (GitHub says so until its lease is taken
  back), `not reached`. When the signs of life cannot be read, one line says so — the reason in the hover — and only
  the stations holding a ticket are listed, their pill `no word`. Nothing of the block comes from a station's log, or
  from a main station. *Rule: `runtime/src/stations-github/stations.ts`. View: `app/src/vue/cooks/stations-github.js`.*
- **The head lines** the view reads from `status` are only `rail` (the counts by state) and `cooks`, and the `awaiting`
  block is one head line counting the TODO cards (below). What only a station's log carries — the project switch and
  the manager's state, the idle-kitchen fault, a kitchen `held` or stopped, Served — is not read from GitHub, and the
  view says nothing of it.
- **Before the rail** (the Backlog, #1836): the other open issues, without `fire`, filed from their labels alone —
  `hors-cuisine` or `blocked-on-human`: set aside; `epic`: epic not split yet; both a `model:` and an `effort:` label:
  ready, not fired; otherwise not calibrated yet. If that reading fails, the view says nothing about it: the rail is
  still shown.
- **A failed reading** keeps the last columns, said stale (#2151); with nothing read before, it is titled
  `NOT READ FROM GITHUB`, its reason in one sentence. GitHub not reached at all is offline (#1818): the last rail stays,
  and says since when.
- **Todo holds only what asks something of the chef, and each card asks it (#2422, after #2075).** An issue labelled
  `fire` that carries `hors-cuisine` or `blocked-on-human` is set aside, whatever its other labels say (a
  `blocked-on-human` delivery keeps `in-pass`: it is not in Pass); with `waiting` as well, the chef moved it to a third
  party: it is in Waiting. Then:
  - **`blocked-on-human`** (the delivery changes what judges it) is a question with its gesture: the card in Todo reads
    "Merge PR #2416 by hand? It changes what judges it.", the PR number opens the PR, and the merge is done on GitHub.
  - **`hors-cuisine` for a technical cause** (sends back exhausted, cooks without a delivery, or put by hand with no word)
    is the second's work, not the chef's: it **stays out of Todo**. It remains on the rail, in its set-aside column
    (**On the rail**, `86`). Its card says at the top **"Will not start: <reason in plain words>."** (#3147) — every
    reason the station can produce has a sentence in `app/src/refus.ts`, a test fails when one has none, and a reason it
    does not know falls back to a generic sentence, never to the raw message alone. The station's own message stays
    behind "details", whole. The card offers three buttons: **Relaunch** (removes `served-elsewhere` from the issue),
    **Close as already done** (closes the issue as completed; the card leaves the rail) and **Ask the second** (the
    hand-over of "ask the second" on a Todo card). The first two write on GitHub through the `refus` bridge call
    (`app/src/gestes-refus.ts`), and only for a ticket the latest read shows set aside by the `served-elsewhere` label; a `86` the station clears by itself (quota, absent station…) keeps its previous line and has no such buttons. Only an `hors-cuisine` ticket whose latest marked comment is `<!-- brigade:todo kind=product-question -->`
    (the convention of #2217) enters Todo, and its card is that question, answered on the card (#2434, in the section
    "The chef's TODO read from GitHub" below).
  - **A `chef-todo` card whose question cannot be read** (no marked comment, or a marked comment with no text) is not shown
    in Todo (#2455): the second is told why in one line of the `awaiting` block of `status` (and of the second's queue), and the chef sees the
    card only once a readable question is written. The same holds for a repair of a red base that failed: it enters Todo
    only with a question for the chef; set aside with no question (`hors-cuisine` after cooks without a delivery or sends
    back), it is the second's, and Todo says so in one line that asks nothing.
  - **An issue labelled `kitchen-board`** (the Kitchen board itself) is never a card, on the rail or in Todo.

  The reason line is taken from the latest comment of a repository author (`OWNER`, `MEMBER`, `COLLABORATOR`) that names the
  label — or, for `blocked-on-human`, the station's "this delivery changes what judges it" comment —, the manager's comments
  aside. The station's comments are said short; any other comment, by its first line. A `#N` in the line opens that issue or
  PR on GitHub on click. No claim is read for it, and the `rail` line of `status` counts it apart (`3 set aside`). *Code:
  `app/src/tableau/mise-de-cote-github.ts`, `app/src/vue/rail/github.ts`. Tests: `app/test/tableau/mise-de-cote-github.test.ts`,
  `app/test/vue/rail/github.test.ts` (the Todo of 2026-11-05: 13 issues, two cards), `app/test/rail.test.ts`.*

*Code: `app/src/tableau/lecture.ts`, `app/src/vue/rail/github.ts`, `app/src/vue/cooks/prises.ts`,
`app/src/vue/cooks/signes-de-vie.ts`, `lireLeTableau` in `app/src/main.ts`. Tests: `app/test/vue/rail/github.test.ts`,
`app/test/vue/cooks/prises.test.ts`, `app/test/vue/cooks/stations-github.test.ts`, `app/test/vue/cooks/signes-de-vie.test.ts`,
`runtime/test/stations-github/stations.test.ts`, `app/test/tableau/lecture.test.ts`. Captures: `docs/captures/2220/` —
`rail-github-seul-avant.png` and `-apres.png`, `cooks-github-seul-avant.png` and `-apres.png`; `docs/captures/2358/` —
`cooks-github-seul-avant.png` and `-apres.png`, `cooks-github-stations-avant.png` and `-apres.png` (one station cooking,
one idle, one silent).*

### A project you cannot write to opens read-only (#3163)

Each reading of a project's rail also reads what this computer's GitHub account may do with its repository:
`permissions.push` of `GET /repos/<owner>/<repo>`, the same path the rail reads for its base, so a reread is a 304 that
costs nothing (`app/src/tableau/ecriture.ts`). When GitHub says `push: false`, `facts` carries `lectureSeule` with the
repository, and the project opens read-only:

- **Everything is seen**: the rail, its cards, Todo, the stations and the cooks, as for any project.
- **No gesture is offered**, absent rather than greyed: no choice, field or `send` on a Todo card (its question is read),
  no `Relaunch` or `Close as already done`, no WAITING gesture, no `Add a station`, no breaker `Resume`, no project
  switch, no `stop the kitchen` or `resume the kitchen`, no `Set up for Brigade`. A ticket's sheet keeps only what opens
  something or asks the second (`open the issue`, `ask the second`…): no priority, no `remove from the rail`, no comment
  to post, no answer to its question, no lifting of `blocked-on-human`. The phone's list of cards awaiting you leaves
  that project's cards out. In Settings, what is proposed to the repository by a pull request — the project settings,
  its humans, its contributing stations, the duration caps and the closer — is not laid.
- **One line at the top of the project**, in its band, says it: `Read-only: your GitHub account cannot write to
  <owner/repo>.`, with two links: `how to get write access` (GitHub's page on inviting a collaborator: the owner invites
  you) and `fork it` (the repository's fork page on GitHub). The main process — on the phone, its bridge
  (`app/android/web/pont.js`) — opens them only for the repository the latest reading says read-only
  (`app/src/lecture-seule.ts`).
- **The second** can still be talked to. Its opening reads the same permission, and when the account cannot write, its
  context carries the same `Read-only:` line and what follows from it: it explains what is happening there and changes
  nothing — no issue, label, comment, merge or push (`app/src/second/file.ts`, `app/src/second/role.md`).
- **Write access gained**, the next reading no longer carries `lectureSeule`: the line goes and the gestures come back,
  without reopening the project. When GitHub does not say (no `permissions` in its answer, a refusal, no answer), nothing
  is decided in its place: the view stays the ordinary one, and the rail is still read.

*Code: `app/src/tableau/ecriture.ts`, `app/src/tableau/lecture.ts`, `lectureSeule` in `app/src/faits.ts`,
`app/src/vue/lecture-seule/lecture-seule.js`, `lectureSeuleDe` in `app/src/vue/vue.js`, `ouvrirLectureSeule` in
`app/src/main.ts`. Tests: `app/test/lecture-seule.test.ts`, `app/test/tableau/lecture.test.ts`,
`app/test/second/file.test.ts`.*

### The chef's TODO, read from GitHub (#2221, epic #2209)

Todo is what awaits the chef, read from GitHub alone (#2460): no Kitchen board feeds it any more (#2061), every item is a
fact on GitHub. The second reads the same thing at its opening (below, "The queue is read for the second"): one reader,
`lireCeQuiAttendLeChef` in `app/src/tableau/attente-du-chef.ts`, so the app and the second never contradict each other. The
chef's rule (#2455): an item of Todo is a fact on GitHub — a label, a PR awaiting the chef — and always asks the chef a
question. On the repository's open issues, read with the token of this computer's `gh`, conditional reads:

| GitHub fact | its line: the question, then the gesture |
|---|---|
| `fire` + `blocked-on-human`, the station's comment naming the PR | `Merge PR #N by hand? It changes what judges it. — merge PR #N on GitHub` |
| `fire` + `hors-cuisine`, a `product-question` marked comment with no answer after it | its question — `answer on its Todo card: “<choice>” or “<choice>” — or in your own words` |
| `chef-todo` | the question of its latest marked comment, and how to answer it, the same way |
| `question`, `decision`, `blocked-on-human` (the manager's set-asides, not on the rail) | the box's words: `set aside by the manager, it carries question — to decide: answer it then remove the label, the manager judges it; or close the issue` |

A `fire` + `blocked-on-human` ticket without a PR reads like the manager's `blocked-on-human`, its reason first. An issue
carrying `waiting` waits for a third party, not the chef; an issue carrying `kitchen-board` (left from the old path) is
never an item; a technical `hors-cuisine` stays on the rail (#2422). Items go oldest first: since the comment that says
them, or since their label was put. They are written as the `awaiting` block of `status` (the line of each ticket, then
its title), which Todo, the home page and the second all read; when there is none, the block says `nothing awaits the
chef`. A GitHub reading that fails is a failed reading of the project (the rail keeps its last columns and says it is
stale), never an empty Todo.

A `chef-todo` card takes its kind and its text from the issue's latest comment that starts with `<!-- brigade:todo
kind=<blocked|merge-by-hand|product-question|abandoned> -->` (the convention of #2217, in `app/src/tableau/todo-github.ts`,
read as is): one line that says what the kind asks of the chef, then the comment's text. The issue number on the card opens
the issue on GitHub. An issue with the label whose question cannot be read — no marked comment, or one without text — is
not in Todo (#2455): the second is told, in the `awaiting` block, which issue it is and why, so the question gets written on
the ticket, or the label taken off if it is technical. The chef lifts the label on GitHub, and the card leaves Todo at the
next reading (within a minute, or after a gesture).
*Code: `app/src/tableau/attente-du-chef.ts`, used by `lireLeTableau` (`app/src/main.ts`, `avecCeQuiAttendLeChef`) and
`app/src/second/file.ts`. Tests: `app/test/tableau/attente-du-chef.test.ts`, `app/test/second/file.test.ts`.*

**"ask the second" on a Todo card hands the card over (#3133).** Every Todo card — with or without a gesture or a
question — ends with an `ask the second` button. One click writes into the project's second, without Enter, a prepared
first message on one line: `/brigade:ask <N>`, the issue number, the card's question (or `no question found on #N`), and
what the issue says — its title and its last relevant message (the most recent one that says something other than the
question already handed over, cut past 1,500 characters), read from GitHub by the workstation's `gh`. An issue that
cannot be read does not stop the handover: the message says why and asks the second to read it. The chef pastes
nothing; their Enter sends it. A stopped second is launched first and nothing is written, as for any button.
*Code: `app/src/passation-second.ts`, `app/src/vue/todo-carte/demander-au-second.js`, channel `passerAuSecond`
(`app/src/main.ts`). Test: `app/test/passation-second.test.ts`.*

**Answering a card on the card (#2434).** A card of the chef read from GitHub — a `chef-todo` issue, or a `hors-cuisine`
`product-question` (below) — has the shape of every Todo card (#1281, `runtime/src/carte-todo/forme.ts`): its
question, one button per choice, a free-text field with `send`, and `ask the second`. GitHub is the only state, and the app
plays the gesture itself. The convention of the marked comment is extended, not changed:

```
<!-- brigade:todo kind=product-question -->
Is every project on GitHub-only now, so the old path can go?
- [resume] Yes, every project is on GitHub-only: remove the old path
- [drop] No, keep it waiting

The old path still runs on two projects.
```

The question is the comment's first written line; each line `- [<gesture>] <label>` after it is a choice, in order, the
gesture among `resume`, `merge`, `drop`, `close` (a GitHub check box `- [ ]` or `- [x]`, or another word, is not a choice);
the rest is drawn under the question. A comment without choices reads as before, and keeps the free-text field. The first
choice is drawn as the recommended answer (#2922): whoever writes the card lists the answer it recommends first. The question
is said once: the card's line says what its kind asks (`A product question waits for your answer.`), the card asks the
question, and the sheet says it under `what it asks you`, its head saying what the kind asks (never `what blocks it: not
communicated`).

**What a TODO card shows at first sight (#3086).** In this order, and nothing more: the ticket number and its title, once;
one line of situation — the first sentence the comment says after its question, whole, else the line of its kind; the
question, the strongest line; the recommendation, `Recommended: <first choice>`; the answer buttons, each label read whole
(no cut text, no `?` beside it — what a button does is on the button, at hover). Everything else — the rest of the comment,
who asked a manager's question and when — is behind one `details` fold, closed by default. The phone's card follows the same
order. *Code: `poserCarteDeTodo` (`app/src/vue/carte-todo.js`), `poserLaCarte`
(`app/src/vue/cartes-du-chef/cartes-du-chef.js`), `carteDuChefDeTodo` (`app/src/carte-todo.ts`). Tests:
`app/test/vue/carte-todo.test.ts`, `app/test/cartes-du-chef/cartes-du-chef.test.ts`, `app/test/carte-todo.test.ts`.*

A click on a choice, or a typed answer, posts a comment on the issue from the chef's `gh` — `<!-- brigade:reponse
gesture=<g> -->`, then the chosen label, or the text — then plays the gesture on GitHub (a typed answer plays `resume`):

| gesture | what the app does on GitHub, after the comment |
|---|---|
| `resume` | removes `hors-cuisine` and `chef-todo`: the ticket is back on the rail, and its cook reads the answer in the issue |
| `merge` | merges the PR the card names — the `#N` of the choice's label, else the ticket's open PR (`cook/<n>-…` branch or `Closes #n`); with none, nothing is sent |
| `drop` | removes `fire`: the ticket leaves the rail, its issue stays open |
| `close` | closes the issue (`not planned`): the ticket is not cooked |

Every gesture also removes `chef-todo`, and a `product-question` followed by a `brigade:reponse` comment no longer asks
anything: the card leaves Todo at the next reading, read again right after the answer. Nothing is sent for a card that changed
since it was read, an empty answer, or a merge with no open PR; a gesture GitHub refuses after the comment is posted is said on
the card (`your answer is posted on #N, but its gesture (…) was not played — play it on GitHub`), the reason on hover.
*Code: `formeDuChef` in `app/src/tableau/todo-github.ts`, `carteDuChefDeTodo` in `app/src/carte-todo.ts`,
`app/src/tableau-gestes/reponse-github.ts`. Test: `app/test/tableau-gestes/reponse-github.test.ts` (#2061 and #1554 rewritten
with choices, a click on each gesture against a fake GitHub).*

**Cards assigned to someone else than the chef (#2761, epic #2748).** Todo shows the account this computer's `gh` is
signed in to the cards that await it. A card awaits the humans its issue lists among its assignees on GitHub; without
an assignee, it awaits the chef — `chef` in the repository's `.claude/brigade/projet.json`, or, without it, the
repository's owner. A signed-in human sees in their own list only the cards that await them; with none, the usual empty
Todo. A card they see is the chef's card unchanged, answered with the same buttons and the same answer flow (above). An
account or a `projet.json` that cannot be read splits nothing: every card is in the list. The account is read again at
most every five minutes, and right after a GitHub sign-in. *Code: `app/src/vue/cartes-assignees/cartes-assignees.ts`,
used by `lireLeTableau` (`app/src/main.ts`). Test: `app/test/cartes-assignees/cartes-assignees.test.ts`. Captures:
`docs/captures/2761/` — `todo-cartes-assignees-avant.png` (the human sees all four cards) and
`todo-cartes-assignees-apres.png` (only their two).*

**Awaiting others (#2985, #3071).** The cards that await another human of the project are not lost, and never drawn under the
rail: they close the Todo column, after the viewer's own cards, in a section **Awaiting others (N)**, N their number,
folded by default — unfolded, it stays so at the next reading. Assigning a card is for notification and readability, never
to stop a human from moving it forward: unfolded, each one is a card of Todo — it opens its sheet on a click, and takes the
same answer, choices, field and gestures (answer, put on the rail, close, waiting for…) — and says in addition who it awaits,
by GitHub login (`awaits alice, carol`), without the “awaiting you” mark. The answer is posted on GitHub with the account
signed in on this computer, like any other answer; the card stays under Awaiting others, and out of the Todo count, until
the reading says otherwise. The chef sees the same way: a card assigned only to others is under Awaiting others;
an unassigned one, or one that lists the chef among its assignees, is the chef's own. When nothing awaits another human, the section
is not shown. The narrow screen draws the same section at the end of its Todo, and the phone splits its cards for the
account it is signed in to, as the desktop does, and answers them the same way. *Code: `partagerLesCartes` in
`app/src/vue/cartes-assignees/cartes-assignees.ts`, `faits.attendAutres` (entries shaped like `attend`'s, plus `qui`) written
by `avecLAttenteDuChef` (`app/src/tableau/attente-du-chef.ts`), the column's `autres` (full cards) in `rail`
(`app/src/faits.ts`, `entreeDe` for the sheet, the chef's card and the address), drawn by `app/src/vue/todo/autres.js`.
Tests: `app/test/cartes-assignees/cartes-assignees.test.ts`, `app/test/vue/todo/autres.test.ts`,
`app/test/lecture-github-telephone.test.ts`, `app/test/gestes-github.test.ts`.*

**What goes into Todo (#2422):** only what asks something of the chef, and each card asks it. A `blocked-on-human` ticket
is the question "Merge PR #N by hand? It changes what judges it." with the PR link, to merge on GitHub; a technical
`hors-cuisine` ticket (sends back exhausted, cooks without a delivery) is the second's work: it stays on the rail, in its
set-aside column, with its reason line, and only one whose marked comment is a `product-question` enters Todo; an issue
carrying `kitchen-board` is never a card (the rule, with its reading, is in the rail section above). Captures:
`docs/captures/2221/` — `todo-github-seul-avant.png` (the same four cards without the kind and the text) and
`todo-github-seul-apres.png`.

### Changing a ticket's priority (#1739)

A ticket's priority is the `prio:<n>` label of its issue on GitHub. On the sheet of a rail card, `change the priority`
offers `1` to `9` (`1` is served first) and `none`; nothing is chosen in advance, and the button stays inactive until a
value is. A click and **the app replaces the label itself on GitHub** (`app/src/priorite.ts`), with the token of this
computer's `gh`: it reads the issue, puts the new `prio:` label, then removes every other one (`none` removes them all
and puts none). No box, no second: the gesture works with the project's kitchen unreachable. It costs
nothing, and asks for no confirmation.

- **Done**: the sheet says `priority changed on GitHub: #22 now carries prio:1 — the box reorders the rail when it reads
  it`, the issue's address on hover. The card and the sheet show the new priority at once. The station reads the label
  at its next turn and reorders the rail; as long as the rail read from GitHub still shows the old priority, the rail
  keeps showing the one the app wrote. Once a reading shows another priority, that reading says it.
- **Failed**: nothing changes on the rail, which keeps the old priority, and the sheet says why in one line — `nothing was
  changed: issue #22 was not read on GitHub`, `nothing was changed: GitHub did not put prio:1 on #22` —, GitHub's answer
  on hover. A refusal after the new label is put (the old one could not be removed) says which `prio:` labels the issue
  now carries. The chosen value stays chosen: one click tries again.

The box has no command for it: the label is read like any other (`docs/runtime/journal-et-rail.md`). Captures:
`docs/captures/1739/` — `fiche-priorite-avant.png` (the old path: the command went into the second, through the box),
`fiche-priorite-apres.png` (the label changed on GitHub, the sheet showing `prio:1`) and `fiche-priorite-echec-apres.png`
(GitHub refused: the sheet keeps `prio:2` and says why).

### Sending a ticket back to the kitchen after WAITING (#1740)

`it arrived, back to the kitchen`, on a WAITING card, and `back to the kitchen`, on the sheet of a ticket back from
WAITING into TODO (recommended there, confirmed with its cost), are one gesture: the app removes the `waiting` label
from the ticket's issue itself (`app/src/gestes-github.ts`, #2061), with the token of this computer's `gh`. No second, no
command: the gesture works with the kitchen unreachable — the ticket leaves WAITING (or TODO) and goes back on the rail,
queued, without going through TODO.

- **Done**: the card says ``back to the kitchen on GitHub: #<n> no longer carries `waiting` — it is queued on the rail
  again`` under its buttons, the issue's address on hover; the sheet says the same under its gestures. While the gesture
  is on its way, the card says `it arrived, back to the kitchen: sent, waiting for the answer…` and its buttons are
  inactive. An issue that no longer carries `waiting` counts as done.
- **Not done**: nothing changes and the card says why in one line, in red — the rail not read yet, a ticket the
  latest reading does not carry, or GitHub refusing (``nothing was changed: GitHub did not remove `waiting` from #<n>``,
  GitHub's answer on hover). One click tries again.

Captures: `docs/captures/1740/` — `carte-waiting-arrivee-avant.png` (the old path: the command went into the second,
through the box), `carte-waiting-arrivee-apres.png` (the gesture said on the card),
`carte-waiting-arrivee-echec-apres.png` (GitHub refused: the card stays and says why), and `fiche-cuisine-avant.png` /
`fiche-cuisine-apres.png` (the sheet of a ticket back from WAITING, `back to the kitchen` confirmed).

### WAITING on a GitHub project (#3075)

On a GitHub project, every TODO card carries **waiting for…**, on the card and on its sheet, on a wide screen as on a
phone's. It opens the form of #591 on the card (or the sheet): *what it waits for, in your words*, *from whom*, and
*follow-up on*, proposed seven days from today. **put in WAITING** sends it; a form without what it waits for, without
whom, or with a follow-up that is not a day after today is refused, the sentence under the fields, and nothing leaves.
**Cancel** closes it. The buttons and the form are `app/src/vue/attente/attente.js`; what the chef typed is read by
`app/src/vue/attente/saisie.ts`, the same reading for every path.

- **Where it goes.** When the project's kitchen runs on this computer, *waiting for…* and *resume* go through the
  runtime's `waiting set` / `waiting resume` command, typed in the project's second (`app/src/attente.ts`). Otherwise —
  the project served elsewhere, or the phone — they are written on the issue as the runtime writes them there
  (`app/src/vue/attente/attente-github.ts`): *waiting for…* posts the WAITING comment (`**WAITING: awaiting <who>.**
  <what>`, then *from whom*, *since*, *follow-up*, *on arrival*, the shape of `direMarque` in `runtime/src/attente.ts`,
  its dates with their year), then sets the `waiting` label; *resume* removes the label, and the ticket goes back to
  what its other labels make it — a TODO card back in TODO. *it arrived, back to the kitchen* removes the label, as
  before (#1740). A comment GitHub posted but whose label it refused is said: the ticket is not in WAITING.
- **What is read.** An issue carrying `waiting` is never a TODO entry, whatever else it carries. Among the issues the
  app already lists — `fire`, `chef-todo`, `question`, `decision`, `blocked-on-human` —, each one carrying `waiting` has
  its last WAITING comment read (`app/src/tableau/attente-du-chef.ts`), and no other list is asked of GitHub (the
  budget of #3007): its card in WAITING says
  `waiting for <what> · from <who> · follow-up <day>`, its sheet adds since when and what arrival does, and it carries
  *resume* and *it arrived, back to the kitchen*. An issue that is not on the rail (no `fire`, a `chef-todo` card) is
  placed in WAITING too. A comment that does not read leaves the card in WAITING with `not given`; a reading of these
  issues that fails leaves TODO read, and says why in the reading's notes. The second and the notifications do not pay
  for this reading.

Captures: `docs/captures/3075/` — `attente-github-avant.png` / `attente-github-apres.png` (the rail: the button on each
TODO card, #40 in WAITING with what, from whom and its follow-up), `attente-github-dialogue-apres.png` (the form opened on
#41; before, there was no button to open it), `attente-github-fiche-avant.png` / `attente-github-fiche-apres.png` (the
sheet of #41), `attente-github-telephone-*.png` and `attente-github-waiting-telephone-*.png` (the same cards at phone
width).

### The second's choices, as buttons under its terminal (#1520)

When the second asks you to choose ("A, B or C?"), it also publishes its choices through its own channel
(`runtime/src/second-propositions/`, #1519): the app never reads the terminal. Under the second's terminal, one
line says `The second asks you to choose` (how to answer is in its `?` hover), then **one button per choice**: what
a click types — its value, `A` — and its one-line label, whole; a long label wraps, it is not cut.

- **A click answers**: the value is typed into the second, then Enter, exactly as if you had typed it; the buttons
  go away and the terminal takes the keyboard back.
- **Typing your own answer** in the terminal works as before: once you press Enter, the buttons go away too. A
  keystroke without Enter, a newline (Shift+Enter) or a paste leaves them.
- Either way, the app tells the channel you answered, and the channel clears that proposal — and only that one.
- **A new proposal replaces the buttons** of the previous one; when the second moves on, it clears its proposal and
  nothing stays under the terminal.
- **With no pending proposal, nothing is shown**: the terminal is as before. The buttons are only under the second
  — not under a shell, not under another project's second, not under a second that stopped (a keypress restarts it,
  it would not receive the choice).

A gesture the second publishes (a merge, a box command) is shown in the same place, as a button: see below.

*Code: `app/src/vue/second/choix.js` (the buttons), `app/src/second/propositions.ts` (the channel followed for each
project, in the main process). Captures: `docs/captures/1520/`.*

### The gesture the second names, as a confirm-then-run button (#1521)

When what you have to do is a command — a merge, a pass on the box —, the second publishes it as a gesture through
the same channel. Under its terminal, one line says `The second asks you to run a command` (how it works is in its
`?` hover), then **one button, `Run the second's command…`**, in plain words: no command line is written on the screen. The
exact command, in full, is read on hovering the button, and again in the confirmation: nothing shortened or rewritten
— a long command wraps between its words, its spaces and quotes kept as published.

- **A click opens a confirmation**, under the button: `Run this command in the second's terminal, in your name?`,
  a folded `the exact command` line that opens on the full command, then `run it` and `cancel`. Nothing runs yet; a second click on the button closes it.
- **`cancel` runs nothing**: the confirmation closes, nothing is typed into the terminal, and the button stays — the
  gesture is still proposed.
- **`run it` types the command into the second's terminal**, exactly as published, then Enter — as if you had typed
  it yourself, in your name (`! …` is `claude`'s shell mode). The button goes away, the terminal takes the keyboard
  back, and the app tells the channel you did it.
- **The second never runs it.** Publishing, publishing again or writing the command in its terminal only shows the
  button; the only path that types the command is your click, then your `run it`.
- **When the second moves on** (it clears its proposal) **or publishes a new one**, the button goes away, and an open
  confirmation with it: its `run it` no longer runs anything. Typing your own answer in the terminal (Enter) also
  answers the gesture, as for choices.
- Like the choices, the button is only under the second of its project, while it runs.

*Code: `app/src/vue/second/geste.js` (the button and its confirmation), `tenirLesChoix` in
`app/src/vue/second/choix.js` (what the view holds: the open confirmation, the gesture run), `lancerLeGeste` in
`app/src/vue/vue.js` (the only write). Captures: `docs/captures/1521/`.*

### From the app

Once the file has a project, adding another is the **+**, at the foot of the bar, which opens
**Add a project**. Adding a project is **declaring it in the app**: its folder, its repository and its branch, and
nothing else. No station is asked and no machine is reached; the project enters the projects file, has its tab and
its line on "All projects", and that is all. Entrusting its kitchen to a station is another gesture, from the project's
page, when you decide it (see "Add a project to your stations, without a terminal").

| What you give | How |
|---|---|
| **Its folder on this workstation** | `Choose…` opens the Mac's folder picker: it is not typed |
| **Its GitHub repository** | `<owner>/<name>`, with no address and no `.git`. The app reads it from the origin of the chosen folder (`git remote get-url origin`) and proposes it; correct it if it is not the right one. With no readable github.com origin, the field tells you so and stays to be written |
| **Its integration branch** | the branch the kitchen delivers to. The app reads the one the clone's origin points to (`git rev-parse --abbrev-ref origin/HEAD`) and proposes it; without one, the field says so and stays to be written |

The project's name is taken from its repository. **Nothing is guessed, and nothing goes while a field is missing**: a
missing or malformed field is flagged with its reason, and nothing is written. A project the file would refuse —
`Not added — two projects are called "brigade"`, `folder not found: …` — is refused with its reason on screen.

- **The app writes only the project added** — then its two colors, drawn for it (see "A project's colors"). What else
  you put in the file stays there — but it is rewritten in full, indented by two spaces: a layout of your own does not
  survive it.
- **It does not write into a file it did not understand**: `Not added — the app does not write
  into a file it did not understand — unreadable JSON: …`. That one is repaired by hand.
- **Renaming a project is done in the file**, not in the app. Removing it is done from the app
  ("Removing a project from the app", below); removing it from the file by hand removes nothing from its station either.

### After the add: the commissioning

A project added is not yet served. The steps that remain are in the project's space, at the head of the panel, under
**Installation** — unfolded by itself for a project you have just added, folded to one line for the others. The steps
are the runtime's (`installation etapes`), read through the project's station, which is the one of this computer; their
state is kept in the project's log, so closing the app and opening it again finds the same steps done. Four actions
matter, **in this order**, and the app skips none:

| | The action | What the app does | What stays with you |
|---|---|---|---|
| 1 | **Prime the repo** — `Run /brigade:init in the second` | opens the space's second on the session: `claude /brigade:init`, a fresh conversation in the project folder | the session itself: it is a Claude Code conversation, not a command, the app does not play it for you |
| 2 | **Merge** — the box `The result of /brigade:init is merged on the integration branch` | says it, in so many words | merge, then tick: **the app does not know whether it is done, you are the one who says so** |
| 3 | **Check** | runs `installation` through the project's station, for you, and displays **everything** it returned | settle what it names, and check again |
| 4 | **Start** | writes nothing: this computer's station runs with the app, there is no service to start | — |

**Three states**, and the check is possible only once init is said merged: **init is not said merged** (`Check` is
inactive: `No check: the result of /brigade:init is not said merged…`); **the check is incomplete** (`NOT READY`, or
nothing yet, or what the app got instead); **everything is ready** (`installation` exited with `0`: `READY — checked
at 14:32:07`). An inactive button has its reason written below, and the main process refuses likewise.

**`/brigade:init` — the app puts you there.** If the space's second is not running, it is launched on the
session, and the line under the right-hand tabs says so (``session launched on `/brigade:init`: `claude
/brigade:init`, a fresh conversation in this folder``). If it is already running, it is not replaced:
`/brigade:init` is written there, without Enter, as by a button. The session can be replayed without harm. The
brigade plugin is needed on your workstation: without it, it is `claude` that says it does not know the command.

**Merging is you.** The station sees of the repo only what its origin carries: as long as the result of init is not
on the integration branch, it can serve nothing. A repo **already primed and merged** does not have to replay the
session: tick the box, and check. **Ticking without having merged starts nothing**: it is `installation` that reads
the integration branch on the origin, and it will say so (`MISSING`, "In the repo").

**Check runs the command that exists**, the same one the bar runs for `status`: `brigade <name> installation`, through
this computer's station. It launches neither a cook nor a setup, consumes no quota, and can be replayed as often as
you like (`docs/installer.md`, "Check that the project is ready"). The app waits for its answer two minutes at most,
and displays **everything it returned, word for word**:

```
NOT READY — checked at 14:32:07

Dans le dépôt
  MANQUE    `.claude/brigade/gates.sh` n'est pas exécutable : la pass le lance tel quel
            → `git update-index --chmod=+x .claude/brigade/gates.sh`, commité sur `main`

Sur GitHub
  MANQUE    labels absents du dépôt : fire, model:opus, model:sonnet, …
            → la même commande, suivie de `labels`

brigade : projet « calculus » : 2 manques : aucun cook ne doit être lancé tant qu'il en reste

→ exit code 1
```

**Each point that is not ready is a `MANQUE` line, and the arrow below says what remains to be done for it**: it is
`installation` that names them, the app translates none of them and removes none. A check replayed **removes the
earlier "ready"** until it has answered.

| What the app says | What happened |
|---|---|
| `READY` | `installation` exited with `0`, with its verdict line (`brigade : projet « <nom> » : prêt…`) |
| `NOT READY` | it was run, and something is missing (code `1`), or it refused its environment (code `2`): its output names it |
| `NO VERDICT` | a code `0` **without** the verdict line: it is not `installation` that answered |
| `NOT REACHED`, `REACHED, BUT UNKNOWN TO THE STATION`… | the command did not return its verdict: the same cases and words as under `status` ("What the station says of the project") |

- **A project whose folder is not there** has neither a second nor a shell: the start says `"…" does not open: folder not found: …`.
- **The commissioning is kept only while the app is open.** Relaunched, the app takes it back at the start, folded:
  unfold it, tick the box again, check — the station says everything again.

### Removing a project from the app

The `Remove this project from the app's sidebar` line of Settings has its one control `Remove from the
app…`, which asks for a `yes, remove "<name>" from the app` before anything happens: a project is not removed by a
stray click. It takes the project off the bar and out of the projects file, and uninstalls the app's plugin from
its folder's local Claude Code settings (see "`/brigade:dev` and `/brigade:ask` in every project the app opens"),
and nothing else: its open terminals are stopped, nothing else in its folder is touched — a `brigade` plugin you
installed yourself stays —, nothing is sent to its station — the project stays installed there, its log
intact — and a notice says so over the screen: `"calculus" is removed from the app.` Uninstalling a project from a
station is not done from the app: it is done on the station itself (`docs/installer.md`, "Uninstall"). To bring the
project back, add it again with the **+**.

### By hand

The file stays yours, and you can do anything in it:

```json
{
  "projets": [
    { "nom": "brigade", "dossier": "~/Dev/brigade", "depot": "benomite/brigade", "base": "main" },
    { "nom": "parade", "dossier": "/Users/chef/Dev/parade", "couleurs": { "onglet": "#a98cf2", "accent": "#4fc7b5" } }
  ]
}
```

- `dossier` is an absolute path, or starts with `~/`.
- `couleurs`: **the project's tab color and accent color** (see "A project's colors"), each
  written `#rrggbb`. You do not have to write it: **the app draws it and writes it itself**
  for a project that has none — when added, at launch for a project declared before they
  existed, or as soon as a project written by hand enters the file. If only one of the two is written,
  the other is drawn. Anything other than a `#rrggbb` color refuses the file (`project no. 1 (parade):
  "couleurs": "onglet" must be a color written `#rrggbb` — "rouge" is not one`).
- `nom` is the project's name; a served project is called the same in the app and on its station.
- `sigle`: **the short label of the project's tile in the bar** (see "The icon bar"), 3 characters at most, no space
  (`"LAB"`). You do not have to write it: absent, the app derives one from the names. It is set from the project's
  Settings, under `you`. A label longer than 3 characters refuses the file (`project no. 1 (mirrorlab): "sigle" is
  4 characters long: 3 at most`).
- `depot` and `base` are the project's GitHub repository (`<owner>/<name>`) and its integration branch.
- **Legacy keys are ignored.** A file written by an older version may still carry keys naming an ssh host, a list of boxes or played stations: it is
  read without error, those keys are left alone and nothing is done with them — where a project cooks is read from the
  project's issues on GitHub and from your paired stations.
- **A project served only by another station is read like any other.** Its rail is read from GitHub whenever a station
  serves it, here or elsewhere. A rail that has returned nothing after a minute stops saying `first read … in
  progress` and says in one line that nothing came back.
- **`commande` is no longer read.** A file that still carries it is refused, saying so:
  `project no. 1 (brigade): "commande" is no longer read — remove it: …`.
- The bar follows the file's order. **Rearranging the icons in the bar** (see "The icon bar") changes
  the order of the `projets` rows there, and nothing else: a project added afterwards arrives at the end.
- **The app rereads this file as soon as it changes** — and every time you come back to its window. The
  bar and "All projects" follow; nothing has to be relaunched (see "When the file changes").
- **The second reads the same file.** The second is the PO role: the session the Second tab
  opens in a project's `dossier` takes `nom` (and `depot`, when there is one) from it, and reads on opening the
  project's queue from its GitHub issues — the `chef-todo` cards and the `fire` rail —, with this computer's `gh` (see
  "The queue is read for the second, at each start"). It relays what awaits you, word for word. A queue that cannot be
  read is said in one line, never as an empty queue.

If the file is refused at launch, the app shows no project: it shows the
file's path, the reason (`unreadable JSON`, `project no. 2 (parade): "dossier" missing`,
`two projects are called "brigade"`…) and the shape of the file, where each value to replace is written between `< >`. A refused file is refused
as a whole, and **the app does not touch it**: nothing can be added from the app until it is
repaired. Repair it, and the app follows without being relaunched. Same for a file it could not
create (`this file could not be created: …`).

### When the file changes

| What changed | What the app does |
|---|---|
| One more project, or the order | The bar and "All projects" follow. Open terminals are not touched; the screen on display stays the same, its reading starts over |
| A project removed, renamed, or whose `dossier` changed | **Its terminals are stopped** — second and shells: they were running in a folder that is no longer its own. The conversation stays with `claude`: on the first click, the second picks the thread up in the new folder. If it was the screen on display and the project is gone, you return to "All projects" |
| The file is no longer readable — an editor mid-write, an extra comma, the file deleted | **Nothing disappears**: the earlier projects stay, their terminals run. A banner, at the bottom of the window, gives the path and the reason; it goes away at the first successful reread |

```
/Users/chef/.config/brigade/app.json changed, and could not be reread:
  → unreadable JSON: Unexpected end of JSON input
Your projects are the earlier ones, and nothing is closed. The app rereads it as soon as it changes.
```

As long as the banner is there, **the `+` writes nothing** — no project: `Not
added — the app does not write into a file it could not reread — …`. Writing over it would lose the projects it
still displays. A file deleted while the app is open is therefore not recreated behind your
back: put it back, or relaunch the app, which creates it empty.

A file the app **could not create** at launch (a folder without permissions, a link that leads
nowhere) keeps its reason on screen, and the app retries every time you come back to its window:
repairing is enough, no relaunch.

A project whose folder is not there (disk unplugged, folder moved) **stays in the
bar**, greyed out, its icon dashed: on click, the app says `folder not found: …` instead of opening
a terminal. Its project is read all the same: the panel and the content tabs answer. The other
projects are not affected.

## All projects at a glance

**Two blocks, and nothing else (#2638, epic #2497).** The home shows exactly two blocks: **Projects** — the project
rows described below — and **This computer's station** (filled by #2640, below). Each block
is its own component: `app/src/vue/accueil/projets/BlocDesProjets.js` and `app/src/vue/accueil/station/BlocDeLaStation.js`.
What the home used to show besides went elsewhere, or was removed:

- **All stations** — the list of stations, the stations under your GitHub account, the station versions and "+ station"
  with its pairing code field — is the last block of **a project's Stations tab**, under the project's own stations and
  this computer's station. The stations under your account are read again each time that tab opens.
- The **Cost** and **Closer** rows, which open the cost and the added / removed ratio of all projects, are the last
  block, **All projects**, of **a project's health strip**, its `Caps, closer and all projects` section of Settings (#3014). Their pages are unchanged.
- The **App** section (the running version, **Update now** / **Later**) is removed: a higher version is said, with
  **Update now**, by the new-version line at the top of the app. The running version, when up to date, is no longer
  shown.
- The **health row** (`Max ✓ · GitHub ✓`) is removed. The main process still computes it (`sante` of
  `app/src/accueil.ts`); the view no longer shows it.

With no project at all, the station lists and "+ station" have no tab to live in: on a computer, the first launch
shows its stations and their projects (`premier-lancement.js`). Captures: `docs/captures/2638/`.

**The station block (#2640, epic #2497).** Three states, in `BlocDeLaStation.js`. **No station on this computer**: one
recommended button, **Install this computer's station**, and no other setting. A click runs `installerLaStation` of the
bridge ("installing the station…", no button meanwhile), then walks the first settings one step at a time — "Step 1 of 2
— GitHub" (**Connect to GitHub**, the gesture the app already has), "Step 2 of 2 — Projects" — each with **Next**, the
last with **Done**, until "the station is ready". A refusal is one line, its detail on hover, and the button comes back.
**Installed** (a card, as `Home.dc.html` draws it): the station's name and its line, then a second row with its version
(and whether a newer one is out) and **Station settings**, which opens its page; no install button. The mockup's
"Update now" is not built: the app has no gesture that updates this computer's station. **Your other stations** are
listed under it, each row opening its page. The bridge's `installerLaStation` (preload and main, `app/src/poste/installer.ts`)
makes sure this app's station is running — on a computer, installing the app installs the station — and refuses in one line
when it is not a station here or refused to start; on Android the bridge has none, and the button says so. The "GitHub" step
may be passed without connecting: the page of the station is where the rest is settled. Tests:
`app/test/accueil/bloc-de-la-station.test.ts`, `app/test/poste/installer.test.ts`.

*Ticket: #870.* The app opens on it, and the round **T** icon, at the head of the bar, brings you back to it. It is
**the overview of brigade**: what is cross-cutting, and nothing else. What belongs to a project —
a piece of information, a setting, an action — is in its space; what belongs to a station, on its page.

```
PROJECTS
● brigade     1 decision awaits you · #867 cooking                 ›
● espace      5 decisions await you, for 2 d                       ›
● calculus    base red · #655 being repaired                       ›

THIS COMPUTER'S STATION
```

- **One row per project**, in the file's order: its name, its dot, and a short sentence that
  says what is going on — **what blocks first**, then **what awaits you** (how many decisions,
  since when), then **what is cooking** (its cooks' tickets, or what is at the pass). Nothing
  going on: `nothing cooking, nothing waits for you`. When the reliability of its cooks has drifted, it ends
  with one word, `drifting`, and hovering says why (#987).
- **A project's dot** is **red** when it is blocked — base red, kitchen stopped or
  held, runtime off, station unreachable —, **yellow** when a decision awaits you, **green**
  otherwise. **Grey** as long as nothing is read from it, or when nothing can be: a project that no station serves
  on this computer. Not read is never green.
- **In All stations, under a project's Stations tab** (#2638), **one row per paired station**: its name, its dot, its state (`online`, or
  `offline for 12 min`), what it is doing — its cooks in progress, `saturated`, `update failed`,
  `Max connection lost`, or `idle` — and the projects it carries. Its machine (system, kernel) and its
  version can only be read **on hover**. Dot **red** when its Max connection is lost,
  **yellow** when it is saturated or an update failed, **green** online, **grey** offline
  or unreadable.
- **A click anywhere on a row opens it**: the project's space, or the station's page
  (see "Your stations: paired by a code, read on GitHub"). **No row carries any
  action** — no merge, no triage, no removing `fire`: decisions are taken in the project.
- **A "Cost" row**, in the All projects block of a project's health strip (#2638), opens **the cost of all
  projects** (#1022), in place of the home (see "The cost of all projects"). It shows no figure: the cost reading only
  starts when its page is open.
- **A "Closer" row**, under it, opens **the added / removed ratio of all projects** (#1682) the same way (see "The
  added / removed ratio of all projects").
- **"+ station"**, under All stations, opens the pairing code field — nowhere
  else. Once paired, the station appears in the list and the field closes, with no
  message left on display; "cancel" closes it, empty.
- **A station registered under your GitHub account** is in the same list (#1778): **each computer once**. A
  paired machine is said by its presence, the projects chosen for it under the account merged in, and "choose
  projects" next to its row opens them, to tick; a machine that is only registered has its own row, which opens on
  them (#1706, see "Your stations under your GitHub account, and the projects each serves"). There is no second
  list, and no "Under your GitHub account" heading.
- **No command** (`brigade …`, `gh …`) **and no raw error text** is displayed there: what
  a row leaves out — the time of the reading, why a box did not answer —, its hover says
  in the app's own words, and the project's space shows it in full.

**The Projects block** (`app/src/vue/accueil/projets/`). One line per project: its state among *cooking*,
*waiting for the chef*, *held* and *idle*, then what is going on in one sentence (the line `accueil.ts` already says),
and, when the chef is expected, an `N awaiting you` pill (`attend` of the line); the stations that serve it are in the
name of the line, not on its face. One click on the line opens the project. "Add a project" sits at the right of the
title (as `Home.dc.html` draws it, #2912) and opens the single guided path (`parcours-projet/`), the same as the "+" in
the bar. An empty list says "no project yet".

**Where it comes from** (`app/src/accueil.ts`). The home asks nothing new of anyone: it is drawn
from what the app already reads. `facts` of each project, every thirty seconds and whatever the
screen, gives the state of its kitchen, its pending decisions and its cooks; `status`, read for each
project while the home is displayed, adds what `facts` does not carry — a red base and the
ticket that repairs it, the cause of a held kitchen, since when the oldest decision has been waiting, a
saturated station, the expiry of the Max token. The stations and their Max connection come from their gists,
on GitHub. A `status` that the home no longer reads is dropped: the row says again what `facts` alone says of it.

**What left the home**: the per-project blocks (their card, the latest event, the output of
`status` and `station`), the lag of the app's code — in each project's settings, and on
hover of the **T** icon (see "The app's code: up to date, or behind") —, the "Projects on
your stations" list and the "add a project" path, on a station's page.

### The cost of all projects

*Tickets: #908 to #912, #1022, #2638.* **In a project's health strip, the "Cost" row opens the cost page of all
projects**, in place of the home, the project's space closed — the **T** icon remains the entry shown, and "‹ All projects"
brings you back to the home. What holds for all projects together lives at the app level; what holds for one project lives
in the project (the home's rule, #868): **no project has a Cost tab**, and what a project has cost is read
on this page, as its share of each figure (its own "cost of this project" block, under Reliability, was dropped by #1699). The page reads `station` (the cap, the cooks,
**the consumed**) **on the box of each project** it still serves, every thirty seconds while it is
displayed — and only then. **At the top,
three figures**: the tokens brigade has launched over **5 h, 24 h and 7 days, all projects together**, and under
each one **each project's share** — its dot, its name, its tokens, its percentage. Each figure is the
sum of the windows that the `consumed` block of `station` communicates, project by project; **a value the box does not
communicate is shown as "not communicated" in place of the figure** — today 7 days, which the runtime does not
count, and any project whose box did not answer. A sum with a project missing is marked "≥" and gives
no percentage. Only projects that have a box, and that it still serves, enter it. **The Max account's quota is
not there**: brigade does not know it, and a single line points to `/usage`. No explanatory
sentence: short labels and figures. **A click on a project's name opens its space.** The code of
this head lives in `app/src/vue/cost/`, next to the page's following blocks. **Under the three figures, the curve of the latest days** (#909, `cost/courbe.js`): the tokens launched
each day, **one line per project**, in the shade of its dot, over the last 14 days at most; a short
title ("tokens per day"), the top of the plot, the days below, **a legend that names each project**, and
what each launched on a given day on hovering its column. Each series comes from the same `consumed` block of `station`:
one line per day, `YYYY-MM-DD: … tokens` (or `: nothing`, a zero); a day a series does not give is a gap
in its line, never a zero. **The runtime does not write these lines yet**: as long as no box gives its
series, the curve area says **"not communicated"**, never an empty chart; a project whose series is missing
while others give theirs says so under its name, in the legend. **Under the three figures, the lost tokens** (#911, `cost/perdus.js`): a single figure, with no explanatory sentence — those
of red attempts ("failed", "refused by the model") and of interrupted cooks (guardrail, "stop", quota,
connection, runtime stopped), read among the "latest cooks" of `station`. **A click on the figure unfolds the list** — one
cook per row: ticket, title, tokens, cause ("red attempt" or "interrupted") —, **a second click, or "close", folds it back**;
a click on a row opens its ticket's card, as for the most expensive tickets.
A lost cook that does not declare its tokens makes the total "≥"; a box that does not list its cooks adds nothing and makes it
"≥" too. If no box communicates them, the figure says **"not communicated"** and the list is not offered; zero lost
cooks is written 0, with no list. The runtime is not touched: the sum is what the box says of it (ten cooks per project at most).
**Then the five
most expensive tickets** (#910, `cost/chers.js`): one row per ticket — its number, its title, its tokens, its
attempts —, **from most to least expensive, five at most**, all projects together. A ticket's cost is the sum of the
cooks the box lists under "latest cooks" of `station` (ten per project at most: that is what it says of them, the
sum is therefore a minimum), and its attempts are those cooks; a cook that does not declare its tokens makes the sum "≥",
a ticket none of whose cooks declare any comes after the others and is shown as "not communicated". The title is that of the
project's rail when it is read, "not communicated" otherwise. **A click on a row opens its project, then the ticket's
card**, over the rail — the rail's one (#621); if the rail does not carry the ticket, the card opens with what is
known of it, its number.
**An overrun of a threshold is seen at a glance** (#912, `cost/seuils.js`): the thresholds are those `station` writes under
"chef's decisions" (`seuil-ticket`, `seuil-perdus`), project by project. When the most expensive ticket exceeds its
project's threshold, or a project's lost tokens exceed theirs, the block turns red and **a single line carries the action, as a button** ("open the card of #7", "open the list");
under the threshold, nothing more is shown. A threshold "not set" is not invented: the block says "ceiling: not communicated"
in place of the alert. The same thresholds judge, the same way, a project's cost on its page.

### The added / removed ratio of all projects

*Ticket: #1682 (epic #1663).* **In a project's health strip, under "Cost", a "Closer" row opens the page of the
added / removed ratio of every project**, in place of the home, like the cost page — "‹ All projects" brings you back. It reads
`closing --json` **on the box of each project** the cost page reads (`RATIOS`, `app/src/onglets.ts`), every thirty
seconds while it is displayed, and only then. Nothing is added to the runtime: the page reads the object that
`closing --json` writes today.

```
added / removed, per project
● brigade   15.5:1  +24,800 / −1,600 · last 100 merges   going down ?
                                                         51–100 merges ago: 20:1 · 21–50 merges ago: 16:1 · last 20 merges: 8:1
● parade    4:1     +18,200 / −4,500 · last 100 merges   flat ?
● cantine   2.8:1   +17,000 / −6,000 · last 100 merges   going up ?
● atelier   7:1     +2,100 / −300 · last 14 merges       not enough data ?
```

- **One row per project with a closer set**, in the file's order; **a project with no closer set has no row**. A
  click on its name opens its space.
- **Its current ratio** is the one of its closer section on Cooks (removed with the Cooks tab, #2921): the longest window, in the words
  of `closing` (`15.5:1`, `nothing removed`), with what it counts below.
- **Its trend — going down, flat or going up — is read from successive values of the ratio.** The runtime keeps no
  history of the ratio: `closing --json` gives it over the last 20, 50 and 100 merges, each window taken from the same
  list of merges. Their differences are three spans that follow each other — merges 51 to 100 back, 21 to 50, the last
  20 —, shown oldest first under the trend. The most recent span is compared with the oldest: more than 10% lower is
  **going down** (green), more than 10% higher **going up** (yellow), **flat** otherwise; the rule is on hover. A span
  that removed nothing counts as the highest of ratios.
- **Too little data says so**: a span counts only with 10 merges or more that changed a line, and a trend needs two.
  A younger branch shows **"not enough data"** — and why, on hover — instead of a trend; its current ratio stays.
- An unreadable integration branch, or a reading that failed, fits in one line (`the integration branch could not be
  read`, `the closer could not be read`), the detail on hover. As long as a box is not read: `reading…`. All read and no
  closer set anywhere: `No project has a closer set.`

The code lives in `app/src/vue/closer/tendance/tendance.js`. Capture: `docs/captures/1682/`.

### The app's code: up to date, or behind

**At the head of each project's settings** (Settings, in its space) — and in one line, **on
hover of the T icon** —, a line says where the code the app runs on stands — that of the clone you launched it from —, with the time of its reading:

```
this app's code is up to date with origin/main — read at 14:32:07, reread when you come back to the window
```

When its clone is behind the origin branch it follows, it says so as an alert, with
the number of commits, and what that means:

```
THIS APP'S CODE IS 39 COMMITS BEHIND origin/main — read at 14:32:07, reread when you come back to the window
  What this app shows may be out of date: what has been delivered since is not in it — a screen, an action, a reading.
  Its clone: /Users/chef/dev/brigade, on branch main.
  One click updates it and relaunches it on the new version — no terminal, nothing to copy. Without a click, it moves to the new version at its next opening.
  It is also the clone of the project "brigade": its second reads the same code there.
[update and relaunch the app]
```

| On screen | What the app read | What it offers |
|---|---|---|
| `this app's code is up to date with origin/main`, discreet | its clone has all the commits of the branch it follows | nothing |
| `THIS APP'S CODE IS 39 COMMITS BEHIND origin/main`, in yellow, solid line | the origin has 39 commits its clone does not — the same number as `git status` after a `git fetch` | **a button**, "update and relaunch the app" — or, if its clone has commits of its own, the command `git -C <its clone> pull` to write in a shell |
| `THIS APP IS RUNNING ON OLDER CODE THAN ITS CLONE'S`, in yellow, solid line | its clone is no longer on the commit of its launch: it was updated while it was running | **a button**, "relaunch the app": it only changes code at its launch |
| `the lag of this app's code behind its origin was not read`, in yellow, dashed line | the origin did not answer, the clone is on no branch, its branch follows nothing — or the app is not launched from a clone | the reason, with what `git` said about it. **Not read is never "up to date"** |
| nothing | **the installed app** (the `.dmg`) has no clone: nothing is read of its code, nor of the brigade clones among the projects — they are recognized by the origin of its own | nothing here: it updates itself on published versions ("Launching the app", *Its update*) |

- **On click, it updates and restarts.** Its clone advances to the origin branch it
  follows, then the app closes and relaunches itself on the new version — through `npm start`
  when that is how it started, so that its launch lays down the dependencies again if the
  new version changes them (see "Launching the app"). Like quitting, relaunching stops the app's
  terminals. During the update, the button says `updating — the app relaunches itself…`.
- **Without a click, at its next opening.** `npm --prefix app start` does the same update before
  opening the app, and says so in the terminal (see "Launching the app").
- **Fast-forward only** (`git merge --ff-only`). A clone that has commits the origin
  does not have, or changes the new version would overwrite, does not move: merging is your
  action. The app says why it stays on its code, under the line; a clone that has commits of its own
  has no button, by the way, but the command `git -C <clone> pull`, **written** into a shell without
  being sent — the rule of all buttons. An app shell lives in a project's space:
  the one whose folder this clone is, otherwise the first that opens. With no project that opens,
  nothing is written and the command is copied by hand.
- **A project's clone, the app does not update**: its button writes `git -C <clone> pull`
  in a shell, as above. The app's clone, when it is also a project's folder, is
  updated with it: its second reads the new code.
- **It says so for a project's clone too, when that clone is brigade's** — a project
  whose folder is a clone of the same origin as the app's. If it is the same clone, it
  is named under the app's line (`It is also the clone of the project "brigade"`); if it is
  another, it has its own line, its number and its button: `THE CLONE OF "brigade" IS 12 COMMITS
  BEHIND origin/main`. The other projects' clones are not read: their lag is
  the business of their repository.
- **The bar's T icon turns yellow** as long as one of these clones is behind or the app is
  to be relaunched: whatever the screen on display, its hover says what (`All projects — this app's code
  is 39 commits behind origin/main`).
- **Nothing is watched continuously**: one reading at launch, one each time you come back to the
  window, one when the projects file changes. In between, the time shown is that of the
  last reading — an app left in the foreground for a whole hour does not reread.
- **Reading writes nothing in your clone** — only the update writes there. The app asks the origin for the commit of the followed branch
  (`git ls-remote`). If your clone does not have it, it fetches the missing commits **into a
  throwaway folder, outside the clone**, counts them, and deletes it: no object, no followed branch, no
  `FETCH_HEAD` is laid down in yours — `git status` says afterwards what it said before, and your
  next `git fetch` fetches everything as if the app had read nothing.
- **It never asks for anything**: no password at the terminal, no window. What your keychain
  or your `ssh` agent already know is used as is; an origin that demands input is an origin
  that did not answer, and `git` is stopped after thirty seconds. The origin's address is
  never displayed: it may carry a token.
- **What the number does not say**: what these commits change. Thirty-nine doc commits and one
  commit that adds a tab read the same — `git log` is what says.

### The new-version line (#1528, #2431)

When a newer `app-v<version>` release is published and the app does not run it, the app puts **one line** at the very top of the window, above every screen, with the running version and the latest one, then where its own update stands:

```
Brigade 1.0.102 is running — 1.0.105 is out · downloading it, 40 %
Brigade 1.0.102 is running — 1.0.105 is out · it is downloaded: it installs at the next launch   [Update now]
Brigade 1.0.102 is running — 1.0.105 is out · installing it — the app relaunches itself…
Brigade 1.0.102 is running — 1.0.105 is out · it could not update itself — Download
Brigade 1.0.102 is running — 1.0.105 is out — Download
```

The suite follows the state of the installed app's update (`miseAJour`, "Launching the app", *Updating it*): downloading, ready with **Update now** (recommended; its price on hover: it closes the app's terminals and relaunches it on the new version — a refusal takes the suite's place), installing. When the update is downloading a version lower than the latest (a newer one came out since), the line names it (`· 1.0.104 is downloaded: …`). When the app does not update itself to it — the update failed (the reason on hover of the line), the release carries no `latest-mac.yml` (one published before #2431), or Android —, the line ends with **Download**, a link to the package of this device itself — the `.dmg` on a Mac, the `.exe` installer on Windows, the `.apk` on Android —, never the releases page; a click opens it in the browser, and its hover says how to open the unsigned build the first time (*right-click Brigade, then Open* on a Mac; *in SmartScreen, click More info, then Run anyway* on Windows; nothing on Android). **Nothing dismisses the line**: it stays until the app runs the latest version, and a check that finds nothing (GitHub silent) does not remove a newer version already known — the running version does not change while the app runs. With the app on the latest version there is no line.

The check is `app/src/mise-a-jour/avis.ts` (#1527), run by the main process at launch and every fifteen minutes, only for the installed app on a Mac or on Windows: launched from the repository, the app updates through its clone and shows no line. Its notice carries the latest version, the running one (`courante`) and the package link. Together with the update's own check, it reads GitHub's API at most three times every fifteen minutes. The bridge gives the view `avisDeVersion` and `surAvisDeVersion`, the gesture `telechargerVersion` (opens the link of the current notice, and only it), and the update's `surMiseAJour` and `installerMiseAJour`. The view is `app/src/vue/mise-a-jour/bandeau.js`; its tests, against a mocked release list and the update's states, are in `app/test/bandeau-mise-a-jour/`; the captures are the `scripts/capture-ecran` screens `nouvelle-version-mac`, `nouvelle-version-windows` and `telephone-nouvelle-version` (`docs/captures/1528/`, taken before #2431). The Android bridge (`app/android/web/pont.js`) does not run the check yet: until it does, the line is built and tested for Android but nothing sends it a notice there.

### Signing the phone in to GitHub (#2500, epic #2498)

On a fresh install, **the Android app opens on one screen: "Sign in to GitHub"** — the rest of the app stays behind it
until the phone is signed in. Under the title, one sentence: *Sign in with your GitHub account to see your projects.*,
then one button, **sign in with GitHub** (recommended). There is no pairing code to type, no QR to scan and no station
address: the phone reads your projects on GitHub under your own account, and no station is involved. What signing in
does — a one-time code typed on GitHub, the access kept in the phone's vault, forgotten with the app — is on hover over
the "?" next to the title.

- **sign in with GitHub** starts GitHub's device flow from the phone itself (`seConnecterAGitHub`, the same bridge action
  as the desktop's first launch): GitHub gives a one-time code, the bridge opens `https://github.com/login/device` in
  the phone's browser, and the screen shows *Type the code A1B2-C3D4 on the GitHub page that opened in your browser.*,
  with **open the GitHub page again**. While it waits, the button says `signing in…` and is inactive: nothing starts
  twice. The code is the same brick as the desktop's first launch (`connexionDite`, `premier-lancement.js`).
- **Signed in**: the app goes to "All projects", with one line at the top — *Signed in to GitHub as `benomite`.*
  (*This phone is signed in to GitHub.* when GitHub did not say the account). The token stays in the phone's vault
  (`Coffre.java`, encrypted by a key of Android's Keystore); the view never sees it, and only the account name is kept in
  the app's storage. At the next launch the app opens straight on "All projects", with the same line. Uninstalling the
  app forgets the sign-in. "All projects" then lists the projects read on GitHub (below).
- **Not signed in**, one line under the button, in red, the detail on hover, and the button starts again: *The sign-in
  was cancelled on GitHub: this phone is not signed in.* (denied on the GitHub page) — *The code expired before it was
  typed on GitHub: sign in again.* — *GitHub refused the sign-in: sign in again.* — *This phone could not reach GitHub:
  check its connection, then try again.* — *GitHub did not start the sign-in: try again.* — *This phone could not keep
  its GitHub sign-in: sign in again.* (the vault refused to write).

The bridge asks GitHub in the name of the GitHub CLI's OAuth App — the one the desktop already signs in through
(`gh auth login`), with `gh`'s scopes (`repo read:org gist`); a brigade OAuth App with its device flow enabled would
replace it in one line (`CLIENT_GITHUB`, `app/android/web/pont.js`). It reaches github.com through Capacitor's native
HTTP — github.com does not answer a WebView (CORS) —, asks again at the pace GitHub gives (`interval`, `slow_down`),
and keeps asking through a lost network until the code expires. On the desktop, nothing of this is shown. The screen is
`app/src/vue/connexion-github.js`; the captures are `telephone-lancement`, `telephone-connexion-code`,
`telephone-connexion-refus` and `telephone-connecte` of `scripts/capture-ecran` (`docs/captures/2500/`).

### Reading projects, rail and TODO from GitHub on the phone (#2501, epic #2498)

Signed in, **the phone reads the chef's projects, each project's rail and its TODO on GitHub alone** — no station is
reached, no station address is asked for. Every request goes to `api.github.com` with the token from the phone's vault,
through Capacitor's native HTTP (`parCapacitor`). The reading is `app/src/lecture-github-telephone.ts`
(`ouvrirLaLectureGitHub`), every 30 s and whenever the view asks (`faits`, `tous`, `regarder`, *try again now*):

- **The projects** are those the app asked of the chef's stations, written in each station's gist under the chef's
  account: `brigade-projets.json` (a name and a repository per project) and `brigade-selection.json` (repositories,
  each named as the station names it). One repository is one project; sorted by name. The last list read is kept
  (`brigade.github.projets` in the app's storage): a relaunched app shows it before reading again.
- **The rail and TODO of each project** are the desktop's own reading (`lireLeTableauDuDepot`, then
  `avecCeQuiAttendLeChef`, conditional reads where a 304 costs nothing), and what is done with it is what the desktop's
  main process does — `facts` through `tenirFaits`, `status` through `mettreAPart` and `attendre`, the alert band, the
  lines of "All projects", the cooks' activity and, in an open project's space, what is before the rail. A project on
  the phone shows the cards the desktop shows of the same project at the same reading.
- **What does not read says so, never a blank screen.** Above the lines of "All projects", one sentence says what the
  list lacks, and nothing when it was just read and has projects (`poserLaListeGitHub`, `app/src/vue/connexion-github.js`):
  *Your projects on GitHub: first read in progress…*; *None of your stations serves a project yet: a project is added
  from a computer.*; *This phone cannot reach GitHub.*; *GitHub did not give your projects.* — what GitHub or the
  network said on hover, with *This phone tries again every 30 s.* The projects already known stay under it. A sign-in
  GitHub refuses (`401`) says *GitHub no longer accepts this phone's sign-in.*, with **sign in again**, which forgets
  the sign-in (the vault's token, the account, the list) and reopens the app on the sign-in screen. A rail GitHub does
  not give is the desktop's failed rail (*offline since …*, or GitHub's refusal in one sentence); an empty project is an
  empty rail, read, whose Todo says *nothing awaits you*.

The APK build lays the module, and what it imports from `app/src/` and `runtime/src/`, next to the view without their
types (`www/src/lecture-github-telephone.js`, `poserLesModules` in `app/packaging/android.ts`); the bridge loads it at
its first reading. Its tests, against a mocked GitHub with no station reachable — the module alone, then the laid bridge
and the real view on a phone screen — are `app/test/lecture-github-telephone.test.ts`.

### Writing the chef's gestures to GitHub from the phone (#2502, epic #2498)

Signed in, **the phone writes the chef's gestures to GitHub with the chef's session**, the way the desktop does and by
the desktop's own writing code — no station is reached for them. `app/src/gestes-github-telephone.ts`
(`ouvrirLesGestesGitHub`) calls what `app/src/main.ts` calls for the same gesture, with the client it builds
(`clientDeLaPriorite`); only the carrier differs: Capacitor's native HTTP (`ecritureParCapacitor`), with the vault's
token, to `api.github.com`. The GitHub reading of the phone opens them (`gestes` of `ouvrirLaLectureGitHub`) on what it
last read of each project — its repository, its last rail read, the chef's card of a ticket —, and the bridge
(`app/android/web/pont.js`) answers the view's `gestesDeFiche`, `gesteDeFiche`, `attente` and `repondreCarte` with them:

- **answering a TODO card** (a chef's card read from GitHub): the answer posted on the issue as the marked comment, then
  its gesture played (`resume`, `merge`, `drop`, `close`) — `repondreSurGithub`, as on the desktop;
- **resuming** — *back to the kitchen* on the sheet, *it arrived, back to the kitchen* on a WAITING card: the `waiting`
  label removed from the issue;
- **putting on hold** — *remove from the rail* on the sheet: the `fire` label removed; no station takes the ticket;
- **the WAITING gestures** (#3075) — *waiting for…* on a TODO card and its sheet, *resume* on a WAITING card: the phone
  reaches no runtime, so it writes them on the issue as the desktop does when the project's kitchen is not on that
  computer (see "WAITING on a GitHub project" above).

A sheet on the phone offers those gestures only, ordered and priced by the desktop's table. Merging a delivery says what
the desktop says (merge its PR on GitHub). A write GitHub refuses, or a GitHub that does not answer, comes back as one
sentence with what GitHub or the network said on hover, and nothing is shown done; only a write GitHub took reads GitHub
again, which shows it. Not signed in, nothing is sent: *nothing was sent: this phone is not signed in to GitHub*. The APK
build lays the module next to the view (`www/src/gestes-github-telephone.js`). Its tests — each gesture played by the
desktop's chain and by the phone on two copies of a mocked GitHub, comparing every request, then through the laid
bridge with no station reachable — are `app/test/gestes-github-telephone.test.ts`.

**Each project's queue on the phone** (#1163) is the project's page of a narrow screen (see above): Rail — TODO
first, then On the rail, WAITING and Served, stacked — and Stations — each station, its state and its running cooks.
It is the desktop's view, fed the same way: what it shows of a reading is what the desktop shows of the same reading,
and nothing on it scrolls sideways at phone width. Screen: `telephone-file` of
`scripts/capture-ecran` (`docs/captures/1163/`; its Cooks screen went with the Cooks tab, #2921).

**The phone opens on the cards that await you** (#2915, epic #2897; artboard `Phone.dc.html`, 390 × 844). At a narrow width
(the same threshold, `ECRAN_ETROIT`), "All projects" gives its place to **Awaiting you**: the cards of every project's
TODO column that ask a question, one touch each — `#21 · parade`, the question, what it asks (*Product choice · 2 options*,
*Review only you can make*) — with the count in the header and, under them, how many projects are cooking when the app
knows it. The projects bar stays above, and a page, a station or the first launch still cover the list. A touch opens the
card: its question, what happens, one button per choice — the first, filled with the accent and marked *Recommended by the
second* —, the field *Or answer in your own words* and **Send** (inactive while empty). A choice, the recommended one
included, is the answer: it goes through `repondreCarte` like the card of TODO (`app/src/vue/carte-todo.js`), and the screen
says **Sent to the kitchen.** with *`#N` is back on the rail* and **Back to the list**. A refusal is one line on the card,
which keeps its buttons. Every button is the family's 44 px, a choice 52, and nothing scrolls sideways at 390 px. The
module is `app/src/vue/cartes-du-chef/` (its tests: `app/test/cartes-du-chef/`); the captures are the screens
`cartes-du-chef-liste`, `cartes-du-chef-carte` and `cartes-du-chef-envoyee` of `scripts/capture-ecran` (`docs/captures/2915/`).
The artboard's line *5 tickets served today* is not drawn: no reading the app holds counts them.

**The queue's gestures on the phone** (#1164) are the desktop's: a TODO card opens its sheet, and its buttons —
`remove from the rail`, `back to the kitchen`, the recommended one first and in the accent color —
call the same bridge action, `gesteDeFiche` (the project, the gesture, the ticket — never a command), confirmed
first when they cost. A phone
has no second to write a command into: there, `gesteDeFiche` answers `{ fait }` — what
the station did — or `{ refus }`, each with the station's answer in `detail` (`app/src/vue/pont.d.ts`). The sheet
says it in one line under its buttons, the station's answer on hover, and the box is read again at once: the card
leaves TODO with that reading (a removed ticket leaves the rail). While the answer has
not come, the line says `remove from the rail: sent, waiting for the answer…` and the sheet's buttons are inactive —
nothing goes twice. A refusal, or a bridge that fails or carries nothing (`nothing was sent — nothing was changed`, the reason on
hover), does not read the box again: the queue stays as it was, and the gesture can be played again. On a
narrow desktop window, where a gesture still goes into the second, the sheet says `sent to the second: its answer
is in the Second tab`.

### The Android app notifies the chef of a TODO card (#2747)

The chef follows Brigade from the phone, away from the computer. **When a TODO card appears on any of their projects, the
app shows one system notification** — "A card awaits you", its text naming the project and the card's question — and
**tapping it opens that card** on the project's space, on the existing card sheet (#2498) where the gesture that answers it is.

- **The signal is the TODO's own.** A card is whatever `lireCeQuiAttendLeChef` reads as awaiting the chef
  (`app/src/tableau/attente-du-chef.ts`): nothing new is marked on GitHub. Any other issue, comment, label or status change
  is not an entry of that reading, so it stays silent.
- **A background poll, no Brigade server.** `MainActivity` schedules `SondeWorker` (Android's WorkManager) every 15 minutes
  — the shortest period Android gives a periodic job — with a network. It plays `android/sonde.html` in a headless WebView,
  which runs `sonder` (`app/src/notifications-todo.ts`) with the vault's token against `api.github.com` and nothing else.
- **Once per card.** What was notified (repository, ticket, question) is kept in the app's preferences before the
  notification is shown, so neither a later poll nor a restart notifies it again. A card that asks another question is
  another card.
- **Dismissed when answered.** Answering in the app dismisses its notification at once (`carteRepondue`, called by the
  bridge's `repondreCarte`); answering on GitHub dismisses it at the next poll, which no longer reads the card. A project
  GitHub could not be read for dismisses nothing: an unread project is not an answered one.
- **Permission.** On Android 13 and later the app asks once for the right to notify; without it nothing is shown.

Its tests (`app/test/notifications-todo.test.ts`) run against a simulated GitHub, a memory and a fake notifier: detection of a
new card, silence on kitchen traffic, no duplicate (successive polls and a restart), dismissal after an answer in the app
and outside it. The Java side (`Notifications.java`, `SondeWorker.java`, `Pont.java`) is not built by the tests.

### Your stations: paired with a code, read on GitHub

**At the bottom of a project's Stations tab** (#2638), the "All stations" list shows the ones you have paired, one line each —
its name, its state, what it is doing and the projects it carries; its machine and version on hover
(see "All projects at a glance"):

```
● box  online · idle · no project                         ›
○ box  offline for 4 min · brigade                        ›
```

**A paired phone is listed like the others** (#1162), with the mention that it does not cook:
`● pixel  online · does not cook` — offline, `offline for 12 min · does not cook`. It never
runs a project's cooks: it is not offered among the machines of "Choose the machine that runs … kitchen"
(nor in the backups, nor in "move the kitchen"), the app never recommends it, and a request that
names it is refused (`pixel does not cook: choose a station that does.`). The station says it by
publishing `cuisine: false` in its gist (#1158); a station that does not publish it cooks. Screens:
`docs/captures/1162/`.

**This computer's station version, beside the box's** (#2191, epic #2182). Under the list, one line "Station
version" puts the versions side by side, each said the same way — the box first, then this computer:

```
Station version   ● parade-box  version 2.4.0 · up to date    ◆ this Mac  version 2.3.1 · behind — 2.4.0 is out
```

The box's cell is its version as its gist publishes it, with `up to date` when its update line says so (see "Its
update line" below); offline, or after a failed update, only its version. This computer's cell reads the status of
its station — `stationVersion`, `latestStationVersion` and `behind`, the runtime's contract (#2189) — through the
bridge (`statutDeLaStation`, then `surStatutDeLaStation`): behind, it says so in yellow with the latest version; up to
date, in green. With no status — a bridge that does not read it yet, or a status that does not keep the contract —
it says `version unknown`, grey, the reason on hover: never an error, never an empty cell. With no box read yet, the
box's cell says `version unknown` too. The phone shows no such line. The view is `app/src/vue/station-version/`, its
tests `app/test/vue-station-version/`; screens: `docs/captures/2191/` (`scripts/capture-ecran` screen
`stations-version-inconnue`).

**A click on its line opens the station's page**: at the top, its name, its dot and its state in
one sentence (#877); below, its faults with their button, the projects the app added to it and the
"add a project" flow (see "Add a project to your stations, without a terminal").
Under the header (#1081): the station's cap on cooks and where it comes from (`3 at most — 8 cores`, read from
`status`), what holds tickets back when it is saturated (memory, processor, value and threshold), no
field to change it: a station takes as many tickets as it declares places, and its declaration is changed on its machine.
#1292: the same cap is on each station's line in the Cooks tab — the `Cooks at once` settings row, `3 at most — 8 cores` — read only
while the station's declaration is not read; a declared station's row has the number field that changes its declaration
(#2920, see "What each declared station provides"). When the station is saturated, one sentence says what holds it (`Saturated on CPU —
load of 19.4 for at most 12`) and that lowering the cap makes the project run fewer cooks, the machine's load not dropping right away.
"‹ All projects" takes you back to the home screen, like the **T** square.
Under its faults, its sections (#2641, epic #2497), in this order, each under its heading: Identity, Connections,
Folders and sandbox, Capabilities, Cooks. The shell is `app/src/vue/station/page/StationPage.js`; each section is a
module of `app/src/vue/station/page/sections/` that exports `poserSection(doc, context)`, loaded once its file name is in
`LIVREES` — until then its heading says `not shown yet`. A section that fails to load or to render says `this section is
unavailable`, its detail on hover; the others render. The page knows whether it is this computer's station (the local
station the app reads); on another station's page, every section gets `lectureSeule` and shows, without editing, what
only changes on that machine. Each setting carries its level mark (`NiveauReglage.js`, the one `niveauDe` uses: this
machine, project, you); no project-level setting appears here — they live in the project's Stations tab (#2484).
Every setting of the page is the app's single settings row (#2920, `app/src/vue/composants/reglage/reglage.js`): its
name and level mark, its value, its control. There is no Save button: a field applies when it changes (Enter, or leaving
it), through the same gesture the section always used (`station/page/appliquer.js`); while it runs the row says
`applying…` and its controls are disabled, then a refusal is the error line under the row, its detail on hover. All of
them live on the machine, none in the repository, so no row opens a pull request. Screens: `docs/captures/2641/`.
Folders and sandbox (#2644, `sections/dossiers-et-bac-a-sable.js`): the clones folder, the worktrees folder, the sandbox
state (on / off) and the network door — the hosts a cook may reach, each with what opens it on hover — each with the
`this computer` mark. On this computer's station a folder changes from its field, and a host opens from the network
door's field, as soon as the field changes — no `save` or `open` button; `saved on this computer` then reads under the row.
Removing a host the chef opened (`remove`) is confirmed inline under the door (`close it` / `keep it open`). The change is
kept in `station-reglages.json` beside the app file (`app/src/reglages-de-la-station.ts`) and read back at every load. On another station the section shows the same, with nothing to change. The station does not
read that file yet: it is the app's side of the setting (each setting's hover says so). The sandbox state is read from
the projects' onboarding: off once a project cooked here continued without it. On another station the section shows
"not available for this station" — the app reads nothing of a station it does not run. Screens: `docs/captures/2644/`.

```
box      ●  online · 2 cooks running   ?
atelier  ◆  saturated                  ?
mac      ○  offline for 12 min         ?
```

The sentence says neither its projects nor what is broken — its faults are below —, and the system, the kernel
and the version of its machine are not written on the page: they are read on hover over the "?". A
saturated station takes no ticket while that lasts: its sentence says only that.

- **The app reaches no station.** Each station writes its state to a secret gist in your
  GitHub account ([docs/runtime/](runtime/station-machine.md), "Une station par machine"), and the app reads it
  there, through your own `gh`, every thirty seconds (`app/src/stations/`). The tracking is therefore
  accurate to the minute, not to the second.
- **A station that is off stays in the list**, offline, with how long ago: right
  away when it stopped cleanly, after two missed signs of life (a little over
  two minutes) when it went off abruptly. A failed GitHub read keeps the previous list,
  and the health line says so in one sentence (`GitHub could not be read`,
  `GitHub limits calls, back around 3:16 PM` — the time GitHub gives the account's calls back is read
  without spending one).
- **Pairing a new station**: "+ station", under the list, opens the field; type in it the code
  it displays (eight characters, like `7KQ2-M9XD` — lowercase, spaces and dashes make no difference),
  then "pair". The app looks for the gist that publishes this code, writes the pairing there, the field closes
  and the station appears in the list. A malformed, unknown or expired code is refused in one line
  under the field, and nothing is written; when GitHub is what failed, what it answered is read on
  hover over that line.

**When it breaks**, its line in All stations says so in one word (`update failed`, `Max connection lost`),
and the fault is stated on the station's page, in one line, with a button — never a command to
type (`app/src/pannes/`, #798):

```
box   ·  (header: name, dot — the state is not repeated there)
  offline for 12 min  [check again] ?

box   online · no cook running
  update to version 1.5.0 failed  [dismiss] ?
  Max connection lost 12 min ago  [log in] ?
```

Each fault is **a single line** and **a single button**; the explanation ("box has given no sign
of life…", "nothing cooks on box until you log in"), then what the button returned once
clicked, are read only on hover over the "?". A fault that two causes describe (offline and no more
sign of life) is stated only once: the page header does not repeat the state when the
"offline for …" line is below it.

- **Station unreachable**: no sign of life for ten minutes (a restart or an update
  fits within that). "check again" re-reads GitHub right away: the app does not reach the
  station, it checks whether it has spoken again.
- **Update failed and rolled back**: the target version did not start, the station
  stayed on its own; the next one will be tried alone. "dismiss" clears the line, as long as
  the app is open. The reason for the failure is not stated here: it is in the projects' queue.
- **Max connection lost**: nothing cooks on the station any more. "log in" runs `claude auth login`,
  which opens the login page in your browser; the station sees the connection restored within
  the minute, and the kitchen resumes on its own. **Only the station of this computer** reconnects
  this way: the login of a server station does not yet start from the app, and the button says so.
- What the app knows about it, the station publishes in its gist ([docs/runtime/](runtime/station-machine.md), "Une
  station par machine"): versions and dates, no reason and no command. An offline station
  no longer states its connection — what it published before going silent is no longer reliable.

**Its update line and its removal** (#880). Under the page header, a single line says
where the station stands: `up to date · on this version for 3 days`. An offline station is not said
to be up to date with anything: no line. A failed update is already stated by its fault: the line does not
repeat it and does not say "up to date" on top of it, it keeps only `on this version for 3 days`.
The "since when" is not published by the station: the app deduces it from the moment it saw the station
move to its version, and keeps it in `versions-vues.json`, next to `app.json`. It does not know
since when a station has been on its version the first time it reads it: the line then says
`up to date` and nothing more, until it sees the version change. A station updated
while the app was closed is dated from the first read that follows.

At the bottom of the page, **"remove the station"** opens a confirmation in the app, with a one-line price:
the station leaves All stations and is no longer read, it keeps running, and a new code pairs it
again. "cancel" closes it and leaves the station in place; "remove" takes its pairing out of its
gist (`brigade-appairage.json`, the only file the app writes there), takes you back to the home screen, and the station
is no longer in its list. If GitHub cannot be written to, the station stays, and the page says so in
one line.

#### A station that is installed but cannot cook yet says why (#1758)

A grey dot is never alone: a station line that cannot cook yet carries a few words next to its state, and the
button that does the gesture. Offline: "not reached" and **check again** (reads GitHub again). Unreadable:
"cannot be read" and **open its page** (where it is removed). Online with no project (and none of this
computer's projects cooking on it): "not added to any project" and **add a project**. What the chef does on
another computer ("start Brigade on *name*'s computer") is the hover of the words. The wording lives in
`app/src/stations/raison.ts`, and a test fails when a grey station line has no reason and button. A station added
to a project that its main station cannot reach is the same on the project's Cooks tab: its main station
published the reason key and the gesture (`raison`, `geste` of `secondaires` in its tracking: `arretee`, `muette`,
`gist-illisible`); since #2713 no runtime publishes them (every station that serves a project opens its kitchen), and
the line reads "not reached" with
**check again**, the gesture on hover.

### Your stations under your GitHub account, and the projects each serves (#1706)

A station installed on one of your machines, its `gh` signed in to your GitHub account, registers itself under that
account (`runtime/src/enregistrement-station/README.md`, #1705): no code to pair. **In All stations, at the bottom of a
project's Stations tab, they are in the list of stations** (#1778, #2638), read each time that tab opens — **one row per computer**:

```
● macbook-air-de-benoit  online · idle · benomite/brigade        ›
● nas                    online · no project chosen yet           ›
● parade-box             online · idle · brigade, calculus-workspace, espace, …     ›
```

- **A machine is recognized by its name**, which its registration shares with its presence (case aside). **A paired
  machine that is also registered has one row**, computed in one place: its state and what it does come from its
  presence (`app/src/accueil.ts`); the projects it serves are those of its presence, then those chosen for it in
  its registration that its presence does not name yet — the station takes them in hand within 30 s
  (`projetsServis`, `ligneFondue`). A machine serving a chosen project is therefore never said `runs no kitchen`
  nor `not added to any project`. Two registrations of the same name (a lost state directory leaves an old one)
  count as one: the online one, else the last seen. The merge is `uneLigneParMachine`
  (`app/src/vue/stations-du-compte.js`).
- **A machine that is only registered** has its row from its registration, in the order of the names: `online` or
  `offline` (the contract's freshness rule: a clean stop, or no sign of life for 4 min 30 s), then the projects it
  serves — `no project chosen yet`, `no project`, or the repositories themselves. Its platform, machine, version and
  last sign of life are on hover. Dot green and full when online, grey ring when not. **A station GitHub's limit
  holds** (#2443; its registration says so, `heldBy`) reads `held by GitHub's limit until 14:37` (the chef's local
  time) in place of `online`, a yellow full dot, never `offline`: it keeps its projects, here, on its page and on
  each project's Cooks tab (`reached` gives way to the same words), while its sign of life waits for the limit to lift.
- **Every row does the same thing: a click anywhere on it (or Enter on the focused row) opens the station's page**
  (#1779) — paired or only registered, online or not, with the same `›` arrow, hover and focus. No row expands a block
  in place. The page of a registered station carries "Projects it serves": **your projects only** (#1780), one
  checkbox each, ticked when the station serves it — the repositories your GitHub account reaches (the list "add a
  project" reads) that the brigade already knows: a project of the app, a project a paired station serves, or a
  repository chosen for any station under your account; a repository it serves that the list no longer names stays
  there, to be unticked. **Any other repository is added by search, never shown as a list**: the field under the
  boxes ("add another repository — type part of its name") shows, as you type, the reachable repositories whose
  name contains what you typed and that have no box yet — eight at most, then "3 more — keep typing", or "no other
  repository matches …"; emptied, it shows nothing again. "add" on one chooses it for the station (written like a
  tick) and it joins your projects: a box on every station's page. A box you untick stays until the app closes; at
  the next launch, your projects are again what the brigade knows. **Ticking or unticking writes at once** the whole selection into the
  station's gist (`brigade-selection.json`, the only file the app writes there; `app/src/stations-du-compte.ts`):
  it is what the app reads again at the next launch. While it is written, the boxes wait; refused by GitHub, one
  line says so under the boxes, the detail on hover, and nothing changes.
- **A repository another station already serves** (#1790, epic #1785; changed by #2713): the ticked station opens its
  own kitchen and cooks there, like every station that serves the project. Before #2713 it joined the one that ran,
  or refused in one sentence, and said which in its tracking (`brigade-projets-suivi.json` of the same gist, `rejoindre`). The app reads it there with the
  account's stations (`avecLeursAjouts`, `app/src/stations-du-compte.ts`; one more read per station that has a
  selection). Just ticked, the box says "asked: the station answers within a minute", and the account's stations are
  read again every 15 s (8 times at most) until the station has answered. Joined, the box says "cooks in box's
  kitchen", and the project's page lists the computer under "Its stations" and on its first line as one more cooking
  station — the station that serves it stays the main one, and nothing says the kitchen runs on this computer.
  Refused, the box says "refused" and the runtime's sentence is under the boxes, whole; the project's page keeps its
  stations, with "<station> was not added: <sentence>" under its first line.
- **An offline station stays editable**: one line says it serves these projects once it is back. A held one too:
  its line says it reads these choices once GitHub's limit lifts, and keeps serving its projects.
- Under the list, with no heading, only what the reading of the account has to add. **No station at all**, neither
  paired nor registered: the sentence to install one on the machine that will cook, and the installation command of
  each system (`docs/installation-station.md`), each with "copy", and "read again". **This computer signed in to no
  account**: the reason and "Sign in to GitHub", the same as on the first launch; signed in, the list reads again.
  **Any other failure** (no `gh`, no network, GitHub's limit): one line, "your stations could not be read", the
  detail on hover, the page that fixes it when there is one, and "read again". **Unreadable registrations**: one
  line, "1 more station cannot be read", the reasons on hover, and "read again".

Screens: `docs/captures/1706/` (before the single list), `docs/captures/1778/` (the single list, before and after), `docs/captures/1780/` (your projects first, the others by search), `docs/captures/1790/` (a computer added to a project another station serves: joined, or refused).

### This computer is a station; a phone is a workstation

*Spec: [the station rebuilt from scratch](superpowers/specs/2026-10-15-station-refonte-design.md) (#797).*

**On a computer — Mac, Windows, desktop Linux —, the installed app is a station.** Once open,
it starts the machine's station: **the same as a server's**, the same entry point
(`runtime/src/station/main.ts`, the one the Debian package's service starts), the same held directory,
the same project configuration (one line each, in `projets`), the same presence on
GitHub. Only the installation differs: a package on a server, the app here (`app/src/poste/`).

- **Its directory** is `station/`, next to the projects file (`~/.config/brigade/station`) —
  or `BRIGADE_STATION_DIR`, if it is set. It runs under your account, with your `gh` and your
  `claude`.
- **It pairs itself.** As on a server, it displays its code in its log; the app
  reads it and types it for you, through the same gesture as "+ station" in All stations. The machine appears
  in "Stations", like the others: `macbook  online · idle · no project`, its machine and its
  version (`code 1a2b3c4d5e6f`) on hover. If GitHub does not show its gist yet: the code is retyped every thirty
  seconds, and the refusal is stated once.
- **A project it is the main station of cooks there**, exactly as on a server: its line
  in `projets`, its state under `etat/`, its cooks started by the station.
- **It lives with the app.** Closed — or killed outright —, the app closes its station's entry, and the station
  stops as on a SIGTERM: its projects stop, and GitHub carries the time it stopped —
  the home screen says it is offline. **The kitchen of the projects it is the main station of therefore stops
  with the app.** Dead on its own, it is restarted five seconds later; refusing to start
  (code 2), it is not, and the app says why.
- **Only one per machine and per account.** A second open app does not start a second
  station (`station/app.pid` names the app that holds it): it says so, and takes over when the
  first one closes.
- **One kitchen per project (#2110).** Before each launch, the app reads the account's stations: a
  project of this computer's configuration that another station already serves (and that cooks) is not
  read by the station — its line stays in `projets` as a `# held-back (served by <station>): …`
  comment, no kitchen opens and no board is published here — and the app logs which station serves
  it. The line comes back as soon as no other station serves the repository. A reading that fails
  changes nothing (`app/src/station-embarquee-cuisine-unique.ts`).
- What the station says is written as is in the terminal that started the app, like its service log
  on a server. It is run by the `node` of `npm start` (`BRIGADE_NODE_BIN` to give
  another): Electron is not one. **The installed app** (the `.dmg`) runs the runtime and the
  `node` of its package, never those of the machine (`app/src/emplacements.ts`).

**On a phone, the app is a workstation**: it drives, it does not cook. Its station is not started there,
and no project cooks there — neither its own, nor any other station's. This is the only place where the platform matters
(`app/src/poste/role.ts`); everything else is the same code. The app of a computer is also a
workstation, and says so at launch, when the runtime is not next to it, or with
`BRIGADE_APP_STATION=0`.

### Add a project to your stations, without a terminal

**On a station's page, in its header,** one line says how many GitHub calls the box made over the last hour and which project and which kind of reading made most of them: `GitHub calls, last hour: 42 — most from parade (30), mostly issues (25)`. The figures come from `appelsGithub` in the `facts` of a project the station carries (#1417). A runtime that does not publish them yet gives a neutral dash, never an error. The module is `app/src/vue/appels-de-la-station.js`.

**On a station's page**, "Projects" lists **all** the projects it carries, one line
each: those its configuration serves — added from the app or written by hand in `projets`,
it publishes them all in its gist —, then those the app asks of it and that it does not serve yet.
Each line carries its mark: **`main`** when the station runs its manager and its pass (it
serves the project), **`secondary`** otherwise — and it then says which station they run on. Then what
the station says about it: `served`, `waiting for your authorization on GitHub`, `being prepared`,
`refused`. On hover: its repository and its branch, the reason for a refusal and, once served, how long it took
since you opened the flow (`served by box 1 min 12 s after “add a project” was
opened`) — or, for a project written by hand, `installed on this station outside the app`. **A click
opens the project**: its space if it is in your projects file, otherwise "Add a project", where
you declare it. "no project on this station yet" is read only on a station that truly carries
none.

- **"+ add a project"**, on that same page, opens the flow: the **repository**, chosen among those your
  `gh` reads (most recent first; its default branch is offered as the integration
  branch); the **stations** that serve it, and its **main** station — the one for its manager and
  its pass. The app offers a **server station** by default, always on; choosing the app of a
  computer (Mac, Windows) says right away that the project's kitchen stops when the app is closed.
  Then the number of **cooks** at a time and the **calibration** of the manager and the reviewer: nothing there is
  chosen in advance, these are your decisions. "add": what is missing is stated under the form, and nothing
  is written.
- **The picked repository is checked first** (#2627, `app/src/vue/ajout-projet/`, `app/src/projets/preparation-du-depot.ts`):
  as soon as you pick it, the app asks the runtime whether it is set up for brigade (`checkRepoSetup`, #2626), on the
  repository's local copy on this computer — the one the app keeps for it, reused or cloned — and says it in one sentence. Set up, the path carries
  on exactly as before. Not set up, the sentence names what is missing — its bindings, its labels, or both, their names
  on hover — and **"set it up"** prepares it (`runRepoSetup`): "Setting up … for brigade…", then "… is now set up for
  brigade." and the path carries on. A failed setup is one sentence, its reason on hover, and **"try again"**. You never
  see or type the plugin's init command. The labels are created on GitHub; the bindings section is written to the
  `CLAUDE.md` of that local copy, as the init command does, for you to commit. While a setup runs, picking another
  repository waits, and a sentence says so.
- **Once confirmed**, the app writes the request in the gist of each chosen station (`app/src/projets/`); the
  main station reads it within half a minute, prepares it and adds it to its configuration
  ([docs/runtime/](runtime/station-machine.md), "Ajouter un projet à une station depuis l'app, sans terminal"). If its GitHub
  Apps must be authorized on the repository, one **"authorize on GitHub"** button per App opens
  GitHub's page: one click, and the station carries on on its own.
- **"remove"**, under a project added from the app, then a second click to confirm, removes the project from the request of each of
  its stations: they remove it from their configuration. Its state and its clone stay on the machine.

**From a project's page** (#983), when no station is cooking for it yet, `No station
cooks <projet> yet.` is followed by **"choose its machine"**. The choice opens below, in one card
(#1107):

- **At the top, a sentence says what you are doing**: `Choose the machine that cooks <projet>.`,
  and that everything is already set to what is recommended: you change what you want, or you launch as is.
- **Then the stations**, one checkbox per paired station, all of them the same. Each says what
  choosing it implies: `always on: it keeps cooking while your computer sleeps` for a
  server, `stops when you close the app on this computer` for the app on a Mac or a PC. **The
  server station is ticked by default**, marked `recommended`; with no server, the first readable
  machine. Every station cooks, takes, reviews and merges.
- **The number of cooks at a time comes preset**, drawn from the cores of the station — those it
  publishes in its gist (`coeurs`, [docs/runtime/](runtime/station-machine.md)) —, by the very rule
  the station applies: `max(1, ⌊(cores − 2) / 2⌋)`, 3 for 8 cores. Below:
  `recommended — from <station>'s 8 cores: …`. A station that does not publish its cores yet: 2,
  and the line says so. Ticking another station makes the number follow, as long as you have not typed it.
- **The calibration of the manager and the reviewer is folded under "Advanced settings"**, with what it
  sets: the model and the effort that judge, split and review — and therefore what they take from your
  quota. Folded, the line says what will go out (`manager sonnet / medium · reviewer sonnet / medium`).
  It takes up **that of the project most recently handed to a station** from the app
  (`recommended — what <projet> runs on, …`), or failing that **the measured starting value**,
  `sonnet` / `medium` (#425).
- **A proposed value is visible as such**: its `recommended — …` line disappears as soon as you
  change it, and what you changed stays yours when the stations are re-read.
- **The button says what it does**: `Start the kitchen on <station>`. Nothing goes out with an empty
  field: what is missing is read above the button, and the card stays open.

Once handed over, the page says **where it cooks** — `Cooks on <station>`, its other stations after it
(`· macbook`) — and, under that line, `All the stations cook.` A station added from the app is told like any other; until it has read the request, its line says in a few words that it is `not received by the station`, with `check again` (reads GitHub again) and, on hover, what to do (#1774). **"+ station"** opens the same card, about the added machine only (#1307):
`Add a station to <projet>'s kitchen.`, with the same sentence, then one **machine** — this computer's
station chosen at once when it does not cook the project yet, otherwise the first paired one — and, from
the first render, what belongs to that machine: **cooks at once** (from its own cores, with its
`recommended — …` line), its **workspace folder** (where its station puts its cooks' workspaces: read, not
changed here), and **what it can do**, one box per capability (a browser, Docker, the Android SDK…), the
ones detected on this computer ticked. For this computer these values come from the runtime operation
`defautsDeStation` (`runtime/src/projets/ajout-de-station.ts`, #1306), read before the card shows; for
another machine, its cooks come from its published cores, its folder is its own, and its boxes start
unticked (`not detectable from this computer`). If this computer cannot be read, one line says so, the
detail on hover. The form **never asks for the repository nor the integration branch**: the extra
station takes them from the first station, or from what the app asked before, or from the project's
clone on this computer (its `origin`, and the branch its repository declares), and the calibration
already requested. `Add <station> to the kitchen` with nothing touched adds it: its request carries its
own cooks and its ticked capabilities (`fournit`), which the station declares in its own journal, never in
the repository. The button is on the Cooks tab too (#1271): the same card, the same steps; once the request is written, the app re-reads the box at once, so the new station's block appears on the tab without reloading. **It has the same effect as ticking the project on the station's page** (#1830): the station opens the project's kitchen on its computer and takes the tickets it can cook, whatever other stations serve it (#2713) — a ticket only that computer can cook leaves for it on its own; there is no second gesture (`runtime/src/projets/tenir.ts`). **A value nobody says** — neither the first
station nor the clone — is read in one sentence above the button; no field appears after the click.

**The flow of a new project** (#1111), under that line, in place of the empty space: the four steps
its main station publishes in its tracking (`onboarding`, #1110) — *Repository*, *Cooking machine*,
*Repository preparation*, *First ticket* —, each `done`, `now` or `to come`, with its sentence. At the
top, what is expected of the chef: the gesture of the current step, a button that opens its GitHub page
(where how to do it is written alongside), or "Nothing to do… step N of 4". The preparation step shows its
ticket (`#433`, a button that opens it) and its state — `in progress`, `failed`, `to review`; on failure,
the reason in one sentence and the time of the next attempt (`Next retry at 10:14 AM, in 10 min.`, then
`Its retry is due now.` once the time has passed). The "within a minute" of the trust is no longer stated
past the minute, nor once the flow is published. When ready, only `<projet> is ready: post
your first ticket with the fire label`, "post the first ticket" and "dismiss" remain: once dismissed, or the page
left, it does not come back (until the next app launch, and never once the first ticket is
on the rail). The pages it opens are those the station published, and no others
(`autoriserSurGitHub`). The module is `app/src/vue/onboarding/parcours.js`.

**What holds the kitchen back** (#1119): its main station publishes, in the project's line of its tracking, `acces`
(repository access refused, #1117: the reason and the gesture) and `worktree` (a worktree that cannot be prepared,
#1118: the ticket, the reason, the time of the next attempt, and `acces` when access is what refuses).
Under the stations line — on Cooks; on Rail, the alert line says it in one line and opens Cooks (#1185) —, a red
block states in one sentence the reason then the gesture (`parade-box cannot fetch from benomite/parade: … Run
gh auth setup-git on parade-box, under the account that runs it.`, the command in code, git's detail on
hover), and a recommended "copy the command" button that copies the command alone — the gesture is made on the
station's machine, which the app does not drive), or, for a worktree, `The worktree of #433 could not be prepared: <reason>` and
`Next retry at 10:14 AM, in 10 min.`. While it holds, the sentence "prepares it within a minute" is no
longer stated. With neither, nothing changes. **The station's refusal** (#1178): when it refuses to serve the
project with no refused access to state, its tracking carries `refus` (#1177: a stable code, a sentence, the
chef's action); the same block puts down the sentence (`This project's settings choose a network port that the station reserves
for itself.`, the code on hover) then the action below — never the raw text of the `en-service` file, nor a
path. **The button comes from the refusal alone** (#1205): the station publishes with it the remedy that lifts it
(#1203: `remedy`, what it will do in one sentence, whether it removes or erases something, its id), and that sentence
is the label of a recommended button, readable before any click — the screen knows no refusal code, so a refusal
type added later on the station shows its button with no change to the app. A remedy that removes or erases opens a
confirmation first, with the same sentence, `yes, do it` and `cancel`; the others go on click. The click asks the
project's principal station to run it, through its gist, the same way for this Mac and for a remote station (the
runtime's `demanderLeRemede`, from `app/src/projets/remede.ts`): while it waits, the button is disabled and a line
says `asking <station> to do it — it reads the app's requests every 30 s…`. Lifted, the refusal leaves the page; still
held, one sentence under the action says why, and the button stays to try again; nothing sent, one line says so, what
GitHub answered on hover. Without a remedy, the action stays written, followed by the station's sentence saying why
there is no button (`noRemedy`). The refused access, being more precise, takes precedence over it. Screenshots:
`docs/captures/1178/`, `docs/captures/1205/`. The station clears it when the gesture is done: the page re-read
(each read of the stations) goes back to its message, without reloading the app. The module is
`app/src/vue/onboarding/depot-retenu.js`.

**What blocks the project** (#1399, epic #1393): every blocker its principal station publishes (`blocages` in its
tracking, #1394) is one row in a card under the stations line, on Rail as on Cooks, headed by one sentence —
`2 things block parade`. Each row says what is blocked in one sentence, then why below it (a producer that gave the
same sentence for both says it once). When the app can perform the gesture, the station names it (`action`) and the
row carries a recommended button: `choose-station` → `choose another station`, which opens the choice of machines for
the move, as the onboarding does (#1113) — offered only when another station can take the project; otherwise one
line says `no other station can take it right now`. An action this version of the app does not know shows no button,
but the line `this app cannot do it for you yet`, the action's id on hover. When the gesture is outside the app, the
row carries a link naming the exact page (`open github.com/settings/personal-access-tokens`), which opens it in the
browser through the main process; as everywhere in the app, only a GitHub page is a link — another one is dropped,
the blocker stays. What a command said (`detail`) is never the message: it stays folded behind `details`, and a
row the chef unfolds stays unfolded from one read to the next. A resolved blocker leaves the card; no blocker, no
card. Screenshots: `docs/captures/1399/`. The module is `app/src/vue/projet/blocages.js`.

**Time to the first served ticket** (#1401, epic #1393): one line above the blockers, from the `delai` the principal
station publishes in its tracking. Before any ticket of the chef is served it says how long ago the project was added
(« Added 2 h 14 min ago, no ticket served yet »), recounted at each read and every 30 s; after the first one it says
the final duration the station froze (« First ticket served 2 h 34 min after the project was added »), which a second
served ticket does not change. The preparation ticket of the repository does not count. No `delai`, no line.
Screenshots: `docs/captures/1401/`. The module is `app/src/vue/projet/delai.js`.

**Ticket times** (#2346, epic #2336): a card under the first-ticket line, per project, on the **Cooks** tab — on Rail,
the band at the top says the four figures (#2672), the rest on hover (#2486): the median total of the
last 10 measured tickets (by `mergedAt`), the slowest (`#number — total`), the median of five phases (cooking with its
tests, waiting for the pass, review, CI, merge). Nothing there shows a time against a max any more: lost time,
cooking against estimate and the quality figures are the figures of the rail band (#2672, #3013). A
ticket's total time has no cap. Two states, `data-temps`: `normal`; `vide` ("No ticket measured yet", never a blank or
a zero). Each of the five phases is the median of that phase alone, so their
sum can differ from the median total. The principal station reads the project's clone
(`.claude/brigade/temps-tickets.json`, integer seconds, and `lostTimeMaxMin` of `projet.json`; `lesTempsDesTickets` in
`runtime/src/temps-ticket/ligne-status.ts`) and publishes `temps` (`{ enregistrements, lostTimeMaxMin, resume }`) in its
project tracking, next to `delai`; the app relays it on the project's view. A station that does not publish it yet
(an older one) shows "Ticket times not available yet", which is not a count of zero tickets.
Screenshots: `docs/captures/2346/`. The module is `app/src/vue/temps-ticket/temps-ticket.js`.

**Median and p75, and lost time against its threshold** (#2664, epic #2659; #2670): the rail band says the ticket time from the `resume` object of `temps-tickets.json` that the measure publishes (`n`, `medianMin`,
`p75Min`, `perduMedianMin`, `lostTimeMaxMin`, `phaseLaPlusLongue` and `perteLaPlusLourde` as `{ nom, medianMin,
partPct }`, the latter null when nothing was lost), relayed as `temps.resume` — the app reads it, it does not recompute
it (`app/src/vue/temps-ticket/resume.js`). A ticket's time, from its filing to its merge, has no cap: its size varies.
Only its **lost time** has one — everything but the cook that delivered and the pass, CI and merge of the merged
delivery: the wait for a claim, the failed cooks, the send-backs. The four figures come from the station
as `temps.chiffres` (`runtime/src/chiffres-du-projet.ts`): `{ cle, nom, valeur, seuil, depasse, pesent }`, read as they
are, never recomputed. Rail band (#3013): « Ticket time 14 min median », the p75 and
the other figures on its hover, and « First try 50% · goal 70% », in red under its goal (`data-depasse="oui"`); what weighs
most (`pesent`) on the hover of First try. With no `resume`, there is no Ticket time; with no first-try value, no First
try — never a blank, a zero or « no measure yet ».
Screenshots: `docs/captures/2664/`.

**Health strip: duration caps** (#2490, epic #2484), in the `Caps, closer and all projects` section of the project's
Settings (#3014), then the closer's; they are read on GitHub when Settings opens, then at most once a minute while it stays open. The Ticket time block that stood before it is gone (#3013): its figures are in the rail band.
**Duration caps** lists, with its current value and where it comes from, each cap above which the kitchen flags a drift:
first the **lost time per ticket** (#2670's `lostTimeMaxMin`, the threshold on the median lost time of recent tickets,
as the station publishes it), then the durations the
repository declares — `drift.testsSeconds`, `drift.gatesSeconds` (100 s by default) —, then, folded behind one line
("Other drift thresholds · 1 set in the repository"), every other `drift.*` threshold of `projet.json`. Each cap is one
settings row (`composants/reglage`, #2920): no **save** — a `drift.*` field applies on its `change` (left, or Enter) when
it changes the repository's value. Kept in the repository, its row says `a change opens a pull request, applied once merged`: the app proposes the change by a pull request, on GitHub, with the chef's `gh` token
(`app/src/plafonds-duree.ts`, `proposerLeFichier`: the file is read again on the integration branch — the repository's
default branch when the project does not name one — for its `sha`, only `drift.<key>` changes, a missing file is created
with `version` and `integrationBranch`; a new branch `brigade/setting-…` starts from the integration branch's head, the
file is written on it, and the PR opens towards the integration branch). While it runs the row says `opening the pull
request…`; then `150 s proposed in` and a `pull request #<n>` link that opens it in the browser. The value shown stays
the one in force: the runtime reads the new one at its next fetch once the PR is merged (`reglages-projet/en-vigueur.ts`).
An empty field proposes the cap's removal (`removal proposed in`). A value the runtime would refuse (zero, a fraction for
a whole threshold) proposes nothing and says so under the field, what was typed staying in it; a step GitHub refuses
(reading the branch head, creating the branch, writing the file, opening the PR) is the error line `nothing was proposed`,
its detail on hover — nothing claims success.
**The lost-time threshold is not editable here yet**: `lostTimeMaxMin` is not a `drift.*` threshold, the only keys this
block writes, and the station reads it from its clone's working tree — its row says so, the reason on hover. The caps
are edited nowhere else in the project view. Screenshots: `docs/captures/2490/`. Module:
`app/src/vue/projet/bandeau-sante/PlafondsDuree.js`.

**Health strip: the closer** (#2491, epic #2484). Under the duration caps, the **Closer** block, in four parts, all
read on the project's integration branch, on GitHub, with the chef's `gh` token (`app/src/closer-sante.ts`) — when Health
opens, then at most once a minute while it stays open; each part that fails to read is one line, its detail on hover, and
does not take the others along.
**What it did**: its last 5 passes, newest first. A pass is a closing issue the runtime opened (`fire`, titled `Closing
pass on …`, its body marked `<!-- brigade:fermeture sha=… -->` by a trusted author — see `docs/runtime/fermeture.md`,
"On GitHub, the only path"); what it removed is the PR of its cook's branch (`cook/<n>-github`), merged: `−1,234 lines`,
`+56 added`. Otherwise the row says why nothing was removed — `in progress — not cooked yet`, `in progress — its PR is in
the pass`, `nothing removed` (closed with no PR, or its PR closed without a merge). The issue number and the PR open in the
browser. No pass yet: `No closing pass yet on this project`, when one is opened on hover.
**What it checks first**: what the latest pass handed it, on this project — the dead code (`3 exports referenced nowhere,
or by tests only`), the duplicates, the drift of the latest merges (its longest window; the others on hover) and the
ticket times (`stable since the previous pass`, or the drift found and its correction ticket) — then, folded behind one
line (`Candidates · 5 handed to pass #2531 on 9f3c2a1`), each candidate under its pass name.
**Extra checks**: what the chef asks the closer to check in addition, one per line, each with **remove**; a field and
**add** (recommended, enabled once something is typed; Enter adds too). Kept in **`.claude/brigade/closer-checks.md`**, the
part says `a change opens a pull request, applied once merged`: adding or removing one is
proposed by a pull request towards the integration branch (`proposerLeFichier` with that path — the file created when
missing, a check already there not doubled, `unchanged` said instead). While it runs the part says `opening the pull
request…`; then `the check “…” proposed in` (or `the removal of “…” proposed in`) and a `pull request #<n>` link that opens
it. The list shown stays the one in force on the integration branch until the PR is merged; a step GitHub refuses is the
error line `nothing was proposed`, its detail on hover. **The runtime does not copy these checks into a pass's issue yet**: they wait in
the repository until it does (the `?` says so).
**Settings**: the closer's four settings of `closer.*` in `.claude/brigade/projet.json` — its **calibration** (a model and an
effort, applied together on the `change` of either list once both are chosen; one without the other proposes nothing; both
emptied, its removal is proposed), its **start condition** (`cooksBelow`, `none in flight` for 1), its **tokens cap** and its
**removed lines cap** —, each a settings row with its value, where it comes from (`in the repository`, `the station's, or
500 lines`) and a control that applies on `change`, with no **save**, as a duration cap: only `closer.<key>` changes, by a
pull request towards the integration branch, which the row announces and then links (`opus / high proposed in` `pull
request #<n>`); the runtime reads it at its next fetch once merged, a value it would refuse proposes nothing and says so. The closer on GitHub reads only the calibration and
the removed lines cap: the two others say `not read on GitHub yet`, the reason on hover. Settings still carries its
closer rows, which propose the same keys by a pull request (#1685). Screenshots: `docs/captures/2491/`. Module:
`app/src/vue/projet/bandeau-sante/Closer.js`.

**What the station lacks for the project** (#1400, epic #1393): every choice its principal station publishes as
pending (`choix` in its tracking, #1398) is one card above the blockers, on Rail as on Cooks, under one sentence —
`2 choices wait for you on parade`. Two missing needs are two cards. Each card says what is missing (`The tests of
parade need a Postgres database, which box does not have.`), why below it, then its options side by side — cook it
on a station that has it, provide it on this station, adapt the tests —, each a button with what follows from it
written under it, the runtime's own sentence. No option is recommended: the station names none. A click writes the
option into the principal station's request (`brigade-projets.json`, `"choix": { "need:postgres": "provide-here" }`),
which the station applies at its next read; once written the card leaves — and stays gone, the app reading its own
request, until the station publishes the choice as chosen. While the write runs, the card's buttons wait and one line
says `recording your choice…`; a refused write leaves the card with one line saying why, what GitHub said on hover.
The option is written only if the page still shows the choice as pending and the choice offers it. A need with a card
has no blocker row as well (the blocker waiting for it shares its id, `need:<need>`). No pending choice, no card.
Every other gesture rewrites the selections as they are. Screenshots: `docs/captures/1400/`. The module is
`app/src/vue/projet/choix.js`; the write is `choisir` in `app/src/projets/projets.ts`.

**"Cook it on a station that has it" opens the station form** (#1511, epic #1506): that one option writes nothing. It
switches to Cooks and opens the edit form of #1510 under a station of this workstation — the first one this computer
plays for the project, else the first the project declares — with the capability the need calls offered, unticked, next
to what the station provides (`browser` → `navigateur-headless`, `postgres` → `postgres`, …: the first capability the
runtime gives the need, `CAPACITE_DU_BESOIN` in `app/src/vue/stations-declarees.js`). Since #2920 each box applies as soon
as it changes: ticking it declares it like any other edit, and the capability shows on the station's row; the card stays until the station publishes the choice as
answered. No station read yet, one line under the card says so. Screenshots: `docs/captures/1511/`.

**The decision facing a station with no sandbox** (#1113): when the published state says `decisionAttendue`,
the *Cooking machine* step puts the runtime's sentence up as a warning — the cooks of this machine
run without a sandbox, nothing goes out before the chef's choice — and two buttons: "choose another
station" (recommended: it opens the choice of machines for the move) and "continue without sandbox"
(`continuerSansBacASable` of the bridge, whose answer is stated under the stations line). The choice records the
decision through the runtime's `accepterSansBacASable`, in the project's state on this computer, for the station
that cooks it — the only one the app reaches: if the main station is another station, the app refuses in one
sentence and nothing is recorded. The warning goes away, and the preparation becomes the current step, as soon as the
decision is recorded; the station then republishes the state that says it for good. Screenshot:
`docs/captures/1113/`.

### Where a project cooks, and moving it in one gesture (#1095)

- **The line says where it cooks**, as its stations publish it (`cuitSur` in their tracking,
  [docs/runtime/](runtime/station-distante.md), "Déménager la cuisine d'un projet, quand on veut") — not what the
  app asked for: a refused move leaves it cooking where it was cooking, and so does the line.
  `Cooks on parade-box` for a project on its box; **`Cooks on this Mac · its kitchen stops when you
  close the app`** for a project that this computer's station serves — the sentence is never
  said of another station. The station's name is on hover over "this Mac".
- **Read and driven here.** A project that cooks on this computer is read and driven
  by this workstation's station: its rail, its queue and its cards come from it, and the gestures go through the
  local station's own gesture. The source follows the kitchen: when
  it moves — to this Mac, or off it —, the reading changes source with it, without
  restarting the app, and the line always says where the project cooks at that moment.
- **This computer's station stopped: a line, not an empty page** (#1124). A project that cooks
  here has nothing to read while this computer's station is not running (refused, stopped, between
  its death and its restart): **`this computer's station is not running`** takes the place of the rail, the
  queue and the cards, and that is all. As soon as the station runs, the line gives way to the rail at
  the next read, without restarting the app. A project served by another station never carries it.
- **"move the kitchen"**, next to "+ station", is the only gesture: it opens under the line the
  choice of the machine to take it to — `Move <projet>'s kitchen from <station> to:` —, one button per
  other paired station (`this Mac` for this computer's station), the one the app recommends
  (always on) set apart, what each implies on hover, and **the price in one line**:
  `Its cooks in flight stop and their tickets go back to the rail; its whole log follows it.`
  A click on a machine moves the kitchen — to this Mac, to its box, to another station —,
  **without removal or re-adding**. The app runs the runtime's operation on this computer
  (`runtime/src/demenagement/demenager.ts`, with its station's directory and your
  stations' gists): it writes the two requests, and the rest happens between the two stations.
- **Once launched**, the line below says so (`<projet>'s kitchen moves to this Mac: parade-box hands it over
  as soon as this Mac is ready — until then it cooks on parade-box`); while it is under way, the
  line says `· moving to this Mac…`, its step on hover, and no other move can be requested
  once the target station has accepted it.
- **Refused, the reason is read in one sentence under the line, in red**, and the line does not change:
  `parade stays on parade-box: <the runtime's reason>` — to this Mac without a sandbox, what it
  lacks (`la configuration du bac à sable ne tient pas sur ce Mac — …`). A refusal from the target
  station, after the fact, is stated the same way (`… : this Mac refused to take it over — …`); the choice then offers
  `keep it on parade-box`, which takes the request back. GitHub unreachable, or a runtime that does not
  start, are stated in one line, their detail on hover: nothing fails silently.
- **The gesture is offered only for a project handed over from the app**, that cooks on one of your paired
  stations: it is the app's request that the operation rewrites. A project served by a station without the app having asked it, has none — the operation would
  refuse it (`add it rather than move it`). An app with no runtime next to it (a phone) launches
  none, and says so.
- **What it keeps from the runtime**: a move in progress is written in each station's request
  (`remise`, `reprise`); the app re-reads them and rewrites them as they are when it rewrites those
  requests (handing over, removing another project), otherwise it would be no more than a change of
  main station.
## A station reading: seven states

At the top of a project's space panel, the reading of its station is in **one of seven states**, which do not look alike.
The reading goes through the gesture of the station that cooks the project on this computer (no other machine is
reached by the app); a project cooked elsewhere is read from its GitHub repository, which has its own failure line
(`NOT READ FROM GITHUB`, see "The rail and its cooks, read from GitHub"):

| On screen | What the app got | What it shows below |
|---|---|---|
| `drivable — read at 14:32:07` | the commands succeeded | their outputs. **A project where nothing is happening is here**: a quiet `status`, not an error |
| `REACHED, BUT NO LONGER DRIVABLE — attempt at …`, in yellow, dotted line | the station's gesture ran, and a command failed there or returned nothing within thirty seconds (stopped at the timeout) | the command that ran, what it wrote, its code — then **the action**: update the runtime (`docs/runtime/exploitation.md`, "Piloter") |
| `REACHED, BUT UNKNOWN TO THE STATION — attempt at …`, in yellow, solid line | the gesture refused the project (code 65): the station serves no project under that name | **what the gesture said about it**, as is — then the name the app gave it, and where it comes from (`nom`, in `app.json`) |
| `REACHED, BUT WITHOUT THE RIGHT TO THE ACTION — attempt at …`, in yellow, solid line | the gesture refused your account (code 68) | **what the gesture said about it**, as is |
| `REACHED, BUT A COMMAND IS MISSING ON THE STATION — attempt at …`, in yellow, solid line | the gesture says a command is missing (code 69) | **what it said about it**, as is — then where these commands go (`docs/installer.md`, "Prepare the box") |
| `REACHED, BUT THE STATION'S NODE DOES NOT SUIT THE RUNTIME — attempt at …`, in yellow, solid line | the gesture refused to start the runtime (code 70): `node` does not start there, or is not the required version | **what the gesture said about it**, as is. No runtime update: it is not the runtime that is old |
| `NOT REACHED — attempt at …`, in red, solid line | nothing proves the station was reached: the command could not be launched, or was stopped at the timeout without saying how far it had gone | the message, as is, and its code. Or the timeout, stated by the app, with no pointer |

- **The app reports, it does not guess.** "No longer drivable" does not say *why* the command
  failed: a runtime too old for what it is asked is the expected case, and the update advice is
  given only there. What it got is in front of you. **The exit code only picks the header**: 65, the project is
  unknown to the station; 68, you lack the right; 69, a command is missing; 70, the station's `node` does not suit the
  runtime; any other code that comes from it, no longer drivable. The text below is never translated.
- **A silent project does not hold back the others**: each project is read for itself, every
  thirty seconds, and carries its own time.
- A project that no station serves on this computer has its panel too: `no reading`, and what it lacks. No block to paste.
- A reading's commands go out **one after the other**, and the first one that fails is the
  error shown: each screen says what *its* commands returned.

## The icon bar

On the left, a column of tiles, Slack or Discord style:

| Tile | What it is |
|---|---|
| **T**, round, at the top | the "All projects" screen. **In yellow**: the app's code, or a brigade clone among your projects, is behind its origin — hovering says which, and by how much |
| one **short label** per project, in the file's order | its space. At most 3 characters, large, on one line, never cut (`app/src/sigle.ts`) — see below |
| **+**, dotted, at the bottom | add a project |

- **The full name is read on hover** over the tile, and **at the top of the space** once inside, to
  the left of the tabs.
- **The label is derived from the names, and no two projects ever carry the same one** (#1983). A
  name of several words gives its initials, three at most (`brigade-site` → `BS`, `my-kitchen-2` → `MK2`); a
  single word gives its first letter and the letter where it parts from the names that start like it —
  `mirrorscreen` and `mirrorlab` read `MS` and `ML` — or its second letter when no other name starts like it
  (`brigade` → `BR`). Should two names still want the same label, the one first in alphabetical order keeps it
  and the other takes its next free one. Rearranging the bar never changes a label.
- **You can write your own label** for a project in its Settings, under `you` ("Label in the bar"): 3 characters at
  most, written to `sigle` in the projects file, and the tile follows at once. Emptied, or with "back to its name",
  the tile goes back to the derived label. A label another project already carries as yours is refused, saying
  whose; the derived labels step aside from yours. Like the colors, it follows you from one device to another.
- **At each tile's corner, a dot: the project's kitchen state, as its station reports it** — not
  deduced. Green, `open`; yellow, `held`; red, `stopped` or `off`. The word is read on
  hover, after the name (`parade — stopped`). It is re-read every thirty seconds, for all
  projects, whatever the screen.
- **The shape tells the state before the color**: a dot has the shape of its tone — solid disc,
  green; diamond, yellow; square, red; triangle, blue; hollow ring, gray. The same goes for the
  driving line (`drivable` disc, `reached but no longer drivable` diamond, `not reached` square),
  the kitchen pill, the manager, and the `awaiting you` pill of the slips in Awaiting you.
  Each state's label stays text; nothing is read beyond what the box says.
- **A dot without a color is not a state**: empty, it is a word the app does not know
  (read on hover, as is); a `!`, the app
  read no fact from this project, and hovering says why (`no fact read — NOT REACHED`). A
  project that no station serves on this computer has no dot.
- **No counter in the bar**: the numbers are in the project's tile.
- **Tiles are rearranged by dragging them.** Take a project's tile and drag it in the bar:
  it fades by half, and **an accent line says where it will land** — before the hovered tile if
  you go up, after it if you go down; nothing over its own tile. Dropped, it takes that place and the
  others shift; dropped outside the bar, it goes back to its own. The new order is written
  in `app.json` — the order of the `projets` rows, nothing else — : you find it again on reopening
  the app, and **"All projects" follows it**. It also goes to your preferences gist, and your other
  devices take it at their next read (see "Your preferences follow you from one device to another"). A project added afterwards arrives at the end of the bar. If
  the file cannot be written (it cannot be re-read, it is not writable), the bar keeps
  its order and the reason is shown over the screen. The **T** and **+** tiles do not move.
- **A click stays a click**: dragging starts only past the system's threshold, and a tile dropped
  on itself opens its project, like a click.
- **Each tile carries its project's tab color**: its letter and its line, and its background
  when it is the space shown (see "A project's colors"). A project with no color — a
  file the app cannot write — keeps the skin's tile.
- A dotted tile is a project whose folder is not there — a fact about this workstation, not about the
  box.

## One space per project

Click a project: you are in its **second** — `claude`, launched in the project's folder with the
role already active, on a real terminal. It is a real Claude Code session: your history, your
slash commands, and a `!` runs on the Mac, with your access.

**The second is not a new role: it is the PO, and the app gives it the role for you.** It runs
`claude --continue` (or `claude` when there is nothing to resume) with the second's role appended to
Claude Code's system prompt (`--append-system-prompt-file`), from a text the app ships
(`app/src/second/role.md`): you have nothing to type, no skill is invoked, and the second reads the
project's queue as soon as it opens — what is waiting, and the action that unblocks it. A system prompt
is not a message of the conversation: the role stays in force after a compaction and on every resume,
and updating the app updates it, with no plugin to install. You keep control: open shells, do what
you want with the session.

**The exception: the second may take a cook's task.** The kitchen stays the default — a ticket goes on
the rail and a cook serves it. Not routine use: the second writes code or does a cook's task itself
only when the work is **urgent** (a blocker now), **needs a human** (the chef's presence or machine, which
a cook on the box lacks), or **unblocks a situation the kitchen cannot unblock** (the fix is for the very
thing that is broken: CI loops, cooks without `gh`, rate limits). A ticket that is neither urgent nor
blocked still goes on the rail. The second names the case to the chef in one line before starting, then
works in its own worktree on a branch, runs the gates, opens a pull request that closes the issue
(which goes through the pass like any delivery) and comments on the issue that the second took it, and
why. What stays forbidden, exception or not: **merging** (the chef or the pass does; the second only
gives the command) and **reading the chef's secrets** (`.env.local`, the Max token). The text is in
`app/src/second/role.md`; the V1 role (`commands/po.md`, with its Codex mirror) carries the same rule (#2178).

**The role exists only in the Second tab.** The role and the settings of the launch (`--settings`, the
hooks the app gives the second) are arguments of the command the tab runs, and nothing else: the app
writes nothing into the project's `.claude/`, nor into any file another session reads. A `claude` you
start yourself in the same folder is a plain Claude Code session, not a second.

**The queue is read for the second, at each start.** The launch settings carry a `SessionStart` hook
(`startup`, `resume`, `compact`): it runs `app/src/second/file.ts`, which reads what awaits the chef on GitHub fresh,
with this computer's `gh` (`gh api`, #1845), and returns it to Claude Code as additional context: the `awaiting` block of
`status`, word for word, each line a ticket with its question and its gesture, or `nothing awaits the chef`. It is the same
reading as the app's Todo (#2460, "The chef's TODO, read from GitHub" above): the second and the app list the same items,
in the same order, in the same words. No box, no station: it works on every project the app knows a repository for. So the
second sees the queue after a start, a resume or a compaction without thinking of it. The repository is the project's
`depot`, or the GitHub `origin` of the session's folder. A queue that cannot be read (no repository known, GitHub not
reached or refusing, or the whole reading — lists, then comments, then label events — not done within 30 s, under the
hook's 45 s, so that `claude` never kills it silent) is said in that context, in one line starting `file non lue :`, and
the hook still exits 0: it never blocks the session. By hand, in the project's folder: `node app/src/second/file.ts <name> [<owner>/<repo> [gh]]`.

**The role is given again once `/brigade:init` is merged (#2689).** A second opened on a project not set up yet has no
bindings in its context: it starts the setup, which ends with a PR to merge (#3167, below). So the launch settings also carry
`app/src/second/role-apres-init.ts` twice. At each start (`SessionStart`), it notes whether the folder's `CLAUDE.md` has the
`## Équipe multi-agents` section — what `claude` just loaded — in a file of the computer's temporary folder, per session.
At each of your messages (`UserPromptSubmit`), for a session born without the section only, it reads `CLAUDE.md` on the
project's integration branch (`base`, or the repository's default branch) with `gh api`. As soon as the section is there
— the init's PR merged — that message carries, as additional context, the role's text, the section as read on GitHub, and
the queue read fresh: the same session answers as the second, with nothing to type or invoke. Once only; a session born
with the section costs its messages nothing — no `gh`, no output. The hook always exits 0. Neither the role nor the end
of `/brigade:init` points to `/brigade:po` or any V1 role, and model and effort are left to the manager.

**The second's hard limits are held by a hook, not only by its role.** The launch settings carry a
`PreToolUse` hook on `Bash`, `Read` and `Grep` that runs `app/src/second/refus.ts`. It denies any
`gh pr merge` (with flags, after `&&` or `;`, in a subshell or a `bash -c`) and any read of the chef's
secrets: `.env.local` files, the Max token (the file named by `BRIGADE_CLAUDE_TOKEN_FILE`, the variable
`CLAUDE_CODE_OAUTH_TOKEN`). The denial names the gesture the chef types instead, with `!` in front
(`!gh pr merge <N> --squash`). The protected names live in one list, `SECRETS`, in that module. The hook
is only in the Second tab's `--settings`: no project file carries it, so another Claude session in the
same folder is not restricted. It is a guard against a slip, not a sandbox: a command that hides the
name it reads (built string, indirection) is not caught.

**Each project has its second, and a project's product questions go to *its* second.**
Triaging `calculus`'s issues is asked in `calculus`'s space, not in `brigade`'s:
a second only knows the product of its folder.

**The second is on the right, permanently — it is not a page.** It is the only agent in the system
that talks to you: it has its column, at the window's right edge, over its full height — **the
terminals space**. At the top, a row of tabs, on one level: the second, your shells, and `+ shell`;
below, a line that says what was just written in the terminal shown, and which terminal.
Changing page in the center, opening a shell, closing one: **the second neither closes nor
empties**, it is the same terminal, with its conversation. And a click on the left — a rail card, a
button, an action — writes into it **without the center changing**: the page you were looking at stays
open, the rail stays where it is; if a shell was shown on the right, the second takes its place back,
so that you see what was written there.

**The second's panel folds and resizes, and each project keeps its own (#2923, epic #2913).** It opens docked on the
right, 360 px wide. The chevron at the end of its row of tabs folds it into a narrow strip that keeps only that button;
one click on it unfolds it. Its left edge is a handle: drag it (or focus it and press ← or →) to change the panel's
width — never below **280 px**, and never wider than what leaves the rail at least **640 px**; a window made narrower
narrows the panel with it. The width and the folded state are kept **per project**, in the view's storage, and come
back at the next launch: another project keeps its own. A storage the app cannot read is not overwritten: the panel
then keeps its width and state until the app closes. On a narrow screen the second is a tab, with neither handle nor
fold button. The logic is in `app/src/vue/projet/panneau-second/`.

**Each shell carries a banner, at the top of its terminal: where it is, with which account** —
`this Mac · benoit`. Its color is the project's tab color: changing space changes it.

**A session that does not have the role is not called Second.** When the app opens a session on
another command (`/brigade:init`, to prime the repo), the second's tab is called **Claude**;
it becomes **Second** again if you relaunch it with one key, which launches it with the second's role.

- **`+ shell`** opens a shell on **this workstation** (`this Mac`): the app opens no shell on any other machine and
  asks nothing. Where a project cooks elsewhere, you work on that machine yourself.
- This shell is **persistent**: it lives in a `tmux` session (or `screen`, where `tmux` is missing)
  on this workstation, under your account. It opens **on the right, next to the second**: it has its tab (`shell 1`,
  `shell 2`…) and is shown in place of the second, which does not stop for all that. **A shell never
  replaces the second**: a click on the second's tab brings it back, with its conversation; a
  click on a shell's tab shows it again, as you left it. The terminal shown takes the
  keyboard. As many shells as you want.
- **Closing the app does not close your shells**: it detaches from them. On reopening, the first click
  on the project brings them back, reattached to their session — the command you had launched there is
  still running, and what it had displayed is there. The app remembers them in `shells.json`, next to the
  projects file.
- **`close shell 1`**, at the end of the row, closes the shown shell **for good**: its tab
  goes away, its session is destroyed, and it does not come back. A shell
  you leave (`exit`) also closes its tab, and the second takes its place back.
  A shell remembered in `shells.json` that is not a shell of this workstation (written by an older version) is dropped.
- The shell that an action opens to write its command in (a `sudo systemctl …`, a `git pull`) is,
  for its part, a login shell of this workstation, in the project's folder: it ends with the app.
- **Changing project interrupts nothing.** Each space keeps its terminals, their content, the
  page and the terminal where you left it: the terminals belong to the app, not to what is
  displayed. Coming back to a project gives you back its second — or the shell you were looking at — as it was.
- A project's second starts only at the first click on that project.
- A project whose folder is not there has no second: its column says why, in its place.

### A project not set up for Brigade says so, with one button (#2628, epic #2584)

A project added before the setup check, or whose setup was skipped, shows a notice on its page (the alerts strip) and
at the head of its TODO: one sentence saying what is missing (`Not set up for Brigade: 2 bindings and 3 labels
missing.`, the names on hover) and one recommended button, `Set up for Brigade` — the same single gesture as adding a
project (`runRepoSetup`). While it runs the button waits and the notice says so; on failure the notice gives one
sentence and `Try again`; once done it leaves on both views without a reload. The state is read once per project with
`checkRepoSetup`; a set up project shows nothing, and `/brigade:init` is never shown. Modules:
`app/src/vue/page-projet/depot-non-prepare.js`, `app/src/vue/todo/avis-todo.js`. Captures:
`docs/captures/2628/`.

### `/brigade:dev`, `/brigade:ask` and `/brigade:init` in every project the app opens (#2160, #2595)

Every project of the projects file gets the app's plugin: in any Claude Code session of its folder — the
second, a shell of the app, or a terminal of your own — `/brigade:dev <number>`, `/brigade:ask <number>` and
`/brigade:init` answer, with nothing to install by hand. These three commands, and only these: no V1 role
(`/brigade:po`, `/brigade:manager`, `/brigade:designer`, `/brigade:sync`) and no agent — the app and the
stations replace them.

- **`/brigade:init` is the app's own, not the V1 one** (`app/src/plugin/init.md`): it sets a repository up on
  the GitHub-only path — no box, no ssh, no V1 plugin. The session deduces the test and install commands (and
  asks only for what it cannot deduce), then a script the app writes into its marketplace
  (`app/src/plugin/init.sh`, under `scripts/`) does the writing: the rail's labels on the repository at once,
  then, in a throwaway worktree on `brigade/init`, the `## Équipe multi-agents` block at the end of
  `CLAUDE.md`, `.claude/brigade/gates.sh` and `.claude/brigade/worktree-setup.sh` — each only if absent — and
  **a pull request you merge**. Your own checkout is never touched. Replayed once merged, it says `unchanged`.
  A project's second whose `CLAUDE.md` has no bindings block starts the setup on its own, with nothing to type
  (#3167): its launch (`runtime/src/second-init/demarrage.ts`, from `planDuSecond`) gives it a first message with what
  it read in the repository — the integration branch (`origin`'s default branch), the checks (the `test`, `typecheck`
  and `lint` scripts, or the stack's test command) and the file zones (the workspaces, or the first-level folders) —
  each with what it is for in Brigade. What cannot be read is said so, with why, and left for the questions. Once you
  have answered, the second runs this `/brigade:init` itself; merge its PR — at your next message, the same session
  takes its role again (#2689). It leaves the plugin once adding a project sets
  the repository up in one gesture (#2584), not before.

- **It is a Claude Code plugin in local scope**, `brigade-app`: Claude Code enables it in
  `.claude/settings.local.json` of the project's folder. If git does not already ignore that file, the app adds
  `/.claude/settings.local.json` to the clone's `.git/info/exclude` — never to a `.gitignore`: `git status`
  shows nothing new, and nothing gets committed.
- **Its marketplace is the app's own**, `brigade-app`, written next to the projects file
  (`~/.config/brigade/plugin-app/`) from the commands the app ships — `commands/dev.md` and `commands/ask.md`,
  copied into the installed app under `plugin/commands/`. It is declared once in your Claude Code user settings.
  The V1 marketplace and plugin (`brigade@brigade`) are not touched.
- **The version is the app's.** The installed app installs its own version; launched from the repository
  (where it says `0.0.0`), the version is `0.0.0-` and a fingerprint of the commands and the init script. At launch, each
  project at another version is updated: after an app update, the installed version is the new app's. A
  project added while the app runs gets it at once.
- **Removing a project from the app uninstalls `brigade-app`** from its folder's local scope, and nothing
  else: a `brigade` V1 plugin you installed yourself stays, and the app's marketplace stays declared for the
  other projects (removing it would uninstall the plugin from all of them).
- A failure (`claude` missing, not logged in) installs nothing and is said in the terminal that launched the
  app (`brigade: the app's plugin was not installed in “calculus” — …`); the next launch tries again.
- A session already open keeps the commands it started with: Claude Code loads plugins at startup.
- **A trial launched with `BRIGADE_CLAUDE_BIN` installs the plugin nowhere**, and removes it from nowhere: the
  stand-in `claude` is a session, not Claude Code's plugin manager. The app says so once in its terminal.

*Code: `app/src/plugin-app.ts`, `app/src/plugin/`; tests: `app/test/plugin-app.test.ts`, against the real `git`
and a stand-in `claude` that keeps its registry like the real one (claude 2.1.300), and
`app/test/plugin-init.test.ts`, a fresh repository opened by the app and set up against a bare `origin` and a
stand-in `gh`.*

### A project's colors

**Each project has two colors, so that you recognize it without reading its name**: its **tab
color**, carried by its tile in the bar, and its **accent color**, carried by its space — a
line at the top of the screen and of the second, its name, the open tab, what has the keyboard. Outside
a space ("All projects", the add form), the accent is the skin's.

- **They are drawn for you** when the project enters the projects file — added from the
  app, written by hand, or declared before colors existed (it gets its own at the next
  launch). A new project gets **one palette color that none of your projects carries, in either
  role**, as its tab and its accent; two projects share a color only when the palette is
  exhausted. They are **written in `app.json`** (`couleurs`): closing and reopening the app does not
  change them, and a color already chosen — from an older palette, or written by hand — is kept.
- **You change them in Settings, in its `you` group** (#1700): a line for the tab (`tab, in the bar`), one
  for the accent (`accent, in the space`), each with the color's name, then one dot per palette color, the one the
  project carries circled, then **other…**,
  the system color picker, for any color you like. A click writes it to `app.json`, and **the bar
  and the space take it at once**; your other devices take it at their next read (see "Your
  preferences follow you from one device to another"). A color outside the palette shows at the end of its row, circled.
- **A color of your own that looks too much like another is said, and kept**: when it is at
  ΔE < 10 (CIEDE2000) of a state color or of a color of another of your projects, a line under its
  line names the closest — `tab, in the bar: close to green, a state color — kept anyway`,
  `accent, in the space: close to the tab of fanfare — kept anyway`. Pick another, and the line goes.
- **The palette** (`app/src/couleurs.ts`, #1106): sixteen colors on three lightnesses — orange, rust,
  peach, raspberry, pink, blush, plum, purple, lavender, cobalt, teal, turquoise, ice, mint, lime,
  olive. **Any two are at ΔE ≥ 15** (CIEDE2000, measured as displayed on the app's background
  `--fond`), and **each is at ΔE ≥ 15 of every state color**: the skin's green, yellow, red, blue and
  gray — an alert, a "not verified", a healthy project — do not change from one project to another,
  and no project color stands in for them. Each reads on the dark background and under the dark text
  of a selected tile (contrast ≥ 4.5). `app/test/couleurs.test.ts` measures all of it. Captures:
  `docs/captures/1106/`.

### Your preferences follow you from one device to another (#1677)

What you set at the `you` level ([`reglages.md`](reglages.md), §3) — **the colors of your projects,
their order in the bar, your display preferences** — is kept in a **secret gist of your own GitHub
account** as well as in `app.json`, and every app signed in to that account reads it. Change a color on
your Mac, and your PC shows it at its next read: **when the app starts, each time you come back to its
window, and every minute**. Nothing to copy, and the screens are the same: they still read `app.json`,
which each read brings up to date (`app/src/reglages-perso/`, on the module of #1676).

- **What stays on the device never goes to the gist**: a project's folder (`dossier`) and its ordinary-ticket
  settings. Each device reads them in its own `app.json`.
- **A read takes what changed on the other devices, a change made here wins over it**: the app writes
  to the gist only what you changed on this device since its last read, so two devices that each
  change a different project keep both changes. On the first read of a new device, the gist wins,
  and the device only adds what the gist did not have — a project it is the only one to know, for one.
- **A project only one device has** keeps its colors and its place in the gist: the others do not
  show it (they have no folder for it), and do not remove it.
- **No gist to read** — GitHub unreachable, `gh` signed in to another account, no `gh` at all — and
  the app shows what `app.json` holds, writes nothing, and says why once in the terminal that started
  it; the next read catches up. A gist the app would not understand (a color that is not `#rrggbb`) is
  not written into `app.json` either.
- Nothing here reads or writes a project's `projet.json`: the project's shared settings change by a
  pull request ([`reglages.md`](reglages.md), §1).

### The Settings tab, and the log by its action

**Only one tab is set at the top, next to the project's name: Settings.** Cost is no longer one (#1022): that
of all projects lives at the app level (see "The cost of all projects"), each project's share named there.

**Settings holds only the project's settings** (#1700, #2494). It is one page, with no sub-page and no navigation of its
own, in one card titled `project`. The `this computer` block is gone from it — its lines (ordinary tickets, the station's
GitHub Apps, the projects it serves, the app's code) are not shown in Settings; they move to Stations.

- the project's settings in its repository (below), stored in `.claude/brigade/projet.json`;
- the kitchen — `running` or `stopped`, with `stop the kitchen…` or the gesture that
  resumes it — which the station that serves the project keeps;
- its label and its two colors — `tab, in the bar` and `accent, in the space`, the color's name, the palette — and
  `Remove this project from the app's sidebar`: `Remove from the app…`, which asks for a `yes` first, which the app keeps in
  its projects file.

Under these, a section of its own, **`Caps, closer and all projects`** (#3014): the duration caps, the closer and the
Cost and Closer rows of all projects, as the folded line at the top of the Rail tab, then of the Stations tab, showed
them — same values, same readings, same actions (see "Health strip: duration caps" and the closer's). The closer's last
passes, which it shows with its settings, are the one reading laid in Settings.

**Every setting is one line**, the same everywhere (`app/src/vue/composants/reglage/`, #2920): its name, its value in
force, and **one** control to change it — a field, a pair of lists, a switch, a checkbox, a number, a palette, a button.
The control applies as soon as it changes, with no Save button; a setting kept in the project's repository opens a pull
request when it changes, and its row says so in one line (`a change opens a pull request, applied once merged`). What the control opened or returned — a confirmation, a refusal — is laid under the row. Nothing else is laid in Settings: no statistic, no history, no reading's
text, no explanatory paragraph — what a setting implies is on hover of its value. A group with nothing to set says so in
one line.

**Removed from Settings** (#1700): the General, Rail and Manager pages and their navigation — Rail and Manager have no
route left (`app/src/onglets.ts`); the installation guide and **the installation check** — the `check the installation`
button in the space's header, the verdict at the top of Settings —: the app only needs a GitHub connection (#1692), and
installing a station is a separate topic (#1536); uninstalling the project from its station (`See what the station would
remove`, `Uninstall from the station`); `where the rail's data comes from`; and the project's `status`, as the station
renders it. **Reliability and Closer are no longer there either** (#1699), nor on the Cooks tab, which is gone (#2921). An alert-band line whose cause is fixed on the Stations tab leads to it in one click. **The log (Log) has no tab and no button** (#3048).

**The project's settings, changed by a pull request** (#1309, epic #1301). At the top of Settings, in its **project** group,
one row per project setting, in the order and with the labels of the artboard `Settings.dc.html` (Integration branch, Manager’s calibration, Reviewer’s calibration, Calibration ceiling, Closer’s tokens cap, then the label and the colors in the bar); the closer's other three settings, which the artboard does not draw, follow under the colors as rows of the same component, and the kitchen is its own *Kitchen* section below. The rows: the integration branch, the manager's and the reviewer's
default calibrations, the calibration ceiling, and the closer's four settings (#1685) — its calibration, its start
threshold (`cooksBelow`), its tokens cap and its removed-lines cap. Each row says the value in force and where it comes from — `from the
repository` (`.claude/brigade/projet.json`), `set on the station`, `from CLAUDE.md`, `default` — and has its edit control —
a text field for the branch and for a closer's number, a model and an effort for a calibration —, with no button: the row
says a change opens a pull request. They are read when the project opens, by the runtime's `setting` where its kitchen
runs. **A change proposes at once** (#2920): a text field when it changes (Enter, or leaving it) with a non-empty value
other than the one in force, a calibration when either of its two lists changes and the pair differs. It plays `setting ceiling
<model> <effort>` (or `manager`, `reviewer`, `closer`, `closer-cooks <n>`, `closer-tokens <n>`, `closer-lines <n>`,
`branch <name>`) there: the runtime checks the value against the settings writer — the check the file itself passes, so
a value the file would refuse (a closer's `0`, a branch git would refuse, a path) is refused there, before any request
and any pull request —, opens a pull request on the project's repository and hands it to the pass, which holds it for you. The row
says `proposing…` under it, its control waiting, until the runtime has answered. Opened, the row says `<value> proposed
in` with a `pull request #<n>` button that opens it; refused — a value that belongs to the machine, a change
the repository already carries —, the runtime's sentence is said under the row, its detail on hover, and the field
goes back to the value in force. **The value shown never changes on a proposal**: it is the one in force, until the pull
request is merged. Nothing is saved on the box. The app itself refuses only what does not write as the command's words
(a branch name with a blank, a closer's number that is not digits: `nothing was sent: this value is a whole number,
written in digits`), all of which the file would refuse too. A runtime that does not have `setting` yet says `settings
unavailable` in one line, the detail on hover; one from before #1685, which does not give the closer's settings, shows
the first four rows only. The modules are `app/src/reglages-du-projet.ts` and `app/src/vue/projet/reglages.js`;
the command, `runtime/src/reglage-cli.ts`.

**The project's humans, each change by a pull request** (#2930, epic #2926). Under the project's settings, a `humans`
section lists the humans the project's `.claude/brigade/projet.json` declares (`humans`, #2759): one row each, its login
and its roles as four checkboxes — `product`, `design`, `review`, `client-contact` — and `remove`. Every change applies
as you make it, with no Save button: ticking or unticking a role sends the human with its new roles; `add a human` opens a
new row, which sends nothing until its login is written (Enter, or leaving the field), then sends it with the roles ticked
on it — `cancel` drops it; `remove` sends the removal. Each row is the settings row (#2920): its login, the roles
`projet.json` declares — the value in force until a pull request is merged —, its checkboxes, and the line every
repository-kept row carries, `a change opens a pull request, applied once merged`. Under it,
`writing to projet.json…` while the service answers, then `proposed in` (or `removal proposed in`) with a `pull request
#<n>` button that opens the pull request. A refusal — an unknown login, no access to the repository — is said in one line
under that row only, the rest on hover, under a pull request the row had already opened; the row goes back to its roles before the change and names no pull request. With no
declared human, the section says `No human is declared for this project.` with `add the first human`; a list that cannot
be read says `humans unavailable` in one line, the detail on hover. The section is `app/src/vue/settings-humans/`; it calls
the service through three bridge methods — `listerLesHumains(project)`, `enregistrerUnHumain(project, {login, roles})`
and `retirerUnHumain(project, login)`, each write answering `{pr}` or `{refus}`. The desktop app carries them to the
runtime's `humans` command (#2929) where the project's kitchen runs — `humans`, `humans save <login> [<role>…]`, `humans
remove <login>` — in `app/src/humains-du-projet.ts`; a project with no station, or a runtime from before the command, is
said in one line. A bridge without `listerLesHumains` (the phone) does not show the section.

Under the humans, the **contributor stations** block (#2936) lists each contributor station that claimed a ticket — its name,
its GitHub account, `refused` when it is — with a `Refuse` button, or `Accept again` once refused. The gesture is sent at once;
a refusal of the runtime (a role other than `chef`, say) is one line on that row, which stays as it was. With none, the block
says `No contributor station has taken a ticket yet.`; a list that cannot be read says `contributor stations unavailable`, the
detail on hover. The block is `app/src/vue/reglages-stations/`; it calls three bridge methods —
`listerLesStationsContributrices(project)`, `refuserUneStationContributrice(project, station)` and
`accepterUneStationContributrice(project, station)`, each write answering `{ok}` or `{refus}`. The desktop app carries them to the
runtime's `contributor-stations` command where the project's kitchen runs, in `app/src/stations-contributrices.ts`. A bridge
without `listerLesStationsContributrices` (the phone) does not show the block.

**The drawn rail is at the center of the space, shared between its two tabs** (see "The rail"): On the rail,
Taken, Pass, Todo, Waiting and Served, all on Rail; Cooks shows no kanban column. **The space opens with no page**: the shown
tab has the whole center, over its full height. **A page opens over the rail**: it covers it entirely, without undoing it —
it stays laid underneath, and re-read, but nothing of it can be clicked through, and nothing of it — not even its sticky
column heads — shows through. Clicking the tab again closes the page, and **the rail comes back as you left it**,
scrolled where it was. The alert band, above, stays visible: no page covers it, nor do the terminals, on the right.

Two **content readings** remain, plus the one Settings makes. A reading relays **as text, word for word,** the output of
a runtime command (`docs/runtime/exploitation.md`, "Piloter"):

| Reading | The command the app runs through the project's station | What you read there |
|---|---|---|
| **Log** | `brigade <nom> log --last 200` | the end of the log: the last 200 events, not the whole log — the line under the tabs says so |

- **Only the displayed reading is read**: its command goes out when you open it, then every thirty
  seconds as long as it is on screen. Changing it, closing it or leaving the space stops its
  reading. With no page open, the app therefore runs only `status` for this project; with
  one, `status` and the page's command (Cooks runs three, one after the other: `station`, `measures`,
  `closing --json`). Added to this is `facts`, read for **all** projects whatever the screen: it is what the bar draws.
- **A reading has its own time** (`read at 14:32:07`) and, if it fails, its error, in one line, its detail on hover.
  **A command that fails takes nothing away from the rest** — a runtime too old for `log` leaves the rail readable.
- A runtime that does not yet know `--last` returns its usage as an error: it is read like any failing command.
- Under the tabs, the line says what you are reading: ``the output of `brigade <nom> log --last 200`, as
  the station renders it — re-read alone every thirty seconds, as long as this tab is displayed``.
- The space gives you back the tab where you left it.

### This station's GitHub Apps, in Settings (#2317, epic #2313)

**Each role acts on GitHub under its own App** (`docs/runtime/identites-et-secrets.md`): you create the three Apps once on
your GitHub account, then hand each station their IDs and private keys **through the app** — on the computer that runs
the station. In Settings' **this computer** group, a line `GitHub Apps` says, in one sentence, that **the keys stay on this
station and are never sent to the repository** (what the Apps are for on hover). Then **one line per role**, `cook App`,
`pass App`, `manager App`:

- **its state**: `configured` (green) with its App ID (`App 1203456`), when the station has the App and its key;
  `not configured` otherwise (`App 1203456 · no key stored` when only the ID is there). What the role's App does is on
  hover. A station whose Apps cannot be read says `this station's Apps unavailable`, the reason on hover — never
  `not configured`.
- **its control**: an `App ID` field (prefilled with the stored ID, which is not secret) and a key field — paste the key,
  or `choose the .pem file`: the file's name is shown, never its content. There is no `save` (#2920): **the row applies
  when its control changes once the key is written** — the key field left, a `.pem` chosen, or the App ID field left
  with a key already there. Kept on this station, the row opens no pull request. `saving…` reads under it meanwhile.
- **Applied, the row** stores the App through the runtime (`runtime/src/identites-stations.ts`, `rangerApp`), in the station's Apps
  directory, replacing the one before. Stored, the line says `configured` and `stored: its key is not shown again`, and
  **the key field is empty**: the key leaves the screen, and nothing ever shows it again — the station only says whether
  it has it. Projects the station opens from then on act under it.
- **What does not store writes nothing**: an empty App ID when the key is given (`nothing was written: enter the App's ID`), one that is not
  an App ID, or a key that is not a PEM private key (`nothing was written: this is not a private key — …`) is said under
  its field, and nothing leaves the screen. What the station refuses — one App for two roles, a key it cannot read, an
  Apps directory open to others — is said in one line under the role, the rest of the runtime's sentence on hover.

Only this computer's station is reached: a phone has no station, and the lines are not laid there. The modules are
`app/src/vue/identites-github.js` and, in the main process, `appsDeLaStation` / `rangerUneApp` (`app/src/main.ts`).
Captures: `docs/captures/2317/`.

### The projects this computer serves, in Settings (#2359, epic #2356)

**A computer's station cooks only the projects you choose for it**, straight from GitHub (`runtime/src/station-ordinateur/`,
#2357). You choose them in Settings' **this computer** group, under a line `projects this Mac serves` (`this PC` under
Windows):

- **On a fresh install, none is chosen**, and the line says so in plain words, in yellow: `this Mac serves no project`.
  Its station then takes no ticket. Once one project or more is chosen, it says `serves 1 project` (`serves 2 projects`…).
  What choosing does — the station clones the project on this computer and takes its tickets, at its next turn, within
  two minutes — is on hover.
- **One line per project of the app**, in the order of the bar: its name and its repository (`chef/parade`), `served`
  (green) or `not served`, and a checkbox. Ticking it adds the repository to the station's list; unticking it removes
  it — the station's cooks in flight on it finish and deliver. The line says `saving…` until the station has written
  the list, and every box waits meanwhile: one project at a time. **The value shown is always the list written**, re-read
  each time a project's space opens: chosen, closed and reopened, a project is still ticked.
- A project whose repository the app does not know (added by hand without `depot`) has its checkbox muted, the reason on
  hover. A repository on the station's list that no project of the app carries keeps its line, ticked, so that you see
  everything this computer cooks and can untick it.
- **What does not write is said**: a repository the station refuses reads `nothing was written: …` under its line, the
  rest of the station's sentence on hover, and the box stays unticked. A list the station cannot read says `projects
  served here unavailable`, the reason on hover — never `serves no project`.

The list lives in the station's own state (`<station dir>/projets-servis.json`), never in the projects file nor in the
repository. Only this computer's station is reached: a phone has no station, and the block is not laid there. The modules
are `app/src/vue/projets-servis/projets-servis.js` and, in the main process, `projetsServis` / `servirUnProjet`
(`app/src/main.ts`), which call `lireProjetsServis`, `ajouterProjetServi` and `retirerProjetServi` of the runtime.
Captures: `docs/captures/2359/`.

## Buttons write, they do not send

A button of the app **does not act**. It writes its command into the space's **second**, cursor
after it, and stops there: you read it, you correct or complete it, and **it is your Enter that
sends it**. In front of the `claude` prompt, a `stop` therefore does not go out from a stray
click — in front of any other screen, read "The limit" below.

**A button that stops says what it stops.** `guardrails stop` exists only in a project's
panel, and stops only **that project's kitchen**: the command it writes names it
(`!(cd <runtime> && BRIGADE_STATION_DIR=<dir> node …/geste.ts <name> guardrails stop)`), and you read it before sending it. It does not close the app, and
touches no other project. **No button stops all projects**: "All projects" has
none.

| Where | The button | What it writes into the second |
|---|---|---|
| the state panel, under the time of the read | `guardrails stop` | `!(cd <runtime> && BRIGADE_STATION_DIR=<dir> node …/geste.ts <name> guardrails stop)` |
| | `guardrails resume` | `!(cd <runtime> && BRIGADE_STATION_DIR=<dir> node …/geste.ts <name> guardrails resume)` |

- **It is the doc's command, word for word**: `brigade <project> <command>` of `docs/runtime/exploitation.md`, "Piloter",
  in its station form for this computer — the gesture of the local station, run from the runtime's folder with the
  station's directory (`(cd <runtime> && BRIGADE_STATION_DIR=<dir> node …/geste.ts <project> <command>)`). The `!`
  in front is the one that runs a command on the Mac from a `claude` session. It stays in the
  second's history, and can be replayed by hand identically.
- **The app writes no Enter**: what is written carries no carriage return or line feed.
  A command that would carry one — a `name` that contains one — **is not written**,
  and the line under the right-hand tabs says so.
- **The limit: the app does not see what `claude` displays.** It writes the command's
  characters, and the screen of the moment receives them. In front of the prompt, they land there. In front of
  **a dialog with numbered choices** (a tool permission, folder trust), they are
  keys: a digit in your `name` or in a path (`project-1`) can choose
  an option there. In **vim mode, outside insert**, letters are editing commands. The app can
  neither know it nor prevent it: click a button only when the second is at its prompt, and
  look at it before confirming.
- **The command waits for you in the second, on the right** — the center does not change —, and the line under
  its title says what just happened:
  ``written in the second, without Enter: `!(cd /Users/chef/brigade/runtime && BRIGADE_STATION_DIR=… node …/geste.ts parade guardrails stop)` — in front of the `claude` prompt, it waits for yours, after your typing if you were typing. In front of any other screen (a choice to make, vim mode), these characters are keys: look at the second before confirming``.
- **If you were typing**, the app does not know: it does not read your terminal. It writes
  **after** your typing, erasing nothing, and says so (above). Same for two
  clicks in a row: the second command is written after the first. Erase the line (`Ctrl+U`), and
  click again.
- **If the second is not running** — you left `claude` — the button **starts it first**, and
  writes nothing: a starting `claude` would take the command for keys. The line says
  ``the second was not running: launched (`claude --continue`, with the second's role in its system prompt) — the command is not written into a second that is starting, click again when it is ready``.
- **Always in the second, never in a shell** opened beside it. One exception, which
  opens its own shell: the project switch's `on`.
- **A button that could write nothing says so** under the right-hand tabs: `nothing is written: …`
  — for example when the project has just left the file.
- A project whose kitchen does not run on this workstation has no button: there is no command to write. A project whose
  folder is not there has no second: its column says why (`folder not found: …`).
- **Only these buttons exist**, each where what it changes is read — and, apart, the project switch. The
  rest of "Piloter" (`manager return`, `base replay`…) is typed. "All projects" has
  none. Going live with a project just added has its own, apart: `installation`
  is run for you there.
- **The stop banner carries `guardrails resume`**: the same button, the same written command,
  set where the stop is read ("What is drawn", "The stop banner").

### The kitchen action

**The kitchen is a line of Settings' project group** (#1700): `kitchen`, its value `running` or `stopped`, and its one
control — **`stop the kitchen…`**, in its own form (a solid red square before the word, a red line), or the gesture
that resumes it. Each says first what it costs, in its confirmation: nothing goes before your "yes". **Stopping the
kitchen is dangerous**: all running cooks are stopped, and none is launched again until it is resumed.

- **At the head of the rail, no technical sentence and no stop button.** The rail starts with its columns. A single
  discreet mention may precede it: `up to date 3 min ago — the station has not answered since`, **visible only when
  the read is more than two minutes old** (or did not succeed).
- **No installation action is left in the app** (#1700): `check the installation` and the installation guide are
  gone — the app only needs a GitHub connection (#1692); installing a station is a separate topic (#1536).

## A direct action really goes out — or says why it does not

An action **without judgment**, that destroys and commits nothing, need not wait for your Enter: its
command **goes out**. It is sent into the **second** — prefixed with the `!` that runs it on the Mac
from the `claude` session —, **its output is read in its thread**, on the right, without the center
changing. The line under the second's title says what went out:

```
sent into the second: `!(cd /Users/chef/brigade/runtime && BRIGADE_STATION_DIR=… node …/geste.ts parade switch off)` — `claude` went into shell mode, the app pressed Enter. Its output is read in its thread, and the second reads it too
```

| The direct action | Where | What goes out |
|---|---|---|
| `project off` | the project switch, at the head of the space | `!(cd <runtime> && BRIGADE_STATION_DIR=<dir> node …/geste.ts <name> switch off)` |

**The other actions stay written** — stopping and resuming the kitchen: they destroy or commit, and are read before they go. **Turning on the
manager** too, for now: it commits, and its warning is set on the written command.
**An action with judgment** — the Awaiting you slip — writes a request into the second and stops:
without your Enter, nothing is transmitted.

### What happens to a command written into the second's input

This is what had to be known before sending anything, and it is measured: a real
`claude` (2.1.296) in a pty, on 2026-10-13, a `!…` command written into its input.

| The second's state | What happens to the command |
|---|---|
| **free** — at its prompt, input empty | followed by Enter, it runs at once, and **its output shows in the thread**. The second then takes **a short turn of its own** from it: it comments on it in a line or two |
| **busy** — in the middle of a turn | it is **neither lost nor run**: `claude` queues it, and it goes out **by itself, at the end of the turn** — when you are no longer looking |
| **in front of a dialog** — a permission, `/model` | its characters are keys: written in one block it does nothing there, but **an Enter there confirms the choice shown** |
| **typing in progress** | it is written after it, and the whole goes out as **a message to the second** — which then tries to run the command itself |

**Writing blind is therefore not sending.** The app does not carry its own input field for all
that: you always talk to the second in its terminal. Nor does it read its screen. It
holds **three witnesses**, and calls it free only if they agree:

| The witness | What it says | Where it comes from |
|---|---|---|
| **its turns** | a turn is in progress, or finished | `claude` announces it itself: the app launches it with three hooks (`--settings`: `UserPromptSubmit`, `PreToolUse`, `Stop`), which write a word into a temporary file, specific to this second. In front of a permission dialog, the turn **is not finished** |
| **its title** | it waits (`✳ …`), or it runs (`◐ …`) | the title `claude` gives its terminal, read in its output. It also runs for a `!` command and for a turn it launches by itself — which the hooks do not announce |
| **your typing** | your input is empty, or not | the app relays what you type into the second: as long as your last key is not **Enter**, your input is not called empty |

**And a proof, before the Enter.** When free, the app **writes** the command, then waits for `claude` to
show itself in **shell mode** (its legend `! for shell mode`): that is the proof that the command is
alone in its input, at its prompt. **Only then** does it press Enter. With no proof after
five seconds — or if you type in the meantime —, it does not press Enter, and says so:

```
written in the second, but not sent: `!(cd /Users/chef/brigade/runtime && BRIGADE_STATION_DIR=… node …/geste.ts parade installation)` — `claude` did not show itself in shell mode ("! for shell mode"), so the app did not press Enter. Its input was not empty, or it was showing something other than its prompt: look at the second, and erase what is written there
```

### When it does not go out, it says so

**Nothing is written into a second that is not called free**, and the line under the right-hand tabs says
why — always followed by ``— the command did not go out, and nothing is written: `!(cd … geste.ts …)` ``:

| What the line says | What is happening | What to do |
|---|---|---|
| `the second is busy: it is in the middle of a turn` | it is answering, or a command is running | wait for the end of the turn, and click again |
| `the second is not at its prompt: it is waiting for your answer — a permission, a question —, or its last turn was interrupted…` | a dialog is open; or you interrupted its turn (Esc), and the app will only know it free at the end of the next one | answer it, or talk to it: the next turn, once finished, calls it free |
| `your input in the second is not called empty: your last key there is not Enter…` | you were typing, or a key went through (an arrow, Esc) | send or erase your typing; with the input empty, **an Enter in the second** tells the app |
| `the second's input is not called empty: the app wrote there without sending…` | a slip request, or a command left without proof, may still be there | send it or erase it, then an Enter |
| `a command from the app is already on its way into the second` | you just clicked | wait for it to have run |
| `the second has not yet finished any turn since its launch: it is starting…` | it is starting; or its hooks are cut (`disableAllHooks`) | wait for the end of its first turn |
| `the app does not know whether the second is free: …` | `claude` gives its terminal no title, or not one of the two the app knows | — see below |

- **The second was not running**: the action starts it, writes nothing into it, and says so — click again when its
  first turn is finished.
- **The second comments on the output.** On `claude` 2.1.296, a `!` command makes it take a short
  turn: it summarizes it in a line or two. It enters its context — that is what lets it
  know what you did —, and every following turn pays for it as input: a direct action must
  output little.
- **All this depends on what `claude` shows today**: its title glyph, its shell-mode
  legend, its hooks. If a version changes them, **no direct action goes out any more** — it
  says why, it does not guess. The command is in the refusal: it is typed.
- **The app's settings add to yours**: its three hooks only write a word into its
  file, and nothing on their output — `claude` reads none of it. Your own hooks still run.

## What is drawn

Four things, and only them, because they are a **table of states**: the bar's pill,
the project tile, the rail, the stop banner. The app draws them from no sentence: it
reads `brigade <name> facts`, the command by which the runtime gives its facts as facts
(`docs/runtime/etat-et-mesures.md`, "Les faits, pour un programme") — a state is **a word read**, a counter **a
number read**. For all projects whose kitchen runs on this computer, every thirty seconds, whatever the
screen.

### The project tile

At the head of the panel, in the project's space:

```
● open   read at 14:32:07 · last tick 9 s before the read
  2        1            1            1           3
  rail     taken        at pass      awaiting you    served 24 h
#14  The append-only log                           box/claude
last event — merge.done · #216 · 13 s before the read
```

| What you read | Where it comes from |
|---|---|
| the pill and the word | `etat`: `open` (green), `held` (yellow), `stopped` or `off` (red) — what each means is in `docs/runtime/etat-et-mesures.md`. *Why* the kitchen is held is read in `status`, below |
| `read at …` | your workstation's time at the read |
| `last tick … before the read` | the gap between the runtime's last tick and the box's time at the read. **The app shows it and concludes nothing**: `open` with a ten-minute-old tick is a runtime to go and look at (`systemctl status brigade@<project>`), and it is you who says so. `no tick`: runtime stopped, or no tick yet since its start |
| the five numbers | `rail` (queued, `BLOCKED` included), `taken` (`taken`), `at pass`, `awaiting you` (the decisions of the `awaiting` block), `served 24 h` |
| the running cooks | `cooks`: one per line, in the box's order — its ticket, that ticket's title, its station. These are the ones `station` shows under "cooks running": neither the reviewer's reviews, nor the manager's judgments. A title too long wraps, nothing is cut; it is empty if the ticket left the rail during the cook. `no cook running` when the box gives none |
| `last event` | its type **as it is** — the app does not translate it —, its ticket if it has one, and its age at the read. `none: the log is empty` on an empty log |

Ages are counted between two times **of the box**: your workstation's clock does not enter into it.

**A box whose runtime does not yet give its cooks** — a runtime from before this field of
`facts` — is not a box that does not return its facts: the tile is drawn, and says in their place
`cooks running: not read — this box's runtime does not give them in facts yet`. **This is not
"no cook"**: `station` shows them, in the space's **Cooks** tab. Once the runtime is updated, the line goes away by itself.

**A cook has no gauge or color**: its turns, its duration, its tokens, its inactivity are in
`status`, and `facts` does not carry them. Its number does not open either — the ticket opens
from the rail.
### The rail

**It is the main view of the space: in the middle of the screen, under the project name, whatever
tab is shown below it** — the second, a shell, the output of a command. **Six columns**, one
ticket per card: what is going to happen (On the rail), what is happening (Taken, Pass), what you
have to do (Awaiting you), what waits for a third party (Waiting), what is done (Served). **The columns are shared between the project's two tabs**
(#1184, then #1269): the kanban stays whole on Rail, Taken and Pass included, and Cooks shows no column. No card
opens a served worktree page (#1846). The spec is
`docs/superpowers/specs/2026-10-13-app-poste-de-travail-design.md`; the visual language remains that
of `docs/maquettes/app/Brigade.dc.html`.

**The order** (#2093): the row reads On the rail, Taken, Pass, Awaiting you, Waiting, Served — the rail in the order of
service, then what waits for you, what waits for a third party, and what is done. The fourth column was titled Todo
until #2922, which gave it the mockup's title (`Project.dc.html`, epic #2897); "Todo" in this document names the same
column. Titles are cased alike (Awaiting you and Waiting, not TODO and WAITING; the card badges keep their words), and
each column has its own mark: a ring for On the rail, a triangle for Taken, a diamond for Pass, a square for Awaiting you, an orange **pause** (two bars: held, waiting for
someone) for Waiting, a disc for Served. The Backlog column, unfolded, comes just left of On the rail. **Todo never
disappears**: when the `awaiting` block says nothing awaits the chef, its one line says `nothing awaits you`; when
the block has lines without a ticket (a station, the base), it says that no ticket heads them. Captures: `docs/captures/2093/` — `espace-projet-*` and `espace-projet-etats-github-*`, `-avant` and `-apres`.

```
● On the rail  2       ● Taken  1             ● Pass  1            ■ Awaiting you  1      ‖ Waiting  0        ● Served  1
  #22 queued             #14 taken              #15 in pass          #21 BLOCKED            no ticket waits     #9 served
  Login by…              Form…                  PDF export…          The log export         for a third party   SIRET validation
  after #14              writes the tests       review in progress   Merge it yourself.                         served at 14:02 ·
                         · 12 min               · 1 min                                                         The SIRET field…
```

**Vouchers, and the warm card** (#2922, mockup `Project.dc.html`): a ticket is a cream paper voucher (`--bon`), in
every column but Awaiting you. There a ticket is the warm card of what awaits you (`--attend`, its `--attend-trait`
border, a card's radius): its number, its title, its question in large type, then its choices — **the first choice is
the recommended answer**, the only button filled with the accent, the others ordinary buttons — then `answer in my own
words`, which opens the free-text field and its `send`. A card with no choices keeps its field open (it is its only
answer), and so does a card on which the chef already typed. Captures: `docs/captures/2922/`.

**The cooking pan** (#2984, `app/src/vue/composants/poele/`): a small 8-bit pan, drawn for Brigade, sizzles at the end
of a voucher's head while an agent works on that ticket — its cook holds it (Taken), or the pass runs its gates,
reviews, judges or merges it (Pass) — and at the end of each line of the Stations tab that runs: a cook, the pass, the
manager qualifying or splitting an issue, the triage, the closer. The main process says which tickets are at work
(`app/src/faits.ts`, `auTravail`, from the rail and the runtime's `agents`); the view lays the pan only on a live
reading. No pan on a card that waits — queued, set aside, awaiting you, waiting for a third party, a delivery waiting
for the pass, its CI or the chef —, none when the kitchen is stopped, on a station that is stopped, absent or whose word
the app does not know, and none on a reading that is offline, stale or from a station that does not answer: the pan
never claims work that may not be happening. It is 22 × 14 px, takes no line of its own, and its colors are tokens
(`--gris` iron, `--accent` food, `--discret` steam) that read on a voucher's paper as on the dark; with the system's
"reduce motion" on, it shows its first frame, still.

**A card fits in two lines** (#622): its number, its state and its title, then **a sentence in plain
words** that says what is happening, and at most **one signal line** when something asks for your
attention. Each sentence is written from the facts the queue already gives about the card
(`app/src/ligne-carte.ts`), one test per state:

| State of the card | Its sentence | Its signal |
|---|---|---|
| taken (`taken`) | what the cook is doing, and for how long: `writes the tests · 12 min` (`rail[].activite`); with no activity, `in the kitchen` and a `…` marker | — |
| in pass | likewise: `review in progress · 1 min`; with no activity, `review in progress` and the marker | — |
| queued | `Waiting for #14, #15` when `status` names the tickets that hold it, each number opening its issue (#3147); otherwise what holds it, as is; otherwise `ready, waits for a place in the kitchen` | — |
| `BLOCKED` | likewise, or `blocked` and the marker | `blocked` |
| set aside (`86`) | `Will not start: <reason in plain words>.` (`app/src/refus.ts`, from `attente.raison` or the station's comment); the word `86` is displayed as `set aside` | `set aside` |
| with a third party (WAITING) | `waiting for <what> · from <who> · follow-up <YYYY-MM-DD>` — the follow-up day on this computer's calendar (#3075); without a follow-up, the first two | `follow-up date passed` when the follow-up date has passed |
| question answered (WAITING) | `answered by <who> · the manager's turn` — `you` for an answer the app has just posted | — |
| awaiting you | what is expected of you, in one sentence (`decision.ts`); for a question from the manager — before splitting an epic, or which holds the ticket through `blocked-on-human` —, the question being asked of you | — |
| served | `served at 14:02 · <first sentence of the review summary>`; with no summary, the time and the marker | — |

**Neither "lease", nor "86", nor "not given" on a card.** When a piece of information is missing, a
small discreet `…` marker signals it; the card never lists what it does not know.
What does not change what you do — who holds the ticket, since when, its lease, what it burns, what
blocks it, `right now` — is in **the card sheet**, which a click on the card opens (`app/src/bon.ts`,
`dit`), with what was served and its expandable remarks for a served ticket. The raw line that
`status` writes for the ticket is nowhere on the card or on the sheet: it is read whole in
Settings. The screenshots of a served interface ticket stay on the card.

**The sheet carries what the queue says about the ticket** (`app/src/bon.ts`) — five things, in this order,
with `right now` (what the kitchen is doing with it, `rail[].activite`, see "Ce que fait un cook en ce moment"
in `docs/runtime/garde-fous.md`) first:

| On the sheet | What it is | Where it comes from |
|---|---|---|
| `taken by` | the station that holds the ticket | `cooks`, in `facts`; failing that, its line of `status` (`by <station> …`) |
| `since` | since when it has been in this state — taken, queued, in pass, served | its line under `rail`, in `status` |
| `lease` | its lease, in the runtime's words: `no progress since 3 min, lease 27 min left`, `STUCK: …`, `lease expired since 5 min` | likewise |
| `burns` | what its cook has spent — never written as long as neither `facts` nor `status` gives it | — |
| `blocks` | in plain words, what holds it: `zone held by #14 (app/src)`, `awaiting #12, #13`, `#17 dropped (…)`, `no station declared` | its line under `rail`, in `status` |

For a ticket in pass or served, `cooked by` is added: who cooked it is not who holds it.

**Under it, `its cook`: what the ticket's cook is doing, as GitHub says it** (#1846, #2061,
`app/src/vue/activite-du-cook.js`) — in place of the cook's terminal, which the app does not follow. The app reads it
from the ticket's issue and PR with this computer's GitHub account alone — no other machine reached
(`app/src/tableau/lecture.ts`, `activitesPubliees`) — every 30 seconds with the rail, and an open sheet follows it
without a gesture: a `cooking` pill, its station and since its claim; `now` and what the kitchen is doing (`cooking`,
or `awaiting review and merge` of `PR #40`); and `open PR #40`, which opens its PR in the browser — or `it opened no
PR`. No turns, tokens or steps: only the station's log carries them. The last line, `as GitHub said at HH:MM UTC`,
dates what it shows by the app's reading, where it comes from in its hover. A ticket no station has claimed has no
section. With the section laid, `right now` is not repeated under it.

- **What the queue does not say is not displayed** (#747) — neither the card nor the sheet writes "not given
  by the queue: …" in place of a piece of information: a missing thing has no line. Nor "nobody",
  nor "0", nor a dash either. (The model keeps `sans`, which the view no longer sets.)
- **A ticket's retro is on its sheet** (#1038), under its history and cost: the lessons its retro left the
  project, three at most, each with the `provisional` badge of the Cooks tab (its meaning on hover), its id and
  its text — `reconfirmed` when the retro reconfirms a lesson the project already had —, then what its cook wrote
  between `<retro>` and `</retro>`, as is. It comes from `retro` in `pass <n> --json` (see "Voir la pass" in
  `docs/runtime/pass-merge.md`). A ticket with no retro says `no retro for this ticket yet`; one served whose cook
  wrote none says `served, but its cook wrote no retro`; a box from before the retro on the sheet says
  `retro unavailable`, its why on hover — never an empty section.
- **A rail card's history and discussion come from GitHub, not from the box** (#1735): the sheet reads the ticket's
  issue (body and comments) and the PRs that close it with the `gh` of this computer, on the project's repository —
  so the sheet opens with the project's station off. The history is what GitHub keeps: `arrived` (the issue's creation),
  `delivered` and `merged` for each PR, or `closed without a merge`. What only the box's journal carries — the cook's
  tokens and time, the attempts, the retro — says `not communicated`, never a made-up value (so the retro section
  above reads `retro not communicated` there). An issue absent from GitHub is one sentence: `<repo>#<n> is not on
  GitHub: there is nothing to read`. A comment is posted by the app directly on the ticket's issue (#2061,
  `commenterLIssue` in `app/src/gestes-github.ts`), with this computer's `gh` token, so under your GitHub account, as
  written; the sheet then says `comment posted on #<n> — on its issue, under your GitHub account`, and the discussion
  is read again. Refused, the sheet says why in one line and nothing is posted. **"ask the second" writes `/brigade:ask <ticket> ` into the project's Second tab** (#2167) — the ticket
  number and a trailing space, the cursor at the end, and no Enter: you type your question after it, and your Enter
  sends it. Nothing goes to GitHub or to the box, whichever station serves the project; what is in the comment
  field is not part of it. A Second that is not running is launched first, and nothing is written into it — click
  again when it is ready.
- **A served interface ticket shows its screenshots, without a click** (#842): for each screen
  changed, the before screenshot and the after screenshot side by side, each under its caption (`fiche — before`,
  `fiche — after`), on its card in Pass as in Served. They come from `captures`, in `facts`,
  each by its address on GitHub at the served commit: the address stays in the main process, which reads
  the image through the workstation's `gh` — a private repository included — and hands it to the view as `data:` (the page
  asks the network for nothing: `img-src data:`). An unreadable screenshot says `not available` in its place, its
  why on hover. **An interface delivery that does not carry all of them is said to be incomplete**, in
  one line at the top of its screenshots (`incomplete delivery: screenshots missing — the after screenshot
  of fiche`), where to put them on hover; a missing screenshot keeps its place, and says `missing`. **A
  ticket that is not an interface ticket has no `captures`**: its card says nothing of them, not even an empty
  zone (`captures.ts`).
- **Every card carries its title.** The one the box gives; failing that — a ticket off the rail, which the
  log does not know —, that of its issue, read once through the workstation's `gh` at the address the box
  returned (`question.ts`, `titreDe`). Unreadable, the card has no title: nothing is written in its place.
- **A card that awaits you for a manager's question says the question being asked of me** (#503) — an
  epic that it does not split before your answer, or a ticket held by `blocked-on-human`: in one or
  two lines, taken from the comment of the manager who asked it (`question.ts`, `resumeDe`), with who
  wrote it and when. Its issue is read through the workstation's `gh` as soon as the card is laid down — the queue does not
  carry the text of the question, only its action. It replaces the raw line of the queue; as long
  as it is not read, the raw line stays. The other TODO cards read nothing.
  On its sheet, two buttons lift the hold without a command to copy: **remove the label** — the
  manager judges the issue at its next turn — or **close the issue** (a second click confirms), through the
  workstation's `gh`, in your name (`question.ts`, `lever`). Nothing goes out for a ticket that the `awaiting` block does not
  say is held.
- **A delivery that awaits you to merge explains itself in two lines, at the top of its sheet**
  (`decision.ts`, `teteDe`): what it does — the first sentence of the summary of its review, line
  absent when the review gives none — and why it awaits you: `Green, but it touches the
  judges: review it.`, `Red after 2 returns: ` followed by the first blocking finding (or `Red, the manager
  gave up: …`), `Green, the CI did not conclude.` When it touches the judges (`.claude/brigade/`,
  `.github/workflows/`), their files follow, one per line, with the lines added and removed —
  nothing drafted. Everything comes from `attend[].livraison` in `facts`, what the pass recorded
  (`runtime/src/attend.ts`, `Livraison`; `judges` of `pass.judged`); with nothing recorded, the
  previous sentence stays alone. The "merge" and "remove from the rail" buttons are below.
- **Each value is a piece of what the box wrote, or a number it gave.** The app
  counts no duration (apart from the age of `right now`, above) and adds nothing up: two cooks in flight on the same ticket are each read
  under their own run.
- **The line read is the one `status` writes under its `rail` line** —
  `  #<ticket>  <state>  <priority>  <detail>  <title>` (`runtime/src/etat.ts`, `decrireEtat`). It is,
  with the number at the head of a line of the `awaiting` block, **the second thing
  the app reads outside the shape of `facts`**, and one more contract on a text. It is bounded
  by the state and the title that `facts` gives for this ticket, and its detail is split only if it has the
  form the runtime writes for that state. **Otherwise nothing is taken from it: the line is relayed on the
  card, whole and word for word**, under ``not given by `facts`, and not read by the app in what
  `status` writes of this ticket, relayed below as is``. This is the case of an `86` and of an
  unknown state word, whose detail is not split. If the runtime rewords this line, the cards do not
  lie: they relay it. And a test of the app has the runtime itself write `status` and `facts`,
  from the same state, and turns the gates red beforehand (`app/test/bon.test.ts`).
- **In Awaiting you, what blocks the ticket is what the `awaiting` block says of it**: laid on the card
  under a cut line, **word for word** — its line and, below, the more indented lines that
  detail it, in their whitespace, neither truncated nor reformatted. A line that is too long wraps to the
  next; nothing is cut.

| Column | What is in it | Where it comes from |
|---|---|---|
| **On the rail** | the `queued` and `BLOCKED` tickets | the state word of `facts` |
| **Taken** | the `taken` tickets | likewise |
| **Pass** | the `in pass` tickets | likewise |
| **Awaiting you** | the tickets that await a decision from you: those the `awaiting` block of `status` names, in the block's order — the oldest first —, then those `facts` names alone | **`attend`, in `facts`**, which says who is awaiting; and **the number at the head of a line of the block** (see "The number it reads there"), which also says what is expected of it |
| **Served** | the tickets served in the last 24 h, **the most recent on top** — whether their issue is closed or not: as many cards as the `served 24 h` counter | **`livres`, in `facts`**; from a box that does not give it yet, the `served` tickets of the rail |

- **On the rail is in the order the runtime serves** (#1347) — the order of `rail[]` in `facts`, by
  `prio:` label then age (`docs/runtime/journal-et-rail.md`), the same order `status`
  prints under its `rail` line: after a reload or a restart of the app, the column shows it again. Each
  queued card carries **its priority**, as its `status` line writes it (`prio:2`), or `no prio` when its
  issue has none. **The card at the top of the queue that does not leave says why**, on its line:
  `does not leave: zone held by #14 (app/src)` or `does not leave: machine saturated` — `rail[].raison`
  in `facts` (#1346); a runtime from before this field says nothing more.
- **A ticket set aside (`86`) is never out of a column.** The runtime gives, in `rail[].attente`
  of `facts`, its reason in plain words ("awaiting: project setup impossible") and the column where it waits;
  the app files it there — failing a column it knows, in **On the rail** — and its card
  carries the reason in one line (`set aside`), never the raw line of `status`
  (`86 prio:1 … (setup-failed), back in …`). Only a ticket in an unknown state, with no `attente`
  (a box from before this field), is still rendered apart under the rail.

- **A served ticket stays in Served 24 h, issue closed or not.** The merge closes the issue, the ticket
  leaves the rail a few seconds later: the column no longer reads it on the rail, but in
  `livres`, which the box rereads from its log. Its card carries its number (which opens the issue), its title,
  `served` — its age at the time of reading, on the box's clock —, `cooked by` — the station —, and **a
  button "open the merged PR"**, which opens it in the browser: the address stays in the main
  process, like that of the issue. A ticket served without a merge has no PR: the card says so
  (`PR  none — served without merge`). An issue closed **without** having been served — dropped,
  set aside — is not there.
- **Under its title, the card says what was served: the review summary, word for word.** The
  title says what was asked; the summary, what the reviewer read in what was served — the one
  it wrote on the issue. It is laid down whole, in its words: neither cut nor reworded, and a
  line that is too long wraps to the next. Below it, **the number of its findings, in plain words** —
  `no remarks`, `4 remarks`, or `2 remarks, 1 of them blocking` for a delivery merged by
  hand despite a red review. **A click on this number expands them** on the card, each in its
  order, with the file it names and its text as the reviewer wrote it; a second click folds
  them back. They come from `relecture`, in `livres` (`docs/runtime/etat-et-mesures.md`, "The facts, for a
  program").
- **With no review, the card says so, and invents nothing**: `what was served: not given —
  no readable review bears on this delivery (merged by hand, served without going through the
  pass, or from before the review)`. From a box whose runtime does not give the review yet, it
  says ``what was served: not given — this box's runtime does not give the review yet
  in `facts` ``. The issue title is never put in place of the summary.
- **Empty, the column says so: "nothing served in 24 h".** It is not "no ticket": nothing was
  served.
- **Long, it scrolls within its height**: its cards push nothing below the grid, and the other
  columns stay in view next to it.
- A `served` ticket still on the rail, served more than 24 h ago, is no longer in Served: it is
  rendered apart, under the grid. A served ticket that the rail carries again under another word —
  taken again since, `86` — is in Served and where that word files it.

- **A ticket that awaits a decision is in Awaiting you, and nowhere else** — a `BLOCKED` leaves
  On the rail, a green unmerged delivery leaves Pass: it is the information that decides an
  action. Its card keeps its state word, and carries **what its line of the block says, word for word**: the
  action is there, as the runtime writes it.
- **It is there as soon as `facts` names it in `attend`**, without waiting for `status`: `facts` is read for
  all projects, whatever the screen. As long as the block has not been read, its card is in
  Awaiting you without the block's words — it writes that what blocks it is not given, and does not
  offer "ask the second", which is composed of those words.
- **A ticket that the block names without its being on the rail** — an issue the manager set aside,
  an epic on which it asks a question — has its card in Awaiting you: its number and its line.
  No state, which `facts` does not give for it; **its title only if `facts.attend` carries
  one** — the log does not know it for an issue set aside, and no further call goes to fetch it: the
  block's line already says what it is. **Its number opens the issue** at the address that `facts.attend`
  gives — the box knows the repository, the app composes none. Without this address (a runtime from before
  this field, or a box that does not know its repository), it opens nothing, and its hover says so.
- **A line without a number is in no column**: the station without a Max connection. It stays in the block, on the right. The `awaiting you` counter of the project
  tile counts the decisions, the column counts its cards: a disconnected station makes the difference.
- **Awaiting you may not be read**, and the column says so (`?`, `not read: this box's runtime
  does not give `attend` in `facts`, and the `awaiting` block of `brigade <name> status` was
  not taken for this project`): a runtime from before `attend` in `facts`, whose `status` is not
  read yet, is failed, or has no edge. It is not "nothing awaits you" — the tickets then stay
  in the column of their state word. The column never says by itself that nothing awaits
  you: empty, it says `no ticket at the head of a line of the `awaiting` block` — or, before the
  block is read, ``no ticket in `attend`, according to `facts` `` —, and it is the block that says the
  rest: a connection, the base also await, and have no card.
- **An `86` ticket that does not await you** — its station gave it a return time — **is
  in no column**, like a ticket whose state word the app does not know: it is read **under the
  columns**, under the title `outside the five columns`, with its word — and its line of `status`, relayed as
  is on its card, says when it comes back; the Rail reading, in Settings, relays what `rail` says of it. An `86` with no return time, or raised by the pass, is in the block: hence in
  Awaiting you.
- **A number opens the issue** in your browser. The address is the one the box gives for this
  ticket — that of its issue, as the runtime received it from GitHub for the repository the
  project declares to it. The app composes none. **Only an `https` address opens**: otherwise the number is not a link, and
  its hover says so.
- **One color per state**: `queued` gray, `taken` blue, `in pass` yellow, `served` green,
  `BLOCKED` and `86` red. The dot of a column has the color of its state; that of Awaiting you is red.
- **No tags on the cards**: the ticket opens on its issue, where its labels are, up to date.
- A box that returns an empty rail draws five empty columns (`no ticket`) — a fact, not a
  missed reading. A box that does not return `facts` draws no rail: the title says the case.
- **What a card carries from `status` holds only for a project whose `status` is read** — the one
  displayed, or all of them in "All projects". When you leave a project, what `status` returned for it
  is dropped: when you come back its cards say what `facts` alone gives for the time of the first
  reading, rather than laying an hour-old line over fresh facts.
- **Two readings, two times**: the columns date from the last reading of `facts`; what
  the block says and what the cards carry, from that of `status`. The provenance, in Settings
  ("where the rail readings come from"), carries the two commands and the two times, and they may differ by thirty seconds: a ticket that has just moved may, for the length of one
  reading, be read with a state word from one reading and a line from the other. Its line is then
  not split — its state is no longer that of `facts` —: it is relayed as is.
- **A card in Awaiting you carries "ask the second"** (`app/src/demande.ts`). The click writes
  into the second a request in prose — a sentence, not a command — and displays it: it names
  the ticket, the project, its title if there is one, and what the `awaiting` block says of it, word for word,
  hence the action the queue names (answer on the issue, close, remove and re-set `fire`, an
  `86`, a pass escalation: each entry has its own, the app invents none). It asks the
  second to read the issue, to explain, then to answer or to do the action with you once
  you have decided. **Nothing is sent: you are the one who presses Enter.** There is no popup agent:
  the second has the queue, its history and its role, and it is the one who answers on the issue when you
  go through it. A manager's question can also be answered without it, on the sheet (below).
  - **The second is the project's own**, displayed as for a button. A stopped second is launched, and
    nothing is written to it: click again when it is ready. The sentence is composed by the main
    process from the block it holds, not from a text coming from the view; a ticket that the block no longer names
    writes nothing.
  - **A control character refuses everything** — a carriage return, a line feed, a Ctrl-C in
    what the queue says: nothing is written, the note says so. So no click presses Enter in your place.
  - **One line, which disappears on sending.** The note of a written request fits in one line, without
    copying the request (it is in the terminal): "request written in the second — press
    Enter to send it". It disappears as soon as you press Enter in the second. The warning about
    dialogs appears only if the second was really waiting for an answer (a permission, a
    choice) when the app wrote, and also fits in one line. The app does not read the screen of
    `claude`: it knows it from the turns and the title of the second (saisie.ts).
- **The question that awaits you, laid down as is, with no LLM** (`app/src/question.ts`, #681). When
  the manager asks a question on an issue — before splitting an epic —, the click on its card
  opens its sheet, and the sheet lays it down: the app reads the issue on opening and shows **the manager's comment
  word for word**, without its hidden markers (`<!-- brigade:… -->`) — no summary, no
  rewording, no second. Below it, what has been written on the issue since, if anything:
  you see that it has already been answered.
  - **Its choices are buttons.** A question that offers `(a) … (b) … (c) …` in its sentence, or
    a list `a)`, `(b)`, `c.`, `d :` at the head of a line — letters that follow one another from `a`,
    at least two —, has one button per choice: `b) it opens on top`. **One click, and it is
    answered**: the letter and the text of the choice, as the question writes them, go out as a
    comment. A question without readable choices has no button: it is answered in one sentence.
  - **A sentence, in the field below**, goes out through its "post this answer" button, as you
    wrote it. Enter sends nothing; an empty sentence does not go out; what you write stays when the
    sheet is redrawn.
  - **The answer is posted on the issue by your `gh`** — the workstation's, signed in to your account, the
    same one the second uses: it is signed by you, and the manager reads it as an answer from the
    chef, at its next tick. The sheet says `answer posted on #<n>, in your name: “…”` and offers
    nothing more to post. No action of the box reads or writes the comments of an issue: that is
    why the app reaches GitHub here, and only here — `gh issue view <issue> --json comments`
    to read, `gh issue comment <issue> --body-file -` on click.
  - **The card leaves TODO as soon as the answer has gone out** (`app/src/repondues.ts`, #503), without
    waiting for the manager or for a new reading of the box: it moves to **WAITING** — the manager is
    the third party it awaits —, with `answered by you · the manager's turn`, and its sheet says who
    answered, when, and what will come. The same goes for a question **answered elsewhere** — on
    GitHub, by the second: the issue read says it answered (a comment written under the question by
    someone with write access to the repository, who is not the manager — which it will read as an
    answer), and the card moves to WAITING. What the manager does with it is read at the next turn: it
    splits the epic, and the queue no longer names it; **or it asks another question, and the card
    comes back to TODO** — the issue of an answered card is reread at most every two minutes as long
    as the queue names it, which is where this shows. What the queue does not say — that a question is
    answered — the app holds by itself, and loses on restart: the issue reread says it again. The
    `awaiting you` counter stays the box's. A question that holds a ticket through
    `blocked-on-human` does not leave TODO when it is answered: the label is still to be lifted.
  - **Nothing goes out without your action**: no default answer, no default choice. And nothing goes out on
    a question that is no longer the one you read: the issue is reread just before writing. If the
    manager has asked another one in the meantime, nothing is posted, the sheet says so and lays down the new one.
    **If something has been written under the question since you read it** — an answer given
    elsewhere, on GitHub or by the second, or another comment —, nothing is posted either: the
    sheet says `nothing was posted: <who> answered the question on the issue since you read it…` and
    shows what was written; you post again, if your answer adds something. A refusal from
    GitHub, an absent network, a `gh` that does not answer within thirty seconds: nothing is said to be posted, the
    sheet writes what `gh` returned. A ticket that the `awaiting` block no longer names can no longer be answered from here.
  - **A question is taken only from those with write access to the repository** (owner, member,
    collaborator), as the manager reads them: a marker copied by someone else opens nothing.
  - **An issue with no manager question adds nothing to the sheet**: the other entries of Awaiting you
    — hand merge, `86`, red base, `question` or `decision` label set by hand… — keep their own
    action. **An issue that could not be read** — `gh` absent from the workstation, not signed in, no
    answer within thirty seconds — says so on the sheet, with what `gh` returned; it is not
    "no question".
  - **"ask the second" stays on the sheet**, under the question, for those that deserve an
    explanation: it writes the same request as before.
- **An idle kitchen with cards on the rail is a fault** (#1863, `panneDe` in `app/src/faits.ts`). When `facts` carries
  `cuisineOisive` (#1862, `docs/runtime/etat-et-mesures.md`) — cards on the rail, no cook for 30 min, the project on,
  not every card waiting for a capability or a third party —, the head of the rail opens with a **red fault bar**,
  above everything else: a `FAULT` mark and `Kitchen idle for 42 min with 3 cards on the rail`, the duration counted
  between two times of the box (the last mark, the reading). On hover, the tickets that should cook and where the
  cause is read (the alerts, what awaits you). It is gone at the first reading of `facts` that no longer carries it;
  without it — or from a runtime from before this field — the head of the rail is exactly what it was. A box that
  does not answer shows none: its last reading is no longer new.
- **What is left before the rail** (`app/src/amont.ts`, `app/src/vue/projet/rail/bande-rail.js`, #1836). An empty rail does
  not mean a finished project. In the band at the top of the Rail tab (#2486, #3013), **Backlog 18 issues** counts
  the open issues of the repository that are not on the rail yet — a number, no bar. It is read from GitHub with the rest of the rail
  view (`avantLeRail` in `app/src/tableau/lecture.ts`, #2061): every open issue without `fire`, filed from its labels
  alone. They fall in five states, in this order — the groups of the Backlog column:
  - **not read yet** (grey): neither a `model:` and an `effort:` label, nor any of the labels below — "not calibrated
    yet";
  - **refused as incomplete** (red): no label says it, so the reading from GitHub never gives it;
  - **epic, not split yet** (blue): it carries `epic`;
  - **ready, not fired** (green): it carries both a `model:` and an `effort:` label, without `fire`;
  - **set aside** (hatched): it carries `hors-cuisine` or `blocked-on-human`.

  An issue that carries `fire` is not counted: it is on the rail. The band says its title and its total (`Backlog`,
  `7 issues`, #2367, #2486, #3013); on hover, on the keyboard or on a tap, it says its counts — `7 issues before the rail — 2
  not read yet · 1 refused as incomplete · …`. **A click unfolds the
  Backlog column**, to the left of "On the rail", and the row scrolls back to show it; a second click on it, or
  `fold` in the column's title, folds it again — a new reading does not fold it. The column holds **the rail's
  cards**, grouped by state in that order, each group sorted by `prio:` (none last, the oldest first): the
  number opens the issue on GitHub, the card says in one line what holds it, and a click opens its sheet over the
  rail — its title, its priority, the link to the issue. **Nothing on the rail** — no card outside Served —, the On the
  rail column says so in plain words (#2486): `nothing on the rail, nothing before it` when there is nothing before it either; otherwise
  how many issues, state by state, and what the manager does with them, according to its state read (`manager`): on,
  it reads them at every wake-up; off, it reads none and nothing new comes in; not read, the app says so instead of
  guessing — and the manager's state is not read from GitHub (only the station's log has it). **The view deduces
  nothing there**: it counts what the reading lists and files each issue under the word it carries. When the open
  issues could not be read, the view says nothing about them — no number, never "not read" — and the rail is still
  shown. A rail reading that fails as a whole gives no Backlog figure (#3013); a Backlog column already unfolded says
  why, and it is not "nothing before the rail".
- **How long a card has been there (#1811, `app/src/cadence.ts`)**: the 24-hour histogram that stood next to the
  backlog left the head of the rail with the line of figures (#3013). **Each Taken or Pass card** carries
  how long it has been in that column (`12 min`, `3 h`, `2 d`), its exact age and the usual time on hover; a card there
  more than **twice the median** of the tickets that went through that column in the last 7 days turns its age red and
  takes a red edge. With fewer than three such tickets, nothing is usual yet: no card stands out, and the hover says why.
  **The age counts from the ticket's first take, across relaunches** (#1893, #1895): the rail's `depuis` is the start of
  its stay in the column, so a ticket whose cook was stopped and relaunched keeps its age — about 50 min after three
  attempts, not 4 — and the slow colour applies to that age. **A ticket that has had more than one attempt shows one small
  dot per attempt next to its age** (read from the rail's `essais`): the finished attempts as hollow dots, the running one
  filled, the last. Each dot says on hover which attempt it is, and — for a finished one — how long it cooked and why it
  stopped, in the runtime's word (`attempt 1 of 3 — stopped after 17 min: turns`; `idle`, `failed`, `interrupted`…). A ticket
  on its first attempt shows no dot. The Pass card draws the same age and, if the box gives `essais` for it, the same dots.
  Everything is read in `facts` (`cadence`, and each rail ticket's `depuis`: `docs/runtime/etat-et-mesures.md`), never
  from the app's own memory: it is right as soon as the app opens. A runtime from before these fields draws neither.
- **The triage, day by day (#1283)**: at the head of the rail, a compact block — `triage, day by day` — gives, for each of the last
  seven days (UTC), the most recent first, two counts: `decided alone` (the cards the triage settled itself) and `sent to TODO`
  (the cards it let into TODO). A day with no activity says `0` and `0`, never a blank. The runtime counts (`facts`, `triage`:
  `docs/runtime/etat-et-mesures.md`); the app only lays them out, and draws nothing from a runtime from before that field.
- **The columns fit in the window at its opening size**; narrower, they scroll.
  The rail and what the displayed tab shows below it share the height, half and half; the
  rail scrolls within its own. A project that no station serves on this computer has no rail — nothing is read from it — and
  its terminal takes the full height.

### The stop banner

When the box says the kitchen is `stopped` — your "stop" —, the project's space says so at the top, above
the tabs, whatever the tab:

```
KITCHEN STOPPED — your "stop" holds
All running cooks have been stopped, and none is launched any more — runtime restart
included, until "resume".
write the restart in the second, without sending:  [guardrails resume]
```

- **The button writes the restart, it does not restart**: `!(cd <runtime> && BRIGADE_STATION_DIR=<dir> node …/geste.ts <name> guardrails resume)`
  in the second, without Enter — everything that "Buttons write, they do not send" says holds
  here.
- **It leaves by itself** at the first reading that no longer says `stopped`: thirty seconds at
  most after your "resume".
- **`off` has no banner**: a stopped runtime is not restarted by an action of
  "Piloter" (`sudo systemctl start brigade@<project>`, on the box). Its pill is red, and
  `status` says the rest.

### A word the app does not know

The two lists of states are closed, and the app puts a color on them alone. If the
runtime gains one — for a project or a ticket —, **it is displayed as is, with no color**: empty
dot, bare word. The app files it under none of the colors it knows.

### A box that does not return its facts

**The app then draws nothing of this project — never an empty table, never zeros.** In place
of the tile, what it obtained; in the bar, a colorless `!`; in place of the rail, a
line that says the case and points to the panel. And **`status` stays readable below**: `facts` is read separately, its
failure removes nothing from the rest.

**Separately, but not abreast**: `facts`, `status` and a tab's command are three readings,
and for the same project they go **one after the other** — a project runs only one command
at a time, whatever the number of readings waiting for it. In "All projects", a station
therefore runs at most one command per project it serves, not two.

| On screen | What the app obtained | What it shows below |
|---|---|---|
| ``REACHED, BUT `facts` DID NOT ANSWER — tried …`` | the station's gesture ran, and the command failed there without its code saying a case. **A runtime from before `facts` is the expected case** | the command launched, what it wrote, its code — then the action: update the runtime on its box (`docs/runtime/exploitation.md`, "Piloter") |
| `REACHED, BUT UNKNOWN TO THE BOX`, `… WITHOUT THE RIGHT TO THE ACTION`, `… A COMMAND IS MISSING ON THE BOX`, `… THE BOX'S NODE DOES NOT SUIT THE RUNTIME` | the station's gesture refused (codes 65, 68, 69, 70): **the same case as under `status`**, with the same words | what the box said of it, as is — then **the pointer for that case**, the one from the table of "A station reading: seven states". No runtime update: it is not the runtime that is old |
| ``THE BOX DID NOT RETURN THE SHAPE OF `facts` — tried …`` | the command succeeded, and its output is not the shape: not JSON, a missing field, a counter that is not a whole number | **the output, word for word**, then what is not the shape (`"compteurs.rail" is not a positive whole number`) |
| `NOT REACHED — tried …` | nothing that proves the box was reached | the message, as is — the same as under `status`, where its pointers are given |

An item of `rail`, `attend` or `livres` that the app cannot read — a value from a box newer than the app, such as a WAITING follow-up at `null` — does not refuse the shape: only its own card is spoiled. It stays in its column and says in one line that the app could not read it and that updating the app fixes it. The shape is refused only when the item has no ticket number, since there is then no card to draw.

A missing field refuses the **whole** shape: the app completes nothing. An extra field is
left aside.

### A box that does not answer at all (#728)

A mute box makes everything the app reads from it fail at once: the manager, the version, the kitchen.
The app does not make three "unchecked" alerts of it, each with an action that changes
nothing: **after two failed readings of `facts` in a row** (`LECTURES_POUR_INJOIGNABLE`) — the box
not reached, not the command failing —, **the band says only one line**:

> station unreachable since 03:27, 4 h 45 ago — the state of the kitchen has been unknown since then

**The project page says it only once (#1078)**, at the top, with what the chef can do about it, in
plain words under the line: check that the machine is on and reachable, restart it if it no longer
answers, then "try again" (its button rereads the box right away). The cause in plain words
(no answer, connection refused, address not found — said from what the command wrote) is
behind "detail". The line goes away as soon as a reading succeeds, without restarting the app. A single
failed reading does not set it.

- **The project's pill** says the same thing in one word, `unreachable`, and the bar's box carries a `×`.
  The project's station ("Cooks on") is no longer green: it is red, `unreachable`.
- **The rail's columns** show no "0": each carries `?` and says "not known while the
  station is unreachable". Nothing else of the rail is laid down (not upstream). A reached box that does not
  return the shape of `facts` is not this case: the rail is not drawn, as above.
- **The `fire` tickets are read on GitHub** (`feu.ts`): it is the workstation's `gh`, launched in the project's
  folder — never the box. They are **folded** under "the tickets in the kitchen according to GitHub, N";
  expanded, they are lines like the rest of the page, each number opening the issue (the address comes from `gh`).
  When GitHub does not answer either, the line from `gh` is said.

### Offline: the last rail read, and one quiet sign (#1818)

The rail is read from the project's GitHub repository (#1694, #2061). With no network, every reading of GitHub
fails at once — the rail, its cooks, TODO — for one plain cause that is not a fault. A
reading **that did not reach GitHub at all** (the request threw: no network, no DNS, no answer within its delay —
`horsLigne` in `tableau/lecture.ts`) is told apart from one that reached it and failed (an HTTP refusal, a rate
limit), and the app then:

- **keeps the last rail it read**, drawn whole — columns, cards, counts — and **dimmed**; the last facts and `status`
  are kept in the main process too (`faits.ts`, `tenirFaits`), so a card's sheet and its addresses still open;
- says it with **one discreet sign** at the top of the rail, in place of the "up to date N min ago" note: `offline since
  1:35 PM` — the time of the first reading of the series that did not reach GitHub. The sign itself does not move;
- puts **nothing in the band**: no "not verified" line, no "open Settings", no signal on the project's box in the bar
  (`alertes.ts`, `tenirBandes`); the project switch keeps the state last read. Upstream says nothing either;
- with nothing read before (offline from the start), shows the sign alone — no "first read in progress", no error, no
  empty rail.

**A reading under way shows as a slow pulse of the rail's top edge**, online or offline, with no sentence: from the
moment the view asks for the facts — the first reading when the bar is laid, or a re-reading (*try again*, an action
done, the network back) — until the main process answers it (`surFaits`). The 30-second readings the main process makes
on its own do not pulse: the view does not ask for them.

When the network comes back, the rail refreshes on its own: the next reading of GitHub (every 30 s) — or at once,
when the system says the network is back — redraws it, and the sign goes away. Alarms then appear only for a real
fault: GitHub refusing is said as before, after the same two readings. A failed local command
says nothing about the network: it neither sets nor lifts the offline state.

### Reporting a failure to brigade (#1977, epic #1973)

Wherever the app shows a failure, a discreet **report to brigade** button follows it — never in front of the action that
repairs it. Its hover says what it does. It is on:

- **a station in fault**, on its page: after each fault line (offline, update failed, Max connection lost);
- **a red station** on the project's station line (Cooks): refused, or unreachable;
- **a card set aside** (`86`), and **a delivery the pass could not judge** (`remontee`, `unjudged`) — a reason that is
  brigade's. A delivery still red after its returns is the project's business, and carries none;
- **an error line**: a reading of the station that failed (`the station did not answer`…);
- **the fault at the top of the rail** (an idle kitchen, #1863).

Nothing failed, no button. The Android app shows none: its bridge opens nothing.

A click opens, **in the default browser**, a new issue on `benomite/brigade`, prefilled
(`app/src/vue/signalement/ouverture.ts`): the body starts with `Field report from the brigade app` and the issue carries
the `field-report` label; it gives the app version, the runtime version (the station serving the project, or the
runtime next to the app), the system, the failure in a few words, and the log lines about it — the end of the
project's log (`log --last 200`), read where its kitchen runs on this computer, filtered on the ticket, the station or
the line (`signalement/contexte/`). Everything goes through `redact` (`signalement/redaction/`) first: no token, no
home folder (`~` in its place), no repository content. **The app sends nothing**: it calls no HTTP client and not
GitHub; the chef reads, edits and submits the issue under their own account. Closing the page sends nothing. While
the browser opens, the button says `opening…`; then `opened in your browser: nothing is sent until you submit it there`,
or, if the browser did not open, one line saying so, its detail in the hover.

### What is not drawn, and will not be here

- **The log and the output of `station`** stay text: they are streams, not state tables.
- **No numeric gauge**, neither of the quota nor of the machine: the runtime does not know the account's
  consumption (`/usage` gives it) and gives figures for the machine only when it saturates. The
  `quota` and `machine` lines of `station` are read as they are, in Cooks.
- **Why** a kitchen is held, what a ticket awaits, who holds it: that is `status` and
  `rail`, in text, just below.
## What the box says about the project

To the right of the terminal, without typing anything, and whatever the tab: the project tile, then
**what awaits you, set apart**, then the output of `brigade <nom> status`, **word for
word**. The app reads nothing in it and says nothing of it again — if
a command's wording changes, what you see changes with it. It cuts out only one thing, by its
edge: the `awaiting` block.

### What awaits you, set apart

At the top of the panel, on its own background: **the `awaiting` block of `status`**, as the runtime
wrote it, from its `awaiting` line to its `end awaiting` line. You no longer have to hunt for it in
the output.

```
what awaits you — the `awaiting` block of `brigade <nom> status`
awaiting   2 decisions await the chef — the oldest since 2 d
  #12  since 2 d  green delivery, not merged — merge by hand: …
  #21  since 3 h 02  BLOCKED: #17 dropped (label `fire` removed) — to unblock: …
end awaiting
```

- **When nothing awaits you, the runtime says so**, in the same place — a two-line block,
  `nothing awaits the chef` on the first, `end awaiting` on the second. The app does not write
  that sentence and writes no other: if the runtime changes it, it changes here.
- **To set it apart, the app reads only the edge**: the only line of the output that starts with
  `awaiting`, the only one that equals `end awaiting` (`docs/runtime/etat-et-mesures.md`, "Ce qui
  attend le chef"). Nothing the block carries is counted or reworded. So it does not know *whether*
  anything awaits you: the full block and the empty block have the same background, no alert
  color, no counter in the bar.
- **The number it reads there** — to sort the rail ("The rail", Awaiting you column) — is all it
  reads in the block: **the ticket number at the head of a line of the block**. The more indented
  lines placed under an entry — what qualifies it — stay attached to it, as they are. The form is
  the one `status` writes: two spaces, `#`, digits, then two spaces or the end of the line
  (`  #12  since 2 d  …`). **It is one more contract between the runtime and the app, on a text**:
  the rest of the line is not read — it is placed on the card, word for word —, a number anywhere
  but at the head (the ticket a `BLOCKED` awaits, a PR's) is not read either, and a line that does
  not start this way belongs to no ticket. If the runtime writes that head differently, Awaiting
  you empties without saying so, and the tickets are read in their state columns: this is why an
  app test has the runtime itself write the block, one wait of each kind, and turns the gates red
  beforehand (`app/test/attend.test.ts`).
- **The rest of `status` follows, word for word**, under a title that says what it lacks ("without
  its `awaiting` block, set apart above"): the block is not shown twice.
- **An output without this edge stays whole**, and the app says so in place of the block, in
  yellow:

  ```
  Nothing could be set apart: the output of `brigade <nom> status` does not have the block the app knows how to take — a single line that starts with `awaiting`, a single `end awaiting` line.
  This is not "nothing awaits you": what awaits you, if anything, is in the output below, whole.
  ```

  The expected case is a runtime from before this edge — the action is then to update it on its box
  (`docs/runtime/exploitation.md`, "Piloter") — but the app does not guess: it says what it did
  not find. The project stays `pilotable`: `status` answered.
- A failed read has nothing to set apart: the error takes all the room, as before.

### What `status` says about the rest

What asks for your attention without awaiting you is where `status` puts it, and said as it says it
(see "The state of the kitchen" in `docs/runtime/etat-et-mesures.md`):

| What you are looking for | Where `status` says it |
|---|---|
| A ticket that no longer progresses | `STUCK`, on its line of the `rail` and on the `cooks` line; each taken ticket carries `no progress since <duration>` — a duration, not a date to compare |
| A stopped cook | no line of its own: `latest events` (`guard.tripped`, `cook.exited`), and the breaker on the `kitchen` line |

The app **never says "nothing awaits you" itself**: a calm screen is an `awaiting` block that says
`nothing awaits the chef`, and a `status` with no `STUCK`.

The head lines of `status` that the app reads (`kitchen`, `connection`, `setup`, `base`, and `nothing cooks:`) have been in English since #928; it also reads them in their French form (`cuisine`, `connexion`, `ROUGE`, `ACTIF`, `rien ne cuit :`…), for a box whose runtime is not up to date.

**Nothing to declare.** The app reads a project's `status` through the gesture of the station that cooks it on this
computer: `brigade <nom> status` and, for the content tab displayed, `rail`, `station` or `log`
(`docs/runtime/exploitation.md`, "Piloter"). The gesture is run from the runtime's folder with the station's directory
(`BRIGADE_STATION_DIR`), by the `node` that plays the station: the account, the installation and the environment are
read there. No other machine is reached. A project whose kitchen does not run on this computer is not read this way:
the app says so in place of the state, and its rail, its cooks and its queue come from its GitHub repository
(see "The rail and its cooks, read from GitHub").

**What the app displays can be copied.** Every action the app names — in a tab line, a failure title, a panel — is
`brigade <nom> <command>`: the form of the doc, with the project's `nom`. What the buttons write into the second is its
station form for this computer (see "Buttons write, they do not send").

**The name sent to the gesture is the project's `nom` in `app.json`**, as is. If the station serves no project under
that name, the gesture refuses it and the app displays it — `REACHED, BUT UNKNOWN TO THE STATION`, with what it said
about it:

```
$ brigade parade status
brigade: unknown project on this station — "parade" has no drop-in

→ exit code 65
```

The gesture accepts only lowercase letters, digits and hyphens: a `nom` written otherwise
(`Parade`, `mon projet`) reaches it whole, quoted, and it says it is unknown.

**It refreshes by itself**, every thirty seconds, for what is displayed and nothing else — the
project, or each one in "All projects"; switching project reads the new one right away. **A read is
shown only in the screen that asked for it**: the one of "All projects", still running when you
open a space, is not shown there — and the reverse. At the top of the panel, **the project's state
and the time of the last read** (`pilotable — read at 14:32:07`): these are the only facts the app
adds. The durations displayed below are those `status` was counting at that time.

**When the station is not read, it is an error, and it takes all the room.** The header changes to
`NOT REACHED — tried at 14:32:37, the next follows by itself`, to `REACHED, BUT NO LONGER
PILOTABLE — …` or to `REACHED, BUT UNKNOWN TO THE STATION — …`, `REACHED, BUT WITHOUT THE RIGHT TO THE ACTION — …`
or `REACHED, BUT A COMMAND IS MISSING ON THE STATION — …` (the states of "A station reading: seven
states", said the same here), and below there is only what the app obtained — the command run, what
it wrote, and the exit code.

```
brigade: "lecteur" has no right to run the action — …

→ exit code 68

The station was reached, and its gesture refused the account: what it said about it is above.
This is neither an outage nor a runtime to update: it is a right that this account lacks.
```

- **Nothing is kept from the previous read**: no stale state beside the error. A micro-outage
  therefore replaces the screen with an error, until the next read.
- **The app does not guess the cause.** The exit code comes from the gesture: 65, it does not know the
  project; 68, it refuses you; 69, a command is missing; 70, its `node` does not suit the
  runtime; any other, reached, but no longer pilotable.
- The panel and the content tab displayed are each read on their own: the error of one is shown in
  its own place, taking nothing from the other.
- A command that returned nothing in thirty seconds is stopped, and the app says so:
  `→ no answer in 30 s: the command was stopped`. Nothing says how far it had gone, so it is displayed
  "not reached", without the runtime update action.

The log is read in `latest events`, refreshed with the rest, and, for its end (the last 200
events), in the **Log** tab.

## The skin

The app has one visual language, and only one: the mockup's (`docs/maquettes/app/`). It dresses
**the frame**, never the content.

- **A dark background, cards on it.** Everything that reads as a block has its card: the lists of
  "All projects", the project tile, the commissioning of an added project, the removal, the served
  pages, the manager's state, the add form. A rail column is a card, a ticket there is
  a **slip** — light paper on the dark —, and what awaits you has its own, the same whether the
  block is full or empty. There is only one theme, dark, and no setting.
- **A palette, written in a single place**: `app/src/vue/jetons.css`. Each color there is a
  variable, and its value is a color from the mockup; `vue.css` and `vue.js` name only those
  variables, the terminal reads its own there. A state color stays that of its word ("What is
  drawn"): on a slip, where a light color would not read as letters, it is in the dot that precedes
  the word, and the word is in ink. **Only a project's colors come from elsewhere** — its tab color
  and its accent color, drawn from the palette of `app/src/couleurs.ts` and written in `app.json`
  ("A project's colors"): the view puts them on two variables, `--teinte` and `--accent`, and never
  on a state color.
- **One button family** (#2916, `Components.dc.html` of the mockup): every gesture of every screen is a button of
  `app/src/vue/composants/bouton/`, its skin in `bouton.css` beside it and nowhere else. Four kinds: the
  **recommended** one, filled with the accent, one per place; the **secondary**, for every other gesture; the
  **quiet** one, to cancel, close or fold; the **danger** one, to stop or remove. A button is 32 px tall on the
  computer, 44 px at phone width and on first launch, whatever its label: a TODO card's answer or a project choice's
  issue too long for one line stays on it, cut by an ellipsis, whole on hover (`title`) and for a screen reader
  (`aria-label`). A project's name that opens it, a link to a page, the lost-tokens
  figure that unfolds its list and the three positions of an autonomy row are buttons of the family too (quiet, or
  secondary and pressed). A tab, a tile of the icon bar, a color swatch, a switch, the edge that resizes the second's panel, a
  clickable row or a ticket number that opens its issue is not a button of the family: each keeps its own shape.
- **One voucher and one awaiting card** (#2918, `Components.dc.html` of the mockup): a ticket's slip is the voucher of
  `app/src/vue/composants/bon/`, and the card of « Awaiting you » is the awaiting card of
  `app/src/vue/composants/carte-attente/` — the voucher marked `data-carte="attente"`, on the warm « what awaits you »
  ground, with the answer card (question, one button per choice, a field for the chief's own words) under it. Each has its
  skin in its own `.css` beside it, which names no screen (no `#rail`, no `.colonne`); `vue.css` draws neither. Both take
  their state from the pill (`composants/pastille`, « awaiting you » included) and their gestures from the button family.
- **One scale, in the same place** (#2909): `jetons.css` also holds five text sizes
  (`--taille-meta` 11, `--taille-corps` 13, `--taille-intertitre` 15, `--taille-titre` 20,
  `--taille-chiffre` 28), six spacing steps (`--pas-1` to `--pas-6`: 4, 8, 12, 16, 24, 32) and the
  radii (`--rayon-carte` 10, `--rayon-bouton` 8, `--rayon-bon` 4, `--rayon-pastille` for a pill's
  full round). Every `font-size`, `padding`, `gap`, `margin` and `border-radius` of the view's style
  sheets names one of them; a bare `0`, `auto`, a percentage or an `em` stays as written. The mockup
  draws these values without naming them: the names were chosen with the ticket. A value off the
  scale went to the nearest step, the larger one on a tie — except a radius under 4 px, which
  softened a sign a few pixels wide: it went to `0`, so that a square stays a square.
- **Two fonts, embedded** (`app/src/vue/polices/`, under the OFL license): nothing is requested
  from the network, the page opens no origin. **Archivo** for the interface. **JetBrains Mono** for
  what is copied as is — a ticket number, a run identifier, a port, a project's name, a command —
  and for what the box returned. **Monospace is information, not a style**: a button is in
  monospace if what it displays is the command it will write, and what the app says itself, even on
  several lines, is in Archivo.
- **What the station returned is in a frame of its own**, dark, in monospace: a command's output, the
  error message, what the installation action answered. **Word for word**: its whitespace and its
  lines are its own, a line that is too long wraps to the next, nothing is cut, hidden or rewritten.
  What the app says about it is below, outside the frame: its words are not confused with the box's.
  Nothing is cut anywhere in the app: the title of a ticket on the line of a running cook wraps, like
  the rest. The window does not shrink below 640 px wide (half its opening); below 1280, the tabs
  and the rail columns scroll, nothing overlaps.

## This computer is a station

The app runs this computer's station (see "This computer is a station; a phone is a workstation"), and a project that
cooks here is read and driven through it. **The app does not play a station for another machine**: a workstation no
longer plays a remote station of a project's box, pulls no ticket from it and launches no cook for it. A ticket that
asks for what only a given computer provides (`chrome-connecté`, your signed-in browser) is cooked by a station that
runs on that computer and provides it (`docs/runtime/station-distante.md`).

**Ordinary tickets, from the project's settings (#852).** In Settings of a project whose kitchen cooks on this computer,
the block is titled with this computer's name — "Ordinary tickets on this Mac", "Ordinary tickets on this PC" under
Windows (#1154). On a Mac, it carries the "Take the ordinary tickets too" option and the "Cooks at once" field, this
Mac's cooks cap. A single line, beside it, says what that implies: `Cooks on this Mac run in Claude Code's sandbox: they
write only in their own worktree, and reach only the network hosts on the project's list.` Both values are written in
the projects file (`"ordinaires": true`, `"limiteCooks": 2`) and re-read at each opening; a value badly written by hand
makes the file refused. **Outside a Mac — a PC under Windows, a desktop Linux —, the block has no option and no field:
its single line says why** — `This PC takes no ordinary ticket: a cook of an ordinary ticket runs only in Claude Code's
sandbox, which the station sets up only on macOS.` The runtime sets up the sandbox of a local kitchen only on macOS
(`runtime/src/bac-a-sable/local.ts`): the app says so rather than hiding the setting. **When the project does not
cook here, the block does not exist.** The sandbox state is read in `facts` (`stations` field,
[docs/runtime/](runtime/station-distante.md), "Les tickets ordinaires sur le poste du chef"): when the
station says it is unavailable, the block writes it beside the option, with the reason the station
gives. As long as it has said nothing, the app guesses nothing.

**Where each ticket cooks (#853).** On the rail, the card of a running ticket says, under "taken by", **"cooks on: box"**
or **"cooks on: Mac"**, according to the `stations` field of `facts`. A station that `facts` does not give — a runtime
from before this field — makes it say nothing: the app does not guess from its name.

## Thread resumed, or new session: the app says so

Under the tabs, a line says what is displayed. For the second, it takes one of these three forms:

| The line | What happened |
|---|---|
| `thread resumed: `claude --continue`, the latest conversation in this folder — whichever it is, not necessarily a second's; it runs with the second's role in its system prompt` | The second was launched by `claude --continue`, with the role, and it is running: you find your thread again, and the role is in force in it. |
| `new session: `claude --continue` exited with code 1, the thread was not resumed — `claude`, with the second's role in its system prompt` | `claude --continue` exited in error — most often because this folder has no conversation yet. The app launched `claude` with the role, **once**. What `claude` said on exit stays readable in the terminal. |
| `the second stopped (code 0) — a keypress restarts it` | You quit `claude`, or the new session did not hold. Nothing is relaunched on its own: a key in the terminal relaunches the second, resuming the thread, with the role. |

Worth knowing:

- "The thread" is **the last conversation of this folder**, as `claude --continue` picks it —
  including a conversation you had in another terminal, or that of a dev or a manager: the app
  cannot guarantee it is a second's, and does not pretend to — it resumes that thread with the
  second's role, and the line says so. The app keeps no session registry of its own.
- The line says `thread resumed` from the launch; if `claude --continue` has nothing to resume, it
  switches to `new session` the instant it exits.
- In a folder `claude` does not know yet, it first asks whether you trust it: it is `claude` that
  asks, in the terminal, as everywhere else.

## Reloading the window

Reloading the window (Cmd+R) reloads only the view: the seconds and shells belong to the app, and keep running. The
window opens again on the screen you were on — the same project, station or page — and every terminal that was open,
in every project, gets its tab back with what it had written (at most its last million characters). A second that is running
is reattached as it is, not relaunched: an answer being written goes on, after what was already there. Nothing is
started twice. Only the screen is kept across a reload; quitting and relaunching the app opens it on "All projects", as
before.

A second that was no longer running when the window reloaded could not be reattached. Its tab comes back anyway, and its
line says so:

| The line | What happened |
|---|---|
| `the second was not running when the window reloaded: it could not be reattached — resume it` | Its `claude` had stopped. The **resume** button next to the line relaunches it like a keypress: resuming the thread, with the role. |

## Closing the app

Closing the window quits the app, and quitting **stops all its terminals** — seconds and shells — and
the readings in progress. Shells opened with `+ shell` only detach from it: their sessions hold,
and they come back on the first click on their project (see above). **And this computer's station**: it runs with the
app, so a project that cooks here stops cooking when the app closes (see "This computer is a station; a phone is a
workstation"). Conversations, for their part, are kept by `claude`: on reopening,
the first click on a project resumes its thread, and the line under the right-hand tabs tells you
whether that worked.

## Launching the app

Two ways: **installed**, from a `.dmg` for Apple Silicon, or **from a clone of the repo**.

**Installed.** `npm --prefix app run dist`, on a Mac, writes
`app/packaging/construit/Brigade-<version>-arm64.dmg`; drag Brigade into Applications and open it.
It carries its station's runtime and the `node` that plays it: no clone, no `node`, no `npm` on the
machine. It reads `~/.config/brigade/` as it is — your projects and settings are those of the repo's
app —, takes the `PATH` of your login shell (to find `claude` and `gh`), and does not update through
`git`: it keeps itself up to date from the published versions (below). Every merge on `main` that
changes the app publishes an `app-v<version>` release with the Mac and Windows installers, built by
the `publier-app` workflow; nobody pushes a tag. The builds are not signed (decision of 2026-11-03):
the published `.dmg` is only ad hoc signed, like one you build yourself — the first time, opened from a
download, macOS asks for "Open anyway"; after that, the app updates itself (below) and never asks
again. What it carries, how it is built and tested: [`app/packaging/README.md`](../app/packaging/README.md).

**Updating it** (#1013, #2431). **How the app updates**: you never download a `.dmg` by hand after the
first one. The installed app checks at launch, then **every fifteen minutes**, whether a version
higher than its own is published — an `app-v<version>` release that carries its `latest-mac.yml`. Every
release carries it, **signed or not**: until #2431 the unsigned path published the `.dmg` without it,
so an installed app saw no newer version, said nothing and stayed where it was (1.0.102 while 1.0.105
was out). If there is one, it announces it with its number and downloads it right away, checked against the
published size and sha512, under `~/.config/brigade/mise-a-jour/`. Once ready, it installs on the
"update now" action — the app closes, the new one takes its place and reopens —, or, with no
action, at the next opening, before anything starts in it. The installer checks the new version's
signature — its integrity (`codesign --verify --deep --strict`), which an ad hoc signed build passes,
and, when the running app is signed by an identified developer, that the new one is signed by the
same; if that fails, the app in place is not touched, it reopens and says why. The `publier-app`
workflow runs the same check on the unsigned `.dmg` before it publishes it, so a build that installed
apps would refuse never goes out. A feed that does not answer never stops the app from
opening: the error is reported, the next check tries again. Launched from the repo, it checks
nothing — its clone updates it. The state and the actions go through the view's bridge (`miseAJour`, `verifierMiseAJour`,
`installerMiseAJour`, `surMiseAJour`); the code is in `app/src/mise-a-jour/`. To try it without
GitHub, `BRIGADE_APP_MISE_A_JOUR_SOURCE=<address>` makes it read a server that answers like GitHub.

**On Windows** (#1156), the installed app (the `Brigade-<version>-x64-setup.exe` installer,
[`app/packaging/WINDOWS.md`](../app/packaging/WINDOWS.md)) updates itself the same way: the same
`app-v<version>` releases, the same checks, the same states, the same actions and the same words. Only
two things differ. It reads the release's `latest.yml` and downloads the setup `.exe` it names. A
release that carries only the Mac's files is not a new version for Windows, and the reverse holds
too — and while the builds are unsigned, releases carry no `latest.yml`: an installed app on Windows
does not update itself to an unsigned installer, and the new-version line gives it the **Download** link. And its installer is a PowerShell script started next to the app, in a hidden console, that outlives it
(`app/src/mise-a-jour/windows.ts`). Once the app has quit, the script moves the installed folder aside
(Windows refuses while one of its files is still open, and then nothing has moved). It runs the setup
silently (`/S`) into that same folder (`/D=`) and checks that `resources\app\package.json` now holds
the expected version. Then it removes the old folder and reopens `Brigade.exe`. If any step fails, it
puts the old folder back as it was, writes the reason (which the reopened app shows) and reopens it.
The app refuses to update when it does not run from the folder the installer laid out
(`Uninstall Brigade.exe` next to `Brigade.exe`), or when that folder cannot be written to, and says so.

**What the chef sees of it** (#1014, #2431). At the very top of the window, as long as a newer version is
published and the app does not run it, **one line** says both versions and where the update stands (see
"The new-version line"). The **App** section that "All projects" carried — the running version
in every state, **Update now** and **Later** — was removed by #2638: the line at the top carries **Update now**.

**From the repo:**

```bash
npm --prefix app start
```

**It is the only action, the first time and every time after.** What is missing, `start` sets up
before launching the app, and says so:

```
brigade : je pose les dépendances de l'app (`npm ci --ignore-scripts`) — elles ne sont pas encore là.
brigade : je pose Electron — téléchargé la première fois sur ce poste, 311 Mo sur le disque.
```

- The dependencies are set up again when `app/package-lock.json` has changed since they were set
  up — after a `git pull` that touches them — and the line says so. Otherwise `start` sets up
  nothing and says nothing.
- A setup that fails stops everything, with its code: `brigade : `npm ci --ignore-scripts` a échoué
  (code 1) — l'app n'est pas lancée.` What `npm` wrote is above.
- You need Node 26 and `npm`; nothing else has to be installed beforehand (see "What it weighs").
- **First of all, `start` moves to the new version.** If the origin branch this clone follows has
  moved on, the clone moves with it (fast-forward only), then the dependencies are set up again if it
  changes them, and the app opens on the new version:
  `brigade: the app is updated — 5 commits from origin/main (3ba369f → e5123e1), in /Users/chef/dev/brigade. It opens on the new version.`
  Already up to date, nothing is said. A silent origin (after a minute), a branch that follows
  nothing, a clone with commits of its own or changes that would be overwritten: the clone does not
  move, the reason is given, and the app opens on the code it has — a failed update never stops it
  from opening.
- **The app runs on the code of this clone, as it was at its launch.** When a new version arrives
  while it runs, the **T** tile turns yellow, each project's settings say so, and a click moves it
  over (see "The app's code: up to date, or behind").

Launched from a terminal, the app inherits its environment: the `PATH` that finds `claude`, your
access.

## For app developers

| Action | Command |
|---|---|
| Tests | `npm --prefix app test` |
| Type check | `npm --prefix app run typecheck` |
| Tests and type check on Windows | the `app-windows` workflow (`.github/workflows/app-windows.yml`), on every push to `main` that touches `app/`, and on demand: a test that cannot run there is skipped with its reason, taken from `app/test/aides/posix.ts` — POSIX stand-ins, the box's code, the Mac and Android packages, a link to a missing file |
| Build the `.dmg` (on a Mac) | `npm --prefix app run dist` → `app/packaging/construit/` ([`app/packaging/README.md`](../app/packaging/README.md)) |
| Launch without consuming quota | `BRIGADE_CLAUDE_BIN="$PWD/app/test/aides/faux-claude.sh" BRIGADE_APP_CONFIG=<trial file> npm --prefix app start` |
| … and without your machine becoming a station | add `BRIGADE_APP_STATION=0` |

**The open app is a station** (see "This computer is a station; a phone is a workstation"): it creates its gist on your GitHub
account through your `gh`, and cooks the projects of its `station/projets`.
`BRIGADE_APP_STATION=0` prevents that; `BRIGADE_APP_CONFIG` also moves its directory, next to the
trial file.

**A project whose kitchen cooks on this computer launches real cooks** as soon as the app is open and the project
has a `fire` ticket for it — on your quota, with no permission prompt, in a worktree of its folder. To try it without a
quota: use the stand-in `claude` above, and a trial file whose projects have no station on this computer.

The fake `claude` says `reçu : /brigade:init` when it is opened on the session.

- **No build.** The main process is TypeScript run as is by Electron (its Node strips the types, like
  the runtime's); the view is JavaScript checked by `tsc` (`// @ts-check`), which imports xterm.js
  through an *import map* — no bundler and no compilation step.
- **Shift+Enter inserts a line break.** xterm.js sends it as Enter; the view intercepts it
  (`attachCustomKeyEventHandler`) and writes instead `ESC` + `\r` into the second (`claude`'s
  Alt+Enter) or a quoted line break `^V` `^J` into a shell. Enter, Ctrl+C and paste do not go
  through there.
- **Option/Cmd/Ctrl/Shift + arrow and Option/Cmd/Ctrl + ⌫ move or delete.** xterm.js sends them as
  `CSI 1;<mod>` or as a bare `DEL`, which the shell and `claude` write out as characters. The same
  interception translates them, in the second as in a shell: Option/Ctrl + ←/→ → `ESC b` /
  `ESC f` (one word), Cmd + ←/→ → `^A` / `^E` (the line), Option + ⌫ → `ESC DEL` (one word), Cmd + ⌫ →
  `^U` (to the start of the line), Ctrl + ⌫ → `^W`. Shift alone has nothing to select: the arrow
  goes out bare.
- **No test launches Electron.** What can be proven lives in twenty modules run by
  `node --test`: `config.ts` (the projects file: reading it, creating it, adding a project to it,
  moving one to another place in it — a legacy key naming a host, boxes or played stations is read and ignored),
  `plugin-app.ts` (the app's plugin: `/brigade:dev` and `/brigade:ask` installed in local scope in each project,
  at the app's version, `git status` left clean, and uninstalled from a removed project only — against the real
  `git` and a stand-in `claude`),
  `nom.ts` (the shape of the name, held against the rule of the installation action: the test calls
  `lireDemande` of `runtime/src/installateur.ts`), `ajout.ts` (adding a project: the fields
  with no default, the repository and the branch read from the chosen clone, and the project written to the real projects file),
  `service.ts` (the
  commissioning: its states — init not merged, check incomplete, all ready —, what `Check` launches
  and what it does with each exit code, through the local station's gesture; and that `Start` writes nothing —
  the verdict line is compared with `runtime/src/installation-cli.ts`), `retrait.ts` (removing a project:
  that "Remove this project from the app" only takes the project out of the projects file and sends nothing to its station),
  `suivi.ts` (the same file read again when it changes, on real files and the system's real
  watch), `lancement.ts` (what `start` sets up before Electron — the commands are collected there,
  not run), `terminaux.ts` (the registry: what is launched, kept, relaunched, and what the app says
  of it — and the direct action: a free second, it goes; a busy one, nothing is written and the
  refusal says so; a filled-in prompt is not sent), `saisie.ts` (what the app knows of the second's
  input: its turns — the hooks played by a real `sh` —, its title, the chef's typing, the proof of
  shell mode; the signs are those recorded on the real `claude`, replayed without launching any),
  `pty.ts` (the real pty, against a fake `claude`), `box.ts` (the station watch and its states, against a
  stand-in gesture that each test writes: no network), `attend.ts` (the `awaiting` block taken by
  its edge, on outputs copied from the runtime; and the number at the head of a line, on the block
  the runtime itself writes — the test calls `decrireAttentes` of `runtime/src/attend.ts`),
  `sigle.ts` (a project's short label: unique among the projects, 3 characters at most, the one written by the chef first; in the played view, the tile, the full name on hover and in the space's header, the row under Settings), `couleurs.ts` (a project's colors: drawn without duplicates as
  long as the palette is not exhausted, written to the file — and only those that are missing —,
  changed one by one; in the played view, the tinted tile, the space's accent, the choice under
  Settings; none is a state color), `onglets.ts` (the five content tabs: each relays a script that
  exists in `runtime/package.json`, and only what is displayed is read), `boutons.ts` (what the
  closer button writes, compared with "Piloter" in `docs/runtime/exploitation.md` — and, in the registry
  and on the real pty, that nothing is sent), `gestes.ts` (the actions that are written into a shell
  of the space, and the two that go into the second: each command compared, character for
  character, with "Piloter", that nothing sends a written action, and that no action exposes a
  shell, a `sudo` or a free command), `manager.ts` (the manager's state read in the output of
  `manager`: on, off, never on, no decision, with its decisions and its set-asides — on outputs the
  test has `runtime/src/manager-cli.ts` itself write, on a real log; what does not have the shape is
  never read as "off"), `allumage.ts` (what turning it on commits: its warning compared with that of
  `docs/runtime/manager.md`, and the two numbers read on a known backlog — the line is written by
  `manager backlog` of `runtime/src/manager-cli.ts` itself, in front of a fake `gh`, then returned
  by a stand-in gesture; a station not reached, a runtime from before the command or an output without the
  line never give "0"), `amont.ts` (what is not yet on the rail: the output written by
  `manager upstream` of `runtime/src/manager-cli.ts` itself, on a real log and in front of a fake
  `gh`, counted and sorted into groups without adding anything to it; what does not have the shape,
  a box not reached or a runtime from before the command never give a number; and, in the played
  view, the number at the head of the rail, the list it unfolds, the card an issue opens, and what an
  empty rail says), `faits.ts` (what gets drawn: the shape read field by field on the example in
  `docs/runtime/etat-et-mesures.md`, what is not that shape refused without a zero, a color on the
  words of closed lists only, an issue's address, the banner — the rail sorted into five columns,
  Awaiting you from the shape's `awaiting` and the `awaiting` block held next to the facts — the view
  receives a ready-to-lay array and computes nothing in it), `bon.ts` (what a rail card carries: the
  line of each ticket under `rail`, held against `status` and `facts` written by the runtime itself
  from the same state; the five things said, or written as missing, on each ticket; a reworded line
  relayed whole, never guessed), `rail.test.ts` (the rail at the center, laid out whatever the tab;
  what the block says of a ticket rendered word for word, long and over several lines; the click on
  an Awaiting you card), `retard.ts` (a clone's lag behind its origin: counted against the real
  `git`, on trial repos whose origin is a neighboring folder — and that the clone read is the same
  after as before, file by file, to the byte and to the instant, even set to prune and tag on each
  `git fetch`; what cannot be read is never rendered as a zero; the command written into a shell,
  never run), `rattrapage.ts` (the app moves to the new version: the clone fast-forwards, or does not
  move and says why — commits of its own, change that would be overwritten, silent origin; at
  opening, before the dependencies, which are set up again if the new version changes them; on click,
  a single relaunch, through `npm start`),
  `main.ts` and the view only wire things up; they are verified by launching the app. **The skin,
  though, is proven without launching it** (`peau.test.ts`): `vue.js` is played there as it is in
  front of a fake document (`app/test/aides/fausse-vue.ts` — just what the view touches of it, and a
  fake bridge), and `vue.css` is read there rule by rule. What it holds: that text relayed from the
  box is laid word for word on the six tabs and the add screen — "All projects" relays none of it —,
  and that no rule cuts it; that no color is written outside `jetons.css`, nor any text size, spacing
  or radius (`echelles.test.ts`), and that each color is a color of the mockup — except a project's, which the view receives from the file (`couleurs.test.ts`);
  that a bar tile is rearranged by dragging it — the line that says where it will land, the room it
  takes, the click that stays a click, what is dragged in from elsewhere and not received
  (`rangement.test.ts`); that the fonts are files of the app; that a ticket number or a port is in
  monospace everywhere it appears; that nothing from the mockup's parking lot shows. **What gets
  painted is not seen there**: a fake document measures and draws nothing — the skin is looked at by
  launching the app.
- **Launched from a clone, the app reaches its origin**: a `git ls-remote` at launch and at each
  return to the window, and a `git fetch` into a throwaway folder when the clone is behind.
  **`npm start` updates the clone** if it follows an origin branch that has moved on — a dev
  worktree on a branch that follows nothing is not touched (`start` says so, and the app says
  `pas lu`).
- **`BRIGADE_CLAUDE_BIN`** replaces `claude`, as for the runtime; **`BRIGADE_GH_BIN`** replaces the `gh` that reads and answers an issue's question
  ("The question awaiting you"); **`BRIGADE_APP_CONFIG`** replaces the path of the projects file.
  None of the three has to be set for real use.
- **node-pty** is the only native module. It ships compiled for macOS and goes through N-API: the
  same binary serves Node (the tests) and Electron (the app), nothing is recompiled. On Linux it
  does not ship compiled: the tests on a real pty are **skipped there, and say so**; the registry and
  the configuration are played there.

### What it weighs

Measured on 2026-10-11 (Mac arm64, Electron 44.7.0, node-pty 1.1.0).

| | Duration | Disk, per worktree |
|---|---|---|
| Worktree setup (`npm ci --ignore-scripts`, warm npm cache) | ≈ 1 s (5 s cold) | 115 MB, of which 62 for node-pty |
| First `npm --prefix app start` on the machine (downloads Electron) | ≈ 25 s | + 311 MB |
| First `start` of another worktree (Electron already in the workstation's cache) | ≈ 1 s | + 311 MB |

So the setup never downloads Electron: only whoever launches the app pays for it. The workstation's
cache (`~/Library/Caches/electron`) weighs 129 MB, once.

## What the app does not do yet

- Prepare a box, or put the installation action on it: that is once per box, on it, by hand
  (`docs/installer.md`, "Prepare the box"). The app says what to do and where, it does not do it.
- Start a service for you: this computer's station runs with the app, and a station on another machine is started
  on that machine.
- Know whether the result of `/brigade:init` is merged, or whether the session succeeded: you say
  so, and `installation` verifies it on the origin.
- Fix what `installation` names — create the labels, protect the branch: it shows the arrow, the
  action is typed (`docs/installer.md`, "Check that the project is ready").
- Keep a go-live from one launch to the next: it starts over from the beginning, and the box says
  everything again.
- Uninstall a project from a station: that is done on the station itself (`docs/installer.md`, "Uninstall").
- Ask for the integration branch: the box takes the origin's default branch. A project for which
  that is not the right one is installed by hand, or fixed in its drop-in.
- A numeric gauge of the quota or the machine: the runtime says `disponible` and `tient`, not a
  level. If it is missing, it is up to the runtime to say it.
- Say *why* a kitchen is held, or what a ticket is awaiting, other than as text: the shape of
  `facts` does not carry it, and the app reads of the output of `status` only the edge of the
  `awaiting` block and the number at the head of its lines.
- Update the runtime: the box moves to the station once, through its package, which then updates
  itself ([`bascule.md`](bascule.md)) — the app has no action for it.
- Answer from the card anything other than a manager question, or remove a label in your place: an
  issue that carries `question` or `decision` is settled on GitHub, or with the second.
- Say that a runtime is no longer beating: it shows the gap between its last tick and the read,
  with no threshold or color.
- Show in the bar *how many* decisions are awaiting you: the number is in the card.
- Show the manager's state outside its tab — in the bar, the tile or "All projects": it is read in
  the **Manager** tab, as long as it is displayed.
- Say, when turning the manager on, how many open issues it is going to judge: the action writes the
  command, and `docs/runtime/manager.md`, "Le manager", says what it commits.
- Follow the log live outside a terminal: the **Log** tab reads its end again, every thirty
  seconds.
- Read what the second displays: the app does not read the terminal. A button writes after your
  typing, does not write into a second it has just launched, and writes into a dialog or a vim mode
  as into the prompt — its characters are keystrokes there ("Buttons write, they do not send", "The
  limit"). Only a direct action guards against it: it goes out only from a second said to be free,
  according to its turns, its title and your typing ("A direct action really goes out — or says why
  it does not").
- Carry its own input field for the second: you talk to it in its terminal.
- Rename a project, set anything else: the app adds a project and removes it, the rest is done in
  the file.
- Merge: a clone with commits of its own, or changes the new version would overwrite, does not move
  — the app says so, and writes `git pull` on request. Updating a project's clone: the same, it is
  updated only with the app, when it is the app's own.
- Say a clone's lag without you coming back to its window, or what the missing commits change: it
  reads at launch and on return, and renders a number.
- Say the lag of the clone of a project that is not a clone of brigade, or compare the version of
  the plugin installed on your side with the published one.
- Install itself as an app (packaging, signing, update): launched from the Finder, it would not
  have your terminal's `PATH` anyway — and, outside a clone, it would say its lag `pas lu`.

## The band does not flicker (#721)

The band says only what is established. A read in progress shows nothing ("first read in progress"
is never shown); a "not verified" line appears only if the read it comes from has failed **twice in
a row** (`LECTURES_POUR_ETABLIR`) — a read that fails and then succeeds on the next round shows
nothing, an unreachable box is reported once and stays. The count is that of **this read alone**:
for a subject read by two sources (the kitchen, the station, the box), the other source's receipts
neither establish it nor undo it (#746). A line that has been shown stays at least
`AFFICHAGE_MINIMUM` (20 s); it leaves at the first receipt that follows, `facts` being read again
every 30 s. A verified alert, read from a successful read, is shown right away. Identical content
from one read to the next does not redraw the band. The two thresholds are constants of
`app/src/alertes.ts`.

## A failing renewal is reported before the deadline (#760)

When the renewal of the Max session fails **two rounds in a row** (`ECHECS_POUR_ALERTER`, in
`app/src/alertes.ts`), the band of an installed project says "Max renewal failing", with the cause
the box gives (the `renouvellement` line of `installation`, which the runtime's probe writes). A
single failure says nothing. The line stays as long as the check (read again every 5 min) reports
the failure, and goes away on the first successful round. A session that has already dropped
reports itself through the disconnected station.

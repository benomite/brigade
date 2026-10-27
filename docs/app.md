# The app

A window on the Mac: your projects in an icon bar, and in each one a real terminal where the
second runs. You no longer open a terminal, you no longer move into a folder.

**In the middle of the space, two tabs, Rail and Cooks** (#1184), next to the project name, only one shown at a
time: **Rail** says where the project stands and what you have to decide — what awaits you and its action, the
whole kanban in its order — On the rail, Taken, Pass, TODO, WAITING and what is served — with nothing about
execution; **Cooks** says what is running — the project's stations and their cooks in flight, the delivery servers
with their worktree and their port, its tickets and its gates, and, folded, its calibration ceiling, its roles, what
its cooks learned and the raw reading of `station` (the machine and its saturation, the quota). One click switches from one to the other; **the app reopens each project on the
last tab you opened in it**, even after you quit it — a project never opened opens on Rail. **On the right, the
terminals, permanently**: the second, and beside it, at the same level, the shells you open — nothing you look at
in the middle hides them, and switching tabs neither cuts nor empties the conversation.
**Cooks reads in the order of its review** (#1456, `docs/revue-page-cooks.md`): **first, what cooks and what is stuck**
— the stations' block, headed by the kitchen's line (its state in a pill and its latest event; the project tile is
folded into it, and is shown whole above the stations only when they are not read), each station with its state, its
reason and its cooks' cards, a stuck cook's card saying `STUCK: no progress since 31 min`; on a 1366×768 laptop
screen, all of it is visible without scrolling. Then the pages served, the project's tickets, **the reliability of its
cooks**, its gates and **its closer** — these two were the Settings pages Reliability and Closer until #1699 (see "The
cooks' reliability, on Cooks" and "The closer, on Cooks"). Then, **folded
behind a single line each and closed by default**: the calibration ceiling (`opus / high · default`), the kitchen roles
(`6 roles · latest: … · no action yet: …`), what the cooks learned (`4 lessons, 3 profiles`) and the raw reading of
`station`. A click on the line opens it; the app keeps it open from one reading to the next. **A block with nothing to
say is a single line**, never a table of zeros: tickets (`nothing served, sent back or escalated in the last day`),
gates (`no run in the last 24 h · budget of one run: …`), lessons (`nothing yet on this project: no lesson, no
profile`); the delivery servers' section is not laid when nothing is served. The cap on cooks is set on each station's
line; the raw reading no longer carries the button that wrote `station cooks` into the second.
**Under the stations, the project's tickets in the last hour and the last day** (#1272): how many were
`served`, `sent back` to a cook and `escalated` to you, in a small table — one row per window, `last hour` then `last day`.
Six numbers read in `facts` (`activiteCuisine`, docs/runtime/etat-et-mesures.md), counted in tickets and for this project only;
with no activity, one line says so (#1456). What each counts is in the help of its heading. A runtime that does not give them shows nothing
there, nor a box that does not answer; on a narrow screen, they sit under the stations' lines.
**Under them, the project's gates over the last hour and the last 24 h** (#1318): `gates, last hour and last 24 h`, the
same small table — one row per window, `last hour` then `last 24 h`, with `runs`, `average time` and `average CPU` (what one
run costs, read against the budget of one run, on the row below, `(default)` when you have not set it), then `total time` and
`total CPU`. On the `last hour` row, each average carries its trend against the last 24 h — `↑ rising` (red), `↓ falling`
(green) past 10 %, `steady` within. Everything is read in `facts` (`coutDesGates`: `lastHour`, `lastDay`, `averages`,
`trend`): the app computes nothing. Averages read in seconds; totals in seconds up to ten minutes, then in minutes, then in
hours; the exact figure is on hover. No run in the hour nor in the 24 h: one line says so, with the budget of one run
(#1456), never a blank. A runtime that
gives only the day shows its row alone, its averages `–` (the hover says why); one that gives nothing shows nothing.
**The gates against their budget, on Cooks too (#1457)**: above that table, in the same block (anchor `#gates-du-projet`), the
block of the Rail — `gates, latest run against budget`, with the full run on the base and the ticket the kitchen opened on
its own — shown whole only when the latest run or the base run is over budget, or when the kitchen opened a ticket; otherwise
one line (`within budget · time 62 s / 100 s, CPU 181 s / 400 s`, or `no run yet`). **The triage, day by day** sits folded
under the roles (anchor `#triage-du-projet`): one line with the latest day's two numbers (`today: 2 decided alone · 1 sent
to TODO`), the days when opened; one line, nothing to open, when there is no day (`no day yet`) or every day is 0. The
Rail no longer carries either block (#1458): it is the kanban, plus one alert line at the top when something holds tickets
back — gates over budget (`gates over budget — #31`, the ticket the kitchen opened), joined with the station alerts already
there (repository access, refusal) in that single line. Clicking it opens Cooks, scrolled to the gates block. Same data
sources (`coutDesGates`, `triage`). Captures: `docs/captures/1457/`.
**On Cooks, one block per station of the project** (#1185, #1270), at the top of the tab, wherever it runs — the box, the Mac,
another computer (`remote`). **Every station serving the project is there, each once** (#1786): the stations of `facts`, then
those the main station declares that have not signed in to it yet, then those the app added to the project that the main
station does not declare yet — a station of the app is recognised by the name the main station gives it (`macbook/claude`,
published with whether it is reached), or else by its machine name. **The main station comes first**, tagged `main station`
(on hover: it runs the manager and the pass); the others are `cooking station`. The main station's block carries **`move the
kitchen`**, the very gesture at the top of the page: it opens the choice of the machine there; greyed, with the reason on
hover, when the kitchen cannot move (a project not added from this app, no other station, a move under way). Each block
says **whether the station is reached** — `reached` in green (the main station, whose kitchen the app reads; a station the
main station says it reaches), `not reached` in grey, or `no word` in grey for a remote station nothing says anything of —,
**as the main station sees it** when `facts` says so (#1830, `presente`): a remote station that has not shown itself to the
main station reads `absent` in grey (on hover: since when the main station has not heard from it), whatever the app reads
of it on GitHub, and its state reads `not cooking` — never `reached · cooking`; once it has shown itself, `reached` (on
hover, its last request) and `cooking`. Then its state, a word of `facts` (`cooking`, `stopped`, `saturated`, `refused`, #1183)
and what it means (`by you, for 3 min · 1 cook finishing`, `its machine has no room`, the reason for a refusal),
and, at the bottom of the block, **the cards of the tickets in flight on that station, and only those** — the very cards of
the Rail kanban: a click (or Enter) opens the same sheet as the same card in Taken, its number opens the issue; a ticket
the rail read does not carry has a card with its number and its title (`no cook running` when there is none). Nothing in a
block is command output. Each block has **a single button**: `stop cooking` when it cooks (saturated included), `start cooking`
when you have stopped it. It plays `station stop|start <station>` where the project's kitchen runs — its box by
`ssh`, or this Mac —, says `stopping…` until the runtime has answered, then rereads the box: the line takes
the new state without reloading the page. Stopping cuts nothing: the cook in flight finishes — served, or its ticket goes
back to the rail — and the line stays at `stopped`. What it does is on hover over the button; restarting says its price
on hover, stopping has none. Refused by the runtime, a line says so under the station, its output on hover. A station
stopped by your "stop" of the whole kitchen, or that refuses the project, has no button: the resume is on the
banner, the action for a refusal in the block under the stations line. **On Rail, a single line at the top** says
what, on the cooks' side, asks for your action — a saturated station, a station that refuses the project, repository access
blocked —, all the causes on the same line, with `open Cooks`, which opens the Cooks tab; nothing shows it
when nothing asks for it. The modules are `app/src/cuisson.ts` and `app/src/vue/stations-de-cuisson.js`.
**A station that cannot cook says why in one line** (#1786, #1774), under its state: `not signed in yet` for a declared
station that has not announced itself to the main station (on hover: it takes no ticket until it does); for a station
added from the app, where it is stuck — `not received by the station`, `waiting for your authorization on GitHub`,
`refused`, `not reached` —, what you do about it on hover, `check again` (it rereads GitHub) and the authorization button
it waits for. **In each block, what the station provides** (`Provides code raisonnement`, then `edit`, below) and **its
cooks at once**: the cap its runtime gives, with `set the cap` (below); for a station whose runtime does not give it yet, the
number it declares (`Cooks at once: 2`) and `set the cap`, which opens its form, in the block. Without the declaration read, what it
provides comes from `facts` (`fournit`, what the main station declares of it, #1830), with no `edit`; only a station the
main station does not declare yet says `not declared on the main station yet`. An absent station says why: `not signed in
yet`, or `silent since <time>`. On a narrow screen, the blocks are read-only: no `edit`, no
`move the kitchen`, no `check again`. The block below, *what each station provides*, is no longer laid when the stations'
blocks are: it is only the fallback while `facts` does not give the stations.
**What each declared station provides** (#1509, epic #1506) — in its block since #1786, in a block of its own under the
stations otherwise: one row per station the project
declares, in the order of its declaration — its name, where it runs, its cooks cap (`3 cooks at once`) and its capabilities
(`code`, `raisonnement`, `navigateur-headless`…). Where it runs has three distinct words: `box station`; `this workstation`,
a remote station this computer plays for the project (it is in the project's `stations` in `app.json` — or any station of a
project whose kitchen runs here); and `remote`, a station another workstation plays. What each means is on hover. The rows
come from `installation stations --json`, which the installation check reads (on opening, then every five minutes): before
the first read, one line says `not read yet`; a project that declares no station says `no station declared: no cook leaves
for this project`, never a blank. On a narrow screen, the block sits under the stations' lines. The module is
`app/src/vue/stations-declarees.js`.
**Each row has `edit`** (#1510) — so does each station's block (#1786): under the row, its form — `Cooks at once`, prefilled; `What it provides`, one checkbox per
capability (the boxes of "+ station", #1307): the ones it declares, ticked, then what the other stations provide and what
this computer can declare, unticked; and `this workstation plays it`, ticked when it does (absent when the project's
kitchen runs here; greyed, with the reason on hover, for a project with no `hote` or a station that does not run
`claude`). `Save`, recommended, changes that station only, by the runtime's single-station commands run on its box
(`installation stations set`, and `remote` when it becomes played here): the others stay as the box wrote them. Played
here, it is also written in the project's `stations` in `app.json` by the runtime's `jouerIci` (`runtime/src/une-station.ts`)
— the app re-reads the file and its runner plays it, with no hand edit; unticked, it leaves that list. `Remove` asks first,
its price in one line, then runs `installation stations remove` (and the station leaves `app.json` if this workstation played
it); the project's only station cannot be removed. Then the stations are read again, and the rows follow; one line under
the row says what was done, or, in the form, why nothing was (the station's answer on hover). It is the same on a
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
**Under the ceiling, the kitchen roles** (#1274), in a block titled `kitchen roles`: the `manager`, the `pass`, the `reviewer`, the
`second judge`, the `triage` and the `closer`, one per row — its name, one line on what it does, and under it its latest action
on this project, a short sentence and its time (`merged #12 · Oct 13, 2026, 9:41 AM`). A role that has never acted on the
project says `no action yet`. The roles, their line and the sentence are read in `facts` (`rolesCuisine`,
docs/runtime/etat-et-mesures.md): the app composes none, and nothing there is command output. A runtime that does not give
them shows nothing there, nor a box that does not answer; on a narrow screen, they sit under the stations' lines. The
module is `app/src/vue/roles-cuisine.js`.
**On a narrow screen — the phone (#1151), or a window under 720 px —, three tabs** (#1186): Rail, Cooks and
**Second**, the conversation with the second, which takes the place of the middle instead of sitting on the right; one
tap switches from one to the other, and switching tabs neither cuts nor empties the conversation. The projects bar
moves to the top. **Cooks is read-only there**: the stations' lines, their state and their cooks — one line each, not
their cards —, and on each one its
only button, `stop cooking` or `start cooking` — no project tile, no Taken and Pass, no delivery servers, no stations
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
has no capture area. One click on a choice, or `send`, is the answer: it is posted once on the Kitchen board (#1694) —
no confirmation; each choice's price (a merge, a cook relaunched)
is on hover. Refused before anything is posted, it stays with its gestures, and a line says why, the box's output on
hover. Posted, the card stays where it is and says where the answer is (#1841, below). The modules are
`app/src/carte-todo.ts` and `app/src/vue/carte-todo.js`.
**A posted answer reads `sent, waiting for the kitchen` until the box replies** (#1841, epic #1838): the card recalls
`your answer: “…”` — the choice's text, or what the chef wrote —, offers neither its choices nor its field, and says
`sent, waiting for the kitchen` in a quiet line (what it means on hover), its left edge pulsing slowly like the rail's
top edge during a reading (#1818). When the box has played it, the card says `played by the kitchen` (the box's line on
hover) and its edge stops; it leaves TODO with the board that no longer carries it. When the box did not play it, the
card says `not played by the kitchen: <reason>` in red, the box's line on hover, and gives its choices and field back.
That state is **read from the Kitchen board, never from the app's memory** (`app/src/tableau/envois.ts`): with each
board reading where a TODO card waits, the app also reads the board's comments written since the oldest such card
entered TODO, finds the chef's last `/brigade choose` or `/brigade answer` for each card, and what the box did with it —
the board's machine block (`tableau.gestes`), or, when the box holds its calls and does not rewrite the block, its reply
comment under the gesture (`**Done**`, `**Not done**`, `**Not understood**`, linking the gesture; #1840). A gesture left
unanswered while the box answered a later one was passed over (not the chef's account): it says nothing. So an app
restarted while the answer still waits shows the card waiting again, never unanswered. Comments that cannot be read
(no network, GitHub refusing) leave the card as the view last knew it. The reading costs one GitHub call per board
reading, only while a TODO card waits. Captures: `docs/captures/1841/`.
**Every TODO card takes that one shape** (#1767, epic #1764, `runtime/src/carte-todo/forme.ts`): when `attend[].carte`
carries `resume` — what happens, in two plain sentences at most —, it heads the card in place of the expected line, then
the question, the captures, one button per choice and the free-text field. A card with a single gesture (merge a green
delivery by hand) has a null question: it shows that one button, filled, and no question. Every card closes on `ask the
second`, a small underlined word set back under the field, never one of its choices: it writes into the second a
request about the ticket with what is typed in the card's field, as the sheet's does, and the card is answered from its
choices without it.
**The main screen keeps only three things: the alert band, the rail and the terminals**; there is
nothing at the bottom of the window. The rest is behind a tab, at the top, next to the name of the
project: **Settings** (the state of the project, the backup and its age, the settings, the
manager, the grants, the reliability of its cooks and what it cost) — read for you, with nothing to type.
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
**One switch for the whole project** (#1406), in place of the manager's switch and the `merge` grant's
(#906, #907): it is not a line of the band, it is at the head of the space, to the right of the tabs —
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
signal. The `merge` grant is no longer a switch: lapsed on its own, it is a line of the band, to enable
again; "expiring soon" remains a line, to extend; its line in Settings still enables and revokes it (#1700).
**"All projects" is the overview of
brigade**: one line per project, one per station, each with its pill and what is going on there in
a few words, and one click opens it — you do not act there, you look, then go where it is decided; a
**Cost** line there opens the cost of all projects.
**Cost, the check of a project and Settings follow the same rules**: no flat instructions
(the explanation of a tab, what a step of the installation is for and what happens if you skip it live
on hover of a "?" icon), each action is a button that says its word — an action that writes the start of a
command into the second is named ("Extend a grant…"), the command is written nowhere —,
a read that fails fits on one line (the `ssh` text, the retry and the exit code on hover), and a
confirmation of a costly action says its price in one line, the rest and its source on hover.
**The log is no longer on screen**: it is breakdown tooling, opened by the
"log" action, at the head of the space. And at the head of the bar, the **All projects** screen: your projects and your
stations at a glance, the entry to the cost of all projects, and the health of Max and GitHub in one line.

**The app also says when its own code is behind.** It runs on the code of a clone, and a
clone nobody updates is an app that shows less than what is delivered: the **T** tile
turns yellow, its hover and the settings of each project say by how many commits its clone is
behind its origin (see
"The app's code: up to date, or behind"). And it moves to the new version of itself: at
its next opening, or right away with one click — with no terminal, no command to copy.

What is **a table of states is drawn**: a pill per project in the bar, a card
of five counters with its cooks in flight, the rail in five columns, and a banner when the kitchen is stopped. The
rest — the log, the grants, the station — stays text (see "What is drawn"); the state
of the manager and that of the grants are read from this text, and laid over it.

The app **adds nothing to the runtime** and doubles no action: what is granted, set or
relaunched is done in its terminal. Its buttons **write** the command into the second, and do not
send it: you are the one who hits Enter (see "Buttons write, they do not send"). What
it shows of the box, it read by running for you the commands that exist.

**Two actions are the exception, because they commit nothing: turning off the manager, checking
the installation.** Those **go**: their command is sent into the second, and its output is
read in its thread, without you copying anything. And when the second is not free, they do not go
silently: the app says why, and that nothing went (see "A direct action really goes out — or says why it does not").

**Only one thing goes from the app to the box without passing through your terminal: adding a project.**
The add screen runs the box's installation action for you — no command to paste,
no port to choose (see "From the app"). What remains afterwards — priming the repo, merging,
checking, starting — is followed in the project's space: the app opens the session there, checks for
you, and **writes the start only if the box says the project is ready** (see "After the add: the
commissioning").

## The app is not the kitchen

**What works is on the box**, project by project, and runs without the app and without you.
**The app is the window on the Mac**: it reads, it displays, it writes commands into a
terminal. Closing it stops nothing on the box, and stopping a project's kitchen does not close the app.

**One exception, and you declare it: the stations your workstation plays.** A ticket may ask for what
only your Mac provides — your signed-in Chrome. The kitchen stays on the box, with its rail, its
guardrails and its pass; but the cook of that ticket runs at your place, launched by the app, as long as it
is open (see "The workstation is a station"). A project that declares no station launches
nothing on your workstation.

Three words look alike, and do not mean the same thing:

| The word | What it designates | Where it is read |
|---|---|---|
| **All projects** | **a screen of the app**, the home: the overview of brigade — your projects, your stations, the entry to the cost of all projects, the health of Max and GitHub —, at the head of the bar. It launches and stops nothing | the round **T** tile |
| a project's **kitchen** | **a state of the runtime, on the box**: `open`, `held`, `stopped`, `off`. It is what your "stop" stops, and it alone | the pill, the card, the `kitchen` line of `status`, the `KITCHEN STOPPED` banner |
| **`taken`** | **the step of a ticket**: a cook holds it, between `queued` and `in pass` — what the rail calls `taken`. It speaks of a ticket, not of the project | the ticket list of an epic, and `pass` |

The log says `kitchen.stopped` and `kitchen.resumed` for your "stop" and your "resume":
that is the project's kitchen, the state — not the screen.

## Telling where your projects are

A single file, outside the repo: `~/.config/brigade/app.json`. Your boxes, declared once, and a
name and a folder per project — with, for a project served by a box, which one. **You do not have to
write it to begin**: the app creates it, and you declare a box and add a project in it from
the app.

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
- **When this computer is not signed in to GitHub**, the head of the screen says so in one sentence,
  with `Sign in to GitHub`: the button runs the runtime's sign-in action (`gh auth login --web`),
  without a terminal. The screen shows the one-time code to type, `Type the code A1B2-C3D4 on the
  GitHub page that opened in your browser.`, and the page opens — by `gh`, or by the app. Signed in,
  the stations are read again; a clone that was held for want of an account starts again by itself.
  The same button appears under a clone refused for that reason.
- **When the stations cannot be read** — no `gh`, no network, GitHub limiting the account —, the
  head says why in the runtime's sentence, its detail in the hover, with the button of the page that
  lifts it (`get the GitHub CLI`) and `read again`. With no station paired yet, the sentence says
  what to do. The screen is never blank.
- **The screen asks for your own account and project** (#1540): under the head sentence, two empty fields,
  `Your GitHub account` (`your-github-login`) and `The project to work on` (`owner/repo, or the path of a
  folder on this computer`), and `open this project`. An `owner/repo` (or a `github.com` address) is cloned by
  the runtime; a bare name is completed with the account typed, and with no account a sentence says so and
  nothing starts; a folder path opens **Add a project**, already filled. What was typed is kept between
  two renderings. No default names the chef's account, machines or projects.
- **A folder you already have** is still one click away: `add a project from a folder instead`,
  or the **+** at the foot of the bar, open **Add a project**. **T** opens All projects.

*Code: `app/src/premier-lancement.ts` and `app/src/connexion-github.ts` (main process),
`app/src/vue/premier-lancement.js` (the screen). Captures: `docs/captures/1434/`.*

### The project opened there: its Rail and its Second never stay blank (#1435)

A project opened from that screen has neither a box nor a station on this computer. Its two tabs
still show something, always:

- **Rail** shows the rail its station publishes on GitHub (#1432), in five columns — On the rail,
  Taken, Pass, WAITING, Served: Cooks has no kitchen to read here, so Taken and Pass stay on Rail.
  The head says `The rail as parade-box publishes it on GitHub.` (or that the station is offline and
  this is the last rail it published); when and for which repository is in the `?` hover. A
  ticket's number opens its issue. While the rail is read, one sentence says so. When it cannot be
  read, the head is the runtime's sentence, its detail in the hover: not signed in to GitHub, with
  `Sign in to GitHub` (the same action as the first-launch screen; signed in, the rail is read
  again); no `gh`, with `get the GitHub CLI`; anything else — no station serves the project, its
  station publishes no rail, GitHub refuses or is out of reach — with `read again`. Cooks keeps its
  one line: no station serves the project on this computer.
- **Second** starts as the runtime plans it (#1433): the `claude` the PATH gives, and on Windows what
  launches it. When it cannot start, there is no terminal: its note says why in one sentence
  (`The second cannot start: claude and git are missing on this PC.`), and under it each missing
  tool by name, with `how to get <tool>`, which opens the page that explains it: the button carries
  the gesture, no command is written out to copy. Why the second needs the tool, and the runtime's
  sentence on how to get it, are in the `?` hover. `try again` checks the tools again and starts the
  second when they are there. When it starts but a tool is missing (`gh`, `ssh`), the terminal is
  there, and above it the sentence that says what will fail, then the tool and its button. Any other
  failure — the project's folder missing, a launch refused — is said in the note's one sentence,
  with `try again`.

*Code: `app/src/vue/rail-publie.js` and `app/src/vue/outils-du-second.js` (the screens),
`railDuProjet` in `app/src/main.ts`, `rangerLeRailPublie` in `app/src/faits.ts`, the plan of the
second in `app/src/terminaux.ts`. Captures: `docs/captures/1435/`.*

### The project view is the rail view (#1692)

A project has one view: the rail view, with its columns, its ticket cards, its TODO and its
gestures. Since #1694 it is fed from the project's Kitchen board on GitHub (read with the token of
this computer's `gh`), with no `ssh` and no box reachable; the app only has to be connected to
GitHub. The screen #1588 added for a board read from GitHub — a TODO column and the raw `status`
sections, with `use the direct link` and its own decision buttons (#1590) — is gone, and so are its
bridge calls (`tableauDuProjet`, `ouvrirDuTableau`, `gesteAuTableau`) on the desktop and the phone.
The gestures of the rail view that the board's grammar knows (`docs/tableau-gestes.md`) are posted
on the board from the card or the sheet: `merge the PR`, `remove from the rail`, a TODO card's
choice or text, `back to the kitchen` after WAITING (#1740, below), and the "yes" or "no" on a proposed
correction or cook profile (#1741, below). A project that neither a box nor this computer serves keeps the published rail
above (#1435). Captures: `docs/captures/1695/` — `espace-projet-avant.png` (the screen removed) and
`espace-projet-apres.png` (the rail view of the same project), and `espace-projet-gestes-apres.png` (the
sheet of a TODO ticket whose decision is known, offering its gestures, `merge the PR` first).

### Changing a ticket's priority (#1739)

A ticket's priority is the `prio:<n>` label of its issue on GitHub. On the sheet of a rail card, `change the priority`
offers `1` to `9` (`1` is served first) and `none`; nothing is chosen in advance, and the button stays inactive until a
value is. A click and **the app replaces the label itself on GitHub** (`app/src/priorite.ts`), with the token of this
computer's `gh`: it reads the issue, puts the new `prio:` label, then removes every other one (`none` removes them all
and puts none). No box, no `ssh`, no Kitchen board, no second: the gesture works with the box unreachable. It costs
nothing, and asks for no confirmation.

- **Done**: the sheet says `priority changed on GitHub: #22 now carries prio:1 — the box reorders the rail when it reads
  it`, the issue's address on hover. The card and the sheet show the new priority at once. The box reads the label at
  its next poll and reorders the rail; until the Kitchen board shows it, the rail keeps showing the priority the app
  wrote — as long as the board still shows the old one, the box unreachable included. Once the board shows another
  priority, the board says it.
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
WAITING into TODO (recommended there, confirmed with its cost), are one gesture: the app posts `/brigade arrived #<n>` on
the project's Kitchen board (`app/src/tableau-gestes/rail.ts`, `docs/tableau-gestes.md`), with the token of this
computer's `gh`. No `ssh`, no second, no box command: the gesture works with the box unreachable, and the box plays it
at its next tick — the ticket leaves WAITING (or TODO) and goes back on the rail, queued, without going through TODO.

- **Posted**: the card says `posted on the Kitchen board — the box plays it at its next tick and answers under it` under
  its buttons, the comment's address on hover; the sheet says the same under its gestures. While the post is on its way,
  the card says `it arrived, back to the kitchen: sent, waiting for the answer…` and its buttons are inactive. The card
  stays in WAITING until the board, read again, shows the ticket back on the rail.
- **Not posted**: nothing changes and the card says why in one line, in red — the board not read yet, a ticket the
  latest board read does not carry, or GitHub refusing the comment (`The gesture could not be posted on the Kitchen board
  of chef/parade: GitHub refused the comment (HTTP 403): …`). One click tries again.
- **Refused by the box** (a ticket neither in WAITING nor back from it): the box answers so under the comment, and the
  rail does not move.

Captures: `docs/captures/1740/` — `carte-waiting-arrivee-avant.png` (the old path: the command went into the second,
through the box), `carte-waiting-arrivee-apres.png` (posted on the board, said on the card),
`carte-waiting-arrivee-echec-apres.png` (GitHub refused: the card stays and says why), and `fiche-cuisine-avant.png` /
`fiche-cuisine-apres.png` (the sheet of a ticket back from WAITING, `back to the kitchen` confirmed).

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
`?` hover), then **one button that shows the exact command, in full**: nothing shortened, rewritten or hidden — a long
command wraps between its words, its spaces and quotes kept as published.

- **A click opens a confirmation**, under the button: `Run this command in the second's terminal, in your name?`,
  the same full command again, then `run it` and `cancel`. Nothing runs yet; a second click on the button closes it.
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
**Add a project**.

**Adding a project is installing it on its box** — a single screen, on a box already prepared:

| What you give | How |
|---|---|
| **Its folder on this workstation** | `Choose…` opens the Mac's folder picker: it is not typed |
| **Its name** | proposed from the folder, as long as you have not typed another. It is also that of its instance on the box (see below) |
| **Its GitHub repository** | `<owner>/<name>`: it is the one the box clones. The app reads it from the origin of the chosen folder (`git remote get-url origin`) and proposes it; correct it if it is not the right one. With no readable github.com origin, the field tells you so and stays to be written |
| **Its box** | to choose among those you declared. Only one declared: it is already chosen |
| **The manager and reviewer calibration** | a model (`opus`, `sonnet`, `haiku`) and an effort (`low`, `medium`, `high`, `xhigh`, `max`) for each: it is your quota. **A starting value is proposed**, with its provenance — you keep it or you change it |
| **Where its backups go** | a directory **on the box**, specific to this project, as an absolute path — under the root the box allows. **Proposed: `<root>/<name>`**, the root being the one the box accepts |

**What is proposed is seen as such, and says where it comes from.** A prefilled field carries, under
it, `Proposed, not chosen — <provenance>`; the line disappears as soon as you touch the field — what
goes to the box is then what you chose.

| Field | Proposed value | Provenance said on screen |
|---|---|---|
| Calibration | that of the last project you added from the app (the app keeps it, with the project, in `calibrage`) | `what "<project>" runs on, the last project you added here` |
| Calibration, lacking such a project | `sonnet/medium`, the value measured on brigade's box | `the value measured on brigade's box, lacking another project added here…` |
| Backups | `<root>/<name>`, which follows the name as long as you have not touched the field | `the root that "<box>" accepts (<root>, read from /etc/brigade-installer.conf), then the project name` |

**The root is not guessed: it is read.** When a box is chosen, the app reads
`/etc/brigade-installer.conf` on it, through `ssh` (`cat`, this file is readable by all) and
takes the `sauvegardes=` line from it. Box not reached, or setting without a root: the field stays empty, and
says why. **The root keeps its absence of a default**: it is set once on the box,
and the app never chooses a disk.

**A box is declared once, not per project.** Under the list, `Declare a box` takes a name —
the one by which your `ssh` reaches it, what you type after `ssh` — and writes it into `hotes`. Nothing
is reached at that moment: it is a name. A second box asks for nothing more than a second name.
A file written before this list has nothing to rewrite in it: the box your projects already name
(`hote`) is proposed too.

**Nothing goes while a field is missing.** A field that can be deduced does not start empty, but you
can empty it: `Install on the box, and add` with an empty calibration or destination
reaches no one, the field is flagged, with its reason (`The manager's model has no default:
it is your quota, choose it.`), and the screen says `Nothing went to the box`. **The runtime, for its part,
always refuses to start without its five variables** (`docs/runtime/exploitation.md`, "Cinq variables, aucun défaut"): the proposed value is
written in the drop-in as a chosen value.

**The name is that of the instance** (`brigade@<name>.service`), and the screen refuses it **as the box
would refuse it, before calling it**: lowercase letters, digits and hyphens, no leading hyphen, 63
characters at most. The field says so as you type, with the reason (`The box refuses this name — it
contains "C"…`). The app corrects nothing: you choose another name.

**What goes to the box** — and you have nothing to paste: the app runs, through `ssh`, the
installation action (`docs/installer.md`, "The installer command"):

```
ssh -o BatchMode=yes -o ConnectTimeout=10 -- <hote> sudo -n /usr/local/bin/brigade-installer install <nom> --depot <propriétaire>/<nom> --sauvegardes <chemin> --manager-modele <modèle> --manager-effort <effort> --reviewer-modele <modèle> --reviewer-effort <effort>
```

**No port is asked or sent**: the box assigns that of the project's door, reads that of
its arbiter, and returns them. The integration branch is not asked either: the box takes the
default branch of the origin, and the screen says which. The clone happens on the box and can
take a few minutes; the app waits up to a quarter of an hour.

**Installed, the project is declared in the app** with its `hote`, after the
others, and the screen stays to show you what the box returned:

```
"calculus" is installed on the box "box", and declared in the app.
Ports assigned by the box — door: 3129 · arbiter: 4100.
Integration branch: `main`, read by the box from the repo's origin.
Backups: /srv/sauvegardes/calculus, on the box.
The box says: the project's runtime is not started: check first (`brigade calculus installation`), then `sudo systemctl enable --now brigade@calculus.service`
```

The installation does not start the runtime. Under what the box returned, the screen says what remains —
priming the repo, merging, checking, starting — and carries the action that opens the next step: `Open
the space of "calculus" and run /brigade:init there` (see "After the add: the commissioning").

**As long as the box has not installed the project, nothing is declared in the app.** What the app
got is shown as is — the line launched, what the box wrote, the exit code — and below it
what there is to do:

| What the screen says | What happened | What to do, and where |
|---|---|---|
| `The box "…" was not reached` | `ssh` opened no session (code 255), or could not be launched | `docs/installer.md`, "Reach the box" — and "Add a human" if your key is refused |
| `… was reached, and the installation action did not answer there` | the box answers, but `brigade-installer` is not in place there — a box prepared before it —, or its sudoers rule does not give it to your account | **the app does not prepare a box**: `docs/installer.md`, "Prepare the box" — "The installer command", on the box, by someone who has `sudo` there |
| `… refused to install "…" (<reason>)` | the action answered, and says no: its sentence is shown word for word — a destination outside the allowed root, a setting missing from the box, an installation begun and undone | what its sentence names; when it is the box that is not ready, "Prepare the box" |
| `"…" is already installed on the box "…"` | the box changed nothing: neither calibration nor backups | if it is only missing from the app, the button `Declare it in the app, as it is on the box` writes it into the file — **a second action, yours**, which sends nothing to the box |
| `… did not finish answering` | `ssh` was stopped at the end of the quarter hour: the app does not know where the box was | replay the add — a box that had finished will say the project is already installed, changing nothing there |

What you entered stays on screen after a refusal: you replay the add without retyping anything.

A project the file would refuse — `Not added — two projects are called "brigade"`, `folder
not found: …` — is refused **before** the box: nothing is installed there for a project the app could not
declare.

- **The app writes only the project added** — then its two colors, drawn for it (see "The
  colors of a project"). What else you put in the file stays there — but
  it is rewritten in full, indented by two spaces: a layout of your own does not survive it.
- **It does not write into a file it did not understand**: `Not added — the app does not write
  into a file it did not understand — unreadable JSON: …`. That one is repaired by hand.
- **Renaming a project is done in the file**, not in the app. Removing it is done from
  the app, and it is two actions: "Removing a project: from the app, or from its box", further down. Removing
  it from the file by hand removes nothing from the box either.
- **A project without a box is not added from the screen**: it is written by hand, without `hote`.

### After the add: the commissioning

Installed, a project is not yet served. Four actions remain, **in this order**, and the app skips
none. They are in the project's space, at the head of the panel, under **Commissioning** —
unfolded by itself for a project you have just added, folded to one line for
the others. A project without `hote` and without a kitchen on this workstation has none.

| | The action | What the app does | What stays with you |
|---|---|---|---|
| 1 | **Prime the repo** — `Run /brigade:init in the second` | opens the space's second on the session: `claude /brigade:init`, a fresh conversation in the project folder | the session itself: it is a Claude Code conversation, not a command, the app does not play it for you |
| 2 | **Merge** — the box `The result of /brigade:init is merged on the integration branch` | says it, in so many words: `The result of /brigade:init must be merged on the integration branch before going on` | merge, then tick: **the app does not know whether it is done, you are the one who says so** |
| 3 | **Check** | runs `installation` on the project's box, for you, and displays **everything** it returned | settle what it names, and check again |
| 4 | **Start** | opens a shell in the space and **writes** the start there, without sending it | your Enter — and your password, if `sudo` wants one |

**Three states, and starting is possible only in the last:**

| The state | What is seen | `Check` | `Start` |
|---|---|---|---|
| **init is not said merged** — the start, always | the box is not ticked | inactive: `No check: the result of /brigade:init is not said merged…` | inactive: `No start: the result of /brigade:init is not said merged.` |
| **the check is incomplete** — said merged, and `installation` does not say, or not yet, the project ready | `NOT READY`, or nothing yet, or what the app got instead | active | inactive, with its reason: `the box has not yet checked this project`, `the check is running`, `installation does not say the project ready — what is missing is named above…`, `installation did not return its verdict…` |
| **everything is ready** — `installation` exited with `0` | `READY — checked at 14:32:07` | active | **active** |

An inactive button has its reason written below. And it is not just a greyed-out button: the main
process refuses likewise — nothing goes to the box while the box is not ticked, and nothing is
written in any terminal until `installation` has said the project ready.

**`/brigade:init` — the app puts you there.** If the space's second is not running, it is launched on the
session, and the line under the right-hand tabs says so (``session launched on `/brigade:init`: `claude
/brigade:init`, a fresh conversation in this folder``). If it is already running — you had opened
the space —, it is not replaced: `/brigade:init` is written there, without Enter, as by a button.
The session can be replayed without harm. The brigade plugin is needed on your workstation: without it, it is `claude`
that says it does not know the command, in the terminal.

**Merging is you.** The box sees of the repo only what its origin carries: as long as the result
of init is not on the integration branch, it can serve nothing. A repo **already primed
and merged** does not have to replay the session: tick the box, and check. Unticking the box takes you back to the
start, and drops the previous verdict. **Ticking without having merged starts nothing**: it is
`installation` that reads the integration branch on the origin, and it will say so (`MISSING`, "In the
repo").

**Check runs the command that exists**, the same one the bar runs for `status`:

```
ssh -o BatchMode=yes -o ConnectTimeout=10 -- <hote> brigade <nom> installation
```

It launches neither a cook nor a setup, consumes no quota, and can be replayed as often as you like
(`docs/installer.md`, "Check that the project is ready"). The app waits for its answer two minutes at
most, and displays **everything it returned, word for word** — the line launched, the output, the code:

```
NOT READY — checked at 14:32:07
$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade calculus installation

Dans le dépôt
  MANQUE    `.claude/brigade/gates.sh` n'est pas exécutable : la pass le lance tel quel
            → `git update-index --chmod=+x .claude/brigade/gates.sh`, commité sur `main`

Sur GitHub
  MANQUE    labels absents du dépôt : fire, model:opus, model:sonnet, …
            → la même commande, suivie de `labels`

brigade : projet « calculus » : 2 manques : aucun cook ne doit être lancé tant qu'il en reste

→ exit code 1
```

**Each point that is not ready is a `MANQUE` line, and the arrow below says what remains to be
done for it**: it is `installation` that names them, the app translates none of them and removes none. It
adds below what the box cannot say from here — how "the same command" is typed from
your workstation (`ssh box brigade calculus installation`, followed by what the arrow names), and that a
missing item "In the repo" is a result of init that is not, or not entirely, on the integration
branch. A `to know` line holds nothing back.

| What the app says | What happened | `Start` |
|---|---|---|
| `READY` | `installation` exited with `0`, with its verdict line (`brigade : projet « <nom> » : prêt…`) | active |
| `NOT READY` | it was run, and something is missing (code `1`), or it refused its environment (code `2`): its output names it | inactive |
| `NO VERDICT` | a code `0` **without** the verdict line: it is not `installation` that answered — an account locked into a forced command, for example | inactive |
| `NOT REACHED`, `REACHED, BUT UNKNOWN TO THE BOX`, `REACHED, BUT WITHOUT THE RIGHT TO THE ACTION`… | the command did not return its verdict: the same cases, the same words and the same pointers as under `status` ("What the box says of the project") | inactive |

A check replayed **removes the earlier "ready"** until it has answered: nothing
starts on a verdict that is being redone.

**Start writes, it does not send** — like the buttons, but **in a shell**, not in the second:

```
ssh -t <hote> sudo systemctl enable --now brigade@<nom>.service
```

It is the action of `docs/installer.md`, "Serve the first ticket", the one the box names at the end
of the installation. **Starting a service is a `root` action**, and neither of the box's two actions
gives it without a password: the app therefore does not run it. It opens one more shell in the space
(`shell 1`), writes the command there, and shows it to you, on the right; the line under the right-hand tabs says ``written in this
shell, without Enter: `ssh -t box sudo systemctl enable --now brigade@calculus.service` — yours is
the one that sends it…``. A shell is a real terminal: `ssh -t` carries there the password that
`sudo` asks you for on the box — which the second's `!` would not do. After that, the first ticket is
served without a `merge` grant, and the first backup is launched by hand: it is still
`docs/installer.md`, "Serve the first ticket".

- **Nothing is written for a `nom` that is the name of no instance, nor for a `hote` that starts
  with a hyphen or carries a control character**: the button stays inactive, and says why.
- **A project whose folder is not there** has neither a second nor a shell: its box is checked all the same,
  and the start says `"…" does not open: folder not found: …`.
- **The commissioning is kept only while the app is open.** Relaunched, the app takes it back at the
  start, folded: unfold it, tick the box again, check — the box says everything again. A project that changes
  `hote`, or that leaves the file, starts over likewise: its "ready" was that of another box.
- **The app does not know whether the runtime started**: that is your Enter. The project's pill will say so at
  the next read — `off` as long as it is not running.
### Removing a project: from the app, or from its box

**Since #1700, the app's view offers only one of the two: Remove from the app.** It is the `in your app` line of
Settings' `you` group — its value `in the bar`, its one control `Remove from the app…`, which asks for a `yes, remove
"<name>" from the app` before anything happens: a project is not removed by a stray click. Uninstalling a project
from its station is no longer in the view — installing and uninstalling a station is a separate topic (#1536) —; what
follows about it describes what `retrait.ts` still holds, not a screen.

**Remove from the app** takes a single click. The project's open terminals are stopped, its folder
is not touched, and a notice says so again over the screen: `"calculus" is removed from the app.` —
`Nothing was sent to the box "box": the project is still installed there, and its log was not
touched.` To uninstall it afterwards, you have to declare it again (the **+** already finds it
installed, and offers to declare it as it is), or do it on the box, by hand.

**Uninstall from the box** takes two steps, and the app skips neither:

1. **`See what the box would remove`** runs `uninstall <name> --plan`. The box answers, and
   **removes nothing**. What it wrote is shown as is — `uninstalling "calculus" would remove
   from this box:`, then one line per thing removed, then `Kept:`. **The app has no deletion
   rule of its own**: it adds nothing to this plan and removes nothing from it. Below, a single
   sentence is its own, read from the object of the action: where the log is — kept, or among what
   would be removed.
2. **You type the project's name**, then `Uninstall from the box`. The button stays inactive until
   the box has returned its plan, and says why. A name that is missing, incomplete or in another
   case: `NOTHING WAS SENT TO THE BOX`, with what you typed and what was expected. The right name:
   the app runs `uninstall <name> --confirm <name>`, and shows what the box says it removed.

**The log survives, unless you ask.** The box `Also delete the project's log on the box` is
**unticked** by default, and its warning is written below it before anyone touches it: ticked,
the app adds `--delete-the-log` to the action, and there is no way back. Without it, the option is
never sent, and the screen says so afterwards: `The project's log still exists on the box:
/var/lib/brigade/calculus.` **The plan is only valid for the setting it was requested with**:
ticking or unticking the box drops it, and the uninstall becomes inactive again until the next
plan — you never confirm a plan that does not say what is going to go. **The name you typed is
likewise only valid in front of the plan on display**: a plan requested again, or dropped, empties
the field. And **a plan is good for one use only**: as soon as the box may have changed — it
removed, started, or did not answer —, the next uninstall asks for a new one. Only a refusal that
comes before its first action lets it stand.

| What the screen says | What happened | What to do |
|---|---|---|
| `STATION "box" HAS DRAWN UP ITS UNINSTALL PLAN — nothing is removed yet` | the box returned its plan; the app says what it reads of it (the log) | check the log line, then type the project's name |
| `UNINSTALLED FROM THE BOX "box"` | the box removed what it lists | nothing — or remove it from the app, with the other action |
| `THE BOX "box" REFUSED (…) — nothing is removed` | the action said no before removing anything: a clone that carries what the origin does not have, a project it does not know, another action in progress | its sentence is above, word for word; sort it out, then replay |
| `THE UNINSTALL STOPPED HALFWAY…` | it had started: the box says what is done and what remains | ask for the plan again — it says what is left to remove |
| `THE BOX "box" COULD NOT BE REACHED — nothing is removed` | at the plan, `ssh` exited with an error: a plan removes nothing, reached or not | `docs/installer.md`, "Reach the box" |
| `` `ssh` FAILED WITHOUT THE ANSWER OF THE BOX "box" `` | at the uninstall, `ssh` exited with an error: session never opened, or lost on the way — its code does not tell them apart, and the box may have started | ask for the plan again: the app says neither "nothing is removed" nor "uninstalled" |
| `… ITS ACTION DID NOT RETURN ITS PLAN` | the box answers, the action does not: it is not installed there, or not in a version that uninstalls | `docs/installer.md`, "Prepare the box" — "The installer command" |
| `THE BOX "box" DID NOT FINISH ANSWERING` | `ssh` was stopped at the time limit (three minutes for the plan, a quarter of an hour for the rest) | ask for the plan again: the app does not call a project uninstalled when its box has not answered |

**Once uninstalled, the project can no longer be driven from the app, and the app says so.** It
stays in the bar, with no dot and dashed; its row in "All projects" says so greyed out
(`uninstalled from its box: nothing is read`), and its panel and tabs show `UNINSTALLED FROM THE BOX "box" — can no longer be driven from the app`, in place of
what the box said about it. **The app no longer reads its box** — no `status`, no `facts`, no tab —,
its buttons and its commissioning are no longer offered: this is not `REACHED, BUT CAN NO LONGER BE DRIVEN`,
which would mean a runtime to upgrade. Its second and its shells, on the other hand, stay: they run on
your workstation.

- **An uninstalled project stays in the app** until you remove it from it: that is the other action.
- **As long as the box has not answered about an uninstall in progress**, "Remove from the app"
  refuses: once removed, the project would have no space left in which to read what it answers.
- **The uninstall can be replayed**: log kept, you can tick the option and start again — the
  plan, then the confirmation. If this second time does not succeed, the project is still said to be
  uninstalled, and the app says it no longer knows where its log stands: the box's plan will tell.
- **Nothing is kept from one launch of the app to the next.** Relaunched, the app reads the box
  again, which itself answers `project unknown on this box`: the panel then says `REACHED, BUT UNKNOWN TO THE BOX`,
  and reminds you that this is what to expect of an uninstalled project.
- **A project without a box** has only the first action: there is nothing to uninstall, and the block says so.

### By hand

The file stays yours, and you can do anything in it:

```json
{
  "hotes": ["<the name by which your ssh reaches your box>"],
  "projets": [
    {
      "nom": "brigade",
      "dossier": "~/Dev/brigade",
      "hote": "<the name by which your ssh reaches your box>",
      "stations": ["mac/claude"]
    },
    { "nom": "parade", "dossier": "/Users/chef/Dev/parade", "couleurs": { "onglet": "#a98cf2", "accent": "#4fc7b5" } }
  ]
}
```

- `hotes` is the list of your boxes, and **each one is only a name**: the one by which **your**
  `ssh` reaches it. It is what the add screen offers; one more box is one more name. It is
  optional: a file that does not carry it is read as before, and the boxes its projects
  name are offered all the same. A name written twice counts once; anything other than a
  list of non-empty strings refuses the file (`"hotes" must be a list`, `host no. 2: must
  be a non-empty string…`).
- `dossier` is an absolute path, or starts with `~/`.
- `couleurs`: **the project's tab color and accent color** (see "A project's colors"), each
  written `#rrggbb`. You do not have to write it: **the app draws it and writes it itself**
  for a project that has none — when added, at launch for a project declared before they
  existed, or as soon as a project written by hand enters the file. If only one of the two is written,
  the other is drawn. Anything other than a `#rrggbb` color refuses the file (`project no. 1 (parade):
  "couleurs": "onglet" must be a color written `#rrggbb` — "rouge" is not one`).
- `hote` is optional, and it is all a project says about its box: the name by which **your**
  `ssh` reaches it. What is written between `< >` above is to be replaced — see "What the box says
  about the project". A project written by hand without `hote` has its terminal, and the app reads nothing of its box: it reads one only if `hote` names it. A project that cooks on this workstation, on the other hand, is read and driven locally, with no `ssh` and no `hote` (see "Where a project cooks").
- **`nom` is also the project's name on the box**: it is what the app gives to the box's action
  (the box's action: `ssh <hote> brigade <nom> status` from your workstation), hence the name of the instance `brigade@<nom>.service`. There is no
  second name to declare: a served project is called the same in the app and on its box.
- `stations` is optional: **the stations this workstation plays for the project**, under the name its
  box gives them in its stations (`station stations`), where they are declared `remote` (see "The workstation is
  a station"). Without it, the app launches no cook. A station is played against a box
  (`"stations" without "hote"` refuses the file), is written `<machine>/<engine>`, and the workstation
  launches only one engine: `mac/codex` is refused (`it launches only `claude``).
- **`commande` is no longer read.** A file that still carries it is refused, saying so:
  `project no. 1 (brigade): "commande" is no longer read — remove it: …`.
- The bar follows the file's order. **Rearranging the icons in the bar** (see "The icon bar") changes
  the order of the `projets` rows there, and nothing else: a project added afterwards arrives at the end.
- **The app rereads this file as soon as it changes** — and every time you come back to its window. The
  bar and "All projects" follow; nothing has to be relaunched (see "When the file changes").
- **The second reads the same file.** The second is the PO role: the session the Second tab
  opens in a project's `dossier` takes `nom` and `hote` from it, and runs once on opening the same action as the app:
  `ssh … <hote> brigade <nom> status`. It relays what awaits you, word for word. A `nom` the
  box does not know is refused by the action, and the second says so in one line; a project
  with no `hote` and no kitchen on this workstation has no queue to read, and it says so the same way. There is no other place to
  declare the box.

If the file is refused at launch, the app shows no project: it shows the
file's path, the reason (`unreadable JSON`, `project no. 2 (parade): "dossier" missing`,
`two projects are called "brigade"`…) and the shape of the file, where each value to replace is written between `< >`. A refused file is refused
as a whole, and **the app does not touch it**: nothing can be added from the app until it is
repaired. Repair it, and the app follows without being relaunched. Same for a file it could not
create (`this file could not be created: …`).

### When the file changes

| What changed | What the app does |
|---|---|
| One more project, a `hote` added or removed, one more box in `hotes`, the order | The bar and "All projects" follow. Open terminals are not touched; the screen on display stays the same, its box reading starts over |
| A station added to `stations`, or removed; the `hote` or the `dossier` of a project that plays one | One more station announces itself to the box, within the minute. **A removed station is left, and its cook in progress is killed**: nothing is returned, its lease expires by itself on the box (see "The workstation is a station") |
| A project removed, renamed, or whose `dossier` changed | **Its terminals are stopped** — second and shells: they were running in a folder that is no longer its own. The conversation stays with `claude`: on the first click, the second picks the thread up in the new folder. If it was the screen on display and the project is gone, you return to "All projects" |
| The file is no longer readable — an editor mid-write, an extra comma, the file deleted | **Nothing disappears**: the earlier projects stay, their terminals run. A banner, at the bottom of the window, gives the path and the reason; it goes away at the first successful reread |

```
/Users/chef/.config/brigade/app.json changed, and could not be reread:
  → unreadable JSON: Unexpected end of JSON input
Your projects are the earlier ones, and nothing is closed. The app rereads it as soon as it changes.
```

As long as the banner is there, **the `+` writes nothing, and installs nothing** — no project, no box: `Not
added — the app does not write into a file it could not reread — …`. Writing over it would lose the projects it
still displays. A file deleted while the app is open is therefore not recreated behind your
back: put it back, or relaunch the app, which creates it empty.

A file the app **could not create** at launch (a folder without permissions, a link that leads
nowhere) keeps its reason on screen, and the app retries every time you come back to its window:
repairing is enough, no relaunch.

A project whose folder is not there (disk unplugged, folder moved) **stays in the
bar**, greyed out, its icon dashed: on click, the app says `folder not found: …` instead of opening
a terminal. Its box, on the other hand, is read: the panel and the content tabs answer. The other
projects are not affected.

## All projects at a glance

*Ticket: #870.* The app opens on it, and the round **T** icon, at the head of the bar, brings you back to it. It is
**the overview of brigade**: what is cross-cutting, and nothing else. What belongs to a project —
a piece of information, a setting, an action — is in its space; what belongs to a station, on its page.

```
PROJECTS
● brigade     1 decision awaits you · #867 cooking                 ›
● espace      5 decisions await you, for 2 d                       ›
● calculus    base red · #655 being repaired                       ›

STATIONS
● parade-box  online · 2 cooks · brigade, espace, calculus         ›
○ Mac         offline for 12 min · no project                      ›
                                                          + station

COST
  all projects  tokens over 5 h, 24 h and 7 d · lost tokens · most …  ›

CLOSER
  all projects  added / removed ratio and its trend                  ›

● Max ✓  ·  GitHub ✓
```

- **One row per project**, in the file's order: its name, its dot, and a short sentence that
  says what is going on — **what blocks first**, then **what awaits you** (how many decisions,
  since when), then **what is cooking** (its cooks' tickets, or what is at the pass). Nothing
  going on: `nothing cooking, nothing waits for you`. When the reliability of its cooks has drifted, it ends
  with one word, `drifting`, and hovering says why (#987, see "The cooks' reliability, on Cooks").
- **A project's dot** is **red** when it is blocked — base red, kitchen stopped or
  held, runtime off, box unreachable —, **yellow** when a decision awaits you, **green**
  otherwise. **Grey** as long as nothing is read from it, or when nothing can be: a project without a box, or
  uninstalled from its own. Not read is never green.
- **One row per paired station**: its name, its dot, its state (`online`, or
  `offline for 12 min`), what it is doing — its cooks in progress, `saturated`, `update failed`,
  `Max connection lost`, or `idle` — and the projects it carries. Its machine (system, kernel) and its
  version can only be read **on hover**. Dot **red** when its Max connection is lost,
  **yellow** when it is saturated or an update failed, **green** online, **grey** offline
  or unreadable.
- **A click anywhere on a row opens it**: the project's space, or the station's page
  (see "Your stations: paired by a code, read on GitHub"). **No row carries any
  action** — no merge, no triage, no removing `fire`: decisions are taken in the project.
- **A "Cost" row**, under the stations, opens **the cost of all projects** (#1022), in place of
  the home — without opening any project (see "The cost of all projects"). It shows no
  figure: the cost reading only starts when its page is open.
- **A "Closer" row**, under it, opens **the added / removed ratio of all projects** (#1682) the same way (see "The
  added / removed ratio of all projects").
- **"+ station"**, under the list of stations, opens the pairing code field — nowhere
  else on the home. Once paired, the station appears in the list and the field closes, with no
  message left on display; "cancel" closes it, empty.
- **A station registered under your GitHub account** is in the same list (#1778): **each computer once**. A
  paired machine is said by its presence, the projects chosen for it under the account merged in, and "choose
  projects" next to its row opens them, to tick; a machine that is only registered has its own row, which opens on
  them (#1706, see "Your stations under your GitHub account, and the projects each serves"). There is no second
  list, and no "Under your GitHub account" heading.
- **The health row**, at the bottom, sums up the Max connection and the access to GitHub. All is well: green
  and discreet, `Max ✓ · GitHub ✓`. When one of the two is off, it says in one sentence what is
  wrong: `Max: token to redo within 20 d`, `Max: connection lost on Mac`,
  `GitHub limits calls, back around 3:16 PM`, `GitHub: this computer is not signed in`. Not yet
  read: `Max ?`, `GitHub ?`, and hovering says why. It shows **no gauge of
  the account's consumption** (see the mockup, `docs/maquettes/app/README.md`).
- **No command** (`brigade …`, `gh …`) **and no raw error text** is displayed there: what
  a row leaves out — the time of the reading, why a box did not answer —, its hover says
  in the app's own words, and the project's space shows it in full.

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

*Tickets: #908 to #912, #1022.* **On the home, the "Cost" row opens the cost page of all projects**,
in place of the home, without opening any project — the **T** icon remains the entry shown, and "‹ All projects"
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

*Ticket: #1682 (epic #1663).* **On the home, under "Cost", a "Closer" row opens the page of the added / removed
ratio of every project**, in place of the home, like the cost page — "‹ All projects" brings you back. It reads
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
- **Its current ratio** is the one of its closer section on Cooks (see "The closer, on Cooks"): the longest window, in the words
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
this app's code is up to date with origin/v2 — read at 14:32:07, reread when you come back to the window
```

When its clone is behind the origin branch it follows, it says so as an alert, with
the number of commits, and what that means:

```
THIS APP'S CODE IS 39 COMMITS BEHIND origin/v2 — read at 14:32:07, reread when you come back to the window
  What this app shows may be out of date: what has been delivered since is not in it — a screen, an action, a reading.
  Its clone: /Users/chef/dev/brigade, on branch v2.
  One click updates it and relaunches it on the new version — no terminal, nothing to copy. Without a click, it moves to the new version at its next opening.
  It is also the clone of the project "brigade": its second reads the same code there.
[update and relaunch the app]
```

| On screen | What the app read | What it offers |
|---|---|---|
| `this app's code is up to date with origin/v2`, discreet | its clone has all the commits of the branch it follows | nothing |
| `THIS APP'S CODE IS 39 COMMITS BEHIND origin/v2`, in yellow, solid line | the origin has 39 commits its clone does not — the same number as `git status` after a `git fetch` | **a button**, "update and relaunch the app" — or, if its clone has commits of its own, the command `git -C <its clone> pull` to write in a shell |
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
  BEHIND origin/v2`. The other projects' clones are not read: their lag is
  the business of their repository.
- **The bar's T icon turns yellow** as long as one of these clones is behind or the app is
  to be relaunched: whatever the screen on display, its hover says what (`All projects — this app's code
  is 39 commits behind origin/v2`).
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

### The update prompt of the Android app (#1170)

At launch, the Android app checks the manifest of the latest release (`app/src/mise-a-jour/android.ts`). When that check returns an offer, the app puts a prompt at the very top of the window, above every screen: **"Version 1.5.0 is available"**, the release notes under it, and two buttons — **Update** (recommended) and **Not now**. *Update* hands the offer's `apkUrl` to the install step (`brigade.installerApk`); *Not now* closes the prompt, and it does not come back until the next launch. With no update — or a failed check — nothing is shown and the launch is unchanged. The desktop app never gets an offer: it updates itself (`miseAJour`). The view is `app/src/vue/mise-a-jour/invite.js`; the capture is `scripts/capture-ecran` screen `offre-apk` (`docs/captures/1170/`). The Android bridge (`app/android/web/pont.js`) does not yet run the check nor the install: until it does, the prompt is built and tested but nothing sends it an offer.

### The new-version download banner (#1528)

When a newer `app-v<version>` release is published, the app puts a banner at the very top of the window, above every screen: **"Version 1.5.0 available — Download"**. *Download* is a link to the package of this device itself — the `.dmg` on a Mac, the `.exe` installer on Windows, the `.apk` on Android —, never the releases page; a click opens it in the browser. On a Mac and on Windows, one line under it says how to open the unsigned build the first time: *right-click Brigade, then Open* on a Mac; *in SmartScreen, click More info, then Run anyway* on Windows. Android has no such line. The **×** at the right dismisses the banner for this version only: the dismissed version is kept next to the projects file (`version-ecartee.json`), so the banner stays hidden after a restart, and a still newer version brings it back. With the app on the latest version — or a failed check — there is no banner.

The check is `app/src/mise-a-jour/avis.ts` (#1527), run by the main process at launch and every six hours, only for the installed app on a Mac or on Windows: launched from the repository, the app updates through its clone and shows no banner. The bridge gives the view `avisDeVersion` and `surAvisDeVersion`, and the two gestures `telechargerVersion` (opens the link of the current notice, and only it) and `refuserVersion`. The view is `app/src/vue/mise-a-jour/bandeau.js`; its tests, against a mocked release list, are in `app/test/bandeau-mise-a-jour/`; the captures are the `scripts/capture-ecran` screens `nouvelle-version-mac`, `nouvelle-version-windows` and `telephone-nouvelle-version` (`docs/captures/1528/`). The Android bridge (`app/android/web/pont.js`) does not run the check yet: until it does, the banner is built and tested for Android but nothing sends it a notice there.

### Pairing the phone with your projects (#1161)

On a fresh install, **the Android app opens on one screen: "Link this phone to your projects"** — the rest of
the app stays behind it until the phone is paired. Under the title, one sentence: *Type the code your station
shows, or scan its QR.* Two fields, **your station's address** — on your tailnet `box.tail1234.ts.net`, the field's
example, reached in `https` without typing it (#1409); on the station's own network `192.168.1.20:7010`, with or
without `http://` — and the **pairing code** (`7KQ2-M9XD`, lowercase, spaces and dashes make no difference), then two buttons:
**pair** (recommended) and **scan the QR**. What a code is — fifteen minutes, one phone, once — and which address
reaches the station from where, are on hover over the "?" next to the title. A running station issues the code and its QR (`runtime/src/telephone/appairage-cli.ts`),
and listens for the phone on its phone desk (`BRIGADE_GUICHET_TELEPHONES`, `runtime/src/telephone/guichet.ts`) —
on the local network, or from any network through your tailnet (see "Reaching a station from any network" below).

- **Scanning** reads the station's QR with Google Play's code scanner — the app does not ask for the camera
  itself. The QR carries the code and the desk's address (`brigade://pair?code=…&url=…`): both fields fill in and
  the pairing leaves at once. Cancelled, nothing changes; unreadable, or not a station's QR, one line says so.
- **"pair"** sends the code to the desk (`POST /pairing`). The phone introduces itself under its model's name
  (`pixel-8`, its machine `Android 14 · Pixel 8`); if a station that cooks already has that name, it tries once
  more as `pixel-8-phone`. While it waits, the line under the buttons says *Waiting for your station at
  192.168.1.20:7010…* and both buttons are inactive.
- **Paired**: the app goes to "All projects", with one line at the top — *This phone is paired with
  `atelier`.* The phone keeps its token in the app's storage, the view never sees it; at the next launch it opens
  straight on "All projects". Uninstalling the app forgets the pairing.
- **Refused**, one line under the buttons, what the station answered on hover, the fields kept as typed:
  *Wrong code: check it on your station, then type it again.* — *This code has expired: ask your station for a new
  one.* — *This code was already used: ask your station for a new one.* — *Too many wrong codes: wait a few
  minutes, then try again.* Nothing is paired, and the chef types again.
- **Unreachable** — the line names what the phone cannot reach, in one sentence; what the network said, and what to
  check, on hover. The fields stay as typed, both buttons work again, and the screen never stays blank (#1409):
  - nothing answers at a tailnet address (`.ts.net`, or `100.64.0.0/10`) — on mobile data, most often the Tailscale
    app is off on the phone: *This phone cannot reach box.tail1234.ts.net on your tailnet.* — on hover, to check that
    Tailscale is on and signed in on the phone, and that the station's machine is on;
  - nothing answers at another address: *This phone cannot reach your station at 192.168.1.20:7010.* — on hover, to
    check that the station is running when on its network, and that from any other network its QR must carry its
    tailnet address;
  - the address answers, but no phone desk behind it — `tailscale serve` answers `502` when the station is stopped or
    has no desk (the bridge reads `502`, `503` and `504` as `sans-guichet`): *box.tail1234.ts.net answers, but the
    station's phone desk behind it does not.*;
  - something else answers there (a `404`, a web page): *What answers at 192.168.1.20:7010 is not a station's phone
    desk.*

On the desktop, nothing of this is shown. The screen is `app/src/vue/telephone/appairage.js`; the Android bridge
that reaches the desk and keeps the token is `app/android/web/pont.js` (with `Pont.java` for the scanner); the
captures are the `telephone-*` screens of `scripts/capture-ecran` (`docs/captures/1161/`; the tailnet's,
`telephone-tailnet-injoignable` and `telephone-tailnet-sans-guichet`, in `docs/captures/1409/`). What the paired phone
then reads — every project of its station and each one's queue — is below (#1414).

**Each project's queue on the phone** (#1163) is the project's page of a narrow screen (see above): Rail — TODO
first, then On the rail, WAITING and Served, stacked — and Cooks — each station, its state and its running cooks.
It is the desktop's view, fed the same way: what it shows of a reading is what the desktop shows of the same reading,
and nothing on it scrolls sideways at phone width. Screens: `telephone-file`, `telephone-file-cooks` and
`telephone-file-merge` of `scripts/capture-ecran` (`docs/captures/1163/`). **The station's phone desk serves these
readings** (#1411), behind the paired phone's token — without it, `401`: `GET /projects`, every project of the
station's configuration in its order, each `served`, `refused` (with its `reason`) or `opening`; and
`GET /projects/<name>/queue`, `{"project", "repository", "facts", "status"}` — the very `facts` and `status` the desktop
reads for that project, read the same way at the same moment (`runtime/src/telephone/projets.ts`); `404` a project the
station does not have, `503` a log it cannot read, with what the command would say.

**The paired phone reads them** (#1414). The Android bridge reads `GET /projects` and each project's `queue` with its
token, every 30 s and whenever the view asks (opening a project, "All projects", *try again now*). It does with them
what the desktop's main process does with its readings: the same modules of `app/src/` — `facts` through `tenirFaits`,
`status` through `mettreAPart` and `attendre`, the alert band and the lines of "All projects" — so a queue on the phone
shows the cards the desktop shows of it at the same moment. That reading is `app/android/web/lecture.ts`; the APK build
lays it, and what it imports from `app/src/`, next to the view without their types (`www/android/lecture.js`,
`www/src/*.js`, Node's own modules replaced by inert ones), and the bridge loads it at its first reading. None of those
modules may read a Node global when it loads — the WebView has no `process` —, which `app/test/packaging/android.test.ts`
checks by loading the laid reading in a Node without one. "All projects"
lists every project of the station in its order, one line each; the last list read is kept, so a relaunched app shows
it before reading again. Above the lines, the Projects section says in one sentence what the list lacks, and nothing
when it was just read: *atelier's projects: first read in progress…*; *atelier serves no project yet: a project is
added from a computer.*; or what cannot be reached, said as at pairing — *This phone cannot reach your station at
192.168.1.20:7010.*, *This phone cannot reach box.tail1234.ts.net on your tailnet.*, *box.tail1234.ts.net answers, but
the station's phone desk behind it does not.*, *What answers at … is not a station's phone desk.* — what the network
said on hover, with *This phone tries again every 30 s.* The projects already known stay under it, each line `station
unreachable`, and an opened queue says *the rail is not drawn — tried at …* and, under it, *the station did not answer*,
what the network said on hover — no GitHub list, which the phone does not read, and no panel on the right, which it
does not have. A station that no longer knows the phone (`401`:
revoked, or paired again elsewhere) says *atelier no longer knows this phone: pair it again.*, with a **pair again**
button that forgets the pairing and reopens the pairing screen. Screens: `telephone-projets*` of `scripts/capture-ecran`
(`docs/captures/1414/`), whose readings are those `lecture.ts` sends for a fixed phone desk.

**The queue's gestures on the phone** (#1164) are the desktop's: a TODO card opens its sheet, and its buttons —
`merge the PR`, `remove from the rail`, `back to the kitchen`, the recommended one first and in the accent color —
call the same bridge action, `gesteDeFiche` (the project, the gesture, the ticket — never a command), confirmed
first when they cost; on Cooks, each station's `stop cooking` or `start cooking` calls `cuireSurLaStation`. A phone
has no second to write a command into: there, `gesteDeFiche` answers like `cuireSurLaStation`, `{ fait }` — what
the station did — or `{ refus }`, each with the station's answer in `detail` (`app/src/vue/pont.d.ts`). The sheet
says it in one line under its buttons, the station's answer on hover, and the box is read again at once: the card
leaves TODO with that reading (a merged ticket moves to Served, a removed one leaves the rail). While the answer has
not come, the line says `merge the PR: sent, waiting for the answer…` and the sheet's buttons are inactive —
nothing goes twice. A refusal, or a bridge that fails or carries nothing (`nothing was sent — nothing was changed`, the reason on
hover), does not read the box again: the queue stays as it was, and the gesture can be played again. On a
narrow desktop window, where a gesture still goes into the second, the sheet says `sent to the second: its answer
is in the Second tab`. Screens: `telephone-gestes-*` of `scripts/capture-ecran` (`docs/captures/1164/`).

**The paired phone plays them at its station** (#1420). The station's phone desk takes `POST
/projects/<name>/gestures` (#1412), behind the phone's token — `{"gesture": "merge" | "remove" | "back-to-kitchen",
"ticket"}`: `merge` and `remove` run the box command for the same button (`rail merge`, `rail remove`), and
`back-to-kitchen` plays on the project's log the action the box plays for `/brigade arrived #<n>` posted on the Kitchen
board, which is how the desktop sends it — so the desktop reads the change at its next reading. On the phone, a card's sheet offers the gestures that desk carries,
and only those — `merge the PR`, `remove from the rail`, `back to the kitchen`, chosen and ordered by the desktop's table
(`gestes-fiche.ts`); opening the issue or the PR, asking the second and changing the priority are not offered there.
The Android bridge's reading (`app/android/web/lecture.ts`) sends the gesture with the token, waits up to 130 s for the
answer (a merge waits for GitHub; the station gives the command 120 s), and answers the view with one sentence: what the
command said, `{ fait }` — and the view reads the station again, the card moving with that reading — or why it was not
done, `{ refus }`: the command's own sentence when it refused (`409`); *atelier could not be reached: nothing was
changed*; *atelier's phone desk does not answer: nothing was changed* (a `502` from `tailscale serve`); *atelier no
longer knows this phone: pair it again* (`401`); and, when the answer never came, *atelier did not answer: the next
read shows whether it went through* — the station is read again at once, as it is when the station says its command
gave no verdict (`502`). What ran and
what it wrote, or what the network said, is on hover; a refused card stays where it was. Screens:
`telephone-projets-gestes*` of `scripts/capture-ecran` (`docs/captures/1420/`).

**Talking to a project's second from the phone** (#1165): on a phone, the Second tab has no terminal and no shell —
no pty runs there —, it holds **the conversation with the second, as messages**: what you wrote to it, from the phone
or from your computer, on the right; what the second answered, on the left, its markdown rendered as in an issue's
discussion; oldest first, the list scrolling on its own. At the top, one line — *Write to parade's second: it answers
here.* —, and on hover that it is the same conversation as your computer's Second. At the bottom, always in view, the
message field and **send**, the recommended gesture, inactive while the field is empty; its price is on hover (the
second's reply is spent on your Max quota).

- **send** calls `envoyerAuSecond` (the project, the text as typed): the message goes into the same conversation as
  the desktop's second, as if typed in its terminal, and the bridge answers with the conversation that carries it — it
  appears, the field empties, and *the second is answering…* closes the list until the reply comes. While the answer
  has not come, *sending to the second…*, and the field and send are inactive: nothing goes twice.
- **The reply**, and anything typed on the desktop into that second, come back by `surConversation`: the list is
  posed again, never the field — what you are typing is not lost, and each project keeps its own draft.
- **Not sent**: one line under the list — the bridge's sentence, or *your message was not sent* —, what the station
  said on hover; the text stays in the field, and send can be played again.
- **A conversation that cannot be read** says why in one sentence — the bridge's (#1426), or *conversation unavailable*
  from a bridge that does not carry it —, what the station or the network said on hover, with **read again**, and no
  field. Choosing the Second tab again re-reads it; a re-read that fails keeps what was shown, and says so under it
  until a read succeeds.
- **A second that failed answering** (its quota spent, `claude` stopped) says so in one line under the conversation —
  the station's sentence, what `claude` wrote on hover —; the field stays, and the next message is sent as usual.

On the desktop, nothing changes: the Second tab of a narrow window is still the second's terminal. The screen is
`app/src/vue/telephone/conversation.js`; the bridge actions are `conversation`, `envoyerAuSecond`, `surConversation`
and `ouvrirLienDuSecond` (`app/src/vue/pont.d.ts`, optional: only a phone's bridge carries them). Screens:
`telephone-second*` of `scripts/capture-ecran` (`docs/captures/1165/`). **The station's phone desk serves the
conversation** (#1413), behind the paired phone's token — without it, `401`, and nothing is read or sent:
`GET /projects/<name>/second`, `{"project", "session", "messages": [{"from": "chef" | "second", "at", "text"}, …]}`,
oldest first (the latest 200, `omitted` counting the earlier ones), with `answering` while the second is answering a
message sent from the phone and `failed` (`said`, `detail`) when it failed doing so; and `POST /projects/<name>/second`
`{"text"}`, `202` once the message is in the conversation, `409` while the second still answers the previous one,
`502` a second that did not take it (`claude` missing, a failure such as the quota), each with its one-sentence `said`;
`404` a project the station does not have, `503` a conversation it does not hold or cannot read. It is the desktop
second's conversation: the latest Claude Code session of the folder where that second runs — the one
`claude --continue` resumes —, read by the module the desktop can read it with (`runtime/src/second/conversation.ts`,
also `node runtime/src/second/conversation.ts <folder>`), and a message goes into it by `claude --continue -p` in that
folder (`runtime/src/telephone/second.ts`). The station knows that folder from the project's line,
`BRIGADE_SECOND_DIR=<folder>`, and reads it under its own account's Claude Code configuration — the second must run on
the station's machine, under its account. A desktop terminal already open does not redraw what the phone wrote: it
shows it when it resumes the session. The desktop app does not write `BRIGADE_SECOND_DIR` on the line yet: until it
does, or the line is written by hand, the Second tab of the phone says *atelier cannot reach parade's second*.

**The Android bridge carries the conversation** (#1426): `conversation` reads `GET /projects/<name>/second` with the
phone's token, each message's markdown rendered by `app/src/markdown.ts`; `envoyerAuSecond` posts `{"text"}` (it waits
up to 130 s for the station to put the message in, as for a card's gesture), and answers with the conversation that
carries it. While the second answers (`answering`), the conversation is read again every three seconds
(`PAS_DE_LA_REPONSE_MS`) and the reply is pushed to the view by `surConversation`; a conversation the phone has read is
also read again with the station, every thirty seconds, so what the chef types on the desktop reaches the phone. The
reading is `app/android/web/lecture.ts`; a link in the second's message opens in the phone's browser (`Pont.java`,
`ouvrir`). What does not go through is said in one sentence, the detail on hover: *atelier could not be reached*,
*atelier did not answer*, *atelier's phone desk does not answer*, *atelier no longer knows this phone: pair it again*,
*atelier cannot reach parade's second* (`503`: the station does not hold that second, or cannot read it); for a message,
the same followed by *your message was not sent*, or the station's own sentence — the second still answering the
previous one (`409`), a second that did not take it (`502`). A message whose answer never came says *atelier did not
answer: the conversation shows whether your message went through*, and the conversation is read again at once.
Screens: `telephone-projets-second*` of `scripts/capture-ecran` (`docs/captures/1426/`).

### Pairing a phone from the desktop: “pair a phone” on a station's line (#1598)

**On the home screen, each station that cooks has a "pair a phone" button at the end of its line** — a paired phone,
which does not cook, has none, and neither has the Android app. The line keeps its click (it opens the station's page);
the button opens, in place of the home, the screen **"Pair a phone with box"**, and "‹ All projects" takes you back.

- **A fresh code at once**: the screen issues one on opening, and shows it with its QR and the time it is still valid
  for, counting down second by second (`valid for 14:32`), then the station's address the phone types it with
  (`box.tail1234.ts.net`). One sentence on top says what to do: *Scan this QR with the Brigade app on your phone, or
  type its code there.* What a code is (fifteen minutes, one phone, once) is on hover over the "?" next to the title.
  The QR is drawn by the app itself (`app/src/vue/qr.js`), from what the station returns — the format of
  `runtime/src/telephone/appairage.ts` (`contenuDuQr`), carried as is: no QR service is called.
- **Expired or used**: past its fifteen minutes, or when the station says a phone used it (the screen asks it every
  five seconds while the code is valid), the QR and the code disappear, one line says so — *This code has expired:
  nobody can pair with it any more.*, *This code was used: pixel-9 is now paired.* — and one click on **"new code"**
  shows a fresh code and its QR. A used code also reads the list again: the new phone appears in it.
- **The phones paired with the station** are listed under the code, one line each — its name, its machine, when it was
  paired on hover — with **"revoke"**. Revoking is confirmed, with its price in one line (*galaxy can no longer reach
  box, from any network; pairing it again takes a new code*); revoked, the phone leaves the list.
- **Unreachable, or refused**: the screen never shows a blank code. One line replaces it — *box did not answer: it may
  be off, or offline.*, *box refused: this computer is not allowed to manage its phones.*, *box cannot pair phones
  yet: its version is too old.* — with what to check on hover, and **"try again"**; the list says *paired phones
  unavailable* the same way.
- **No command anywhere**, not even on hover: no terminal, no `ssh`, no `sudo` to type or read. Behind the screen, the
  app runs the station's command `phones code | status <code> | list | revoke <phone>` (`runtime/src/telephones.ts`,
  #1596) — on the station's machine through `ssh`, or here, without `ssh`, for this computer's station — in the name of
  the first project the station carries; a station that carries none yet says so. The station's own rule is what lets
  this computer in. The module is `app/src/telephones-de-station.ts`, the screen `app/src/vue/telephones-de-station.js`;
  captures in `docs/captures/1598/`.

### Reaching a station from any network: your tailnet (#1408)

**The phone reaches a station's phone desk through your tailnet** — the private network that
[Tailscale](https://tailscale.com) weaves between your own devices, over WireGuard. It is the chosen mechanism because:

- it is a standard tool, not a relay of ours to host and keep up;
- it crosses home routers and mobile data alike: the phone on 4G reaches the remote box and the computer at home, with
  no port opened on either;
- it is encrypted end to end, and **only your own devices**, signed in to your tailnet, reach the desk at all — the
  pairing code and the phone's token still guard it, exactly as on the local network;
- on the phone it is an app from Google Play: **no terminal on the phone**.

**How it is wired.** The desk keeps listening on the station's loopback (`127.0.0.1`); `tailscale serve` publishes it
on the tailnet, in HTTPS, under the machine's name (`https://box.tail1234.ts.net`). On the box this matters: the
station's unit reaches nothing but the loopback (`IPAddressAllow=localhost` in `brigade-station.service`), and
tailscaled, outside it, receives the phone and hands the request to the desk on the loopback — nothing in the unit
is reopened. Whatever comes through `serve` arrives from the loopback: that is why the desk never issues a code
itself, and judges every request by the code and the token alone. The pairing command finds the published address on
its own (`runtime/src/telephone/tailnet.ts`) and puts it in the QR.

**What you do, once per station — here, the remote box** (over your usual `ssh <box>`):

1. Install Tailscale and join your tailnet: `curl -fsSL https://tailscale.com/install.sh | sh`, then
   `sudo tailscale up` — it prints a link: open it on your computer and sign in. In the Tailscale admin console (DNS
   page), MagicDNS and HTTPS certificates must be on: `serve` needs them to publish in HTTPS.
2. Give the station a phone desk on its loopback: `sudo systemctl edit brigade-station`, add

   ```
   [Service]
   Environment=BRIGADE_GUICHET_TELEPHONES=127.0.0.1:7010
   ```

   then `sudo systemctl restart brigade-station`. Its journal says `guichet des téléphones à l'écoute sur
   127.0.0.1:7010`. Any free port does; 7010 is an example.
3. Publish it on the tailnet: `sudo tailscale serve --bg 7010`. `tailscale serve status` then shows
   `https://box.tail1234.ts.net (tailnet only)` proxying to `http://127.0.0.1:7010`; it survives reboots. **Not
   `tailscale funnel`**: Funnel opens the desk to the whole internet, not only to your devices — the pairing command
   says so if it finds it.
4. Issue a pairing code, as the station's account (its registry is in `/home/brigade/.local/state/brigade`):
   `sudo -u brigade -H /usr/lib/brigade-station/node/bin/node /usr/lib/brigade-station/runtime/src/telephone/appairage-cli.ts code`.
   With no `--url`, it asks `tailscale serve status --json` where the desk is published, and the QR carries that
   address (`brigade://pair?code=…&url=https://box.tail1234.ts.net`, also `url` in its JSON). Its last line says from
   where the phone reaches the desk: *from any network, through your tailnet* — or, not published, that only this
   machine reaches it and the `tailscale serve` to run; a desk listening on a local-network address gives that
   address, *from this network only*. `BRIGADE_TAILSCALE_BIN` names another `tailscale` than the one in the `PATH`.

**On the phone**, once: install **Tailscale** from Google Play and sign in with the same account. Then, on mobile data
or any Wi-Fi, scan the station's QR — or type `https://box.tail1234.ts.net` as the station's address with the code.
A station on your computer works the same way: the Tailscale app, the same `BRIGADE_GUICHET_TELEPHONES` in its
environment, `tailscale serve --bg 7010`.

**A lost phone is revoked** from the desktop: on the station's "pair a phone" screen, its line in the list of paired
phones, with **"revoke"** (see "Pairing a phone from the desktop" above). Its token opens nothing any more, from any
network, and it leaves the stations list. Paired again, it needs a new code.

The Android app pairs through the tailnet and says what it cannot reach there (#1409, "Pairing the phone with
your projects" above). The tests stand a relay in for tailscaled (`runtime/test/telephone/tailnet.test.ts`):
no test mounts a real tailnet.

### Your stations: paired with a code, read on GitHub

**On the home screen**, the "Stations" list shows the ones you have paired, one line each —
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

**A click on its line opens the station's page**: at the top, its name, its dot and its state in
one sentence (#877); below, its faults with their button, the projects the app added to it and the
"add a project" flow (see "Add a project to your stations, without a terminal").
Under the header (#1081): the station's cap on cooks and where it comes from (`3 at most — 8 cores`, read from
`status`), what holds tickets back when it is saturated (memory, processor, value and threshold), a field
and "set the cap" to set it, "back to the default" to remove it. The setting runs `station cooks <N|0|auto>`
on the box of every project that names the station — it applies to all the stations of those projects.
#1292: the same cap is on each station's line in the Cooks tab, **for that project alone** — `Cooks at once: 3 at most — 8 cores`,
a field and "set the cap", and "back to the default" when the chef set it. The setting goes to the box of that project only
(`reglerLePlafond(station, valeur, projet)`). When the station is saturated, one sentence says what holds it (`Saturated on CPU —
load of 19.4 for at most 12`) and that lowering the cap makes the project run fewer cooks, the machine's load not dropping right away.
"‹ All projects" takes you back to the home screen, like the **T** square.

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

**When it breaks**, its line on the home screen says so in one word (`update failed`, `Max connection lost`),
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
the station leaves the home screen and is no longer read, it keeps running, and a new code pairs it
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
publishes the reason key and the gesture (`raison`, `geste` of `secondaires` in its tracking,
`runtime/src/projets/secondaires.ts`: `arretee`, `muette`, `gist-illisible`); the line reads "not reached" with
**check again**, the gesture on hover.

### Your stations under your GitHub account, and the projects each serves (#1706)

A station installed on one of your machines, its `gh` signed in to your GitHub account, registers itself under that
account (`runtime/src/enregistrement-station/README.md`, #1705): no code to pair. **On the home screen, they are in
the list of stations** (#1778), read each time the home opens — **one row per computer**:

```
● macbook-air-de-benoit  online · idle · benomite/brigade        ›   pair a phone
● nas                    online · no project chosen yet           ›
● parade-box             online · idle · brigade, calculus-workspace, espace, …     ›   pair a phone
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
  last sign of life are on hover. Dot green and full when online, grey ring when not.
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
- **A repository another station already serves** (#1790, epic #1785): the ticked station does not open a second
  kitchen — it joins the one that runs, or refuses in one sentence (`runtime/src/projets/rejoindre.ts`), and says
  which in its tracking (`brigade-projets-suivi.json` of the same gist, `rejoindre`). The app reads it there with the
  account's stations (`avecLeursAjouts`, `app/src/stations-du-compte.ts`; one more read per station that has a
  selection). Just ticked, the box says "asked: the station answers within a minute", and the account's stations are
  read again every 15 s (8 times at most) until the station has answered. Joined, the box says "cooks in box's
  kitchen", and the project's page lists the computer under "Its stations" and on its first line as one more cooking
  station — the station that serves it stays the main one, and nothing says the kitchen runs on this computer.
  Refused, the box says "refused" and the runtime's sentence is under the boxes, whole; the project's page keeps its
  stations, with "<station> was not added: <sentence>" under its first line.
- **An offline station stays editable**: one line says it serves these projects once it is back.
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
  reads it and types it for you, through the same gesture as "+ station" on the home screen. The machine appears
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
- What the station says is written as is in the terminal that started the app, like its service log
  on a server. It is run by the `node` of `npm start` (`BRIGADE_NODE_BIN` to give
  another): Electron is not one. **The installed app** (the `.dmg`) runs the runtime and the
  `node` of its package, never those of the machine (`app/src/emplacements.ts`).

**On a phone, the app is a workstation**: it drives, it does not cook. Its station is not started there,
and no project cooks there — neither its own, nor the stations its projects hand to the
workstation ("The workstation is a station"). This is the only place where the platform matters
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

- **At the top, a sentence says what you are doing**: `Choose the machine that runs <projet>'s kitchen.`,
  then what that machine does — it runs the manager and the pass, and it cooks — and that
  everything is already set to what is recommended: you change what you want, or you launch as is.
- **The main machine first**, a simple choice among your paired stations. Each says what
  choosing it implies: `always on: it keeps cooking while your computer sleeps` for a
  server, `stops when you close the app on this computer` for the app on a Mac or a PC. **The
  server station is chosen by default**, marked `recommended`; with no server, the first readable
  machine.
- **Then the other stations, optional** (`Other stations · optional`): one checkbox per other station.
  Every station cooks; only the main one runs the manager and the pass.
- **The number of cooks at a time comes preset**, drawn from the main station's cores — those the station
  publishes in its gist (`coeurs`, [docs/runtime/](runtime/station-machine.md)) —, by the very rule
  the station applies: `max(1, ⌊(cores − 2) / 2⌋)`, 3 for 8 cores. Below:
  `recommended — from <station>'s 8 cores: …`. A station that does not publish its cores yet: 2,
  and the line says so. Choosing another main station makes the number follow, as long as you have not typed it.
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
(`· macbook (second station)`) — and, under that line, `The first station keeps the manager and the pass;
all the stations cook.` A station added from the app counts as a *second station* only once it serves the project (it has read the request and calls itself secondary); until then its line carries no rank but says where it is stuck in a few words — `not received by the station`, `waiting for your authorization on GitHub`, `refused`, `being prepared` — with `check again` (reads GitHub again) and, on hover, what to do (#1774). **"+ station"** opens the same card, about the added machine only (#1307):
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
the repository. The button is on the Cooks tab too (#1271): the same card, the same steps; once the request is written, the app re-reads the box at once, so the new station's block appears on the tab without reloading. **It has the same effect as ticking the project on the station's page** (#1830): the station joins the kitchen that runs and takes the tickets it can cook — a ticket only that computer can cook leaves for it on its own; there is no second gesture (`runtime/src/projets/tenir.ts`, `rejoindre.ts`). **A value nobody says** — neither the first
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
plays for the project, else the first the project declares — with the capability the need calls already checked, in
addition to what the station provides (`browser` → `navigateur-headless`, `postgres` → `postgres`, …: the first
capability the runtime gives the need, `CAPACITE_DU_BESOIN` in `app/src/vue/stations-declarees.js`). Save writes it like
any other edit, and the capability shows on the station's row; the card stays until the station publishes the choice as
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
- **Read and driven here, with no `ssh` and no `hote`.** A project that cooks on this computer is read and driven
  by this workstation's station: its rail, its queue and its cards come from it, not from a box, and
  the app launches no `ssh` for it. It therefore needs no `hote`: a project written by hand
  without `hote` is read here as soon as its kitchen runs on this Mac. The source follows the kitchen: when
  it moves — to this Mac, or off it —, the reading changes source with it, without
  restarting the app, and the line always says where the project cooks at that moment.
- **This computer's station stopped: a line, not an empty page** (#1124). A project that cooks
  here has nothing to read while this computer's station is not running (refused, stopped, between
  its death and its restart): **`this computer's station is not running`** takes the place of the rail, the
  queue and the cards, and that is all. As soon as the station runs, the line gives way to the rail at
  the next read, without restarting the app. A project served by a box never carries it.
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
  stations: it is the app's request that the operation rewrites. A project written by hand with
  `hote`, or served by a station without the app having asked it, has none — the operation would
  refuse it (`add it rather than move it`). An app with no runtime next to it (a phone) launches
  none, and says so.
- **What it keeps from the runtime**: a move in progress is written in each station's request
  (`remise`, `reprise`); the app re-reads them and rewrites them as they are when it rewrites those
  requests (handing over, removing another project), otherwise it would be no more than a change of
  main station.
## A box reading: seven states

At the top of a project's space panel, the reading of its box is in **one of seven states**, which do not look alike:

| On screen | What the app got | What it shows below |
|---|---|---|
| `drivable — read at 14:32:07` | the commands succeeded | their outputs. **A project where nothing is happening is here**: a quiet `status`, not an error |
| `REACHED, BUT NO LONGER DRIVABLE — attempt at …`, in yellow, dotted line | `ssh` reached the box, and a command failed there (a code other than 255) or returned nothing within thirty seconds (`ssh`, connected, stopped at the timeout) | the command that ran, what it wrote, its code — then **the action**: update the runtime on its box (`docs/runtime/exploitation.md`, "Piloter") |
| `REACHED, BUT UNKNOWN TO THE BOX — attempt at …`, in yellow, solid line | `ssh` reached the box, and its action refused the project (code 65): it serves no project under that name | **what the action said about it**, as is — then the name the app gave it, and where it comes from (`nom`, in `app.json`) |
| `REACHED, BUT WITHOUT THE ACTION'S RIGHT — attempt at …`, in yellow, solid line | `ssh` reached the box, and its action refused your account (code 68): it is not among those who may run it | **what the action said about it**, as is — then where the action that grants this right is written, on the box (`docs/installer.md`, "Add a human") |
| `REACHED, BUT A COMMAND IS MISSING ON THE BOX — attempt at …`, in yellow, solid line | `ssh` reached the box, and a command was not found there: the box's shell says so (code 127), or the action, for `sudo` (code 69) | **what the box said about it**, as is — then where these commands go (`docs/installer.md`, "Prepare the box") |
| `REACHED, BUT THE BOX'S NODE DOES NOT SUIT THE RUNTIME — attempt at …`, in yellow, solid line | `ssh` reached the box, and its action refused to start the runtime (code 70): `node` does not start there in the unit's environment, or is not the required version | **what the action said about it**, as is — then where `node` goes (`docs/installer.md`, "Prepare the box"). No runtime update: it is not the runtime that is old |
| `NOT REACHED — attempt at …`, in red, solid line | nothing proves the box was reached: `ssh` itself failed (code 255), could not be launched, or was stopped at the timeout without saying how far it had gone | **`ssh`'s message**, as is, and its code — then where its sentences are explained (`docs/installer.md`, "Reach the box"), and where access is given when it is your key it refuses ("Add a human"). Or the timeout, stated by the app, with no pointer |

- **The app reports, it does not guess.** "No longer drivable" does not say *why* the command
  failed: a runtime too old for what it is asked is the expected case, and the update advice is
  given only there. What it got is in front of you. **The exit code only picks the header and the
  pointer**: 65, the project is unknown to the box; 68, you lack the action's right; 69 or 127, a
  command is missing on the box; 70, the box's `node` does not suit the runtime; any other code that comes from it, no longer
  drivable. The text below is never translated.
- **A reader without access reads it as such**, in two forms the app does not mistake for an
  outage. *Reached, without the action's right*: a state of its own (68). *Key refused*: `ssh` exits
  with 255, as for a box that cannot be found, and **only its message tells them apart** — the app
  does not read it. So it stays at `NOT REACHED`, shows what `ssh` wrote, and names where to read
  it. In both cases it says where the action that gives access is written, and does not replay it:
  it is played on the box.
- **"A command is missing" does not say which.** 127 is the box shell's code for any command not
  found: the action not installed (`brigade: command not found`) is the expected case, and
  it is the box that names it, above.
- **Code 255 is `ssh`'s.** A remote command that itself exited with 255 would be read as "not
  reached".
- **A silent project does not hold back the others**: each project is read for itself, every
  thirty seconds, and carries its own time.
- A project with no `hote` and no kitchen on this workstation has its panel too: `no reading`, and what it lacks — `hote`, the name
  by which your `ssh` reaches your box. No block to paste.
- A reading's commands go out **one after the other**, and the first one that fails is the
  error shown: each screen says what *its* commands returned.

## The icon bar

On the left, a column of tiles, Slack or Discord style:

| Tile | What it is |
|---|---|
| **T**, round, at the top | the "All projects" screen. **In yellow**: the app's code, or a brigade clone among your projects, is behind its origin — hovering says which, and by how much |
| one **monogram** per project, in the file's order | its space. Two characters drawn from the `nom`: the initials of its first two words (`brigade-site` → `BS`), or its first two letters if it has only one (`brigade` → `BR`) |
| **+**, dotted, at the bottom | add a project |

- **The full name is read on hover** over the tile, and **at the top of the space** once inside, to
  the left of the tabs.
- **Two projects can carry the same monogram** (`parade`, `partage`: `PA`). The app does not
  tell them apart: the name does, and the bar's order, which is your file's.
- **At each tile's corner, a dot: the project's kitchen state, read on its box** — not
  deduced. Green, `open`; yellow, `held`; red, `stopped` or `off`. The word is read on
  hover, after the name (`parade — stopped`). It is re-read every thirty seconds, for all
  projects, whatever the screen.
- **The shape tells the state before the color**: a dot has the shape of its tone — solid disc,
  green; diamond, yellow; square, red; triangle, blue; hollow ring, gray. The same goes for the
  driving line (`drivable` disc, `reached but no longer drivable` diamond, `not reached` square),
  the kitchen pill, the grants, the manager, and the `awaiting you` pill of the slips in Awaiting you.
  Each state's label stays text; nothing is read beyond what the box says.
- **A dot without a color is not a state**: empty, it is a word the app does not know
  (read on hover, as is); a `!`, the app
  read no fact from this project, and hovering says why (`no fact read — NOT REACHED`). A
  project with no `hote` and no kitchen on this workstation has no dot.
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

**The role exists only in the Second tab.** The role and the settings of the launch (`--settings`, the
hooks the app gives the second) are arguments of the command the tab runs, and nothing else: the app
writes nothing into the project's `.claude/`, nor into any file another session reads. A `claude` you
start yourself in the same folder is a plain Claude Code session, not a second.

**The queue is read for the second, at each start.** The launch settings carry a `SessionStart` hook
(`startup`, `resume`, `compact`): it runs `app/src/second/file.ts`, which reads
`ssh <hote> brigade <name> status` fresh and returns it to Claude Code as additional context, so the
second sees the queue after a start, a resume or a compaction without thinking of it. A queue that
cannot be read (box not reached, gesture refused, no answer in 30 s, no box declared) is said in that
context, in the words of the role, and the hook still exits 0: it never blocks the session. By hand:
`node app/src/second/file.ts <name> <host> [ssh]`.

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

**Each shell carries a banner, at the top of its terminal: where it is, with which account** —
`box parade-box · debian`, `this Mac · benoit`. For a remote machine, the account is the one
your `ssh` gives its name (`ssh -G`, nothing is reached); if it does not say, the banner writes
`account set by ssh`. Its color is the project's tab color: changing space changes it.

**A session that does not have the role is not called Second.** When the app opens a session on
another command (`/brigade:init`, to prime the repo), the second's tab is called **Claude**;
it becomes **Second** again if you relaunch it with one key, which launches it with the second's role.

- **`+ shell`** asks you **on which machine** to open a shell: **this workstation** (`this Mac`), the project's
  **box** (`box <hote>`), and **each station its box declares** (`station studio/claude`).
  A station the box runs at home is on the box, one your workstation plays is your
  workstation: they are named on their machine's line. The others — `remote` stations
  played by another machine — are reached by `ssh <machine>`, the machine being what precedes
  the slash in their name: it is under this name that your `ssh` must know it. The stations are those
  of the box's last check (every five minutes): before it, only this workstation and the box
  are offered. A project with no box has only this workstation: nothing to choose, the shell opens there.
- This shell is **persistent**: it lives in a `tmux` session (or `screen`, where `tmux` is missing)
  on the chosen machine, under your account — on a remote machine, the one your `ssh` gives
  it. It opens **on the right, next to the second**: it has its tab (`shell 1`, `shell 2 ·
  parade-box`…) and is shown in place of the second, which does not stop for all that. **A shell never
  replaces the second**: a click on the second's tab brings it back, with its conversation; a
  click on a shell's tab shows it again, as you left it. The terminal shown takes the
  keyboard. As many shells as you want.
- **Closing the app does not close your shells**: it detaches from them. On reopening, the first click
  on the project brings them back, reattached to their session — the command you had launched there is
  still running, and what it had displayed is there. The app remembers them in `shells.json`, next to the
  projects file.
- **`close shell 1`**, at the end of the row, closes the shown shell **for good**: its tab
  goes away, its session is destroyed on its machine, and it does not come back. If the machine does not answer,
  the shell is closed anyway, and the line under the tabs says its session stays there. A shell
  you leave (`exit`) also closes its tab, and the second takes its place back.
- **A machine that is no longer reachable does not make its shell disappear.** Network lost,
  machine off, workstation asleep: when the connection drops — `ssh` gives up on a machine that does not
  answer at opening after ten seconds, and on an established connection that stops answering
  after thirty —, the shell stays in place, and its terminal says so, in yellow:
  ``[brigade] box parade-box is not reachable — session `brigade-parade-1` stays there, and this
  shell reattaches to it by itself as soon as the machine answers (a keypress tries now)``. Its
  banner says so too (`box parade-box · debian — not reachable`). **Its session holds, over there**:
  the app does not destroy it, and remembers it.
  - **It reconnects by itself.** The app asks the machine whether it answers — `ssh -o BatchMode=yes
    -o ConnectTimeout=10 -- <hote> true`, which launches nothing and asks nothing —, after 2 s,
    then 5, 10, 20, and every 30 s as long as it does not answer; the line under the tabs says
    where it stands, with what `ssh` answered (`attempt 3: ssh: connect to host parade-box port
    22: Network is unreachable`). As soon as it answers, the shell reattaches to its session (`answers
    again — reattaching…`): the command you had launched there is still running, and what it
    displayed is there.
  - **A keypress tries right away**, without waiting for the next probe: it is the reattachment
    itself, in the terminal — an `ssh` that wants a password asks you for it there. The keypress
    itself is not sent. Still unreachable, the terminal says so again, and the app resumes its probes.
  - **When the workstation wakes**, each remote shell reattaches to its session at once (`this Mac woke
    up — reattaching…`), without waiting for `ssh` to find out that the connection from before the sleep is
    dead. If the network has not come back yet, the terminal says the machine is unreachable, and the
    reconnection happens by itself when it returns.
  - A machine that rebooted no longer has the session: the reattachment opens a new, empty one.
    This workstation's shells and the second have no connection to lose: none of this touches them.
- The shell that an action opens to write its command in (a `sudo systemctl …`, a `git pull`) is,
  for its part, a login shell of this workstation, in the project's folder: it ends with the app.
- **Changing project interrupts nothing.** Each space keeps its terminals, their content, the
  page and the terminal where you left it: the terminals belong to the app, not to what is
  displayed. Coming back to a project gives you back its second — or the shell you were looking at — as it was.
- A project's second starts only at the first click on that project.
- A project whose folder is not there has no second: its column says why, in its place.

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

- **What stays on the device never goes to the gist**: a project's folder (`dossier`), its ssh host
  (`hote`), the boxes you declared (`hotes`), the stations this computer plays and its ordinary-ticket
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

**Settings holds only what you can set, grouped by level** (#1700, epic #1698). It is one page, with no sub-page and no
navigation of its own, in three groups, each a card titled by the word of its level (`app/src/vue/niveaux.js`), where
it is kept on hover:

| Group | Its settings |
|---|---|
| **project** | the project's settings in its repository (below); one line per grant (`grant merge`…); the kitchen — `running` or `stopped`, with `stop the kitchen…` or the gesture that resumes it |
| **this machine** | the ordinary tickets on this computer — `taken` or `not taken`, a checkbox — and `cooks at once`, a number (a Mac only: off a Mac the group says `nothing to set on <this computer> for this project`); the app's code, and each brigade clone, in one sentence with its one button when it has one |
| **you** | the project's two colors — `tab, in the bar` and `accent, in the space`, the color's name, the palette —, and `in your app`: `Remove from the app…`, which asks for a `yes` first |

**Every setting is one line**, the same everywhere: its name, its value in force, and **one** control to change it — a
field and `propose`, a switch, a checkbox, a number, a palette, a button. What the control opened or returned — a
confirmation, a refusal — is laid under the value. Nothing else is laid in Settings: no statistic, no history, no reading's
text, no explanatory paragraph — what a setting implies is on hover of its value. A group with nothing to set says so in
one line.

**Grants are one line each**: `grant <action>`, its state in one word with its dot and, when it has one, the remaining
duration (`6 h left`) — since when, by whom, until when, on hover — and a switch, `merge on` / `merge off`. Clicking it
opens the confirmation of `grant-activer` or `grant-revoquer`, which says what the grant changes: nothing goes before
your "yes". Settings reads `grant` on the station for that (`grants.ts`), every thirty seconds while it is shown;
unread, each grant named by the doc still has its line, its switch muted and the reason on hover. Its latest uses, its
latest actions, what no grant allows and the deliveries stopped for lack of a grant are no longer shown.

**Removed from Settings** (#1700): the General, Rail and Manager pages and their navigation — Rail and Manager have no
route left (`app/src/onglets.ts`); the installation guide and **the installation check** — the `check the installation`
button in the space's header, the verdict at the top of Settings —: the app only needs a GitHub connection (#1692), and
installing a station is a separate topic (#1536); uninstalling the project from its station (`See what the station would
remove`, `Uninstall from the station`); `where the rail's data comes from`; and the project's `status`, as the station
renders it. **Reliability and Closer are no longer there either** (#1699): they are sections of the Cooks tab (see "The
cooks' reliability, on Cooks" and "The closer, on Cooks"). **Cooks** is no longer there (#1184): it is the space's Cooks
tab, which relays `station`, read on the box of the single project shown, at the bottom of the tab — folded behind its
line (#1456), with no button: the cap on cooks is set on each station's line; it is read only while the tab is shown.
An alert-band line whose cause is fixed there leads to it in one click; the grant line that is not verified opens
Settings. **The log (Log) has no tab**: the "log" button, next to the tabs, opens the end of the log over the rail;
clicking it again closes it.

**The project's settings, changed by a pull request** (#1309, epic #1301). At the top of Settings, in its **project** group,
one row per project setting: the integration branch, the manager's and the reviewer's
default calibrations, the calibration ceiling, and the closer's four settings (#1685) — its calibration, its start
threshold (`cooksBelow`), its tokens cap and its removed-lines cap. Each row says the value in force and where it comes from — `from the
repository` (`.claude/brigade/projet.json`), `set on the station`, `from CLAUDE.md`, `default` — and has its edit control —
a text field for the branch and for a closer's number, a model and an effort for a calibration — and `propose`, enabled once the value differs. They
are read when the project opens, by the runtime's `setting` where its kitchen runs. `propose` plays `setting ceiling
<model> <effort>` (or `manager`, `reviewer`, `closer`, `closer-cooks <n>`, `closer-tokens <n>`, `closer-lines <n>`,
`branch <name>`) there: the runtime checks the value against the settings writer — the check the file itself passes, so
a value the file would refuse (a closer's `0`, a branch git would refuse, a path) is refused there, before any request
and any pull request —, opens a pull request on the project's repository and hands it to the pass, which holds it for you. The button
says `proposing…` until the runtime has answered. Opened, the row says `<value> proposed as a pull request — it applies
once merged`, with a `pull request #<n>` button that opens it; refused — a value that belongs to the machine, a change
the repository already carries —, the runtime's sentence is said next to the field, its detail on hover, and the field
goes back to the value in force. **The value shown never changes on a proposal**: it is the one in force, until the pull
request is merged. Nothing is saved on the box. The app itself refuses only what does not write as the command's words
(a branch name with a blank, a closer's number that is not digits: `nothing was sent: this value is a whole number,
written in digits`), all of which the file would refuse too. A runtime that does not have `setting` yet says `settings
unavailable` in one line, the detail on hover; one from before #1685, which does not give the closer's settings, shows
the first four rows only. The modules are `app/src/reglages-du-projet.ts` and `app/src/vue/projet/reglages.js`;
the command, `runtime/src/reglage-cli.ts`.

**The drawn rail is at the center of the space, shared between its two tabs** (see "The rail"): On the
rail, Taken, Pass, TODO, WAITING and Served, all on Rail; Cooks shows no kanban column. **The space opens with no page**: the shown
tab has the whole center, over its full height. **A page opens over the rail**: it covers it entirely, without undoing it —
it stays laid underneath, and re-read, but nothing of it can be clicked through, and nothing of it — not even its sticky
column heads — shows through. Clicking the tab again closes the page, and **the rail comes back as you left it**,
scrolled where it was. The alert band, above, stays visible: no page covers it, nor do the terminals, on the right.

Two **content readings** remain, plus the one Settings makes. A reading relays **as text, word for word,** the output of
a runtime command (`docs/runtime/exploitation.md`, "Piloter"):

| Reading | The command the app runs on the box | What you read there |
|---|---|---|
| **Cooks** | `ssh <hote> brigade <nom> station`, then `ssh <hote> brigade <nom> measures --last <window> --by 1`, then `ssh <hote> brigade <nom> closing --json` | the station: the cooks, the machine, the quota — on the Cooks tab, not under Settings —, with **the reliability of the project's cooks** (see "The cooks' reliability, on Cooks") and **its closer** (see "The closer, on Cooks") as sections of that tab (#1699) |
| **Grants** | `ssh <hote> brigade <nom> grant` | nothing as text: Settings lays one line per grant from it (above) |
| **Log** | `ssh <hote> brigade <nom> log --last 200` | the end of the log: the last 200 events, not the whole log — the line under the tabs says so |

- **Only the displayed reading is read**: its command goes out when you open it, then every thirty
  seconds as long as it is on screen. Changing it, closing it or leaving the space stops its
  reading. With no page open, the app therefore runs only `status` for this project; with
  one, `status` and the page's command (Cooks runs three, one after the other: `station`, `measures`,
  `closing --json`). Added to this is `facts`, read for **all** projects whatever the screen: it is what the bar draws.
- **A reading has its own time** (`read at 14:32:07`) and, if it fails, its error, in one line, its detail on hover.
  **A command that fails takes nothing away from the rest** — a runtime too old for `log` leaves the rail readable.
- A runtime that does not yet know `--last` returns its usage as an error: it is read like any failing command.
- Under the tabs, the line says what you are reading: ``the output of `ssh <hote> brigade <nom> log --last 200`, as
  the box renders it — re-read alone every thirty seconds, as long as this tab is displayed``.
- The space gives you back the tab where you left it.

### The cooks' reliability, on Cooks

*Tickets: #987, #1699.* On the project's **Cooks** tab, in a section under its tickets, **the reliability of the
project's cooks, over its latest served tickets** — on a wide screen only: a narrow screen's Cooks is read-only and runs
no reading (#1186), so neither this section nor the closer's is laid there. Until #1699 it was the page **Settings →
Reliability**; it is read with the Cooks tab, every thirty seconds while that tab is shown, and a reading that fails
whole is said once, by the tab's reading line, not again in the section.

- **At the top, three figures**: the share **delivered first time** ("1 of 7 · 14%"), against its threshold;
  the **average number of attempts per ticket**; the **tokens lost on failed attempts**, against their cap.
  Below, a line says over which tickets they are taken: `7 merged of the last 10 tickets served — 3 not
  merged, left out`.
- **Then the failure causes that come back most, three at most**: each with its number of attempts,
  its share of the failed attempts, and its latest tickets — three at most, most recent first. **A click
  on a ticket opens its card**, over the tab, with its history. With no failed attempt, `no failed attempt`.
- **A figure past its threshold turns red** — the first-time share *below* its own, the lost tokens
  *above* theirs —, as the `drift` line of `status` flags it. The average number of attempts has
  no threshold. A threshold the chef has not set: the runtime's for first time, `50% (default)`;
  none for the lost tokens, `no ceiling set`, and nothing is judged.
- **Not enough served tickets yet to measure, the section says so** —
  `not enough tickets served yet to measure: 6 of the 10 it takes`, or `none of the last 10 tickets
  served is merged yet` —, **never zeros**.
- **Below, the causes a correction of the guidelines aimed at** (#1001, epic #994), under "corrected causes:
  before and after the merge" — **one panel per accepted correction** (see "A proposed correction to the
  project's guidelines"), oldest first: the cause, **the runtime's word at the top** — `recedes` in
  green, `does not recede` in red —, the correction's PR and the day of its merge, then **side by side the share
  of tickets the cause made fail before the merge, and after** (`30%`, `6 of 20 tickets failed because of
  it`), each with its three latest tickets hit, a click on which opens the card. What each side
  looks at is on hover over its name. **While there is nothing to compare, the panel says so in words, never by a
  figure**: not merged yet (`not merged yet`, with no before or after), merged with no ticket finished since
  (`nothing to compare yet` — the before, and `not yet` in place of the after), or that will not be (`not
  merged`). **With no accepted correction, the section is not laid**, and nothing is said in its place. It comes
  from `facts` (`reculs`, `docs/runtime/etat-et-mesures.md`, "Une correction mergée recule-t-elle sa cause ?"),
  read alongside (`app/src/recul.ts`): the app judges nothing, "recedes" is the runtime's verdict; a box not
  reached keeps the last reading.
- **What the cooks taught the project** (#1058, epic #1034), under "what the cooks learned" — **now on the Cooks tab of the project, under the calibration ceiling (#1273), no longer on Reliability**, folded behind its line (#1456); same content, same actions, laid from `facts` once the box answers. **Its
  lessons**, provisional then promoted in `facts` order, one line each: the status as a dot
  (`provisional`, `promoted` in the accent's tone; its meaning on hovering the dot), the identifier in
  monospace and the text, then the day of its entry (`since 10/1/2026`), **where it comes from** (#1089: `origin: retro`, `origin: pass send-back on #12` or `origin: chef correction on #15`, read from the `origine` of the lesson in `facts`; a lesson with none recorded reads as `retro`), **the tickets that proposed it** —
  a click opens the card — and **the number of cooks that received it** (`received by 14 cooks`, or `received by
  no cook yet`). **A promoted one carries "open in the notebook"**: the button opens, in the browser, its line
  of the project's notebook on GitHub — the address `facts` gave for this lesson, and no other (the view
  names the lesson, the main process holds the address) —, **creating nothing: no branch, no PR**; to
  remove it, the chef opens their own PR. With no address (the box does not know the repo), the button is inactive,
  and hovering says so. A provisional one has no link. **Its profiles**: the name, the domain (`for
  app/src/vue`), the notebook — each lesson by its identifier and its text, its state when it is no longer
  promoted (`retired`, `expired`), or `empty` — and **the tickets it cooked** (`cooked #29 #36`, or `none
  yet`). **Each lesson and each profile also shows its progress** (#1059): under its line, the share delivered
  first time (`60% (6 of 10)`) and the average attempts per ticket (`1.5 on average`), **before then after its
  entry** — the figures of `progres` in `facts`. A side with no merged ticket is said in words, `not enough
  tickets yet`, never by 0 or NaN. An empty part is said in one line (`no profile yet`). **While the project has neither lesson nor profile,
  the section is a single line** — `what the cooks learned` and `nothing yet on this project: no lesson, no
  profile` (#1456) —, **and no list**, nothing to open. It comes from `facts` (`apprentissage`, `docs/runtime/etat-et-mesures.md`),
  read by `app/src/apprentissage.ts`; a runtime from before this field does not return it either, and the page says the
  same sentence. While the project's facts are not read, the section is not laid.
- **What the project cost is no longer there** (#1699): the "cost of this project" block — its lost tokens and its
  most expensive tickets, read in its own `station` — was dropped instead of moved. The app's cost page (see "The cost of
  all projects") gives each project's share of every figure, and the lost tokens and most expensive tickets of all
  projects together; this project's lost tokens, judged against `seuil-perdus`, stay in the third figure above.

**Where it comes from** (`app/src/fiabilite.ts`). The app computes nothing and asks the runtime for nothing new:
it reads what `measures` writes (`docs/runtime/etat-et-mesures.md`, "Le relevé des mesures") — the blocks
`retries`, `failures` and `launches` —, and the chef's settings under "chef's decisions" of `station`.

- **The window is that of the first-time drift**: `fenetre-renvois` (10 absent a setting), its
  threshold `seuil-renvois` (50%). The reading therefore runs `station`, then `measures --last <window>`: the section
  and the `drift` line of `status` judge the same tickets. **The minimum to measure is the drift's**:
  the full window, of which at least one merged ticket. Served tickets that are not merged (in progress,
  dropped, served with no diff) are set aside, and the line under the figures says so.
- **The lost tokens are those the runtime judges against `seuil-perdus`**: over the last 10 merges.
  `--by 1` puts each merge in its own slice, so that each row of the `launches` block carries its rank;
  the app sums the `lost` column of the last ten. A launch whose tokens are not known makes the
  sum "≥".
- A box whose `measures` does not yet count returns (a runtime from before #946): the section says in one
  line that reliability is not communicated, the detail on hover.

**On the home screen, the line of a project whose reliability has drifted says so in one word: `drifting`** — when the
project's `status` carries a `drift` line on the first-time share, or on the lost tokens. What it
says is on hover; the dot does not change: nothing awaits the chef, nothing blocks. The other thresholds
(tests, repo, most expensive ticket) are not the cooks' reliability, and add nothing to it.

### The closer, on Cooks

*Tickets: #990 (epic #986), #1699.* On the project's **Cooks** tab, in a section under its gates, **the project's
"closer" part**: what the closer's last observation spotted (`docs/runtime/fermeture.md`, "La fermeture qui observe").
Until #1699 it was the page **Settings → Closer**; `closing --json` now goes out with the Cooks tab's reading, after
`station` and `measures`.

- **At the top, four figures**: the **merges since the last cleanup**, the **added / removed**
  ratio (`2.5:1`, or `nothing removed`, as `closing` says it — over its longest window, with below it
  `+18,340 / −7,336 · last 100 merges`), the **duplicates** and the **dead exports**. The closer's calibration
  is stated next to the title (`closer sonnet / medium`).
- **A button unfolds what was spotted** — `show what was found (8)` —, and clicking it again folds it;
  once unfolded, the list stays so across re-readings. One line per finding, under the name the pass gives it:
  `D1  app/src/vue/vue.js:1405-1428  24 lines also at app/src/vue/fiabilite.js:40-63`, or
  `M1  runtime/src/mesures.ts:212  export ancienneJauge named by tests only`. Nothing spotted: `nothing found`.
- **With no closer set, the part says so** — `No closer is set on this project.` — **and gives the action
  that sets one, as a button**: the model and the effort are chosen together, in two closed lists
  (those the station accepts), and **"Set the closer…"**, the recommended button, acts only once both are
  chosen — one without the other makes the start be refused (`docs/runtime/fermeture.md`). Like the
  action buttons ("Buttons write, they do not send"), it **writes into the second, without
  sending**, the doc's two actions on one line — `!ssh <hote> brigade <nom> station closer-modele
  <model> && ssh <hote> brigade <nom> station closer-effort <effort>` — : the chef hits Enter. What it
  writes, and the accepted values, are on hover; no command is displayed. The choice holds across
  re-readings. What is written is composed in the main process (`app/src/boutons.ts`, `ecritPourLeCloser`),
  which refuses a value outside the lists. **No figure.**
- **An unreadable integration branch**: the merges remain (the log holds them alone), the other three
  figures say `not communicated`, and a line `the integration branch could not be read` carries the reason
  on hover. A failed reading — a box with no log, a runtime from before `closing --json` — fits in one line,
  `the closer could not be read`, the detail on hover.
- **Under the list, the launch of a cleanup** (`closer-lancement`, #991) — see below. Under it, the
  **summary of the last finished pass** (`closer-bilan`, #992) — see below.

**Launching a cleanup** (#991). **"Launch a cleanup…"**, the recommended button — the price on hover, from the
closer's calibration: `on your quota: sonnet / medium · 500,000 tokens at most · 500 lines removed at most`.
**Nothing goes out on click**: the app asks the box for the preview (`closing preview --json`, which writes nothing), and opens
the confirmation of actions that cost — **`Launch a cleanup?`**, the price in one line (`closer on sonnet /
medium · starts under 1 cook in flight · …`), **what the closer will do**, sentence by sentence, as the runtime
says it, then what the request made now would become (`a request would leave within the second`, or
`a request would wait`, the reason on hover). **"yes, launch it"** sends the request, a single one —
`closing write --json --confirm`: the main process launches it only with the view's "yes", and the runtime
refuses it without `--confirm` —, **"no"** closes without sending anything. A request that would be refused, impossible
or already made has no "yes": the line says why.

**Where the request stands** is then read in the same reading, `closing --json` (its `request`): the action having come back,
the app re-reads the tab at once, and the place says meanwhile what was done (`the cleanup is requested —
reading where it stands…`). Then, one line per state:

- **waiting, and for what** — `Cleanup requested — waiting: start condition not met: 3 cooks in flight for a
  threshold of 1`, the whole reason on hover —, and **"Cancel the cleanup"**, which withdraws it
  (`closing cancel --json`): the place then goes back to "nothing requested", the launch button alone;
- **running** — `Cleanup running — since …`: started, it can no longer be cancelled, and is not relaunched;
- **refused, and why** — `Last cleanup refused on …: …` — then the button, to relaunch;
- **finished** — `Last cleanup finished on …` — then the button; its summary is below.

**The summary of a finished pass** (#992, `vue/closer/bilan/bilan.js`). When the last request is `done`, the
summary place shows, from `request` of `closing --json` (nothing is recounted): **what the pass
removed** — one line per candidate, its short name (`M1`, `D2`) and what it was proposed for; the number of
lines removed/added on hovering the title — and **the PR opened**, as a link: a click opens it in the
workstation's browser (`ouvrirBilan`, https only). Nothing removed: `nothing was removed`; no PR (or
an address that is not https): `no PR was opened`, with no link. A request that is not finished has
no summary: the place is empty. Capture: `docs/captures/992/`.

A box that does not answer, a runtime that does not know these actions: one line (`the station could not be asked —
not reached`), what the app got on hover, and the button stays. The three actions go out through the
project's passage, like `manager backlog` (`app/src/closer-lancement.ts`); the place is laid in the view
(`app/src/vue/closer/lancement/lancement.js`). With no closer set, there is neither place nor button.

**Proposing a cleanup when the drift crosses its threshold** (#993). When `closing --json` says `drift.crossed`, the
launch place carries at the top `The drift threshold is crossed — a cleanup could bring it back.`, what crossed
its threshold on hover, and a button, **"Review the cleanup…"**. It does the launch button's action — the preview,
then the confirmation above —: **the proposal creates no request**, neither at its click, nor on loading or
re-reading the page; the request goes out only at "yes, launch it". It disappears when a request is waiting or
running, or when an action is on its way; threshold not crossed (or not declared), it does not exist
(`app/src/vue/closer/derive/derive.js`).

**Where it comes from.** The app runs `closing --json` (#988) and reads the object it returns on one line — nothing is
recounted, nothing is launched: the command opens the log read-only. The view reads it itself in the
Cooks tab's output (`app/src/vue/closer/section.js`); the raw object is not shown.
### The grants, in Settings

*Ticket: #1700.* **Is a grant active, and until when?** It is the heaviest authorization in the system — under a
`merge` grant, code written by a cook lands on the integration branch without you (`docs/runtime/pass-merge.md`, "Le
grant `merge`") —, and it is read in Settings' **project** group, **one line per grant** the doc names, from `ssh
<host> brigade <name> grant`, read while Settings is shown (`grants.ts`):

- **its value**: its state in one word with its pill — `ACTIVE` (green), `LAPSED` (yellow), `REVOKED` or `ABSENT`
  (grey) —, and, when it has an expiry, **the remaining time** the box counted at the time of the read (`6 h left`).
  Since when and by whom, the hour of its expiry (in UTC, spelled out), what is left of it (`9 uses left`) and what
  the runtime says of it (`a green pass is merged without you`) are on hover. An expired expiry never reads as a
  duration: past its hour, the line says `LAPSED`.
- **its one control**: a switch, `merge on` / `merge off`. Its click opens the confirmation of `grant-activer` or
  `grant-revoquer`, which says what the grant changes: nothing goes before your "yes".
- **The app guesses nothing**: a failed read says neither active nor absent — each named grant keeps its line, its
  switch muted, the reason on hover.

Its latest uses, its latest actions, what no grant authorizes and the deliveries stopped for lack of a grant are no
longer shown (#1700): they are history and statistics, not settings — `grant` on the station still says them.

## Buttons write, they do not send

A button of the app **does not act**. It writes its command into the space's **second**, cursor
after it, and stops there: you read it, you correct or complete it, and **it is your Enter that
sends it**. In front of the `claude` prompt, a `stop` therefore does not go out from a stray
click — in front of any other screen, read "The limit" below.

**A button that stops says what it stops.** `guardrails stop` exists only in a project's
panel, and stops only **that project's kitchen**: the command it writes names it
(`!ssh <host> brigade <name> guardrails stop`), and you read it before sending it. It does not close the app, and
touches no other project. **No button stops all projects**: "All projects" has
none.

| Where | The button | What it writes into the second |
|---|---|---|
| the state panel, under the time of the read | `guardrails stop` | `!ssh <host> brigade <name> guardrails stop` |
| | `guardrails resume` | `!ssh <host> brigade <name> guardrails resume` |

- **It is the doc's command, word for word**: the form of `docs/runtime/exploitation.md`, "Piloter",
  from your workstation (`ssh <box> brigade <project> <command>`), with your `host` and your `name`. The `!`
  in front is the one that runs a command on the Mac from a `claude` session. It stays in the
  second's history, and can be replayed by hand identically.
- **The app writes no Enter**: what is written carries no carriage return or line feed.
  A command that would carry one — a `name` or a `host` that contains one — **is not written**,
  and the line under the right-hand tabs says so.
- **The limit: the app does not see what `claude` displays.** It writes the command's
  characters, and the screen of the moment receives them. In front of the prompt, they land there. In front of
  **a dialog with numbered choices** (a tool permission, folder trust), they are
  keys: a digit in your `host` or your `name` (`box2`, an IP, `project-1`) can choose
  an option there. In **vim mode, outside insert**, letters are editing commands. The app can
  neither know it nor prevent it: click a button only when the second is at its prompt, and
  look at it before confirming.
- **The command waits for you in the second, on the right** — the center does not change —, and the line under
  its title says what just happened:
  ``written in the second, without Enter: `!ssh box brigade parade guardrails stop` — in front of the `claude` prompt, it waits for yours, after your typing if you were typing. In front of any other screen (a choice to make, vim mode), these characters are keys: look at the second before confirming``.
- **If you were typing**, the app does not know: it does not read your terminal. It writes
  **after** your typing, erasing nothing, and says so (above). Same for two
  clicks in a row: the second command is written after the first. Erase the line (`Ctrl+U`), and
  click again.
- **If the second is not running** — you left `claude` — the button **starts it first**, and
  writes nothing: a starting `claude` would take the command for keys. The line says
  ``the second was not running: launched (`claude --continue`, with the second's role in its system prompt) — the command is not written into a second that is starting, click again when it is ready``.
- **Always in the second, never in a shell** opened beside it. Two exceptions, and each
  opens its own shell: `Start`, which needs a real terminal ("After adding: going live"), and the project switch's `on`.
- **A `host` that starts with a dash** (`-box`) has no command written: in the doc's
  form, `ssh` would read it as an option. The button writes nothing, and the line under the right-hand tabs
  says why — reading the box, for its part, does not suffer.
- **A button that could write nothing says so** under the right-hand tabs: `nothing is written: …`
  — for example when the project has just left the file.
- A project **without `host`** and without a kitchen on this workstation has no button: there is no command to write. A project whose
  folder is not there has no second: its column says why (`folder not found: …`).
- **Only these buttons exist**, each where what it changes is read — and, apart, the project switch. The
  rest of "Piloter" (`manager return`, `base replay`…) is typed. "All projects" has
  none. Going live with a project just added has its own, apart: `installation`
  is run for you there, and `Start` writes into a shell.
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
sent into the second: `!ssh box brigade parade switch off` — `claude` went into shell mode, the app pressed Enter. Its output is read in its thread, and the second reads it too
```

| The direct action | Where | What goes out |
|---|---|---|
| `project off` | the project switch, at the head of the space | `!ssh <host> brigade <name> switch off` |

**The other actions stay written** — stopping and resuming the kitchen, enabling and revoking a
grant: they destroy or commit, and are read before they go. **Turning on the
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
written in the second, but not sent: `!ssh box brigade parade installation` — `claude` did not show itself in shell mode ("! for shell mode"), so the app did not press Enter. Its input was not empty, or it was showing something other than its prompt: look at the second, and erase what is written there
```

### When it does not go out, it says so

**Nothing is written into a second that is not called free**, and the line under the right-hand tabs says
why — always followed by ``— the command did not go out, and nothing is written: `!ssh …` ``:

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
runs `ssh <host> brigade <name> facts`, the command by which the runtime gives its facts as facts
(`docs/runtime/etat-et-mesures.md`, "Les faits, pour un programme") — a state is **a word read**, a counter **a
number read**. For all projects that have a `host`, every thirty seconds, whatever the
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
tab is shown below it** — the second, a shell, the output of a command. **Five columns**, one
ticket per card: what is going to happen (On the rail), what is happening (Taken, Pass), what you
have to do (Awaiting you), what is done (Served). **The columns are shared between the project's two tabs**
(#1184, then #1269): the kanban stays whole on Rail, Taken and Pass included, and Cooks shows no column; on Rail, the card of a served page
carries only its screen and its action, its worktree and its port are on Cooks. The spec is
`docs/superpowers/specs/2026-10-13-app-poste-de-travail-design.md`; the visual language remains that
of `docs/maquettes/app/Brigade.dc.html`.

```
● On the rail  2       ● Taken  1             ● Pass  1            ● Awaiting you  1      ● Served  1
  #22 queued             #14 taken              #15 in pass          #21 BLOCKED            #9 served
  Login by…              Form…                  PDF export…          The log export        SIRET validation
  after #14              writes the tests       review in progress   Merge it yourself.    served at 14:02 ·
                         · 12 min               · 1 min                                    The SIRET field…
```

**A card fits in two lines** (#622): its number, its state and its title, then **a sentence in plain
words** that says what is happening, and at most **one signal line** when something asks for your
attention. Each sentence is written from the facts the queue already gives about the card
(`app/src/ligne-carte.ts`), one test per state:

| State of the card | Its sentence | Its signal |
|---|---|---|
| taken (`taken`) | what the cook is doing, and for how long: `writes the tests · 12 min` (`rail[].activite`); with no activity, `in the kitchen` and a `…` marker | — |
| in pass | likewise: `review in progress · 1 min`; with no activity, `review in progress` and the marker | — |
| queued | `after #14, #15` when `status` names the tickets that hold it; otherwise what holds it, as is; otherwise `ready, waits for a place in the kitchen` | — |
| `BLOCKED` | likewise, or `blocked` and the marker | `blocked` |
| set aside (`86`) | its reason in plain words, the one the runtime gives (`attente.raison`); the word `86` is displayed as `set aside` | `set aside` |
| with a third party (WAITING) | `waiting for <what> · from <who>` | `follow-up date passed` when the follow-up date has passed |
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
  no `ssh`, so the sheet opens with the box off. The history is what GitHub keeps: `arrived` (the issue's creation),
  `delivered` and `merged` for each PR, or `closed without a merge`. What only the box's journal carries — the cook's
  tokens and time, the attempts, the retro — says `not communicated`, never a made-up value (so the retro section
  above reads `retro not communicated` there). An issue absent from GitHub is one sentence: `<repo>#<n> is not on
  GitHub: there is nothing to read`. Posting a comment and "ask the second" still go through the box.
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
- **A line without a number is in no column**: the station without a Max connection, the summary of
  stops for lack of a grant. They stay in the block, on the right. The `awaiting you` counter of the project
  tile counts the decisions, the column counts its cards: a disconnected station makes the difference.
- **Awaiting you may not be read**, and the column says so (`?`, `not read: this box's runtime
  does not give `attend` in `facts`, and the `awaiting` block of `ssh <host> brigade <name> status` was
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
- **What is not on the rail yet** (`app/src/amont.ts`, #697). An empty rail does not
  mean a finished project: at the head of the rail, a number — `23 upcoming` — counts the open issues of the
  repository that the rail does not carry. It comes from `ssh <host> brigade <name> manager upstream`
  (`docs/runtime/manager.md`, "En amont du rail"), read **for the displayed project only**, once a
  minute: the box reads GitHub each time. A click expands the list, **grouped by what is
  happening to them**, in the box's words:
  - `not yet read by the manager`; `epic, not yet split`; `awaiting your answer — it is also in
    TODO`; `set aside by the manager` (with its reason in one line); `off the rail — still
    open` (`fire` removed, or `served-elsewhere` set);
  - then three passages, when there are any: `on its way to the rail` (it carries `fire`, or the
    manager put it there), `epic split — its tickets carry the work`, `served — its issue is still open`.

  Each issue carries its number, its title and what the box says of it, word for word. **A click opens it
  on its sheet**, over the rail — its title, its priority (the `prio:` the box gives), the link
  to the issue; that of its Awaiting you card, if it has one. **Nothing on the rail** — no
  card outside Served —, the rail says so in plain words: `nothing on the rail, nothing upcoming` when
  there is nothing upstream either; otherwise how many are upcoming, group by group, and what the manager
  does with them, according to its state read (`manager`): on, it reads them at every wake-up; off, it reads
  none and nothing new comes in; not read, the app says so instead of guessing. **The app deduces
  nothing there**: it counts what the box lists and files each issue under the word it carries.
  A failed reading — box not reached, GitHub not read by the box, a runtime from before `upstream`
  ("update brigade on the box") — never gives a number: the button says `upcoming: not read`,
  the expanded list says why, and it is not "nothing upcoming".
- **How fast tickets are being served (#1811, `app/src/cadence.ts`)**: on the same line as `23 upcoming`, a small
  histogram of the last 24 hours — one line high, one thin bar per hour, the hour in progress on the right. Each bar is
  stacked: the tickets **served** in that hour in green at the bottom, the **failed** ones in red on top (a pass that came
  back red, or a cook a guardrail stopped). An hour with nothing is an empty slot on a faint baseline: a run of empty
  slots shows at once that nothing moved — there is no sentence, and no reassuring blank. The scale is the day's busiest
  hour, four tickets at least. On hover, on the keyboard or on a tap on the phone, a bar says its hour and its two counts
  (`14:00–15:00 · 3 served · 1 failed`, the last one `…–now`): that is its only text. **Each Taken or Pass card** carries
  how long it has been in that column (`12 min`, `3 h`, `2 d`), its exact age and the usual time on hover; a card there
  more than **twice the median** of the tickets that went through that column in the last 7 days turns its age red and
  takes a red edge. With fewer than three such tickets, nothing is usual yet: no card stands out, and the hover says why.
  Everything is read in `facts` (`cadence`, and each rail ticket's `depuis`: `docs/runtime/etat-et-mesures.md`), never
  from the app's own memory: it is right as soon as the app opens. A runtime from before these fields draws neither.
- **The triage, day by day (#1283)**: at the head of the rail, a compact block — `triage, day by day` — gives, for each of the last
  seven days (UTC), the most recent first, two counts: `decided alone` (the cards the triage settled itself) and `sent to TODO`
  (the cards it let into TODO). A day with no activity says `0` and `0`, never a blank. The runtime counts (`facts`, `triage`:
  `docs/runtime/etat-et-mesures.md`); the app only lays them out, and draws nothing from a runtime from before that field.
- **The gates against their budget (#1318, epic #1313)**: at the head of the rail, above the triage, a compact block —
  `gates, latest run against budget` — gives what the project's latest gates run cost against the budget of one run, in
  wall-clock time and in CPU, both in seconds to read one against the other: `time 215 s / 100 s (default)`,
  `CPU 990 s / 400 s (default)`. A budget you have not set is the default, and says `(default)`. When the runtime judges
  the run over budget, the block takes a red edge and the mark `over budget`; when the kitchen opened a ticket on its own
  to bring the gates back under it, a line says `the kitchen opened #31 on its own to bring the gates back under budget`,
  and the number opens that ticket's sheet — with its title and its issue when the rail or what is upcoming carries it.
  No run yet: `–` against the budget, and `no run yet`. A run cut before its end has its CPU `not measured`. Everything is
  read in `facts` (`coutDesGates`, `docs/runtime/etat-et-mesures.md`): the app judges nothing, and draws nothing from a
  runtime from before that field.
- **The columns fit in the window at its opening size**; narrower, they scroll.
  The rail and what the displayed tab shows below it share the height, half and half; the
  rail scrolls within its own. A project with no `host` and no kitchen on this workstation has no rail — nothing is read from it — and
  its terminal takes the full height.

### A proposed correction of the project's guidance (#999)

When the same cause of failure comes back on several recent tickets, the runtime proposes to correct
the project's guidance — its `CLAUDE.md`, its team doc, its gates (`docs/runtime/etat-et-mesures.md`,
"The proposed corrections"). `facts` carries it in `corrections`; **each proposal is a
card of the queue, at the head of the rail, above the columns**, on the warm background of what awaits you.
A wide card: the diff would not fit in a column. **With no proposal, no card**, and
nothing is said in its place.

```
A failure cause keeps coming back: accept this correction of the project's guidance?
[correction proposed]  red gates: app tests
failed because of it:  #3  #5  #8
Three cooks ran the app tests against the clock; the guidance never says …
CLAUDE.md  +3  −1
  @@ -21,7 +21,10 @@ Conventions
   - Type check: `npm run typecheck`.
  -- A test may wait a few seconds for the server to start.
  +- A test never runs against the clock: it waits for a fact — …
this proposal cost 18,342 tokens · proposed 10/13/2026, 9:58:40 AM
[yes, open it as a PR] ?   [no]
```

- **At the head, what is expected of you**, in one sentence; then the cause (its sentence, `titre`) and the
  model's why (`motif`), when it gave one.
- **Each ticket the cause made fail opens with a click** on its issue, at the address the
  box gave for it (`corrections[].tickets[].url`); without an https address, its number is laid
  alone.
- **The correction is a diff, file by file**: the file name, its lines added
  (`+3`, in green) and removed (`−1`, in red), then its lines as they are, in monospace —
  an added line in green, a removed one in red, the head of a hunk (`@@ … @@`) in blue, each
  with its sign: the color does not say it alone. The file heads (`diff --git`,
  `index`, `---`, `+++`) are not repeated: the file name says them. A long correction
  scrolls within its height.
- **What the proposal cost is read on the card** (`cout.tokens`): it is already spent.
- **"yes, open it as a PR"**, recommended, and **"no"**. The price of the "yes" is in its hover:
  a PR that carries exactly this diff goes through the pass like a delivery — gates, review, CI —,
  on your quota. The action goes out right away: the whole card is what you have to read before.
- **The answer is posted on the project's Kitchen board** (#1741, `app/src/tableau-gestes/rail.ts`,
  `docs/tableau-gestes.md`), with the token of this computer's `gh`: `/brigade correction yes <proposal>` or
  `/brigade correction no <proposal>`, once, for a proposal the latest board read carries. No `ssh`, no second, no
  box command: the gesture works with the box unreachable, and the box plays it at its next tick
  (`runtime/src/correctif/decision.ts`).
- **Posted**: both buttons stay inactive, and a line under them says `your “yes”: posted on the Kitchen board — the box
  plays it at its next tick and answers under it`, the comment's address on hover — the same words as the other
  gestures posted on the board. While the post is on its way, the buttons wait (`posting your “yes” on the Kitchen
  board…`). The board is read again at once; the card leaves the queue with the first read that no longer carries the
  proposal.
- **Not posted** — the board not read yet, a proposal the latest board read does not carry, or GitHub refusing the
  comment: the card stays, and so do its two buttons, and a line says why, what GitHub answered on hover. One click
  tries again.
- **Refused by the box** (a proposal already answered, or that no card shows any more): the box answers so under the
  comment, and nothing is written.

Captures: `docs/captures/1741/` — `correction-oui-avant.png` (the old path: the answer went to the box, and the card
left the queue at once), `correction-oui-apres.png` (posted on the board, said on the card),
`correction-refus-avant.png` (the old refusal: a station that did not know the gesture) and `correction-refus-apres.png`
(GitHub refused the comment: the card stays and says why).

### A proposed cook profile (#1053, epic #1033)

When an area of the code comes back on enough recent tickets and is delivered on the first try far
less often than the rest of the project, the runtime proposes to make it a cook profile
(`runtime/src/profils/`). `facts` carries it in `profils`; **each proposal is a card of the
queue, under those of the corrections, above the columns** — the same wide card, on the same background.
**With no proposal, no card**, and nothing is said in its place.

```
One part of the code keeps needing more than one try: give it a cook profile of its own?
[profile proposed]  app-src-vue  for app/src/vue
6 of the last 20 tickets served touch it
delivered on the first try: 33% here (2 of 6), against 75% for the whole project (15 of 20) — 42 points below ?
its tickets:  #4  #7  #9  #11  #14  #17
what the profile would hold
  skills     none proposed ?
  perimeter  app/src/vue
  notebook   starts with 2 lessons of the project, born of this domain's tickets
             L-007  A view change is judged on a screenshot, before and after …   from #9
proposed 10/13/2026, 9:41:05 AM
[yes, create the profile] ?   [no] ?
```

- **At the head, what is expected of you**, in one sentence; then the profile name and its domain.
- **The figures that justify it**, each in one sentence (`app/src/profil.ts`, `carteDeProfil`):
  how many of the latest served tickets touch the domain, and its share delivered on the first try against
  the project's. The thresholds that made the proposal are on hover.
- **Each ticket of the domain opens with a click** on its issue, at the address the box gave
  (`profils[].chiffres.tickets[].url`); without an https address, its number is laid alone.
- **What the profile would hold**: its skills (the measure proposes none — said, with the why
  on hover), its perimeter, and its starting notebook, lesson by lesson with the retros that carry it.
- **"yes, create the profile"**, recommended, and **"no"**; what each does is in its hover.
  The answer is posted like that of a correction, on the project's Kitchen board (#1741): `/brigade profile yes
  <proposal>` or `/brigade profile no <proposal>`, once, for a proposal the latest board read carries — no `ssh`, no
  box command, the box unreachable included. Posted, the card says so under its two inactive buttons, the comment's
  address on hover, and leaves the queue with the first board read that no longer carries it; not posted, the card
  stays and a line says why, what GitHub answered on hover. The box plays it at its next tick
  (`runtime/src/profils/decision.ts`): the "yes" writes the profile's definition in the project's clone on the box,
  and a definition the repository already has is refused under the comment, the proposal still waiting.

Captures: `docs/captures/1741/` — `profil-oui-avant.png` (the old path: the answer went to the box, and the card left
the queue at once) and `profil-oui-apres.png` (posted on the board, said on the card).

### The stop banner

When the box says the kitchen is `stopped` — your "stop" —, the project's space says so at the top, above
the tabs, whatever the tab:

```
KITCHEN STOPPED — your "stop" holds
All running cooks have been stopped, and none is launched any more — runtime restart
included, until "resume".
write the restart in the second, without sending:  [guardrails resume]
```

- **The button writes the restart, it does not restart**: `!ssh <host> brigade <name> guardrails resume`
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
and for the same project they go **one after the other** — a project opens only one `ssh`
connection at a time, whatever the number of readings waiting for it. In "All projects", a box
therefore receives at most one connection per project it serves, not two.

| On screen | What the app obtained | What it shows below |
|---|---|---|
| ``REACHED, BUT `facts` DID NOT ANSWER — tried …`` | `ssh` reached the box, and the command failed there without its code saying a case. **A runtime from before `facts` is the expected case** | the command launched, what it wrote, its code — then the action: update the runtime on its box (`docs/runtime/exploitation.md`, "Piloter") |
| `REACHED, BUT UNKNOWN TO THE BOX`, `… WITHOUT THE RIGHT TO THE ACTION`, `… A COMMAND IS MISSING ON THE BOX`, `… THE BOX'S NODE DOES NOT SUIT THE RUNTIME` | the box's action refused (codes 65, 68, 69 or 127, 70): **the same case as under `status`**, with the same words | what the box said of it, as is — then **the pointer for that case**, the one from the table of "A box reading: seven states". No runtime update: it is not the runtime that is old |
| ``THE BOX DID NOT RETURN THE SHAPE OF `facts` — tried …`` | the command succeeded, and its output is not the shape: not JSON, a missing field, a counter that is not a whole number | **the output, word for word**, then what is not the shape (`"compteurs.rail" is not a positive whole number`) |
| `NOT REACHED — tried …` | nothing that proves the box was reached | the message from `ssh`, as is — the same as under `status`, where its pointers are given |

An item of `rail`, `attend` or `livres` that the app cannot read — a value from a box newer than the app, such as a WAITING follow-up at `null` — does not refuse the shape: only its own card is spoiled. It stays in its column and says in one line that the app could not read it and that updating the app fixes it. The shape is refused only when the item has no ticket number, since there is then no card to draw.

A missing field refuses the **whole** shape: the app completes nothing. An extra field is
left aside.

### A box that does not answer at all (#728)

A mute box makes everything the app reads from it fail at once: the manager, the version, the kitchen,
the grant. The app does not make four "unchecked" alerts of it, each with an action that changes
nothing: **after two failed readings of `facts` in a row** (`LECTURES_POUR_INJOIGNABLE`) — the box
not reached, not the command failing —, **the band says only one line**:

> station unreachable since 03:27, 4 h 45 ago — the state of the kitchen has been unknown since then

**The project page says it only once (#1078)**, at the top, with what the chef can do about it, in
plain words under the line: check that the machine is on and reachable, restart it if it no longer
answers, then "try again" (its button rereads the box right away). The cause in plain words
(no answer, connection refused, address not found — said from what `ssh` wrote) is
behind "detail". The line goes away as soon as a reading succeeds, without restarting the app. A single
failed reading does not set it.

- **The project's pill** says the same thing in one word, `unreachable`, and the bar's box carries a `×`.
  The project's station ("Cooks on") is no longer green: it is red, `unreachable`.
- **The rail's columns** show no "0": each carries `?` and says "not known while the
  station is unreachable". Nothing else of the rail is laid down (neither upstream nor corrections). A reached box that does not
  return the shape of `facts` is not this case: the rail is not drawn, as above.
- **The `fire` tickets are read on GitHub** (`feu.ts`): it is the workstation's `gh`, launched in the project's
  folder — never the box. They are **folded** under "the tickets in the kitchen according to GitHub, N";
  expanded, they are lines like the rest of the page, each number opening the issue (the address comes from `gh`).
  When GitHub does not answer either, the line from `gh` is said.

### Offline: the last rail read, and one quiet sign (#1818)

The rail is read from the project's Kitchen board on GitHub (#1694). With no network, every reading of that board
fails at once — the project switch, the kitchen state, the grant state — for one plain cause that is not a fault. A
reading **that did not reach GitHub at all** (the request threw: no network, no DNS, no answer within its delay —
`horsLigne` in `tableau/lecture.ts`) is told apart from one that reached it and failed (an HTTP refusal, no board, a
board the app cannot read), and the app then:

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

When the network comes back, the rail refreshes on its own: the next reading of the board (every 30 s) — or at once,
when the system says the network is back — redraws it, and the sign goes away. Alarms then appear only for a real
fault: a board that cannot be read, or GitHub refusing, is said as before, after the same two readings. A failed `ssh`
says nothing about the network: it neither sets nor lifts the offline state.

### What is not drawn, and will not be here

- **The log and the output of `station`** stay text: they are streams, not state tables. The state of the
  grants is not drawn from `facts`: it is read in the output of `grant`, one line per grant in Settings ("The grants,
  in Settings").
- **No numeric gauge**, neither of the quota nor of the machine: the runtime does not know the account's
  consumption (`/usage` gives it) and gives figures for the machine only when it saturates. The
  `quota` and `machine` lines of `station` are read as they are, in Cooks.
- **Why** a kitchen is held, what a ticket awaits, who holds it: that is `status` and
  `rail`, in text, just below.
## What the box says about the project

To the right of the terminal, without typing anything, and whatever the tab: the project tile, then
**what awaits you, set apart**, then the output of `ssh <hote> brigade <nom> status`, **word for
word**. (Grants have their own tab.) The app reads nothing in it and says nothing of it again — if
a command's wording changes, what you see changes with it. It cuts out only one thing, by its
edge: the `awaiting` block.

### What awaits you, set apart

At the top of the panel, on its own background: **the `awaiting` block of `status`**, as the runtime
wrote it, from its `awaiting` line to its `end awaiting` line. You no longer have to hunt for it in
the output.

```
what awaits you — the `awaiting` block of `ssh <hote> brigade <nom> status`
awaiting   2 decisions await the chef — the oldest since 2 d
  #12  since 2 d  green delivery, not merged for lack of a `merge` grant — merge by hand: …
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
  Nothing could be set apart: the output of `ssh <hote> brigade <nom> status` does not have the block the app knows how to take — a single line that starts with `awaiting`, a single `end awaiting` line.
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
| A grant about to lapse | `EXPIRING SOON`, on the `grant` line of the header |
| A stopped cook | no line of its own: `latest events` (`guard.tripped`, `cook.exited`), and the breaker on the `kitchen` line |

The app **never says "nothing awaits you" itself**: a calm screen is an `awaiting` block that says
`nothing awaits the chef`, and a `status` with no `STUCK` nor `EXPIRING SOON`.

The head lines of `status` that the app reads (`kitchen`, `connection`, `setup`, `base`, `grant`, and `nothing cooks:`) have been in English since #928; it also reads them in their French form (`cuisine`, `connexion`, `ROUGE`, `ACTIF`, `rien ne cuit :`…), for a box whose runtime is not up to date.

**Say where the box is.** A single field on the project, in `app.json`:

- `hote`: the name by which **your** `ssh` reaches your box — a name from your `~/.ssh/config`, or
  `account@machine`. There is no value to copy: it is what you type after `ssh`.

**What the app displays can be copied.** Every action the app names — in a tab line, a failure
title, a panel, what the buttons write — is the *workstation action*,
`ssh <hote> brigade <nom> <command>`, with your `hote` and the project's `nom`: it is what you type
on your Mac. `brigade <nom> <command>` alone is the *box action*, the one of the box itself
(`docs/runtime/exploitation.md`, "Piloter"): typed on the Mac, it returns `command not found`, and
the app puts nothing on your workstation to avoid that. Under the project name, `<hote>` and `<nom>`
are to be replaced by the two fields of your file.

You no longer dictate any command. The app runs **the box action**, reached by `ssh`: `ssh <hote>
brigade <nom> status` — and, for the content tab displayed, `ssh <hote> brigade <nom> rail`,
`station`, `grant` or `log` (`docs/runtime/exploitation.md`, "Piloter"): the account, the
installation and the environment are read on the box, in the project's unit. The action must
therefore be placed there, and allowed to your account without a password (`docs/installer.md`,
"Prepare the box").

**The name sent to the action is the project's `nom` in `app.json`**, as is. If the box serves no
project under that name, the action refuses it and the app displays it — `REACHED, BUT UNKNOWN TO
THE BOX`, with what it said about it:

```
$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade parade status
brigade: unknown project on this box — "parade" has no drop-in (`sudo systemctl edit brigade@<project>.service`, docs/installer.md)

→ exit code 65
```

The action accepts only lowercase letters, digits and hyphens: a `nom` written otherwise
(`Parade`, `mon projet`) reaches it whole, quoted, and it says it is unknown.

The app runs `ssh -o BatchMode=yes -o ConnectTimeout=10 -- <hote> 'brigade <nom> status'`: your
key, your ssh configuration, no port or API. `BatchMode`: `ssh` cannot ask you anything from the
app — a key that demands its passphrase must be in your agent. `ConnectTimeout`: a silent box is
reported by `ssh` after ten seconds, in its own words. A project with no `hote` and no kitchen on
this workstation is not read, and the app says so in place of the state.

**It refreshes by itself**, every thirty seconds, for what is displayed and nothing else — the
project, or each one in "All projects"; switching project reads the new one right away. **A read is
shown only in the screen that asked for it**: the one of "All projects", still running when you
open a space, is not shown there — and the reverse. At the top of the panel, **the project's state
and the time of the last read** (`pilotable — read at 14:32:07`): these are the only facts the app
adds. The durations displayed below are those `status` was counting at that time.

**When the box is not read, it is an error, and it takes all the room.** The header changes to
`NOT REACHED — tried at 14:32:37, the next follows by itself`, to `REACHED, BUT NO LONGER
PILOTABLE — …` or to `REACHED, BUT UNKNOWN TO THE BOX — …`, `REACHED, BUT WITHOUT THE ACTION'S
RIGHT — …` or `REACHED, BUT A COMMAND IS MISSING ON THE BOX — …` (the states of "A box read: seven
states", said the same here), and below there is only what the app obtained — the command run, what
it or `ssh` wrote, and the exit code — then, when the code allows it, where the action that answers
it is written.

```
$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade brigade status
ssh: connect to host box port 22: Operation timed out

→ exit code 255

`ssh` did not open a session on the box, and it said why: its message is above. The app does not read it.
What each of its sentences means, and the action that answers it:
(docs/installer.md, "Reach the box")

If it says your key was refused (`Permission denied`), the box answers and what you lack is access. It is given on the box:
(docs/installer.md, "Add a human")
```

A reader whom the box reaches but to whom the action was not given reads this, under `REACHED, BUT
WITHOUT THE ACTION'S RIGHT`:

```
$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade brigade status
brigade: "lecteur" has no right to run the action on this box — without a terminal, `sudo` does not give it to them under the account "brigade" without a password (docs/installer.md, "Add a human")

→ exit code 68

The box was reached, and its action refused the account through which your `ssh` reaches it: what it said about it is above.
This is neither an outage nor a runtime to update: it is a right that this account lacks.

It is given on the box, by someone who has `sudo` there — the app does not do it for you:
(docs/installer.md, "Add a human")
```

- **Nothing is kept from the previous read**: no stale state beside the error. A micro-outage
  therefore replaces the screen with an error, until the next read.
- **The app does not guess the cause.** A 255 code comes from `ssh`: not reached. Any other code
  comes from the box, whose message is displayed (`brigade: …`): 65, the action does not know the
  project; 68, it refuses you; 69 or 127, a command is missing on the box; 70, its `node` does not
  suit the runtime; any other, reached, but no longer pilotable.
- The panel and the content tab displayed are each read on their own: the error of one is shown in
  its own place, taking nothing from the other.
- An `ssh` that returned nothing in thirty seconds is stopped, and the app says what it knows of it:
  - `→ no answer in 30 s: ssh stopped` — `ssh` was connected (it then exits by itself, with 255)
    and it is the command that returned nothing: "reached, but no longer pilotable".
  - `→ no answer in 30 s: ssh stopped, without having said whether it had reached the box` — `ssh`
    died of a signal, with no code: nothing says how far it had gone. Its ten seconds to reach the
    box (`ConnectTimeout`) do not cover what follows the connection: an ssh agent waiting for a
    confirmation (Touch ID, 1Password, `ssh-add -c`) holds it without limit. The app does not know
    where it stood: it displays it "not reached", without the runtime update action — nothing says
    there is a runtime to restart — and without a pointer to the docs: `ssh` wrote nothing that can
    be read there.

The log is read in `latest events`, refreshed with the rest, and, for its end (the last 200
events), in the **Log** tab. To follow it live: `ssh <hote> brigade <nom> status -- --follow`, in a
shell of the space.

## The skin

The app has one visual language, and only one: the mockup's (`docs/maquettes/app/`). It dresses
**the frame**, never the content.

- **A dark background, cards on it.** Everything that reads as a block has its card: the lists of
  "All projects", the project tile, the commissioning of an added project, the removal, the served
  pages, the manager's state, the grants', the add form. A rail column is a card, a ticket there is
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
- **Two fonts, embedded** (`app/src/vue/polices/`, under the OFL license): nothing is requested
  from the network, the page opens no origin. **Archivo** for the interface. **JetBrains Mono** for
  what is copied as is — a ticket number, a run identifier, a port, a project's name, a command —
  and for what the box returned. **Monospace is information, not a style**: a button is in
  monospace if what it displays is the command it will write, and what the app says itself, even on
  several lines, is in Archivo.
- **What the box returned is in a frame of its own**, dark, in monospace: a command's output, the
  `ssh` message, what the installation action answered. **Word for word**: its whitespace and its
  lines are its own, a line that is too long wraps to the next, nothing is cut, hidden or rewritten.
  What the app says about it is below, outside the frame: its words are not confused with the box's.
  Nothing is cut anywhere in the app: the title of a ticket on the line of a running cook wraps, like
  the rest. The window does not shrink below 640 px wide (half its opening); below 1280, the tabs
  and the rail columns scroll, nothing overlaps.

## The workstation is a station

A ticket can ask for a capability the box does not have — `chrome-connecté`, your browser, with
your sessions. The project then declares on its box a station that provides it and that **does not
run on the box**: `mac/claude:1:chrome-connecté:distante` (`docs/runtime/station-distante.md`, "Une
station distante tire son travail"). **The app plays it**, for the projects that ask it to:

```json
{ "nom": "brigade", "dossier": "~/Dev/brigade", "hote": "ma-box", "stations": ["mac/claude"] }
```

As long as the app is open, it does for each station what the box expects of it, through the box
action and nothing else (`ssh <hote> brigade <nom> pull <station> …`):

| What it does | When | What goes to the box |
|---|---|---|
| **announce** itself | at launch, then every thirty seconds while all its cooks are taken | `pull mac/claude announce` |
| **claim** a ticket | every thirty seconds while it has room left | `pull mac/claude claim` |
| **cook** | at each ticket received: a worktree in the project folder, on the branch the box names, and `claude` in it, with the arguments the box handed over | nothing |
| **renew** its lease | every thirty seconds per cook | `pull mac/claude renew <run> [--proof <fingerprint>] --turns <n> --tokens <n>` |
| **return** | when the cook is done: its branch pushed to the origin, then its last message to the box | `git push` to the origin; `pull mac/claude return <run> --end livre\|echec …` |

The pace is thirty seconds, less if the box announces a shorter presence delay or lease.

**Everything leaves your workstation, nothing arrives there.** The app listens on no port for this
work and opens no server; it tells the box neither its name nor its address, and opens no port
forwarding: one outgoing `ssh` per request, one `git` to the origin, and `claude`. The box, for its
part, has no path to your Mac (`runtime/test/architecture.test.ts`). On the app side,
`app/test/runner.test.ts` holds it: what the runner imports, the three programs it launches, and
each line passed to `ssh` during a full service.

**With the app closed, the station is absent — and this is not an outage.** Past the box's presence
delay (two minutes by default), the tickets that only it can cook are `86`, "station absent", and
`status` says so; the others go out on the box as before. Reopen the app: they restart by
themselves, at its first request. There is nothing to do on the box, and the app does nothing
special when closing.

**Ordinary tickets, from the project's settings (#852).** In Settings › General of a project for
which this workstation plays a station (`stations`), the block is titled with this workstation's
name — "Ordinary tickets on this Mac", "Ordinary tickets on this PC" under Windows (#1154). On a Mac,
it carries the "Take the ordinary tickets too" option and the "Cooks at once" field, this Mac's
cooks cap. A single line, beside it, says what that implies: `Cooks on this Mac run in Claude Code's
sandbox: they write only in their own worktree, and reach only the network hosts on the project's
list.` Both values are written in the projects file (`"ordinaires": true`, `"limiteCooks": 2`) and
re-read at each opening; a value badly written by hand makes the file refused. **Outside a Mac — a
PC under Windows, a desktop Linux —, the block has no option and no field: its single line says why**
— `This PC takes no ordinary ticket: a cook of an ordinary ticket runs only in Claude Code's sandbox,
which the station sets up only on macOS.` The runtime sets up the sandbox of a local kitchen only on
macOS (`runtime/src/bac-a-sable/local.ts`), and a remote station without a sandbox takes no ordinary
ticket: the app says so rather than hiding the setting. **With no station played, the block does
not exist.** The sandbox state is read in `facts` (`stations` field,
[docs/runtime/](runtime/station-distante.md), "Les tickets ordinaires sur le poste du chef"): when the
station says it is unavailable, the block writes it beside the option, with the reason the station
gives, and specifies that this Mac takes no ordinary ticket. As long as it has said nothing, the app
guesses nothing. The block sets what the app keeps; the box's `distante+ordinaires` declaration
remains the chef's.

**Where each ticket cooks (#853).** The box sends an ordinary ticket to the Mac only when it is
saturated (`docs/runtime/station-distante.md`, same section). On the rail, the card of a running
ticket therefore says, under "taken by", **"cooks on: box"** or **"cooks on: Mac"** — Mac for a
remote station, according to the `stations` field of `facts`. A station that `facts` does not give
— a runtime from before this field — makes it say nothing: the app does not guess from its name.

**A cook on your workstation is not a privileged cook.** What the box holds for its own, it holds
for this one, and the app bypasses nothing:

- **The same arguments.** `claude` is launched with those the box handed over, as they are: same
  instruction, same calibration, same forbidden tools (neither `git push` nor `gh pr merge`).
- **No extra grant.** Its environment is that of the terminal that launched the app, sorted as the
  box sorts that of its own: without the `BRIGADE_…` variables, without anything that diverts
  `claude` from its connection (`ANTHROPIC_API_KEY`…), without automatic memory. The app adds no
  token, no project secret, no grant — the box hands over none. What your workstation can otherwise
  do (your `gh`, your browser) is yours: this is why the ticket comes here.
- **The same lease, on proof of work.** At each renewal the app sends what the cook has consumed,
  and the fingerprint of its worktree **if it has changed since it entered it**: an intact worktree
  is presented as proof of nothing. The box renews only on a fingerprint that has changed;
  otherwise the lease lapses at its expiry, and the cook is stopped.
- **The same caps.** Turns, tokens, duration, idleness: the box judges them on what the app
  reports and on its own clock. As soon as it answers `stopped` — a cap, the lease, your "stop", a
  runtime restart —, the app stops its cook (`SIGTERM`, then `SIGKILL` five seconds later) and
  returns nothing: the box would receive nothing more from it.
- **A silent box does not leave a cook unguarded.** If no renewal has been accepted for the length
  of the lease — the box no longer answers, or refuses —, the app stops the cook by itself.
- **The same log.** The taking, the launch, the reading, the end and the report of the cook are
  written by the box, in its log, as for a cook of its own (`cook.launched` carries `remote: true`);
  each request of the app is there too, with its answer.
- **The same pass.** The cook does not push: the app pushes its branch to the origin, and the box
  fetches it from there — same gates, same reviewer, same `merge` grant, same sendbacks. A sendback
  from the pass returns to the same branch, as the origin carries it.

**What a cook from here delivers** is judged in its worktree, as on the box:

| It concluded, and… | What the app does | What the box keeps of it |
|---|---|---|
| its branch carries commits | what lies uncommitted is committed in its place, the branch is pushed, `return --end livre` | `done`: PR, report, pass |
| no commit, intact worktree | nothing is pushed, `return --end livre` with its last message | `done`, `no-diff`, if it delimited a deliverable; otherwise `no-deliverable` |
| no commit, files written | `return --end echec --reason no-commit` | `failed` |
| it left its branch | `return --end echec --reason off-branch` | `failed` |
| it did not conclude (exit code, quota, lost session, model refusal) | `return --end echec`, with the reason | `failed` |

**What this writes in the project folder.** The folder is your clone: the app adds a worktree per
cook to it, outside the folder (`~/.config/brigade/stations/<project>/<run>`), and its branch
`cook/<run>`. What it fetches from the origin goes into separate references
(`refs/brigade/origine/…`): **your branch, your tracking branches and your tags do not move.** Once
the cook is done, the worktree is removed; the branch goes too, unless it carries what is not on the
origin — a failed or stopped cook that had committed, or left files: they are committed on it, and
the branch **stays in your clone**, never pushed. The app says so, and it is up to you to delete it.
The folder must therefore be a clone of the repository, whose `origin` is the origin the box
serves, and your workstation must be able to push to it.

**Where to read it.** On the box: `station` shows the presence of `mac/claude` on its `presence`
line (Cooks tab), and `status` the tickets that await it (the project's panel). On your
workstation: the app writes in the terminal that launched it what each station does, one line per
change.

```
brigade: station mac/claude of "brigade" — present — provides chrome-connecté
brigade: station mac/claude of "brigade" — cooks ticket #16 (16-9f494a1d)
brigade: station mac/claude of "brigade" — ticket #16 returned: done
brigade: station mac/claude of "brigade" — refused by the box — the project declares no station mac/claude: …
```

A station the box refuses — it does not declare it, or not as `distante` — asks again every five
minutes, launching nothing.

**What is not guaranteed.**

- **Closing the app kills its cooks**, returning nothing: the ticket stays taken until its lease
  expires, then goes back to the rail (`guard.tripped`, `reason: lease`) — a failure counted by the
  breaker, as for any cook whose lease lapses. The worktree stays, and is removed at the next
  launch; what the cook had committed stays on its branch, in your clone.
- **An app killed outright** (not closed) can leave a `claude` running: nothing watches it any
  more. Its worktree is removed at the next launch.
- **The project's worktree setup is not played** (`.claude/brigade/worktree-setup.sh`): on the box,
  the station plays it before the cook; here, it is up to the cook to run it if it needs it.
- **A failed cook from here delivers nothing**, even if it had committed: on the box, its commits go
  to the pass anyway ("harvested"); here they stay on its branch, at your place.
- **The exhausted quota of your workstation is a failure** for the box, not an `86` with a return
  time: the `pull` action can only say "delivered" or "failure".
- **The cook's raw stream is not kept** on your workstation: the box receives only its last
  message, and what it consumed.
- **Two apps open on the same projects file** play the same station twice, and each removes at
  launch the worktrees the other laid.

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
## Closing the app

Closing the window quits the app, and quitting **stops all its terminals** — seconds and shells — and
the box reads in progress. Shells opened with `+ shell` only detach from it: their sessions hold,
and they come back on the first click on their project (see above). **And the cooks of its
stations**: once closed, the app plays none of them any more, and the box reports them absent (see
"The workstation is a station"). Conversations, for their part, are kept by `claude`: on reopening,
the first click on a project resumes its thread, and the line under the right-hand tabs tells you
whether that worked.

## Launching the app

Two ways: **installed**, from a `.dmg` for Apple Silicon, or **from a clone of the repo**.

**Installed.** `npm --prefix app run dist`, on a Mac, writes
`app/packaging/construit/Brigade-<version>-arm64.dmg`; drag Brigade into Applications and open it.
It carries its station's runtime and the `node` that plays it: no clone, no `node`, no `npm` on the
machine. It reads `~/.config/brigade/` as it is — your projects and settings are those of the repo's
app —, takes the `PATH` of your login shell (to find `claude` and `gh`), and does not update through
`git`: it keeps itself up to date from the published versions (below). Every merge on `v2` that
changes the app publishes an `app-v<version>` release with the Mac and Windows installers, built by
the `publier-app` workflow; nobody pushes a tag. Until signing lands (#1441), the published `.dmg` is
only ad hoc signed, like one you build yourself: copied from another Mac, macOS asks for "Open
anyway". What it carries, how it is built and tested: [`app/packaging/README.md`](../app/packaging/README.md).

**Updating it** (#1013). The installed app checks at launch, then every six hours, whether a version
higher than its own is published — an `app-v<version>` release that carries its `latest-mac.yml`. If
there is one, it announces it with its number and downloads it right away, checked against the
published size and sha512, under `~/.config/brigade/mise-a-jour/`. Once ready, it installs on the
"install now" action — the app closes, the new one takes its place and reopens —, or, with no
action, at the next opening, before anything starts in it. The installer checks the signature of the
new version (the same developer as the one running); if that fails, the app in place is not touched,
it reopens and says why. A feed that does not answer never stops the app from opening: the error is
reported, the next check tries again. Launched from the repo, it checks nothing — its clone updates
it. The state and the actions go through the view's bridge (`miseAJour`, `verifierMiseAJour`,
`installerMiseAJour`, `surMiseAJour`); the code is in `app/src/mise-a-jour/`. To try it without
GitHub, `BRIGADE_APP_MISE_A_JOUR_SOURCE=<address>` makes it read a server that answers like GitHub.

**On Windows** (#1156), the installed app (the `Brigade-<version>-x64-setup.exe` installer,
[`app/packaging/WINDOWS.md`](../app/packaging/WINDOWS.md)) updates itself the same way: the same
`app-v<version>` releases, the same checks, the same states, the same actions and the same words. Only
two things differ. It reads the release's `latest.yml` and downloads the setup `.exe` it names. A
release that carries only the Mac's files is not a new version for Windows, and the reverse holds
too. And its installer is a PowerShell script started next to the app, in a hidden console, that outlives it
(`app/src/mise-a-jour/windows.ts`). Once the app has quit, the script moves the installed folder aside
(Windows refuses while one of its files is still open, and then nothing has moved). It runs the setup
silently (`/S`) into that same folder (`/D=`) and checks that `resources\app\package.json` now holds
the expected version. Then it removes the old folder and reopens `Brigade.exe`. If any step fails, it
puts the old folder back as it was, writes the reason (which the reopened app shows) and reopens it.
The app refuses to update when it does not run from the folder the installer laid out
(`Uninstall Brigade.exe` next to `Brigade.exe`), or when that folder cannot be written to, and says so.

**What the chef sees of it** (#1014). On "All projects", an **App** section gives the running
version (`Brigade 1.4.0`) — in every state, including up to date, in error or launched from the
repo; the reason for an error is in the hover of the version. When a higher version is published, a
line announces it (`version 1.5.0 is available`, with the progress during the download) and carries
two actions: **Install now** (the recommended button; the app closes its terminals and relaunches on
the new version, which its hover says) and **Later** (the line disappears until the next launch,
where the downloaded version installs itself). A refusal of the installation is told in one line
under the message. Up to date and in error, no message.

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
  `brigade: the app is updated — 5 commits from origin/v2 (3ba369f → e5123e1), in /Users/chef/dev/brigade. It opens on the new version.`
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
| Tests and type check on Windows | the `app-windows` workflow (`.github/workflows/app-windows.yml`), on every PR that touches `app/`: a test that cannot run there is skipped with its reason, taken from `app/test/aides/posix.ts` — POSIX stand-ins, the box's code, the Mac and Android packages, a link to a missing file |
| Build the `.dmg` (on a Mac) | `npm --prefix app run dist` → `app/packaging/construit/` ([`app/packaging/README.md`](../app/packaging/README.md)) |
| Launch without consuming quota | `BRIGADE_CLAUDE_BIN="$PWD/app/test/aides/faux-claude.sh" BRIGADE_APP_CONFIG=<trial file> npm --prefix app start` |
| … and without a box | add `BRIGADE_SSH_BIN=<a script that prints a status output>` — and, to see what gets drawn, the example in `docs/runtime/etat-et-mesures.md` when its arguments end with `facts` |
| … and without your machine becoming a station | add `BRIGADE_APP_STATION=0` |

**The open app is a station** (see "This computer is a station; a phone is a workstation"): it creates its gist on your GitHub
account through your `gh`, and cooks the projects of its `station/projets`.
`BRIGADE_APP_STATION=0` prevents that; `BRIGADE_APP_CONFIG` also moves its directory, next to the
trial file.

**A project that declares `stations` launches real cooks on your workstation** as soon as the app is
open and its box has a ticket for them — on your quota, with no permission prompt, in a worktree of
its folder. To try it without a box or quota: no `stations` in the trial file, or the two stand-ins
above.

**Without `BRIGADE_SSH_BIN`, adding a project really installs**: the add screen runs the real
installation action on the chosen box. To try it without a box, the fake `ssh` returns the action's
object when its line carries `brigade-installer` (a line `{"ok":true,"ports":{"porte":3129,"arbitre":null},…}`).
For the go-live: the output of `installation` when its arguments end with `installation` — with, for
a "ready", the line `brigade : projet « <nom> » : prêt` and a code 0. The fake `claude` says
`reçu : /brigade:init` when it is opened on the session.
**And "Uninstall from the box" really uninstalls**: to try it without a box, the fake `ssh` returns,
when its line carries `uninstall`, the action's sentences on its error output and its object on its
standard output — `{"ok":true,"action":"uninstall","fait":"plan","projet":"<nom>",…}` for
`--plan`, `"fait":"desinstalle"` for `--confirm`.

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
  moving one to another place in it, declaring a box in it — and the boxes the add screen offers),
  `nom.ts` (the shape of the name, held against the rule of the installation action: the test calls
  `lireDemande` of `runtime/src/installateur.ts`), `installation.ts` (adding a project: the fields
  with no default, what goes to the box — read back by the same `lireDemande` —, and what the app
  does with each answer, against a fake `ssh` and the real projects file), `service.ts` (the
  go-live: its three states — init not merged, check incomplete, all ready —, what `Check` launches
  and what it does with each exit code, against a fake `ssh`; and that `Start` writes nothing into
  any terminal as long as the box does not say the project is ready, on the registry and fake ptys —
  the verdict line is compared with `runtime/src/installation-cli.ts`, the startup with
  `docs/installer.md`), `retrait.ts` (removing a project: that "Remove this project from the app"
  launches no `ssh` and leaves the box's log as it is; that the uninstall goes out neither without
  the box's plan, nor without the project's name, nor with the log option if it is not ticked —
  against a fake `ssh` standing in for a box, whose sentences are those of `direDesinstallation` and
  whose arguments are read back by `lireRetrait`, from `runtime/src/desinstallateur.ts`),
  `suivi.ts` (the same file read again when it changes, on real files and the system's real
  watch), `lancement.ts` (what `start` sets up before Electron — the commands are collected there,
  not run), `terminaux.ts` (the registry: what is launched, kept, relaunched, and what the app says
  of it — and the direct action: a free second, it goes; a busy one, nothing is written and the
  refusal says so; a filled-in prompt is not sent), `saisie.ts` (what the app knows of the second's
  input: its turns — the hooks played by a real `sh` —, its title, the chef's typing, the proof of
  shell mode; the signs are those recorded on the real `claude`, replayed without launching any),
  `pty.ts` (the real pty, against a fake `claude`), `box.ts` (the box watch and its states, against a
  fake `ssh` that each test writes: no network, no box), `attend.ts` (the `awaiting` block taken by
  its edge, on outputs copied from the runtime; and the number at the head of a line, on the block
  the runtime itself writes — the test calls `decrireAttentes` of `runtime/src/attend.ts`),
  `barre.ts` (a project's monogram), `couleurs.ts` (a project's colors: drawn without duplicates as
  long as the palette is not exhausted, written to the file — and only those that are missing —,
  changed one by one; in the played view, the tinted tile, the space's accent, the choice under
  Settings; none is a state color), `onglets.ts` (the five content tabs: each relays a script that
  exists in `runtime/package.json`, and only what is displayed is read), `boutons.ts` (what each
  button writes, compared with "Piloter" in `docs/runtime/exploitation.md` — and, in the registry
  and on the real pty, that nothing is sent), `gestes.ts` (the actions that are written into a shell
  of the space, and the two that go into the second: each command compared, character for
  character, with "Piloter", that nothing sends a written action, and that no action exposes a
  shell, a `sudo` or a free command), `manager.ts` (the manager's state read in the output of
  `manager`: on, off, never on, no decision, with its decisions and its set-asides — on outputs the
  test has `runtime/src/manager-cli.ts` itself write, on a real log; what does not have the shape is
  never read as "off"), `allumage.ts` (what turning it on commits: its warning compared with that of
  `docs/runtime/manager.md`, and the two numbers read on a known backlog — the line is written by
  `manager backlog` of `runtime/src/manager-cli.ts` itself, in front of a fake `gh`, then returned
  by a fake `ssh`; a box not reached, a runtime from before the command or an output without the
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
  `runner.ts` (the workstation plays a station, end to end against a test box: the tests'
  kitchen of the runtime — rail, guardrails, stations, pass —, on a real git repo, reached by a fake
  `ssh` that launches the real `runtime/src/tirer-cli.ts` in its process, and a fake `claude` to
  cook; the ticket goes out, its delivery passes the pass, its path in the log is that of a box cook;
  app stopped it is `86`, relaunched it goes out again; the lease renews only on a worktree that
  has moved, and lapses otherwise; each line passed to `ssh` is compared with the shape of the
  `pull` command — and, piece by piece, the reading of the stream against `superviser` and
  `lireFlux` of the runtime, the cook's environment against its `environnementCook`).
  `main.ts` and the view only wire things up; they are verified by launching the app. **The skin,
  though, is proven without launching it** (`peau.test.ts`): `vue.js` is played there as it is in
  front of a fake document (`app/test/aides/fausse-vue.ts` — just what the view touches of it, and a
  fake bridge), and `vue.css` is read there rule by rule. What it holds: that text relayed from the
  box is laid word for word on the six tabs and the add screen — "All projects" relays none of it —,
  and that no rule cuts it; that no color is written outside `jetons.css`, and that each is a color
  of the mockup — except a project's, which the view receives from the file (`couleurs.test.ts`);
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
- **`BRIGADE_CLAUDE_BIN`** replaces `claude`, as for the runtime; **`BRIGADE_SSH_BIN`**
  replaces `ssh`; **`BRIGADE_GH_BIN`** replaces the `gh` that reads and answers an issue's question
  ("The question awaiting you"); **`BRIGADE_APP_CONFIG`** replaces the path of the projects file.
  None of the four has to be set for real use.
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

- Show in the window the stations the workstation plays, and their cooks: that is in the terminal
  that launched the app, and on the `présence` line of `station`. Nor declare them from a screen:
  `stations` is written in the file.
- Play the worktree setup before a workstation cook, keep its raw stream, or resume a cook after a
  closing: "The workstation is a station", "What is not guaranteed".
- Play a station on an engine other than `claude`.
- Prepare a box, or put the installation action on it: that is once per box, on it, by hand
  (`docs/installer.md`, "Prepare the box"). The app says what to do and where, it does not do it.
- Start the runtime for you: that is a `root` action, which no box action gives without a password.
  The app writes the command into a shell, and writes it only if `installation` says the project is
  ready; the Enter is yours.
- Know whether the result of `/brigade:init` is merged, or whether the session succeeded: you say
  so, and `installation` verifies it on the origin.
- Fix what `installation` names — create the labels, protect the branch: it shows the arrow, the
  action is typed (`docs/installer.md`, "Check that the project is ready").
- Keep a go-live from one launch to the next: it starts over from the beginning, and the box says
  everything again.
- Keep from one launch to the next that a project was uninstalled from its box: relaunched, the app
  reads the box again, which says it is unknown.
- Remove what the uninstall leaves on the box — the project's backups, the unit templates, the
  action: `docs/installer.md`, "Uninstall".
- Ask for the integration branch: the box takes the origin's default branch. A project for which
  that is not the right one is installed by hand, or fixed in its drop-in.
- Add from the screen a project with no box, or served from your workstation.
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

## The manager

The manager decides **what goes onto the rail, and at what calibration**. Once on, the chef writes an issue in
product language, with no label at all: the manager sets `fire`, `model:` and `effort:` and says why —
or says, in a comment, why it is not an executable ticket. An **epic** it **splits** (see "It splits
epics"); a ticket that **fails in the pass**, it does something about, rather than passing it up to you as is
(see "It reacts to a failure").

**It has no switch of its own: it follows the project switch** (#1406, `npm --prefix runtime run switch`,
see "The project switch" in `docs/runtime/exploitation.md`) — one ON/OFF for the whole project, which also
takes the fired tickets and merges the green deliveries. The switch is **on by default**: the runtime sets it
at its first start, so a new project's manager judges without anyone flipping anything. On a log from before
the switch, the runtime sets it on at its start as well, whatever the manager and the `merge` grant were: the
stations took the fired tickets without reading either, so the project was cooking and keeps cooking. It turns on and off without a restart (facts in the log). Switched off in
the middle of a judgment, it lets the judgment finish but sets nothing: the decision is set, without judging
again, when the project is switched back on. `manager -- on` and `manager -- off` are refused, naming
`switch on` and `switch off`: nothing is written.

What `manager` writes — outputs, refusals, errors — is **in English** (words from `docs/glossary.md`: `ON` / `OFF`, `latest decisions`, `set aside`, `epics`, `reactions`). The keys of the `upstream` JSON do not change, only the text of `dit` is in English.

```bash
npm --prefix runtime run manager                # whether it judges (the project switch), its last fifteen decisions, what it set aside, the epics, its reactions to failures
npm --prefix runtime run manager -- return 77   # hand back an issue it set aside because you removed one of its labels
npm --prefix runtime run manager -- backlog     # what turning it on commits it to: how many issues are open, and how many carry blocked-on-human
npm --prefix runtime run manager -- upstream    # what is not on the rail yet: every open issue it does not carry, and what is happening to it — for the app
```

⚠️ **Once on, it judges the whole open backlog**, and whatever it judges executable goes straight to
the kitchen — and, the project switch being the same, its green deliveries are merged. Before switching it on, set `blocked-on-human` on whatever must not go: an issue that carries it
is never judged, **an epic that carries it is never split**. Between two issues you wrote
yourself, it sets no dependencies: they go in service order, unless you
write `attend` in the card of one of them. Between the tickets of an epic it splits, it does set them.

**Count before you turn it on.** `manager -- backlog` says in one line what turning it on commits it to:

```
backlog               12 open issues, of which 3 carry `blocked-on-human` — read just now on GitHub (benomite/brigade)
```

It is **a read, and nothing else**: a `GET` on the repository's list of open issues — the one the
manager polls, PRs left out —, under the `gh` of the service account, like `installation`. It sets no
label, writes nothing to the log and does not read it: it answers whether the manager is on or not, whether
the runtime is running or not. The second number counts the issues that carry
`blocked-on-human`: those will never be judged. The first is not "what will go" —
an issue already launched, a `question`, the roadmap are open too, and the manager does nothing with them
(the table below): it is what it will **look at**. Both numbers are written as bare digits,
in front of their word: the app reads them there, on the "turn on" gesture (`docs/app.md`, "The Manager
tab"). GitHub not reached, the command exits with `1` and says so, with no number at all — that is not
"no issue".

### Upstream of the rail

**An empty rail does not mean a finished project.** The rail carries only what has `fire`; upstream
are the issues the manager has not read yet, the epics not split yet, those it
set aside, those waiting for your answer, those that left the rail. `manager -- upstream`
lists them all, for a program — the app draws from it the "N upcoming" number next to the rail
(`docs/app.md`, "The rail"):

```json
{"lu":"2026-10-15T09:12:03.000Z","depot":"benomite/brigade","issues":[{"ticket":16,"titre":"…","url":"https://github.com/benomite/brigade/issues/16","priorite":1,"etat":"epique","dit":"it carries `epic`: not split yet"}]}
```

A single JSON object, on one line. `lu`: the time of the read, by the box's clock. `issues`:
**every open issue of the repository that the rail does not carry**, PRs left out — the list the manager
polls, read just now under the `gh` of the service account, like `backlog` —, in the order it
reads them: `prio:1` first, none last, the oldest first at equal priority.
`priorite`: that of its `prio:` label, `null` without. `dit`: what the box says about it, in one line.
`etat`: what is happening to it, one word from a closed list — the first that holds, in this order:

| `etat` | The issue… | According to |
|---|---|---|
| `attend` | awaits your answer: it is in the `awaiting` block of `status`, as in Awaiting you | the manager's waits |
| `en-route` | is about to enter the rail: it carries `fire`, the manager put it there without `fire` being there yet, or it was born from a split | its labels, the log |
| `sortie` | left the rail without being served (`fire` removed, `hors-cuisine` set), and nothing has been decided about it since | the log |
| `servie` | was served, and its issue is still open | the log |
| `decoupee` | is a split epic: its tickets carry the work — `dit` says how many are served, and names those that will not be without the chef ("#876 closed without delivery", "#877 left the rail (…)"). An epic whose tickets are **all** served is no longer listed: the manager closes it itself, with a comment that lists its tickets and their PRs (once; an epic the chef already closed is not commented). An epic with a missing ticket stays open | the splits |
| `epique` | is an epic not split yet — judged to be one, or carrying `epic` —, or whose split is in progress | the log, its labels |
| `ecartee` | was set aside by the manager — refused, or held by a label —, with its reason in one line | the manager's decisions |
| `non-lue` | has not been judged yet, or was handed back to it and not judged again | the log |

What the rail did with an issue (left, served) counts only if it is more recent than what the
manager decided about it. **Nothing else is deduced there**: neither the body of the issue, nor its
comments. It is **a read**: a `GET` on GitHub, then the log opened read-only;
nothing is written there, no label is set. It answers whether the manager is on or not. GitHub
not reached, or a log that does not have the manager's state yet, it exits with `1` and says so, without
listing anything — that is not "nothing upstream".

### What the code decides, and what the LLM judges

Its loop is code. On each wake-up it rereads **one** list — the open issues of the repository, under
its own ETag — and sorts it without spending anything:

| The issue… | What the manager does with it | In the log |
|---|---|---|
| carries `fire` and a complete calibration | Nothing: it is launched, by you or by it | — |
| received labels from the manager, and lacks `fire`, `model:` or `effort:` since | Nothing, **until you hand it back**. It says so once on the issue, with the command (see "Handing it back") | `manager.set-aside` (`chef-changed`) |
| is written by someone who has no hand on the repository | Nothing, without a comment | `manager.set-aside` (`untrusted-author`) |
| is the roadmap (`BRIGADE_ROADMAP_ISSUE`) | Nothing | `manager.set-aside` (`roadmap`) |
| is an epic it already split, or a ticket born from one of its splits | Nothing: it is done, and what they have carried since is yours | — |
| carries `hors-cuisine` — even with `fire`, a complete calibration or the `merge` grant | Nothing: the ticket is not served on this box. It does not enter the rail, is not in `attend`, and the manager says so once if it carries `fire` | `manager.set-aside` (`hors-cuisine`) |
| carries `blocked-on-human` | **Reread** by the LLM, once per state, for the decision it awaits. Written in the issue: nothing, it stays held. Absent, but a real question derives from it: a `product`, `design` or `gesture` card is proposed (the statement is the question) and goes to the triage like any card (see "Before TODO: the triage"), the issue stays held and the card leaves when the label goes. Absent, with no question: the kitchen takes the ticket back, the label is removed and the issue judged in the same turn. The comment says which of the two | `manager.requalified` (`stated`, `card`, `taken-back` or `unreadable`), then `manager.set-aside` unless taken back |
| carries `question` or `decision` | Nothing | `manager.set-aside` (the label) |
| already carries, in its body, the list of an epic's tickets, without it having split it | Nothing: it was split by hand | `manager.set-aside` (`already-split`) |
| carries `epic` | **Split** by the LLM, once | `manager.split`, or a question |
| any other | **Judged** by the LLM, once per state | `manager.judged`, or `manager.failed` |

None of these labels is required: an epic without `epic` goes to the LLM, which recognizes it — at the
price of one more judgment.

**The judgment** is a call to `claude` with no tool, outside any worktree, at the manager's calibration
(`station manager-modele` / `manager-effort`). It reads the title, the body, the labels and the
comments of those who have a hand on the repository (owner, members, collaborators — the rule of the
card), and answers with one of five natures: `ticket`, `epic`, `question`, `decision`,
`incomplete`. Only `ticket` enters the rail, calibrated according to this table; `epic` goes to
the split, the other three are refused:

| Ticket | Calibration |
|---|---|
| doc, rename, fix whose test is already written | `haiku` / `low` |
| mechanical `fix`/`tech` on a known module | `sonnet` / `low` |
| non-mechanical `fix`/`tech`, or any issue with precise acceptance criteria | `sonnet` / `medium` |
| `feature`, cross-cutting refactor, core of the product | `opus` / `high` |

**A written form criterion is worth one notch more**: as soon as an acceptance criterion imposes a
form ("five lines", "no preamble"), the ticket goes out at `sonnet` / `low` at least —
**write it in the acceptance criteria**, it does not guess it. It never sets `xhigh` or
`max`: they are yours alone.

### Handing it back

**Each deviation has its gesture, and `run manager` says it** (the `set aside` section, the ten most recent).

| Set aside because… | What hands it back to the manager |
|---|---|
| you removed from it a `fire`, `model:` or `effort:` that it had set (`chef-changed`) | `npm --prefix runtime run manager -- return <n°>` |
| it carries `blocked-on-human`, `question` or `decision` | Remove the label: it is judged at the next wake-up |
| its body already lists the tickets of an epic (`already-split`) | Remove the list from the body: the epic is split at the next wake-up |
| it carries `hors-cuisine` | Nothing to hand back: it is served elsewhere. Remove the label if the box must take it; the why is on the issue, written by whoever set it |
| it is the roadmap, or its author has no hand on the repository | Nothing |

`return` forces no deviation other than `chef-changed`: on an issue held by a label, the
command answers with the gesture that concerns it, writes nothing and exits with 1 — `blocked-on-human` remains your
protection. **Removing `fire` or a calibration it set, without replacing it**, is taking
execution back: it sets itself aside, and says so once on the issue with the command that hands it back.
Replacing a `model:` with another, or tidying your backlog (`prio:`, `question`, `decision`,
`blocked-on-human`), never makes a `chef-changed`.

**Handed back, the issue is judged anew** (`manager.handed-back`), at the next wake-up: it **removes the
calibration labels it had set itself** (`manager.withdrew` — never yours; if you launched and
calibrated it in the meantime, it is not judged again), then judges it again. **A handing back is worth one
judgment.**

### It splits epics

You set an **epic** in product language and find tickets: each with its **observable** acceptance
criteria, its dependencies, its file zone and its calibration, already launched.

**The split** is a second call to `claude`, like the judgment (`run` in `decoupe-<n°>-…`). It
reads the epic, the trusted comments, and **the repository's plan** — its folders on two
levels, as of the last fetch of the station's clone — from which it draws the zone of each ticket;
the project's common paths enter none. It returns one of three answers:

| Answer | What the manager does | In the log |
|---|---|---|
| a split, twelve tickets at most | Creates the tickets, launches them, says so on the epic | `manager.split`, then a fact per step |
| **a question**: the epic is ambiguous on a product choice | Sets it in a comment, creates nothing | `manager.split-asked` |
| "already split": the epic already names its tickets | Creates nothing, says so once | `manager.split-skipped` |

The question is reserved for a **product choice**, set as a choice between paths (what the
user will find). A technical ambiguity — where the code lives, the order, the mechanism — is
decided by the manager, which writes on the issue what it decided and why (the `motif` of the split).

An answer the code cannot read — a ticket with no criterion, no zone, one that waits for a ticket
placed after it, a calibration outside the table, more than twelve tickets — creates **no** ticket
(`manager.split-failed`).

**The question holds nothing back**: the rail moves on. It is read in `run manager`
(`QUESTION ASKED`). Answer in a comment or edit the epic: it is read again, **with the question**.

**A ticket born from a split** carries: a body that starts with `Épique : #N`, then the context,
the criteria and **why this calibration**; `model:`, `effort:`, and the epic's `prio:`; its
**card** (`attend`, `zone`, and `requiert` if it asks for a capability) in a comment; and `fire`, set **last**. It does not go through
the judgment again, and waits for those it depends on (see "A ticket's card", in `station.md`).

**An interface ticket is designated for the design cook** (`agents/cook-design.md`). The manager
recognizes it at the split: its zone touches the app's view (`app/src/vue/`, a file below it, or a
folder that contains it like `app/src`) — the code then designates it in any case —, or the
split says so (`"cook": "design"`), which it proposes only in a repository that defines the design
cook. A ticket of the runtime, of the docs or of the scripts is not one. The designated ticket carries the
label `cook:design` next to `model:` and `effort:`, a "Cook design" paragraph at the head of its
body — that is where the cook learns it is one, and where to read its profile —, and `· cook design` in
the "Calibrage" column of the split comment. The calibration does not change: model and effort
are set as for any ticket, never `xhigh` or `max`.

**The delivery of an interface ticket shows the screen before and after** (`runtime/src/captures.ts`).
A ticket is an interface ticket when its zone, at the taking, touches the app's view, or its issue carries
`cook:design` — reread at delivery, the rail does not keep labels. The design cook takes its
captures with `scripts/capture-ecran/` and commits them on its branch, one pair per changed screen:

```
docs/captures/<ticket>/<écran>-avant.png
docs/captures/<ticket>/<écran>-apres.png
```

`<écran>` pairs the two (`fiche`, `rail-vide`); `avant` and `apres` are read regardless of
case and accents. At the pushed delivery, the station reads them in the files the branch
changes, and shows them **under the PR's head line** and on the ticket: a "Captures" section (the heading the runtime writes),
each screen as an `Avant | Après` table, the two images side by side and captioned (`fiche — avant`),
loaded at the pushed commit (`https://github.com/<repository>/blob/<sha>/<path>?raw=true`, which GitHub
also shows in a private repository). **An interface delivery without its captures** — none, or a
screen that has only one — is said to be **incomplete** there: `Livraison incomplète : captures manquantes —
<what is missing>`, and where to put them. Nothing is stopped at delivery: it is the review that judges (below). The captures
go to the log with the report (`cook.reported`, `captures`: the commit and each screen), from which
`facts` gives them to the ticket's card. **A ticket that is not an interface ticket says nothing of it** — no
section on the PR, no field in the log, none in `facts`. A send-back delivers on the PR already open: its
body keeps the captures of the first delivery, the send-back's comment and `facts` show the
new ones.

**The review also judges the captures** (`runtime/src/reviewer.ts`, #843). For an interface ticket,
the reviewer's instruction adds a "Les captures" section (French: it is the heading the runtime writes today): the delivered captures (which it opens with
`Read`) and the three violations of the rules of #830, looked for on each "after" capture — `geste-non-bouton`
(an expected gesture that is only a command to copy), `mode-d-emploi` (a paragraph of explanation
in plain words), `erreur-brute` (a technical error displayed as is). **It judges only the part of the screen
that the ticket adds or changes** (#895): what is found identical on the "before" capture existed
already and never blocks. A violation in the ticket's zone is a **blocking** finding, which carries `regle`
and cites as `fichier` the "after" capture concerned; a pre-existing violation, outside that zone, is a
**remark** (same `regle`, same `fichier`), which proposes a separate ticket if no open ticket covers it.
A finding of this type that does not cite a delivered capture, or that is `a_supprimer`, makes the review
unreadable (it is asked for again). A
capture that respects the rules produces no finding of this type. **An interface delivery with no capture
at all is blocking**: the station adds the finding itself (`fichier`: `docs/captures/<ticket>/`)
if the reviewer did not say it. A screen that has only one of its two captures stays a remark. A ticket
that is not an interface ticket does not change. The expected case is in `evals/relecture-captures-830/`.

**The epic lists its tickets, with their state**, in a block that the manager writes at the end of its
body, between two markers:

```markdown
<!-- brigade:tickets -->
## Tickets de l'épique

**1/3 servi.**

| # | Ticket | État |
|---|---|---|
| #80 | Le rail compte ses tickets | servi |
| #81 | La pass lit le compte | en cuisine |
| #82 | La doc dit le compte | attend #81 |

_Liste tenue par le manager : ce qui est entre ses deux marqueurs est réécrit, le reste de l'épique est à toi. Pour y faire entrer un ticket que tu ajoutes, écris `Épique : #78` dans son corps._
<!-- /brigade:tickets -->
```

(The block is written in French, as shown: it is text the runtime writes onto GitHub. The note at its
foot says: *list kept by the manager: what is between its two markers is rewritten, the rest of the epic is yours. To
make a ticket you add enter it, write `Épique : #78` in its body.*)

**It is the only place in the body that it rewrites.** A marker counts only **alone on its line,
outside a code block**; without an end marker, it replaces only the start one. The states follow
the rail: `pas sur le rail` (off the rail), `en attente` (queued), `attend #N` (awaiting), `en cuisine` (taken), `en pass` (in pass), `servi` (served),
`86 (motif)`, `bloqué — #N abandonné (…)` (blocked, #N dropped), `abandonné (…)` (dropped), `fermé` (closed). **`en cuisine` is the step
of a ticket** — the one the rail calls `pris` (taken), a cook holds it — and says nothing of the project's state
(see "The state of the kitchen"). Off, the manager no longer keeps
the list; turned back on, it catches up.

**Your split is stronger than its own.** An epic is split **only once**. After which:

- you **close** a ticket: it is not reborn; the list says `abandonné`, and `bloqué` for those that
  waited for it — it is up to you to remove the `attend` line from their card;
- you **add** a ticket: write `Épique : #N` in its body, it enters the list, judged and
  calibrated like any issue;
- you **change** a criterion, a card, a calibration, you remove `fire`: nothing is rewritten;
- you **hold** the epic (`blocked-on-human`): the creations in progress wait.

**An epic already split by hand: paste `<!-- brigade:tickets -->` into its body** (even
alone) before turning on — the code recognizes it without an LLM (`already-split`). A **closed** epic
is never split.

**Creating N issues is not atomic**: the split is in the log **before** the first call to
GitHub, and after an outage the next wake-up resumes at the first ticket that is missing, **without
judging again**. A creation left without follow-up is first **searched for** by the mark that each ticket
carries in its body (`<!-- brigade:decoupage #N.k -->`), and resumed (`reconciled: true`). The
mark — like a card — counts only coming from **someone who has a hand on the repository**.

Limits: the code checks that two concurrent tickets share no zone path (see
"File zones", in `station-cook.md`), not that the zone is the right one; and closing the served epic is your gesture.

### It reacts to a failure

Off, nothing changes: the pass sends back twice to the same calibration, then passes the ticket up to you.
**On, the pass hands over to it from the second red** (`pass.deferred`): the ticket stays in
the pass, no cook restarts until it has decided.

| Pass red no. | What happens | Cost |
|---|---|---|
| 1 | send-back 1/2 at the same calibration — that is the pass | — |
| 2 | the manager **raises the calibration one notch** if it can, then sends back 2/2. Otherwise the send-back goes at the same calibration, and it says why | none: it is code |
| 3 and following | the manager **chooses**: raise again, **re-split** the ticket, or **pass it up** to you — and says which and why, on the issue | a judgment |

**Raising one notch** is the effort first (`low` → `medium` → `high` → `xhigh` → `max`), then the
model (`haiku` → `sonnet` → `opus`) keeping the effort reached — **within the project's
ceiling** (#1284), a chef's decision in the project's log, **`opus` / `high` by default**: a project where
nobody set it raises up to there, with no action. **It
replaces only its own labels**: a dimension you calibrated is never touched. **A
ticket that failed twice never goes out identical**: if nothing changes, it is passed up.

| Its choice | What happens |
|---|---|
| **raise** | the label changes, the ticket goes back to queued: a cook takes it up on the same branch, on the same PR. Red again, the manager chooses anew |
| **re-split** | the ticket becomes **the epic of its sub-tickets**: they are born calibrated, ordered and launched, and start again from the base. It goes **86** (`manager:split`, pass `manager-split`); its PR stays open, as a reference, and **it no longer holds its zone**. A ticket born from such a re-split is not re-split |
| **pass up** | the ticket goes **86** (`manager:escalated`, pass `still-red`, cause `manager-escalated`), and you receive what you need to decide: each attempt with its calibration and what the pass found in it, why it is passed up, and **what it proposes** |

A card is proposed only if the cause of the red is a **product choice** (`product`) or a **gesture** that only you can make (`gesture`): the manager proposes it with the passing up, in one line; like any card it goes to the triage, and what enters TODO (`todo.entered`) is a question with its choices, which replaces the bare passing up in `attend`. A red that hides neither is passed up **without a card** — the issue says so —, and no card is ever set for it. The card leaves TODO as soon as the ticket is no longer 86 `manager:escalated`.

An unreadable answer, a choice that was not offered (raising at the ceiling, re-splitting a
sub-ticket) or an impossible re-split counts as **passing up**. **The breaker has the last
word**: at the threshold, the manager passes up without relaunching or judging anything more. Each reaction is in the
log (`manager.reacted`, `manager.raised`); `run manager` shows the last ten.

**Good to know.** A ticket whose calibration you change while the manager holds it goes back to
yours. If you set the old label back in place of its own, the ticket waits, "rouge, au manager"
in `run pass`: replace the label, or turn the manager off — the pass takes back its earlier rule.

#### The calibration ceiling

Each dimension is a decision (`decisions.ts`), set without a restart: `station ceiling-modele <model>`,
`station ceiling-effort <effort>`; `station remove ceiling-modele` brings the default back. The manager rereads it at
each reaction. `station` shows it, and where each value comes from (`calibration ceiling: opus / high — default`);
`facts` gives it (`plafondDeCalibrage`: `modele`, `effort`, `parLeChef`), and the app shows and sets it on the Cooks
tab. `BRIGADE_CEILING_MODEL` and `BRIGADE_CEILING_EFFORT` are no longer read from the environment: left in a
drop-in or on a station line, the runtime says them ignored, with the gesture that replaces them, and serves the
project. Each reaction notes the ceiling it chose within (`manager.reacted`, `ceiling`), and its comment on a raise
names it.

**The project's repository comes first** (#1304). When the integration branch carries
`.claude/brigade/projet.json`, its `calibrationCeiling`, and its `defaultCalibrations` for the manager and the
reviewer, replace what is set on the box: the decisions stay in the log, ignored while the file sets them. The file is
read on `origin/<integration branch>` as the last fetch saw it (`runtime/src/reglages-projet/en-vigueur.ts`), never in
the clone's working tree, which the station never updates: a merged change applies from the next fetch — before each
cook and each pass —, with no restart. `station` says where each value comes from (`from the project's repository`),
`facts` adds `depuisLeDepot: true` to `plafondDeCalibrage`, and a `station ceiling-modele …` gesture on such a project
is written but said ignored. A file that is not the project's settings refuses to open the kitchen; one that becomes
unreadable while it runs is said once, and the runtime keeps to what it last read. Without the file, nothing changes.

### Before TODO: the triage

While the manager is on, **no card enters TODO directly**: a card admitted at the door is held
(`todo.held`) and goes first to the triage agent (`agents/triage.md`; the runtime ships its copy,
`runtime/src/triage/agent.md`, which a test keeps identical). At its next wake-up, the manager gives
it the issue and its trusted comments, the ticket on the rail and what it waits for, the delivery
and what the pass and the review found, the PR diff, the CI checks and the log of each red job.
While it decides, the card is not in TODO.

| Its answer | What the runtime does |
|---|---|
| **relaunch** | the ticket goes back to queued (`triage:relaunched`), and its delivery is returned to a cook with the agent's diagnostic in place of the findings |
| **re-split** | the manager's split, then the ticket goes 86 `manager:split`, like a re-split after a red |
| **dependency** | the number is removed from the `attend` line of the card (fiche) on the issue |
| **wait** | only if a check is still running: the card stays held for 15 minutes, then is triaged again |
| **remove** | `fire` is removed, the ticket leaves the rail |
| **todo** | the card it writes — its kind, one question, its choices — goes to the TODO gate (below), in the name of whoever set it; without one, the card as it was set |

Each action done writes **exactly one sentence** on the issue (the agent's, refused if it is not a
single sentence on one line), and `todo.triaged` in the log. An unreadable answer, an action that
cannot be done, an agent that cannot run (stop, breaker, held account): the card as it was set goes
to the gate. **The triage never merges**: no action merges, an agent asking for it is not read, and
merging stays with the grant on a green pass. Manager off, every held card goes to the gate; the one
it refuses stays held until the manager is back.

#### What enters TODO, and how you answer

The TODO gate (`runtime/src/carte-todo.ts`) admits **two kinds of cards, and no other**: a choice
that changes the product (`product`) and a design validation (`design`). Each says first **what
happens, in at most two plain sentences** (`resume`: one line, no Markdown), asks **exactly one
question** (one line, ending with its only "?") and offers **at least two choices**, each one line,
each with the gesture it plays: `resume` (the kitchen takes the ticket up again with your answer),
`merge` (the green delivery waiting for you is merged) or `drop` (the ticket leaves the rail). The
gate judges by the single shape of every TODO card (`runtime/src/carte-todo/forme.ts`). A `design` card shows **the captures its
ticket delivered**, each screen before and after (`docs/captures/<ticket>/<screen>-avant.png` and
`-apres.png`, taken with `scripts/capture-ecran/` and read from its last delivery,
`runtime/src/captures.ts`); without them it does not enter. A `product` card shows them when its ticket delivered some, and none otherwise. Anything
else — a `gesture`, a card with no question or no choice — is refused (`todo.refused`, with the
reason) and **sent back to the triage**: it stays held, and the agent reads the reason at its next
turn. A card the gate sends back three times after an answer of the agent is no longer taken up:
the ticket shows in `attend` with the card of what it waits for (below). A card entered before this gate (a `gesture`,
a card without choices) is no longer read as a card.

Every ticket in `attend` has a card of that same shape (`runtime/src/carte-todo/cartes.ts`), built
from what it waits for when no card of the gate stands for it: a green delivery the pass does not
merge, a red ticket escalated by the manager or the pass, a PR closed without a merge, a ticket set
aside (86, a missing capability, an absent station, back from WAITING), a ticket blocked by one that
left the rail, an issue the manager set aside or could not read, the manager's question before
splitting an epic. A card with a single gesture — merging a green delivery without a grant, taking a
blocked ticket off the rail, handing an issue back to the manager — shows that one button and asks no
question. Every card offers the free answer, and "ask the second" beside its choices, never among
them. A card that does not hold the shape is never shown half-built: the runtime raises.

`facts` gives each card in `attend[].carte`: `type` (`product` or `design` for a card of the gate,
otherwise what the ticket waits for — `merge`, `remontee`…), `resume`, `question` (`null` on a single
gesture), `choix` (`texte`, `suite`), `reponseLibre`, `secondaire` (`ask the second`) and `captures`
(`complet`, `ecrans` with `avant` and `apres`, by address), `null` without a screen. **One call
settles it**, by a choice or in your own words:

```
npm --prefix runtime run rail -- choose 8 2              # choice 2 of the card, from 1
npm --prefix runtime run rail -- answer 8 <your words…>  # free text
```

Your answer is written on the issue, the card leaves TODO (`todo.answered`, `todo.left`), and the
ticket moves on: a delivery waiting for you — green, or passed up — goes back to a cook, who reads
your answer in place of the findings (`chef-answered`); a `merge` choice merges the green delivery,
the pass serves the ticket; a ticket 86 with no delivery goes back to the rail; an issue held by
`blocked-on-human` loses its label and the manager judges it again. What cannot be done (no card,
a choice out of range, a `merge` with no green delivery waiting, a cook at work) is refused before
anything is written; GitHub refusing the comment changes nothing.

### What it leaves on the issue

- **Executable**: the labels, then a comment — why, **why this calibration**, what
  was already set, the cost of the judgment. **Refused**: no label, and its nature, the reason, what
  would make it executable.
- **Split epic**: why these tickets, this order, their table, the cost — and the list in
  its body. **Question**, **already split**, **unreadable**: a comment that says so.

An issue is judged **only once per state** — title, body, trusted comments: you
edit the body or you comment, it is judged again (at the price of a judgment); your labels, and what
the manager wrote, do not make it judged again. An unreadable judgment is not retried on the same
state; a judgment **that did not complete** (outage, guardrail) writes nothing and starts again at the next
wake-up, bounded by the breaker.

### Your gesture is stronger than its own

- **It never removes a label you set.** The only ones it removes are its own: a
  calibration it raises, or one it had set on an issue you hand back to it.
- **It never sets in a dimension that already carries a label**, and **sets only once per
  issue**: after which everything it carries is yours, until you hand it back. "Set
  by the manager" is what the log says (`manager.labeled`), not the author as GitHub sees it.
- **It rereads the labels just before setting**: held in the meantime, nothing is set.
- **`fire` set by you on what the code sets aside** (the roadmap, a `question` label…): it removes
  nothing, does not calibrate, and says so once. If you calibrate yourself, the cook goes.

Known limit: if the runtime dies between setting the labels and writing `manager.labeled`,
they are taken for yours.

### What it costs

**It spends quota only to judge and to split** (an epic with no label: two calls).
Each judgment is in the log **like a cook** (`cook.launched`, station `manager`, off ticket;
`cook.exited`; stream in `runs/`) and goes through the guardrails: **nothing is judged** under "stop",
open breaker, exhausted quota or expired connection — it is judged on resumption. For the
breaker, an unreadable or incomplete judgment is **a failure**, a successful judgment counts neither
for nor against; a judgment **that the model refuses** is retried, and is pinned at the third refusal
in a row (see "When the model refuses", in `station-cook.md`). It does not hold the station. Allow up to one
minute between the decision and the cook's departure.

| Event | Meaning |
|---|---|
| `manager.enabled`, `manager.disabled` | The chef turns on, turns off (off ticket) |
| `manager.set-aside` | The code set the issue aside, without judgment: `reason`; `fired`: it carries a `fire` left in place; `lacking`, on a `chef-changed`: what it lacks |
| `manager.judged` | The LLM judged: `verdict` (`fire`, `refused`), `kind`, `reason`, `missing`, `model`, `effort`, `calibration`, `run`, `fingerprint` (the judged state) |
| `manager.failed` | The judgment ran to its end, but cannot be read — or the model refused it three times in a row |
| `manager.labeled`, `manager.commented` | The labels it set, once GitHub answered; the decision is said on the issue |
| `manager.handed-back`, `manager.withdrew` | The chef hands back an issue set aside as `chef-changed`; the manager's calibration labels are removed from it (`labels`) |
| `manager.closed`, `manager.reopened` | An issue the manager was waiting on the chef for left the open issues (it leaves the chef's queue), or came back to them |
| `manager.reacted`, `manager.raised` | Its reaction to a failure in the pass; the labels a raising changed |
| `manager.split` | The intent of the split, written before any creation: `reason`, `order`, `tickets` (title, context, criteria, `waitsFor`, zone, calibration, `overlaps` — the waits the code added for overlapping zones), `run`, `fingerprint` |
| `manager.split-asked`, `-skipped`, `-failed` | A question to the chef; the epic already lists its tickets; the answer cannot be read |
| `manager.split-creating`, `-created`, `-fired` | The ticket of rank `index` is about to be created; it exists (fact carried by the born ticket, `reconciled` if it was found again); its card and `fire` are set |
| `manager.split-done`, `-commented` | All the tickets exist and are launched; the split is said on the epic |
| `manager.split-adopted`, `-seen`, `-listed` | A ticket of the chef's claims the epic; an epic ticket left the open issues or came back to them; the list is written in the body (`digest`) |

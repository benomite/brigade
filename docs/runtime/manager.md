## The manager

The manager decides **what goes onto the rail, and at what calibration**. The chef writes an issue in
product language, with no label: the manager sets `fire`, `model:` and `effort:` and says why — or says
in a comment why it is not executable. An **epic** it **splits**; a ticket that **fails in the pass**, it
acts on rather than passing it up as is.

**It has no switch of its own: it follows the project switch** (`npm --prefix runtime run switch`, see
"The project switch" in `docs/runtime/exploitation.md`), without a restart. Switched off mid-judgment, it
finishes the judgment but sets nothing: the decision is set, without judging again, when the project is
switched back on. `manager -- on` and `manager -- off` are refused, naming `switch on`/`switch off`.

What `manager` writes is **in English**; the keys of the `upstream` JSON do not change, only `dit`.

```bash
npm --prefix runtime run manager                # whether it judges, its last fifteen decisions, what it set aside, the epics, its reactions
npm --prefix runtime run manager -- return 77   # hand back an issue it set aside because you removed one of its labels
npm --prefix runtime run manager -- backlog     # what turning it on commits it to: open issues, and how many carry blocked-on-human
npm --prefix runtime run manager -- upstream    # every open issue not on the rail, and what is happening to it — for the app
```

⚠️ **Once on, it judges the whole open backlog**, and whatever it judges executable goes straight to the
kitchen and is merged when green. Before switching on, set `blocked-on-human` on whatever must not go:
an issue that carries it is never judged, **an epic that carries it is never split**. It sets no
dependencies between issues you wrote (unless you write `attend` in a card), but does between the
tickets of an epic it splits.

**Count before you turn it on.** `manager -- backlog` says in one line, for example `12 open issues, of
which 3 carry blocked-on-human — read just now on GitHub`, what turning on commits to. It is **a read**
(a `GET` on the open issues, PRs left out; the log is neither written nor read). The first number is
what it will **look at**, not "what will go". Both are bare digits before their word: the app reads
them (`docs/app.md`, "The Manager tab"). GitHub not reached, it exits with `1`.

### Upstream of the rail

**An empty rail does not mean a finished project.** `manager -- upstream` lists, for a program, the
issues not read yet, epics not split, set aside, awaiting your answer, or left the rail (the app does
not run it: the Kitchen board publishes the same issues, [`tableau-de-cuisine.md`](tableau-de-cuisine.md),
`avantLeRail`).

One JSON object on one line (`lu`, `depot`, `issues`). `lu`: read time, by the box's clock. `issues`:
**every open issue the rail does not carry**, PRs left out, `prio:1` first, none last, oldest first at
equal priority. Each has `ticket`, `titre`, `url`, `priorite` (its `prio:` label, `null` without), `dit`
(one line from the box) and `etat`, the first that holds of:

- `attend`: awaits your answer (it is in the `awaiting` block of `status`);
- `en-route`: about to enter the rail (it carries `fire`, the manager put it there without `fire` being
  there yet, or it was born from a split);
- `sortie`: left the rail unserved (`fire` removed, `hors-cuisine` set), nothing decided since;
- `servie`: served, its issue still open;
- `decoupee`: a split epic; `dit` says how many tickets are served and names those that will not be
  without the chef. An epic whose tickets are **all** served is no longer listed: the manager closes it,
  with a comment listing its tickets and PRs (once);
- `epique`: an epic not split yet (judged to be one, or carrying `epic`), or being split;
- `ecartee`: set aside by the manager (refused, or held by a label), with its reason;
- `non-lue`: not judged, or handed back and not judged again.

What the rail did with an issue (left, served) counts only if more recent than the manager's decision.
It is **a read**. GitHub not reached, or a log without the manager's state, it exits with `1`.

### What the code decides, and what the LLM judges

On each wake-up the loop rereads **one** list — the open issues, under its own ETag — and sorts it
without spending anything:

| The issue… | What the manager does | In the log |
|---|---|---|
| carries `fire` and a complete calibration | Nothing: launched, by you or by it | — |
| received labels from the manager, and lacks `fire`, `model:` or `effort:` since | Nothing, **until you hand it back**; says so once on the issue, with the command | `manager.set-aside` (`chef-changed`) |
| is written by someone with no hand on the repository | Nothing, no comment | `manager.set-aside` (`untrusted-author`) |
| is the roadmap (`BRIGADE_ROADMAP_ISSUE`) | Nothing | `manager.set-aside` (`roadmap`) |
| is an epic it already split, or a ticket born from its splits | Nothing: what they carry since is yours | — |
| carries `hors-cuisine` — even with `fire`, a calibration or the `merge` grant | Nothing: not served on this box, not in the rail nor `attend`; says so once if it carries `fire` | `manager.set-aside` (`hors-cuisine`) |
| carries `blocked-on-human` | **Reread** by the LLM once per state, for the decision it awaits. Stated in the issue: stays held. Absent but a real question derives: a `product`, `design` or `gesture` card is proposed and goes to the triage; the issue stays held, the card leaves with the label. Absent, no question: the kitchen takes the ticket back, the label is removed, the issue judged in the same turn. The comment says which | `manager.requalified` (`stated`, `card`, `taken-back`, `unreadable`), then `manager.set-aside` unless taken back |
| carries `question` or `decision` | Nothing | `manager.set-aside` (the label) |
| already lists an epic's tickets in its body, unsplit by it | Nothing: split by hand | `manager.set-aside` (`already-split`) |
| carries `epic` | **Split** by the LLM, once | `manager.split`, or a question |
| any other | **Judged** by the LLM, once per state | `manager.judged`, or `manager.failed` |

No label is required: an epic without `epic` goes to the LLM, at one more judgment.

**The judgment** is a call to `claude` with no tool, outside any worktree, at the manager's calibration
(`station manager-modele` / `manager-effort`). It reads the title, body, labels and comments of those
with a hand on the repository (owner, members, collaborators) and answers one of five natures: `ticket`,
`epic`, `question`, `decision`, `incomplete`. Only `ticket` enters the rail, calibrated by this table;
`epic` goes to the split, the others are refused:

| Ticket | Calibration |
|---|---|
| doc, rename, fix whose test is already written | `haiku` / `low` |
| mechanical `fix`/`tech` on a known module | `sonnet` / `low` |
| non-mechanical `fix`/`tech`, or any issue with precise acceptance criteria | `sonnet` / `medium` |
| `feature`, cross-cutting refactor, core of the product | `opus` / `high` |

**A written form criterion is worth one notch more**: when an acceptance criterion imposes a form ("five
lines", "no preamble"), the ticket goes out at `sonnet` / `low` at least — **write it in the criteria**,
it does not guess. It never sets `xhigh` or `max`: they are yours alone.

### Handing it back

**Each deviation has its gesture, and `run manager` says it** (the `set aside` section, ten most recent).
`chef-changed` (you removed a `fire`, `model:` or `effort:` it set): `npm --prefix runtime run manager --
return <n°>`. `blocked-on-human`, `question`, `decision`: remove the label, judged at the next wake-up.
`already-split`: remove the list from the body. `hors-cuisine`, roadmap, author with no hand on the
repository: nothing to hand back (remove `hors-cuisine` if the box must take the issue).

`return` forces only `chef-changed`: on an issue held by a label it names the right gesture and exits
with 1. **Removing `fire` or a calibration it set, without replacing it**, sets it aside. Replacing a
`model:`, or tidying `prio:`, `question`, `decision`, `blocked-on-human`, never makes a `chef-changed`.

**Handed back** (`manager.handed-back`), the issue is judged anew at the next wake-up: it **removes the
calibration labels it set itself** (`manager.withdrew`; never yours), then judges. **A handing back is
worth one judgment.**

### It splits epics

You set an **epic** in product language and find tickets, each with **observable** acceptance criteria,
dependencies, file zone and calibration, already launched.

**The split** is a second call to `claude` (`run` in `decoupe-<n°>-…`). It reads the epic, the trusted
comments and **the repository's plan** (its folders on two levels, as of the station clone's last fetch),
from which it draws each zone; the project's common paths enter none. Three answers:

| Answer | What the manager does | In the log |
|---|---|---|
| a split, twelve tickets at most | Creates and launches the tickets, says so on the epic | `manager.split`, then a fact per step |
| **a question**: the epic is ambiguous on a product choice | Sets it in a comment, creates nothing | `manager.split-asked` |
| "already split": the epic names its tickets | Creates nothing, says so once | `manager.split-skipped` |

The question is for a **product choice**; a technical ambiguity the manager decides, writing what and
why (the `motif`). An answer the code cannot read (a ticket with no criterion or zone, one waiting for a
ticket placed after it, a calibration outside the table, more than twelve tickets) creates **no** ticket
(`manager.split-failed`). **The question holds nothing back**: the rail moves on. It is read in `run
manager` (`QUESTION ASKED`); answer in a comment or edit the epic, and it is read again **with the
question**.

**A ticket born from a split** carries a body starting with `Épique : #N`, then context, criteria and
**why this calibration**; `model:`, `effort:` and the epic's `prio:`; its **card** (`attend`, `zone`,
`requiert`) in a comment; and `fire`, set **last**. It is not judged again and waits for those it depends
on (see "A ticket's card", in `station.md`).

**An interface ticket goes to the design cook** (`agents/cook-design.md`): its zone touches the app's view
(`app/src/vue/` or a folder containing it like `app/src`), or the split says so (`"cook": "design"`, only
in a repository that defines the design cook). It carries `cook:design`, a "Cook design" paragraph at
the head of its body, and `· cook design` in the split comment's "Calibrage" column. Calibration is
unchanged.

**Its delivery shows the screen before and after** (`runtime/src/captures.ts`). A ticket is an interface
ticket when its zone, at the taking, touches the app's view or its issue carries `cook:design`. The design
cook commits one pair per changed screen, taken with `scripts/capture-ecran/`:
`docs/captures/<ticket>/<écran>-avant.png` and `…-apres.png`. At the pushed delivery the station shows
them under the PR's head line and on the ticket, one `Avant | Après` table per screen. **A delivery without
its captures** (none, or a screen with one) is said **incomplete** there; nothing is stopped, the review
judges. They go to the log with the report (`cook.reported`, `captures`), from which `facts` gives them to
the card.

**The review also judges the captures** (`runtime/src/reviewer.ts`). On each "after" capture it looks for
`geste-non-bouton`, `mode-d-emploi` and `erreur-brute`, **only in what the ticket adds or changes**. A violation in the ticket's zone is a **blocking** finding citing the "after" capture; a
pre-existing one outside it is a **remark**. A finding citing no delivered capture, or `a_supprimer`,
makes the review unreadable (asked again). **A delivery with no capture at all is blocking**; a screen
with one of two stays a remark. The expected case is in `evals/relecture-captures-830/`.

**The epic lists its tickets, with their state**, in a block the manager writes at the end of its body,
between `<!-- brigade:tickets -->` and `<!-- /brigade:tickets -->`: a French heading `## Tickets de
l'épique`, `**1/3 servi.**`, a `# | Ticket | État` table, and a note saying what is between the markers is
rewritten, the rest is yours, and `Épique : #78` in a ticket's body makes it enter. **It is the only place
in the body it rewrites.** A marker counts only **alone on its line, outside a code block**. States
follow the rail: `pas sur le rail`, `en attente`, `attend #N`, `en cuisine`, `en pass`, `servi`,
`86 (motif)`, `bloqué — #N abandonné (…)`, `abandonné (…)`, `fermé`. Off, the manager no longer keeps
the list; turned back on, it catches up.

**Your split is stronger than its own.** An epic is split **only once**. You **close** a ticket: it is not
reborn (the list says `abandonné`, `bloqué` for its dependents: remove their `attend` line yourself); you
**add** one by writing `Épique : #N` in its body; you **change** a criterion, card or calibration, or
remove `fire`: nothing is rewritten; you **hold** the epic: creations in progress wait. **An epic split by hand: paste `<!-- brigade:tickets -->` into its body** before turning on
(`already-split`). A **closed** epic is never split.

**Creating N issues is not atomic**: the split is in the log **before** the first call to GitHub; after an
outage the next wake-up resumes at the first missing ticket, **without judging again**, first **searching**
the mark each ticket carries (`<!-- brigade:decoupage #N.k -->`; `reconciled: true`). The mark counts
only from **someone with a hand on the repository**. The code checks that two concurrent tickets share no
zone path (see "File zones", in `station-cook.md`), not that the zone is right.

### It reacts to a failure

Off, the pass sends back twice at the same calibration, then passes the ticket up to you. **On, the pass
hands over from the second red** (`pass.deferred`): the ticket stays in the pass, no cook restarts until
the manager decides.

| Pass red no. | What happens | Cost |
|---|---|---|
| 1 | send-back 1/2 at the same calibration — the pass | — |
| 2 | the manager **raises the calibration one notch** if it can, then sends back 2/2; else same calibration, and it says why | none: code |
| 3 and following | the manager **chooses**: raise again, **re-split**, or **pass up** — and says which and why on the issue | a judgment |

**Raising one notch** is the effort first (`low` → `medium` → `high` → `xhigh` → `max`), then the model
(`haiku` → `sonnet` → `opus`) keeping the effort reached, **within the project's ceiling** (below), and
only on its own labels: a dimension you calibrated is never touched. **A ticket that failed twice never
goes out identical**: if nothing changes, it is passed up.

| Its choice | What happens |
|---|---|
| **raise** | the label changes, the ticket goes back to queued: a cook takes it up on the same branch and PR. Red again, the manager chooses anew |
| **re-split** | the ticket becomes **the epic of its sub-tickets**, born calibrated, ordered, launched, starting from the base. It goes **86** (`manager:split`, pass `manager-split`); its PR stays open as a reference and **no longer holds its zone**. A ticket born from a re-split is not re-split |
| **pass up** | the ticket goes **86** (`manager:escalated`, pass `still-red`, cause `manager-escalated`) and you receive each attempt with its calibration and what the pass found, why it is passed up, and **what it proposes** |

A card is proposed with the passing up only if the cause is a **product choice** (`product`) or a
**gesture** only you can make (`gesture`); it goes to the triage like any card, and what enters TODO
(`todo.entered`) replaces the bare passing up in `attend`; it leaves once the ticket is no longer 86
`manager:escalated`. A red that hides neither is passed up **without a card**: the kitchen takes it up
(`pass.md`, "A technical escalation goes to the kitchen").

An unreadable answer, a choice not offered (raising at the ceiling, re-splitting a sub-ticket) or an
impossible re-split counts as **passing up**. **The breaker has the last word**: at the threshold the
manager passes up without relaunching or judging. Reactions are in the log (`manager.reacted`,
`manager.raised`); `run manager` shows the last ten. A ticket whose calibration you change while the
manager holds it goes back to yours; if you set the old label back in place of its own, the ticket
waits, "rouge, au manager" in `run pass`: replace the label, or turn the manager off.

#### The calibration ceiling

**`opus` / `high` by default**, a chef's decision in the project's log (`decisions.ts`), set without a
restart: `station ceiling-modele <model>`, `station ceiling-effort <effort>`; `station remove
ceiling-modele` brings the default back. `station` shows it and where each value comes from; `facts`
gives it (`plafondDeCalibrage`: `modele`, `effort`, `parLeChef`); the app shows and sets it on the
Cooks tab. `BRIGADE_CEILING_MODEL` and `BRIGADE_CEILING_EFFORT` are no longer read: left set, the
runtime says them ignored. Each reaction notes its ceiling (`manager.reacted`, `ceiling`).

**The project's repository comes first.** When the integration branch carries
`.claude/brigade/projet.json`, its `calibrationCeiling` and `defaultCalibrations` for the manager and the
reviewer replace what the box sets. It is read on `origin/<integration branch>` as the last fetch saw it
(`runtime/src/reglages-projet/en-vigueur.ts`): a merged change applies from the next fetch. `station`
says `from the project's repository`, `facts` adds `depuisLeDepot: true`, and a `station ceiling-modele
…` gesture on such a project is written but said ignored. A file that is not the project's settings
refuses to open the kitchen; one that becomes unreadable is said once, the runtime keeping what it last
read.

### Before TODO: the triage

While the manager is on, **no card enters TODO directly**: a card admitted at the door is held
(`todo.held`) and goes first to the triage agent (`agents/triage.md`; `runtime/src/triage/agent.md` is its
copy, kept identical by a test). At its next wake-up the manager gives it the issue and trusted comments,
the ticket and what it waits for, the delivery and the pass's and review's findings, the PR diff, the CI
checks and each red job's log. Its answer:

- **relaunch**: the ticket goes back to queued (`triage:relaunched`); its delivery returns to a cook with
  the agent's diagnostic in place of the findings;
- **re-split**: the manager's split, then the ticket goes 86 `manager:split`, as after a red;
- **dependency**: the number is removed from the `attend` line of the card (fiche);
- **wait**, only if a check is still running: held 15 minutes, then triaged again;
- **remove**: `fire` is removed, the ticket leaves the rail;
- **todo**: the card it writes (kind, one question, choices) goes to the TODO gate in the name of whoever
  set it; without one, the card as set.

Each action writes **exactly one sentence** on the issue and `todo.triaged`. An unreadable answer, an
impossible action, an agent that cannot run (stop, breaker, held account): the card as set goes to the
gate. **The triage never merges.** Manager off, every held card goes to the gate; the one it refuses
stays held until the manager is back.

#### What enters TODO, and how you answer

The TODO gate (`runtime/src/carte-todo.ts`) admits **two kinds of cards**: a choice that changes the
product (`product`) and a design validation (`design`). Each says **what happens in at most two plain
sentences** (`resume`: one line, no Markdown), asks **exactly one question** (one line, its only "?") and
offers **at least two choices**, one line each, with the gesture it plays: `resume` (the kitchen takes the
ticket up again with your answer), `merge` (the green delivery waiting is merged), `drop` (the ticket
leaves the rail, or stays off it) or `close` (its issue is closed, the ticket is not cooked). The shape is judged in `runtime/src/carte-todo/forme.ts`. A `design` card shows **the
captures its ticket delivered** (see "It splits epics"), without which it does not enter; a `product` card
shows them when there are some. Anything else (a `gesture`, no question or choice) is refused
(`todo.refused`, with the reason) and **sent back to the triage**, held; the agent reads the reason at its
next turn. A card sent back three times after an agent answer is no longer taken up: the ticket shows in
`attend` with the card of what it waits for.

Every ticket in `attend` has a card of the same shape (`runtime/src/carte-todo/cartes.ts`), built from
what it waits for when no gate card stands for it: a green delivery the pass does not merge, an
escalation that stays the chef's, a PR closed unmerged, a ticket blocked by one that left the rail, an
issue the manager set aside or could not read, the manager's question before splitting, a ticket the
kitchen took off the rail without serving it (below). A card with a
single gesture (merging a green delivery without a grant, a delivery to review — `pass.md`, "The merge
card of a delivery to review" —, taking a blocked ticket off the rail, handing an issue back) shows that
one button and asks no question. Every card offers the free answer, and "ask the second" beside its
choices, never among them.

`facts` gives each card in `attend[].carte`: `type` (`product` or `design` for a gate card, otherwise what
the ticket waits for: `merge`, `remontee`…), `resume`, `question` (`null` on a single gesture), `choix`
(`texte`, `suite`), `reponseLibre`, `secondaire` (`ask the second`) and `captures` (`complet`, `ecrans`
with `avant` and `apres`, by address; `null` without a screen). **One call settles it**:

```
npm --prefix runtime run rail -- choose 8 2              # choice 2 of the card, from 1
npm --prefix runtime run rail -- answer 8 <your words…>  # free text
```

Your answer is written on the issue, the card leaves TODO (`todo.answered`, `todo.left`) and the ticket
moves on: a delivery waiting for you goes back to a cook who reads your answer in place of the findings
(`chef-answered`); a `merge` choice merges the green delivery; a ticket 86 with no delivery goes back to
the rail; an issue held by `blocked-on-human` loses its label and is judged again. What cannot be done
(no card, a choice out of range, a `merge` with no green delivery, a cook at work) is refused before
anything is written.

#### A ticket the kitchen takes off the rail without serving it

It never vanishes silently (#2118, `runtime/src/abandon-au-chef.ts`). Three ways lead off the rail
unserved: the pass's kitchen drops it (`pass.kitchen-took-over` `drop`, [`pass.md`](pass.md)), it leaves
with a dropped ticket it awaits (`ticket.dropped-with`, [`journal-et-rail.md`](journal-et-rail.md)), or
the triage removes it instead of asking you (`todo.triaged` `remove`). Once the poll has seen `fire`
gone, the ticket enters TODO with a card (`type` `abandon`; `decision`: `quoi` `abandon`, `motif` the
way — `pass`, `chain`, `triage` —, `cause` the dropped escalation's): which ticket, why in one sentence
of fixed words, and three choices — **Put it back on the rail** (`resume`: `fire` is set again; left
with a dropped root, it is the root that gets `fire`, and the ticket follows it), **I take it in a dev
session** (`drop`: it stays off the rail, its issue open, yours by hand), **Close it** (`close`: its
issue is closed). A free answer puts it back on the rail, with your words on the issue. The `awaiting`
line says the same: `taken off the rail by the kitchen without being served — <why> — to decide: …`.

**The card stays until you answer**: time, the rail moving or a card answered elsewhere never take it
away. Only your answer does — on the card (`todo.answered`), `fire` set back by hand (`ticket.arrived`),
the issue closed (the manager sees it leave the list of open issues and writes `manager.closed`), or
its PR merged by hand (`merge.done`). Taking a ticket off the rail yourself (`rail drop`, a card's
`drop`, a human's job) opens no card: the decision is yours.

### What it leaves on the issue

A comment saying why (and **why this calibration**), or for a refusal its nature and what would make it
executable; for a split epic, the table and the list in its body. An issue is judged **only once per
state** (title, body, trusted comments): edit the body or comment and it is judged again; your labels
and the manager's writings do not. An unreadable judgment is not retried on the same state; one **that
did not complete** (outage, guardrail) writes nothing and restarts at the next wake-up, bounded by the
breaker.

### Your gesture is stronger than its own

- **It never removes a label you set**; only its own (a calibration it raises, or set on an issue you
  hand back).
- **It never sets in a dimension that already carries a label**, **sets only once per issue**, and
  rereads the labels just before setting: after that everything is yours until you hand it back. "Set by
  the manager" is what the log says (`manager.labeled`), not the GitHub author.
- **`fire` set by you on what the code sets aside** (the roadmap, a `question`…): it removes nothing,
  does not calibrate, says so once. If you calibrate, the cook goes.

### What it costs

**It spends quota only to judge and to split** (an epic with no label: two calls). Each judgment is in the
log **like a cook** (`cook.launched`, station `manager`, off ticket; `cook.exited`; stream in `runs/`) and
goes through the guardrails: **nothing is judged** under "stop", open breaker, exhausted quota or expired
connection. For the breaker, an unreadable or incomplete judgment is **a failure**; one **the model
refuses** is retried and pinned at the third refusal in a row (`station-cook.md`, "When the model
refuses"). Allow up to one minute between the decision and the cook's departure.

Its events are all `manager.*`: `enabled`/`disabled`, `set-aside`, `judged`, `failed`, `labeled`/
`commented`, `handed-back`/`withdrew`, `closed`/`reopened`, `reacted`/`raised`, `split` (the intent,
written before any creation) and the `split-*` steps.

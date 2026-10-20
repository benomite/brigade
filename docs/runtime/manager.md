## The manager

The manager decides **what goes onto the rail, and at what calibration**. Once on, the chef drops an issue in
product language, with no label at all: the manager sets `fire`, `model:` and `effort:` and says why —
or says, in a comment, why it is not an executable ticket. An **epic** it
**splits** (see "It splits epics"); a ticket that **fails in pass** it does something about
rather than escalating it to you as is (see "It reacts to a failure").

**It is off until you turn it on**, and turns on without a restart (facts in the
log). Turned off during a judgment, it lets the judgment finish but posts nothing: the decision is posted
without re-judging when you turn it back on.

What `manager` writes — outputs, refusals, errors — is **in English** (words from `docs/glossary.md`: `ON` / `OFF`, `latest decisions`, `set aside`, `epics`, `reactions`). The keys of `upstream`'s JSON do not change, only the `dit` text is in English.

```bash
npm --prefix runtime run manager                # the switch, its latest fifteen decisions, what it set aside, the epics, its reactions to failures
npm --prefix runtime run manager -- on
npm --prefix runtime run manager -- off
npm --prefix runtime run manager -- return 77   # hand back an issue it set aside because you removed one of its labels from it
npm --prefix runtime run manager -- backlog     # what turning on commits to: how many issues are open, and how many carry blocked-on-human
npm --prefix runtime run manager -- upstream    # what is not on the rail yet: each open issue it does not carry, and what is happening to it — for the app
```

⚠️ **Once on, it judges the whole open backlog**, and whatever it judges executable goes straight to the kitchen.
Before turning it on, set `blocked-on-human` on whatever must not go out: an issue that carries it
is never judged, **an epic that carries it is never split**. Between two issues you wrote
yourself, it sets no dependencies: they go out in serving order, unless you
write `awaiting` in the card of one of them. Between the tickets of an epic it splits, it does set them.

**Count before turning on.** `manager -- backlog` says in one line what turning on commits to:

```
backlog               12 open issues, of which 3 carry `blocked-on-human` — read just now on GitHub (benomite/brigade)
```

It is **a read, and nothing else**: a `GET` on the list of the repository's open issues — the one
the manager polls, PRs left out —, under the service account's `gh`, like `installation`. It
sets no label, writes nothing to the log and does not read it: it answers whether the manager is
on or not, whether the runtime is running or not. The second number counts the issues that carry
`blocked-on-human`: those will never be judged. The first is not "what will go out" —
an issue already launched, a `question`, the roadmap are open too, and the manager does nothing with them
(the table below): it is what it will **look at**. Both numbers are written as bare digits,
ahead of their word: the app reads them there, on the "on" action (`docs/app.md`, "The
Manager tab"). If GitHub cannot be reached, the command exits with `1` and says so, with no number — it is not
"no issues".

### Upstream of the rail

**An empty rail does not mean a finished project.** The rail only carries what has `fire`; upstream,
there are the issues the manager has not read yet, the epics not yet split, those it
set aside, those awaiting your answer, those that left the rail. `manager -- upstream`
lists them all, for a program — the app derives from it the "N upcoming" number set beside the rail
(`docs/app.md`, "What is not on the rail yet"):

```json
{"lu":"2026-10-15T09:12:03.000Z","depot":"benomite/brigade","issues":[{"ticket":16,"titre":"…","url":"https://github.com/benomite/brigade/issues/16","priorite":1,"etat":"epique","dit":"it carries `epic`: not split yet"}]}
```

A single JSON object, on one line. `lu`: the time of the read, on the box's clock. `issues`:
**every open issue of the repository that the rail does not carry**, PRs left out — the list the manager
polls, read just now under the service account's `gh`, like `backlog` —, in the order in which it
reads them: `prio:1` first, without `prio:` last, the oldest first at equal priority.
`priorite`: that of its `prio:` label, `null` without one. `dit`: what the box says about it, in one line.
`etat`: what is happening to it, one word from a closed list — the first that applies, in this order:

| `etat` | The issue… | According to |
|---|---|---|
| `attend` | awaits your answer: it is in the `awaiting` block of `status`, as in Awaiting you | the manager's awaited items |
| `en-route` | is about to enter the rail: it carries `fire`, the manager put it there without `fire` being on it yet, or it was born of a split | its labels, the log |
| `sortie` | left the rail without being served (`fire` removed, `served-elsewhere` set), and nothing has been decided about it since | the log |
| `servie` | has been served, and its issue is still open | the log |
| `decoupee` | is a split epic: its tickets carry the work — `dit` says how many are served, and names those that will not be without the chef ("#876 closed without delivery", "#877 left the rail (…)"). An epic whose **every** ticket is served is no longer listed: the manager closes it itself, with a comment that lists its tickets and their PRs (once; an epic the chef already closed is not commented on). An epic with a missing ticket stays open | the splits |
| `epique` | is an epic not yet split — judged as such, or carrying `epic` —, or whose split is under way | the log, its labels |
| `ecartee` | was set aside by the manager — refused, or withheld by a label —, with its reason in one line | the manager's decisions |
| `non-lue` | has not been judged yet, or was handed back to it and has not been re-judged | the log |

What the rail did with an issue (left, served) only counts if it is more recent than what the
manager decided about it. **Nothing else is deduced from it**: neither the issue's body, nor its
comments. It is **a read**: a `GET` on GitHub, then the log opened read-only;
nothing is written to it, no label is set. It answers whether the manager is on or not. If GitHub
cannot be reached, or the log does not have the manager's state yet, it exits with `1` and says so, without
listing anything — it is not "nothing upstream".

### What the code settles, and what the LLM judges

Its loop is code. On each wake-up it re-reads **one** list — the repository's open issues, under
its own ETag — and sorts it without spending anything:

| The issue… | What the manager does with it | In the log |
|---|---|---|
| carries `fire` and a complete calibration | Nothing: it is launched, by you or by it | — |
| received labels from the manager, and has since lacked `fire`, `model:` or `effort:` | Nothing, **until you hand it back**. It says so once on the issue, with the command (see "Handing it back") | `manager.set-aside` (`chef-changed`) |
| is written by someone who has no write access to the repository | Nothing, without a comment | `manager.set-aside` (`untrusted-author`) |
| is the roadmap (`BRIGADE_ROADMAP_ISSUE`) | Nothing | `manager.set-aside` (`roadmap`) |
| is an epic it already split, or a ticket born of one of its splits | Nothing: it is done, and what they carry from then on is yours | — |
| carries `served-elsewhere` — even with `fire`, a complete calibration or the `merge` grant | Nothing: the ticket is not served on this box. It does not enter the rail, does not appear in `awaiting`, and the manager says so once if it carries `fire` | `manager.set-aside` (`hors-cuisine`) |
| carries `blocked-on-human` | **Re-read** by the LLM, once per state, for the decision it awaits. Written in the issue: nothing, it stays withheld. Absent, but a real question derives from it: a `product`, `design` or `gesture` card enters TODO (the statement is the question), the issue stays withheld and the card leaves when the label goes. Absent, with no question: the kitchen takes the ticket back, the label is removed and the issue judged in the same turn. The comment says which of the two | `manager.requalified` (`stated`, `card`, `taken-back` or `unreadable`), then `manager.set-aside` unless taken back |
| carries `question` or `decision` | Nothing | `manager.set-aside` (the label) |
| already carries, in its body, an epic's list of tickets, without it having split it | Nothing: it was split by hand | `manager.set-aside` (`already-split`) |
| carries `epic` | **Split** by the LLM, once | `manager.split`, or a question |
| any other | **Judged** by the LLM, once per state | `manager.judged`, or `manager.failed` |

None of these labels is required: an epic without `epic` goes to the LLM, which recognizes it — at the cost
of one more judgment.

**The judgment** is a call to `claude` with no tool, outside any worktree, at the manager's calibration
(`station manager-modele` / `manager-effort`). It reads the title, the body, the labels and the
comments of those who have write access to the repository (owner, members, collaborators — the card's
rule), and answers one of five kinds: `ticket`, `epic`, `question`, `decision`,
`incomplete`. Only `ticket` enters the rail, calibrated according to this table; `epic` goes to
the split, the other three are refused:

| Ticket | Calibration |
|---|---|
| doc, rename, fix whose test is already written | `haiku` / `low` |
| mechanical `fix`/`tech` on a known module | `sonnet` / `low` |
| non-mechanical `fix`/`tech`, or any issue with precise acceptance criteria | `sonnet` / `medium` |
| `feature`, cross-cutting refactor, core of the product | `opus` / `high` |

**A written form criterion is worth one notch more**: as soon as an acceptance criterion imposes a
form ("five lines", "no preamble"), the ticket goes out at least as `sonnet` / `low` —
**write it in the acceptance criteria**, it does not guess it. It never sets `xhigh` or
`max`: they are yours alone.

### Handing it back

**Each deviation has its gesture, and `run manager` says it** (`set aside` section, the ten most recent).

| Set aside because… | What hands it back to the manager |
|---|---|
| you removed `fire`, `model:` or `effort:` that it had set (`chef-changed`) | `npm --prefix runtime run manager -- return <n°>` |
| it carries `blocked-on-human`, `question` or `decision` | Remove the label: it is judged at the next wake-up |
| its body already lists an epic's tickets (`already-split`) | Remove the list from the body: the epic is split at the next wake-up |
| it carries `served-elsewhere` | Nothing to hand back: it is served elsewhere. Remove the label if the box should take it; the why is on the issue, written by whoever set it |
| it is the roadmap, or its author has no write access to the repository | Nothing |

`return` forces no deviation other than `chef-changed`: on an issue withheld by a label, the
command answers with the gesture that concerns it, writes nothing and exits with 1 — `blocked-on-human` remains your
protection. **Removing `fire` or a calibration it set, without replacing it**, is taking back
execution: it sets itself aside, and says so once on the issue with the command that hands it back.
Replacing a `model:` with another, or tidying your backlog (`prio:`, `question`, `decision`,
`blocked-on-human`), never makes a `chef-changed`.

**Handed back, the issue is judged anew** (`manager.handed-back`), at the next wake-up: it **removes the
calibration labels it had set itself** (`manager.withdrew` — never yours; relaunched
and calibrated by you in the meantime, it is not re-judged), then re-judges it. **A handing back is worth one
judgment.**

### It splits epics

You drop an **epic** in product language and you get tickets back: each with its **observable**
acceptance criteria, its dependencies, its file zone and its calibration, already launched.

**The split** is a second call to `claude`, like the judgment (`run` as `decoupe-<n°>-…`). It
reads the epic, the trusted comments, and **the repository's layout** — its folders two
levels deep, as of the last fetch of the station's clone — from which it derives each ticket's zone;
the project's common paths enter none. It returns one of three answers:

| Answer | What the manager does | In the log |
|---|---|---|
| a split, twelve tickets at most | Creates the tickets, launches them, says so on the epic | `manager.split`, then one fact per step |
| **a question**: the epic is ambiguous on a product choice | Posts it as a comment, creates nothing | `manager.split-asked` |
| "already split": the epic already names its tickets | Creates nothing, says so once | `manager.split-skipped` |

The question is reserved for **product choice**, posed as a choice between paths (what the
user will find). A technical ambiguity — where the code lives, the order, the mechanism — is
settled by the manager, who writes on the issue what it decided and why (the split's `motif`).

An answer the code cannot read — a ticket with no criterion, no zone, that awaits a ticket
placed after it, a calibration outside the table, more than twelve tickets — creates **no** ticket
(`manager.split-failed`).

**The question holds nothing back**: the rail moves on. It is read in `run manager` ("QUESTION
ASKED"). Answer in a comment or edit the epic: it is re-read, **with the question**.

**A ticket born of a split** carries: a body that begins with `Épique : #N`, then the context,
the criteria and **why this calibration**; `model:`, `effort:`, and the epic's `prio:`; its
**card** (`awaiting`, `zone`, and `requiert` if it requires a capability) as a comment; and `fire`, set **last**. It does not go through
judgment again, and awaits those it depends on (see "A ticket's card").

**An interface ticket is designated for the design cook** (`agents/cook-design.md`). The manager
recognizes it at the split: its zone touches the app's view (`app/src/vue/`, a file under it, or a
folder that contains it like `app/src`) — the code then designates it regardless —, or the
split says so (`"cook": "design"`), which it only proposes in a repository that defines the design
cook. A runtime, doc or scripts ticket is not one. The designated ticket carries the
label `cook:design` beside `model:` and `effort:`, a "Cook design" paragraph at the top of its
body — that is where the cook learns it is one, and where to read its profile —, and `· cook design` in
the "Calibration" column of the split comment. The calibration does not change: model and effort
are set as for any ticket, never `xhigh` or `max`.

**An interface ticket's delivery shows the screen before and after** (`runtime/src/captures.ts`).
A ticket is an interface ticket when its zone, at the time it is taken, touches the app's view, or its issue carries
`cook:design` — re-read at delivery, the rail does not keep the labels. The design cook takes its
captures with `scripts/capture-ecran/` and commits them on its branch, one pair per changed screen:

```
docs/captures/<ticket>/<screen>-before.png
docs/captures/<ticket>/<screen>-after.png
```

`<screen>` pairs the two (`card`, `empty-rail`); `before` and `after` are read regardless of
case or accents. On a pushed delivery, the station reads them among the files the branch
changes, and shows them **under the PR's header line** and on the ticket: a "Captures" section,
each screen as a `Before | After` table, the two images side by side and captioned (`card — before`),
loaded at the pushed commit (`https://github.com/<repository>/blob/<sha>/<path>?raw=true`, which GitHub
also shows in a private repository). **An interface delivery without its captures** — none, or a
screen that has only one — is said there to be **incomplete**: `Livraison incomplète : captures manquantes —
<what is missing>`, and where to put them. Nothing is stopped at delivery: the review judges (below). The captures
go to the log with the report (`cook.reported`, `captures`: the commit and each screen), from where
`facts` gives them to the ticket's card. **A ticket that is not an interface ticket says nothing of it** — no
section on the PR, no field in the log, none in `facts`. A send-back delivers on the PR already open: its
body keeps the captures of the first delivery, the send-back's comment and `facts` show the
new ones.

**The review also judges the captures** (`runtime/src/reviewer.ts`, #843). For an interface ticket,
the reviewer's instruction adds a "The captures" section: the delivered captures (which it opens with
`Read`) and the three violations of the rules of #830, looked for on each "after" capture — `geste-non-bouton`
(an expected gesture that is only a command to copy), `mode-d-emploi` (a paragraph of plain-text
explanation), `erreur-brute` (a technical error displayed as is). **It judges only the part of the screen
that the ticket adds or changes** (#895): what is found identical on the "before" capture already existed
and never blocks. A violation in the ticket's zone is a **blocking** finding, which carries `regle`
and cites as `fichier` the "after" capture concerned; a pre-existing violation, outside that zone, is a
**remark** (same `regle`, same `fichier`), which proposes a separate ticket if no open ticket covers it.
A finding of this type that does not cite a delivered capture, or that is `a_supprimer`, makes the review
unreadable (it is asked for again). A
capture that respects the rules produces no finding of this type. **An interface delivery without any
capture is blocking**: the station adds the finding itself (`fichier`: `docs/captures/<ticket>/`)
if the reviewer did not say it. A screen that has only one of its two captures remains a remark. A ticket
that is not an interface ticket does not change. The expected case is in `evals/relecture-captures-830/`.

**The epic lists its tickets, with their state**, in a block that the manager writes at the end of its
body, between two markers:

```markdown
<!-- brigade:tickets -->
## The epic's tickets

**1/3 servi.**

| # | Ticket | État |
|---|---|---|
| #80 | Le rail compte ses tickets | servi |
| #81 | La pass lit le compte | en cuisine |
| #82 | La doc dit le compte | attend #81 |

_Liste tenue par le manager : ce qui est entre ses deux marqueurs est réécrit, le reste de l'épique est à toi. Pour y faire entrer un ticket que tu ajoutes, écris `Épique : #78` dans son corps._
<!-- /brigade:tickets -->
```

**This is the only place in the body that it rewrites.** A marker only counts **alone on its line,
outside a code block**; without an end marker, it only replaces the start one. The states follow
the rail: `off the rail`, `queued`, `awaiting #N`, `taken`, `in pass`, `served`,
`86 (reason)`, `blocked — #N dropped (…)`, `dropped (…)`, `closed`. **`taken` is the step
of a ticket** — the one the rail says is `taken`, a cook holds it — and says nothing of the project's state
("The kitchen's state"). Off, the manager no longer
keeps the list; turned back on, it catches up.

**Your split is stronger than its own.** An epic is split **only once**. After which:

- you **close** a ticket: it is not reborn; the list says `dropped`, and `blocked` for those that
  awaited it — it is up to you to remove the `awaiting` line from their card;
- you **add** a ticket: write `Épique : #N` in its body, it enters the list, judged and
  calibrated like any issue;
- you **change** a criterion, a card, a calibration, you remove `fire`: nothing is rewritten;
- you **withhold** the epic (`blocked-on-human`): creations under way wait.

**An epic already split by hand: paste `<!-- brigade:tickets -->` into its body** (even
alone) before turning on — the code recognizes it without an LLM (`already-split`). A **closed** epic
is never split.

**Creating N issues is not atomic**: the split is in the log **before** the first call to
GitHub, and after an outage the next wake-up resumes at the first missing ticket, **without
re-judging**. A creation left without follow-up is first **searched for** by the mark that each ticket
carries in its body (`<!-- brigade:decoupage #N.k -->`), and resumed (`reconciled: true`). The
mark — like a card — only counts coming from **someone who has write access to the repository**.

Limits: the code checks that two concurrent tickets share no zone path (see
"The file zones"), not that the zone is the right one; and closing the served epic is your gesture.

### It reacts to a failure

Off, nothing changes: the pass sends back twice at the same calibration, then escalates the ticket to you.
**On, the pass hands it over from the second red** (`pass.deferred`): the ticket stays in
pass, no cook restarts before it has decided.

| Red pass no. | What happens | Cost |
|---|---|---|
| 1 | send-back 1/2 at the same calibration — this is the pass | — |
| 2 | the manager **raises the calibration one notch** if it can, then sends back 2/2. Otherwise the send-back goes at the same calibration, and it says why | none: it is code |
| 3 and following | the manager **chooses**: raise again, **re-split** the ticket, or **escalate** it to you — and says which and why, on the issue | one judgment |

**Raising one notch** is effort first (`low` → `medium` → `high` → `xhigh` → `max`), then the
model (`haiku` → `sonnet` → `opus`) keeping the effort reached — **within the project's cap**,
`BRIGADE_CEILING_MODEL` and `BRIGADE_CEILING_EFFORT`, **with no default**: a dimension with no
cap never goes up, and with neither of the two it is left to re-split or escalate. **It only
replaces its own labels**: a dimension you calibrated is never touched. **A
ticket that failed twice never restarts identically**: if nothing changes, it is escalated.

| Its choice | What happens |
|---|---|
| **raise** | the label changes, the ticket goes back to queued: a cook picks it up on the same branch, on the same PR. Red again, the manager chooses anew |
| **re-split** | the ticket becomes **the epic of its sub-tickets**: they are born calibrated, ordered and launched, and restart from the base. It goes **86** (`manager:split`, pass `manager-split`); its PR stays open, as a reference, and **it no longer holds its zone**. A ticket born of such a re-split is not re-split |
| **escalate** | the ticket goes **86** (`manager:escalated`, pass `still-red`, cause `manager-escalated`), and you receive what you need to decide: each attempt with its calibration and what the pass found in it, why it is escalated, and **what it proposes** |

A card only enters TODO if the cause of the red is a **product choice** (`product`) or a **gesture** that only you can make (`gesture`): the manager sets it with the escalation, in one line (`todo.entered`), and it replaces the bare escalation in `awaiting`. A red that hides neither is escalated **without a card** — the issue says so —, and no card is ever set for it. The card leaves TODO as soon as the ticket is no longer 86 `manager:escalated`.

An unreadable answer, a choice that was not offered (raising at the cap, re-splitting a
sub-ticket) or an impossible re-split counts as **escalation**. **The breaker has the last
word**: at the threshold, the manager escalates without relaunching or judging anything. Each reaction is in the
log (`manager.reacted`, `manager.raised`); `run manager` shows the last ten.

**Worth knowing.** A ticket whose calibration you change while the manager holds it restarts at
yours. If you put the old label back in place of its own, the ticket waits, "red, to the manager"
in `run pass`: replace the label, or turn the manager off — the pass goes back to its earlier rule.

### What it leaves on the issue

- **Executable**: the labels, then a comment — why, **why this calibration**, what
  was already set, the cost of the judgment. **Refused**: no label, and its kind, the reason, what would
  make it executable.
- **Epic split**: why these tickets, this order, their table, the cost — and the list in
  its body. **Question**, **already split**, **unreadable**: a comment that says so.

An issue is judged **only once per state** — title, body, trusted comments: you
edit the body or you comment, it is re-judged (at the cost of a judgment); your labels, and what
the manager wrote, do not make it re-judge. An unreadable judgment is not retried on the same
state; a judgment **that did not complete** (outage, guardrail) writes nothing and restarts at the next wake-up,
bounded by the breaker.

### Your gesture is stronger than its own

- **It never removes a label you set.** The only ones it removes are its own: a
  calibration it raises, or one it had set on an issue you hand back to it.
- **It never sets in a dimension that already carries a label**, and **sets only once per
  issue**: after which everything it carries is yours, until you hand it back. "Set
  by the manager" is what the log says (`manager.labeled`), not the author as seen by GitHub.
- **It re-reads the labels just before setting**: withheld in the meantime, nothing is set.
- **`fire` set by you on what the code sets aside** (the roadmap, a `question` label…): it removes
  nothing, does not calibrate, and says so once. If you calibrate yourself, the cook goes out.

Known limit: if the runtime dies between setting the labels and writing `manager.labeled`,
they are taken to be yours.

### What it costs

**It only consumes quota to judge and to split** (an epic without a label: two calls).
Each judgment is in the log **like a cook** (`cook.launched`, station `manager`, off ticket;
`cook.exited`; stream in `runs/`) and goes through the guardrails: **nothing is judged** under "stop",
breaker open, quota exhausted or connection expired — it is judged on resumption. For the
breaker, an unreadable or incomplete judgment counts as **a failure**, a successful judgment counts neither
for nor against; a judgment **that the model refuses** is retried, and pinned at the third refusal
in a row (see "When the model refuses"). It does not withhold the station. Count up to one
minute between the decision and the cook's start.

| Event | Meaning |
|---|---|
| `manager.enabled`, `manager.disabled` | The chef turns on, turns off (off ticket) |
| `manager.set-aside` | The code set the issue aside, without judgment: `reason`; `fired`: it carries a `fire` left in place; `lacking`, on a `chef-changed`: what it lacks |
| `manager.judged` | The LLM judged: `verdict` (`fire`, `refused`), `kind`, `reason`, `missing`, `model`, `effort`, `calibration`, `run`, `fingerprint` (the judged state) |
| `manager.failed` | The judgment ran to completion, but cannot be read — or the model refused it three times in a row |
| `manager.labeled`, `manager.commented` | The labels it set, once GitHub served; the decision is said on the issue |
| `manager.handed-back`, `manager.withdrew` | The chef hands back an issue set aside as `chef-changed`; the manager's calibration labels are removed from it (`labels`) |
| `manager.closed`, `manager.reopened` | An issue the manager awaited the chef on left the open issues (it leaves the chef's queue), or came back to them |
| `manager.reacted`, `manager.raised` | Its reaction to a failure in pass; the labels that a raise changed |
| `manager.split` | The split's intent, written before any creation: `reason`, `order`, `tickets` (title, context, criteria, `waitsFor`, zone, calibration, `overlaps` — the waits the code added for overlapping zones), `run`, `fingerprint` |
| `manager.split-asked`, `-skipped`, `-failed` | A question to the chef; the epic already lists its tickets; the answer cannot be read |
| `manager.split-creating`, `-created`, `-fired` | The ticket of rank `index` is about to be created; it exists (fact carried by the born ticket, `reconciled` if it was found again); its card and `fire` are set |
| `manager.split-done`, `-commented` | All the tickets exist and are launched; the split is said on the epic |
| `manager.split-adopted`, `-seen`, `-listed` | A chef's ticket claims the epic; an epic ticket left the open issues or came back to them; the list is written in the body (`digest`) |

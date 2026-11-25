## What it does today

| Action | What happens |
|---|---|
| Start | Takes the project's lock, recomputes its projections from the log, writes `runtime.started`, then any change in caps (`guard.configured`) and partition (`isolation.configured`), announces the declared stations (`station.announced`; `stations.undeclared` if none), polls GitHub |
| Run | Watches the log every second, wakes at the tick (60 s). Each wake-up: guardrails look for the "stop", stations take what their bounds allow, the pass judges, the manager (if on) acts. Each tick: `runtime.ticked`, GitHub poll, lapsed leases given back, worktrees checked and tidied, every cook read (`cook.progressed`) |
| Stop (`SIGTERM`, `SIGINT`) | Lets go of the running cooks (a relay carries them; **the unit does not signal them**, `KillMode=process`), kills the gates being played, writes `runtime.stopped`, releases the lock, exits 0 |
| Die without warning | Nothing is lost: the kernel releases the lock, the next start writes `runtime.interrupted` |
| Launched twice on a project | Refuses, exit code 2, naming the running runtime |

**It launches cooks**, several at once, through `claude` under the machine's Max connection:
**every cook consumes Max quota**, as does every **manager** call and every review by the pass's
**reviewer**. Its other subprocesses are `gh`, `git`, and **the project's gates**
(`.claude/brigade/gates.sh`). **It merges by itself** what its pass judges
green. It listens on no port. **Nothing it launches is partitioned until you set up the partition**
(see "The partition"); it says so at every start. Everything goes out under the machine's GitHub
account, or, with Apps, **one identity per role** with one-hour tokens no cook receives (see "One
GitHub identity per role").

## The log

One file per project, `log.db`, in the state directory. Each event carries `seq` (the order of
truth), `at` (UTC), `project`, `ticket` (or nothing), `type`, `author` (`runtime`, `chef`,
`station:<name>`…) and `payload` (JSON). The database refuses any modification or deletion; the
*projections* are recomputed from it at every start.

### Reading the log

```bash
npm --prefix runtime run log -- 13           # everything that happened to ticket 13
npm --prefix runtime run log [-- --ticks]    # the whole log; heartbeats only with --ticks
npm --prefix runtime run log -- --last 200   # only the last 200 events
```

`--last <N>` combines with a ticket number or `--ticks`; excluded heartbeats do not count in N. A
program re-reading the log at an interval should pass it, or the output grows with the log. One line
per event; the command reads `$BRIGADE_STATE_DIR`, never writes, and answers while the runtime runs.

## The rail

The rail carries the project's tickets: **the open issues of the repository that carry the `fire`
label**. Setting the label brings the issue in at the next poll (a minute at most); closing it or
removing the label takes it off, **whatever its state** — removing `fire` is the way to take a
ticket back. PRs are never tickets.

Removing `fire` and setting it again on a held ticket (86) lifts it, however fast: the runtime reads
the label history and, for a removal after the hold, writes `ticket.left` then `ticket.arrived`. A
removal before the hold does not lift it: `ticket.fire-unseen`, and the queue line says to remove
`fire` and set it again now.

The rail's facts: `ticket.arrived`, `ticket.changed`, `ticket.left` (also for an awaited issue closed without having come onto the rail), `ticket.taken`, `ticket.renewed`, `ticket.released`, `ticket.passing`, `ticket.served`, `ticket.86`, `ticket.blocked`, `ticket.waiting`, `ticket.resumed` (in the name of `chef`), `ticket.dropped-with`, `ticket.back-with`, `waiting.marked`, `rail.commons`.

| State | Meaning |
|---|---|
| **queued** | on the rail, to be taken — or held back: its line says by what |
| **BLOCKED** | waiting for a **dropped** ticket, or a **frozen** one (86, set aside by the pass, which could not judge it): it needs an action from you |
| **taken** | lent to a station, under a lease |
| **in pass** | the cook has finished; the pass is judging — or stopped, green, without merging |
| **served** | merged. The pass closes its issue: it leaves the rail at the next poll |
| **86** | not servable for now (quota exhausted, ticket refused, pass escalated to the chef) |
| **WAITING** | in an old box log, waiting for a **third party**, not for you; the kitchen does not take it — today such a ticket is parked (see "A ticket waits for someone: parked") |

**Service order**: `prio:1`, `prio:2`, `prio:3`, then no `prio:`; at equal priority, the oldest
first. Only the `prio:` labels set the order; the rail lends the first ticket, in this order, that
nothing holds back (a ticket whose zone is held waits where it stands).

**A ticket can wait for another**: the `attend` line of its card (see "A ticket's card"; the key
stays French until the runtime renames it). It is not lent until **all** those it waits for are
**served**.

| What the line says | Meaning | What makes it leave |
|---|---|---|
| `queued … awaiting #12, #13` | #12 and #13 are not served yet | the last one served |
| `BLOCKED … #12 dropped (…)` | #12 left the rail **without being served** | put #12 back on the rail (open issue, `fire`), or remove its number from `attend` |
| `BLOCKED … blocked by #12 (set aside (86) by the pass, not judged)` | #12 is 86 with no return; this ticket waits for it (`attend`), never for its zone: a ticket 86 holds none | settle #12 (judged, given back or withdrawn) |

- **Served means its delivery is merged**, by the pass or by you (also on a ticket escalated to 86).
  An issue closed by hand, or delivered by a PR the runtime did not open, is a drop. Served stays
  served, even reopened.
- **Dropped**: issue closed without being served, `fire` removed, or issue gone (even if it never
  came onto the rail).
- **A block is told once per drop**: a comment "Rail — ticket bloqué" (French until the runtime is
  translated), the `ticket.blocked` fact, `BLOCKED` on the rail — after the pass has re-read the PR
  of the ticket that left, if any: merged by hand, it serves it.
- **A cycle is refused** (#14 awaits #15, which awaits #14): each card becomes unreadable, the cycle
  named; they return once a wait is removed.
- An open ticket without `fire` can be awaited. A dependency set on a ticket already taken or in
  pass only plays if it comes back to queued.
- **A ticket the kitchen drops takes its waiters with it** (`runtime/src/abandon-en-chaine.ts`).
  When the pass's kitchen drops a ticket (`pass.kitchen-took-over` `drop`, see [`pass.md`](pass.md)),
  every queued or 86 ticket awaiting it, directly or step by step, leaves with it: after the next
  poll a comment "Cuisine — ticket abandonné avec #N" names the root and the reason,
  `ticket.dropped-with` (`root`, `cause`, `reason`) is written, then `fire` is removed; until then
  its line says `the kitchen drops it with #N (<cause>), which it awaits`. **Putting `fire` back on
  the root is the only way back**: the kitchen then sets `fire` back on each still-open ticket that
  left because of it (`ticket.back-with`, `refired`; a comment "Cuisine — #N est revenu sur le
  rail"). One that comes back alone while its root stays dropped leaves again. A ticket taken or in
  pass is not touched. A ticket you take off the rail yourself takes no one with it. Off the rail, the root and each ticket that
  left with it wait in your TODO with a card until you answer (#2118, see [`manager.md`](manager.md));
  on a ticket that left with its root, « Put … back on the rail » sets `fire` on the root.

**A ticket is lent only once**: its station gets a **lease** of 30 minutes, **renewed only on
observable progress** in the cook's worktree (`ticket.renewed`), checked at the tick, at most once
per tenth of the lease. Progress is what a `git status` shows (a new or rewritten commit, a tracked
file modified or deleted, a new file not ignored), not the output stream: idleness (10 minutes, see
"The guardrails") listens to the stream, the lease to the worktree. An unreadable worktree counts as
neither: the lease then falls only after a grace of one tenth of the lease.

- **When the lease falls**, the station stops the cook and harvests (`guard.tripped`, reason
  `lease`): what it committed goes to the pass; with no commit, the ticket goes back to queued and
  the stop counts toward the breaker. The rail gives back by itself (`ticket.released`,
  `lease-expired`) only a ticket taken without a cook.
- **Past half the lease with no progress**, the cook is flagged: `STUCK` in `status` and
  `cook.stalled` in the log (once per episode). Nothing is stopped.
- **An 86 comes back by itself** at its return time; without one, it stays 86 until given back.
- **GitHub unreachable**: the rail stays as it is (`sondage GitHub en échec` in journald, French
  until the runtime is translated); the poll is replayed at the next tick.

### Reading the rail

```bash
npm --prefix runtime run rail
```

One line per ticket, in service order; a queued ticket that does not leave says why (`awaiting #12,
#13`, `zone held by #14 (path)`, see "File zones"; `BLOCKED` and the dropped ticket). The first line
names the project's **common paths**. Under a ticket with a card, an indented line gives the waits of
its card, with where they were read (`waits for #12 — read from the card`, #3763; `awaiting: nothing` when
its card names none). The journal does not record the waits read from a body or from a cook's stop, so this
command does not show them; `brigade <project> status` and the app do. The line then gives its zone, and what
the runtime does not understand in it (`UNREADABLE CARD — clé inconnue « budget »`, French as the card reader writes it).

### Removing a ticket from the rail

```bash
npm --prefix runtime run rail -- remove <ticket>
```

`remove` (`runtime/src/geste-ticket.ts`) takes `fire` off the issue of a queued or `BLOCKED` ticket:
it leaves the rail, its issue stays open. A ticket taken, in pass, served or 86 is refused. It uses
the service account's `gh` (`BRIGADE_GITHUB_REPO` required), logs the fact the poll would have
written, and states its price (`— cost: …`; refused: standard error, code 1).

### A ticket's priority is its `prio:` label

The box has no command for it: change the issue's `prio:<n>` label on GitHub, or from the ticket's
sheet in the app (`app/src/priorite.ts`, `docs/app.md`, "Changing a ticket's priority"); the box
reads it at its next poll.

### Answering a TODO card

```bash
npm --prefix runtime run rail -- choose <ticket> <choice number>
npm --prefix runtime run rail -- answer <ticket> <answer…>
```

`choose` answers the ticket's TODO card by one of its choices, numbered from 1 as `status` shows
them; `answer`, in your own words. The answer is written on the issue, the card leaves TODO and the
ticket moves on (see "What enters TODO, and how you answer" in [`manager.md`](manager.md)).

### Handing a ticket to a human

```bash
npm --prefix runtime run rail -- human <ticket> [who…]
```

For a ticket in WAITING because no station provides what its `requiert` line asks: it is a human's
job. The issue loses `fire` and takes `served-elsewhere`, the ticket leaves the rail (`ticket.left`,
reason `served-elsewhere`), and its task enters TODO, author `chef`: `capability.human-job` (to whom —
`chef` without a name —, what is missing, title, context and acceptance criteria from the issue) and
a `product` card, `What became of this task?` — `It is done`, `It will not be done`, or your own
words; the answer is written on the issue and the card leaves TODO. It skips the triage. `facts`
gives the task in the TODO entry (`attend[].tache`). Played again on a ticket whose task is in TODO,
it hands the task to someone else; any other ticket is refused. The other way out is to give the
capability to a station (`installation stations set`): `facts` gives, on such a WAITING card only,
`requiert`, every capability the card asks for.

### A ticket waits for someone: parked

A ticket that waits for someone — the chef, a client's answer, an external decision, a date — is
**parked** (#4129, rule 13 of
[the simplified process](../superpowers/specs/2026-11-24-simplified-process.md)): its issue carries
the `parked` label and a comment marked `<!-- brigade:parked {…} -->` that says **who** it waits
for, **for what**, and **until when** — a date, or a fact
(`runtime/src/attente-github/marque.ts`, `corpsDuParking`). Parked replaces WAITING: the label
catalogue renames `waiting` to `parked` on GitHub, an old `<!-- brigade:waiting … -->` comment is
still read, and the box's `waiting` command is gone. Nothing goes through the box: every gesture
is written on the issue, on any GitHub project.

No box command sets or lifts it (#4262): the chef's app and the second park and unpark a ticket the
same way, on its issue, on any project, through the same two functions — `parquer`
(`app/src/vue/attente/attente-github.ts`) and `deparquer` (`app/src/gestes-github.ts`). The app
plays them from **waiting for…** on a card, **resume** and **it arrived, back to the kitchen**; the
second with the parking command the app gives it at each session start (`app/src/second/parking.ts`):
`park <owner>/<repo>#<n> --who <who> --what <what> --until <YYYY-MM-DD>` and
`unpark <owner>/<repo>#<n>`. The kitchen parks with the same marks (`mettreEnAttenteGitHub` and
`poserLAttente` in `runtime/src/attente-github/attente-github.ts`).

- **From any step.** A ticket is parked at the backlog, while its cook is cooking it (`taken`) or
  at the pass (`in-pass`): the labels of its step stay as they are. A ticket that is already
  parked is refused, and nothing is written.
- **Until when.** A date — the day the app's form or the parking command gives, seven days when the
  kitchen says none — or a fact, which only the kitchen writes today (a ticket parked by its failures
  waits for the supervisor's answer).
- **It resumes exactly where it was** — `parked` is removed and nothing else: no `fire` added, the
  labels of its step as they were — when its **date** comes (the station, at each turn:
  `ramenerALaRelance` in `runtime/src/attente/attente-par-le-cook.ts`), when its **fact** happens
  (`arrived`, or the app's *it arrived, back to the kitchen*), or when the person **answers**
  (`resume`, the app's *resume*, the second). A ticket parked until a fact, or for the chef, never
  resumes by a date.
- **For the chef.** Parked for the chef, it carries `chef-todo` instead of `parked`, and a card: it is in the chef's TODO ([TODO cards](../todo-cards.md)). A TODO card the
  kitchen posts parks its ticket the same way (`poserCarte` in
  `runtime/src/github-seul/carte-todo/carte-todo.ts`). A chef's card parked for someone else takes
  `parked` and leaves TODO; when it resumes, it is back in TODO.
- **What the kitchen parks by itself.** A ticket whose cooks failed too many times: the station
  stops its relaunch loop and parks it, waiting for the supervisor, which gets its dossier
  (`parquerSesEchecs`, `runtime/src/manager/supervision.ts`). A ticket whose cook says it cannot be
  done before a date, or that it waits for a third party outside the kitchen: parked until that
  date, or seven days. And, for the chef, with a TODO card (`chef-todo`): a cook blocked on a
  product or design question, or on a gesture only the chef makes (`poserALaMain`); a prerequisite
  only a human installs on a station; a wait the manager finds to be a product decision; an issue
  the manager refuses to the chef with its question. `blocked-on-human`, `question`, `decision`,
  `product-question` and `set-aside:failures` are set by nothing any more: on an issue that still
  carries one from before, they are read as before.
- **Nothing takes it before**: see "Nothing takes a parked ticket" in
  [exploitation.md](exploitation.md).
- **Old logs.** The WAITING events of a box log (`ticket.waiting`, `ticket.resumed`) are still read
  as history by `status`; nothing writes them any more.
- What a third party or an absent machine holds — a capability no station provides (`no-station`),
  an absent remote station — does not wait for the chef either: not in the `awaiting` block nor in
  TODO; the rail line says what it waits for.

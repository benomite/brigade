## What it does today

| Action | What happens |
|---|---|
| Start | Takes the project's lock, recomputes its projections from the log, writes `runtime.started`, then whatever changed in its caps (`guard.configured`) and its partition (`isolation.configured`), announces the stations the project declares (`station.announced`; `stations.undeclared` if it declares none), asks `claude` whether the machine has a session, and polls GitHub |
| Run | Watches the log every second and wakes at the tick, every 60 s. At each wake-up: the guardrails look for the "stop", the station takes what its bounds allow, the pass judges what is delivered, the manager — if it is on — judges, splits and reacts. At each tick: `runtime.ticked`, GitHub poll, lapsed leases given back, worktrees' progress checked, worktrees tidied, a reading of every cook (`cook.progressed`) |
| Stop (`SIGTERM`, `SIGINT`) | Lets go of the running cooks — a relay carries them, the next runtime picks them up again; **the unit does not signal them** (`KillMode=process`) — and kills the gates being played, writes `runtime.stopped`, releases the lock, exits with code 0 |
| Die without warning | Nothing is lost: the kernel releases the lock, and the next start writes `runtime.interrupted` before going on |
| Be launched a second time on the same project | Refuses, exit code 2, naming the runtime that is running (pid, machine, start time) |

**It launches cooks**, several at once, through the `claude` binary under the machine's Max
connection: **every cook consumes Max quota**, as does every call of the **manager** (short, no
tools) and every review by the pass's **reviewer** (read-only). Its other subprocesses are `gh`,
`git`, and **the project's gates** (`.claude/brigade/gates.sh`). **Under a `merge` grant, it merges
by itself** what its pass judges green. It listens on no port. **Nothing it launches is partitioned
until you have set up the partition** (see "The partition"): it tells you so at every start.
Everything goes out under the machine's GitHub account — or, with Apps, **under one identity per
role**, with one-hour tokens that no cook receives (see "One GitHub identity per role").

## The log

One file per project, `log.db`, in the state directory. Each event carries `seq` (the order of
truth), `at` (UTC), `project`, `ticket` (or nothing), `type`, `author` (`runtime`, `chef`,
`station:<name>`…) and `payload` (JSON). The database refuses any modification and any deletion; the
*projections* are recomputed from the log at every start.

### Reading the log

```bash
npm --prefix runtime run log -- 13           # everything that happened to ticket 13, in order
npm --prefix runtime run log                 # the whole log, without the runtime's heartbeats
npm --prefix runtime run log -- --ticks      # the whole log, heartbeats included
npm --prefix runtime run log -- --last 200   # only the last 200 events, in order
```

`--last <N>` combines with a ticket number or `--ticks`. Without a ticket, it reads from the end of
the log (a bounded query, not the whole log loaded only to keep its tail); with a ticket, it keeps
the end of that ticket's list. Excluded heartbeats do not count in N. Without it, the output grows
with the log: it is the form that a program re-reading the log at a regular interval should ask for.

One line per event. The command reads `$BRIGADE_STATE_DIR`, never writes, and answers while the
runtime is running.

## The rail

The rail carries the project's tickets: **the open issues of the repository that carry the `fire`
label**. Setting the label brings the issue in at the next poll (a minute at most); closing it or
removing the label takes it off, **whatever its state** — removing `fire` is the action to take a
ticket back. PRs are never tickets.

Removing `fire` and setting it again on a held ticket (86) lifts it, however fast you do it: the
list never shows the removal, so the runtime reads the issue's label history instead and, for a
removal that came after the hold, writes `ticket.left` then `ticket.arrived`. A removal that came
before the hold does not lift it: `ticket.fire-unseen` is written, and the ticket's queue line
says so and what to do (remove `fire`, set it again now).

| State | Meaning |
|---|---|
| **queued** | on the rail, to be taken — or held back: its line says by what |
| **BLOCKED** | waiting for a **dropped** ticket, or a **frozen** one (86 with no return time, which the pass could not judge): it will not leave without an action from you |
| **taken** | lent to a station, under a lease |
| **in pass** | the cook has finished; the pass is judging — or stopped, green, without merging |
| **served** | merged. The pass closes its issue: it leaves the rail at the next poll |
| **86** | not servable for now (quota exhausted, ticket refused, pass escalated to the chef) |
| **WAITING** | waiting for a **third party** — a client, an external decision, a meeting —, not for you: the kitchen does not take it, and it is not among what awaits you (see "A ticket waits for a third party: WAITING") |

**Service order**: `prio:1`, `prio:2`, `prio:3`, then the issues with no `prio:`; at equal priority,
the oldest first.

**A ticket can wait for another**: the `attend` line of its card (see "A ticket's card"). The rail
does not lend it until **all** those it waits for are **served**.

The lines below are what `rail` and `status` write now, in English. The card key `attend` is
read in French by the runtime today, and stays French until the runtime renames it.

| What the line says | Meaning | What makes it leave |
|---|---|---|
| `queued … awaiting #12, #13` | #12 and #13 are not served yet | nothing: once the last is served, it leaves by itself |
| `BLOCKED … #12 dropped (…)` | #12 left the rail **without having been served** | put #12 back on the rail (open issue, `fire`), or remove its number from the `attend` line |
| `BLOCKED … blocked by #12 (86 with no return time, not judged by the pass)` | #12 is 86 with no return; this ticket waits for it (`attend`) — never for its zone: a ticket 86 holds none | settle #12: it is judged, given back or withdrawn, and this ticket leaves by itself |

- **Served means its delivery is merged** — by the pass or by you, including on a ticket escalated
  to 86. An issue closed by hand, or delivered by a PR the runtime did not open, is not served: it
  is a drop. Once served, a ticket stays served, even reopened.
- **Dropped**: issue closed without having been served, `fire` label removed, or issue gone —
  including a closed issue that never came onto the rail.
- **A block is told to you once per drop**: a comment "Rail — ticket bloqué", the `ticket.blocked`
  fact, `BLOCKED` on the rail — after the pass has re-read the PR of the ticket that left, if it
  left one: merged by hand, it serves it.
- **A cycle is refused** (#14 awaits #15, which awaits #14): the card of each of its tickets becomes
  unreadable, the cycle named; they come back by themselves once a wait is removed.
- An awaited ticket that is open, without `fire`, can be waited for. A dependency set on a ticket
  already taken or in pass will only play if it comes back to queued.

The comment "Rail — ticket bloqué" is written on the issue in French; it stays French until the
runtime is translated.

**A ticket is lent only once**: the station that takes it receives a **lease** of 30 minutes. **The
lease is renewed only on observable progress** in the cook's worktree (`ticket.renewed`), checked at
the tick, at most once per tenth of the lease. An unreadable worktree counts neither as progress nor
as absence of progress: the lease then falls only after a grace of one tenth of the lease.

What a `git status` would show counts as progress: one more commit or a rewritten one, a tracked
file modified or deleted, a new file that is not ignored. Do not count: the cook's output stream,
what `.gitignore` sets aside, the contents of `.git`. Idleness (10 minutes, see "The guardrails")
listens to the stream: the cook is alive; the lease looks at the worktree: it progresses.

- **When the lease falls**, the station stops the cook and harvests (`guard.tripped`, reason
  `lease`): what it committed goes to the pass; with no commit, the ticket goes back to queued and
  the stop counts toward the breaker. The rail gives back by itself (`ticket.released`,
  `lease-expired`) only a ticket taken without a cook.
- **Past half the lease with no progress**, the cook is flagged: `STUCK` in `status` (`COINCE` before
  #940), which says "no progress since …", and `cook.stalled` in the log (once per episode).
  Nothing is stopped.
- **An 86 comes back by itself** at its return time; without one, it stays 86 until it is given back.
- **GitHub unreachable**: the rail stays as it is (`sondage GitHub en échec`, in journald), and the
  poll is replayed at the next tick.

The journald line `sondage GitHub en échec` is written in French by the runtime today; it stays
French until the runtime is translated.

### Reading the rail

```bash
npm --prefix runtime run rail
```

One line per ticket, in service order. A queued ticket that does not leave says why:
`awaiting #12, #13`, `zone held by #14 (path)` (see "File zones") or, `BLOCKED`, the dropped ticket
and its reason. The first line names the project's **common paths**. Under a ticket that has a card,
an indented line says what it awaits, its zone, and what the runtime does not understand in it
(`UNREADABLE CARD — clé inconnue « budget »`: the finding, written to the log in French, is relayed
as it is).

The finding after `UNREADABLE CARD —` (here `clé inconnue « budget »`) is French, as the card
reader writes it; it stays French until the runtime is translated.

### Removing a ticket from the rail, changing its priority

```bash
npm --prefix runtime run rail -- remove <ticket>
npm --prefix runtime run rail -- priority <ticket> <1-9 | none>
```

The two actions of the app's card (`runtime/src/geste-ticket.ts`). `remove` takes the `fire` label
off the issue of a queued or `BLOCKED` ticket: it leaves the rail, its issue stays open. A ticket
that is taken, in pass, served or 86 is refused, and nothing is touched. `priority` replaces the
issue's `prio:<n>` label, whatever the state of the ticket; `none` removes it. Each sets the label
under the service account's `gh` (`BRIGADE_GITHUB_REPO` is required), writes to the log the fact the
poll would have written — the rail and the card read it at once —, and states its price
(`— cost: …`): on standard output if it is done, on standard error with its reason, with code 1, if
it is refused.

### Sending a delivery back to a cook, saying why you corrected it

```bash
npm --prefix runtime run rail -- send-back <ticket> [reason…]
npm --prefix runtime run rail -- correct <ticket> <reason…>
```

The reason is typed as words, without quotes, on one line of at most 400 characters. `send-back`
sends back to a cook the delivery of a ticket that the queue says awaits you — green and not merged,
or escalated with its PR —, as the pass sends back a red delivery: `pass.returned` (in the name of
`chef`, your reason as the finding) then `ticket.released` (reason `chef-sent-back`); the cook goes
back to its branch, its PR stays open, and the send-back counts among the ticket's. Without a
reason, the cook reads that it must re-read the issue and the PR. `correct` touches nothing: you
corrected yourself the delivery of a ticket that was delivered at least once — on its branch or after
its merge — and you say why; without a reason, it is refused. Neither talks to GitHub. With a reason,
each makes it a project **candidate lesson**, with origin `chef-correction #<ticket>` (see
[`carnet-lecons.md`](carnet-lecons.md), "A lesson born from a send-back").

### Answering a TODO card

```bash
npm --prefix runtime run rail -- choose <ticket> <choice number>
npm --prefix runtime run rail -- answer <ticket> <answer…>
```

`choose` answers the ticket's TODO card by one of its choices, numbered from 1 as `status` shows
them; `answer`, in your own words, typed without quotes. In the same call, the answer is written on
the issue, the card leaves TODO and the ticket moves on — see "What enters TODO, and how you
answer" in [`manager.md`](manager.md).

The rail's facts: `ticket.arrived`, `ticket.changed`, `ticket.left` (in the name of `github`; also
for an awaited issue, closed without having come onto the rail), `ticket.taken`, `ticket.renewed`,
`ticket.released`, `ticket.passing`, `ticket.served`, `ticket.86`, `ticket.blocked`,
`ticket.waiting`, `ticket.resumed` (in the name of `chef`), `ticket.fire-unseen` (a removal of `fire` not counted as the gesture), `waiting.marked`, `rail.commons`.

### A ticket waits for a third party: WAITING

What waits for someone other than you — a client's answer, an external decision, a meeting — leaves
what awaits you (TODO) and is put aside: **WAITING**. The ticket says there what it waits for, in
your words, from whom, since when, the date to come back to it, and what will happen when it arrives.

```bash
npm --prefix runtime run waiting                # the tickets in WAITING
npm --prefix runtime run waiting -- set 8 --what "sa validation écrite du devis" --from "le client" [--remind 2026-10-21]
npm --prefix runtime run waiting -- resume 8    # WAITING → TODO, right away
npm --prefix runtime run waiting -- arrived 8   # "it arrived, we go on": taken, without going through TODO
```

The `--what` and `--from` values above are the chef's own words, so here they are French; the
words `set`, `resume`, `arrived`, `--what`, `--from` and `--remind` are the runtime's English ones.
The old words (`poser`, `reprendre`, `arrive`, `--quoi`, `--de`) still answer.

- **`set`** puts a ticket of the rail that is **queued or 86** in WAITING; a ticket that is taken or
  in pass is refused — the kitchen holds it. `--remind`: a date (that day at midnight, box time), a
  date and a time (`2026-10-21T09:00`) or a duration (`7j`, `36h`); **without it, in seven days**.
  Said again on a ticket that already waits, it updates what it waits for without changing since
  when.
- **The second launches it, alone or on the chef's request.** Alone: when reading the queue, any
  TODO card whose text names the awaited third party (the client, a person, a date, an outside
  event) goes to WAITING through this action, with a follow-up — the card's date, otherwise seven
  days. It says so in its first answer, one line per card (what, from whom, follow-up, why), and the
  chef cancels in a word ("resume #N": `resume`). Who is awaited is unclear: it moves nothing and
  asks a one-line question. A card that awaits the chef (product decision, design, action) stays in
  TODO. A refusal of the action (ticket taken, in pass, served) is relayed as it is. On request
  ("put #8 in waiting for the client until the 21st"), it extracts what is awaited, from whom and
  the follow-up, asks for what is missing before acting, then launches this same action through the
  box (`brigade <name> waiting set 8 --what … --from … --remind 2026-10-21`) — never a label or a
  comment set by hand. Auto mode judges it: no narrow rule names free arguments. Eval cases:
  `evals/second-met-en-attente`, `evals/second-met-en-attente-seul`.
- **The kitchen never takes a WAITING ticket**: it is an 86 with no return time (the base of the
  frozen ticket), with reason `third-party`. The readout does not give it back; like every 86, it
  holds no zone, even with an open delivery — put back on the rail, it claims it again.
- **`resume`** brings it back to TODO: in the state it was in before waiting if it had been set aside
  (its `attend` line comes back as it was), otherwise set aside for you (reason
  `third-party:resumed`), with what it was waiting for and your actions. It does not go to the
  kitchen alone.
- **`arrived`** puts it back on the rail, queued: a cook takes it in turn — on its open delivery, if
  it carries one. It also works on a ticket that came back from WAITING into TODO.
- **On the issue**, the running runtime says so as soon as it reads the action: the `waiting` label
  while the ticket waits, and a comment on entering WAITING and at each change — from whom, what,
  since when, the follow-up, what will happen on arrival; on leaving, the label is removed and a
  comment says where it went. What is set is written to the log (`waiting.marked`); if GitHub is
  unreachable, it is caught up at the next wake-up. The label is created by GitHub at its first
  setting if it does not exist.
- The follow-up is today only a stated date: nothing brings the ticket back by itself when it passes.

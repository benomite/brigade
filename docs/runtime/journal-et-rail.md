## What it does today

| Gesture | What happens |
|---|---|
| Starting | Takes the project's lock, recomputes its projections from the log, writes `runtime.started`, then what changed in its caps (`guard.configured`) and its partition (`isolation.configured`), announces the stations the project declares (`station.announced`; `stations.undeclared` if it declares none), asks `claude` whether the machine has a session, and polls GitHub |
| Running | Watches the log every second and wakes at the tick, every 60 s. On each wake-up: the guardrails watch for the "stop", the station takes what its bounds allow, the pass judges what is delivered, the manager — if it is on — judges, splits and reacts. On each tick: `runtime.ticked`, GitHub poll, expired leases returned, worktree progress checked, worktrees cleaned up, a reading of each cook (`cook.progressed`) |
| Stopping (`SIGTERM`, `SIGINT`) | Lets go of the cooks in flight — a relay carries them, the next runtime picks them up; **the unit does not signal them** (`KillMode=process`) — and kills the gates being played, writes `runtime.stopped`, releases the lock, exits with code 0 |
| Dying without notice | Nothing is lost: the kernel releases the lock, and the next start writes `runtime.interrupted` before starting again |
| Being launched a second time on the same project | Refuses, exit code 2, naming the runtime that is running (pid, machine, start time) |

**It launches cooks**, several at a time, through the `claude` binary under the machine's Max connection:
**each cook consumes Max quota**, as does each call of the **manager** (short, with no
tool) and each review by the pass's **reviewer** (read-only). Its other subprocesses
are `gh`, `git`, and **the project's gates** (`.claude/brigade/gates.sh`). **Under a `merge` grant, it
merges by itself** what its pass judges green. It listens on no port. **Nothing it launches
is partitioned until you have set up the partition** (see "The partition"): it tells you so at each
start. Everything goes out under the machine's GitHub account — or, with Apps, **under one identity
per role**, with one-hour tokens that no cook receives (see "A GitHub identity per
role").

## The log

One file per project, `log.db`, in the state directory. Each event carries `seq` (the order
of truth), `at` (UTC), `project`, `ticket` (or nothing), `type`, `author` (`runtime`, `chef`,
`station:<name>`…) and `payload` (JSON). The database refuses any modification and any deletion; the
*projections* are recomputed from the log at each start.

### Re-reading the log

```bash
npm --prefix runtime run log -- 13           # everything that happened to ticket 13, in order
npm --prefix runtime run log                 # the whole log, without the runtime's heartbeats
npm --prefix runtime run log -- --ticks      # the whole log, heartbeats included
npm --prefix runtime run log -- --last 200   # only the last 200 events, in order
```

`--last <N>` combines with a ticket number or `--ticks`. Without a ticket, it reads from the end of the
log (a bounded query, not the whole log loaded just to keep its tail); with a
ticket, it keeps the end of that ticket's list. Excluded heartbeats do not count in N. Without it, the output grows with the log: it is the form that a
program re-reading the log at regular intervals should ask for.

One line per event. The command reads `$BRIGADE_STATE_DIR`, never writes, and answers while
the runtime is running.

## The rail

The rail carries the project's tickets: **the repository's open issues that carry the `fire` label**.
Setting the label makes the issue enter at the next poll (one minute at most); closing it or removing
the label makes it leave, **whatever its state** — removing `fire` is the gesture to
take a ticket back. PRs are never tickets.

| State | Meaning |
|---|---|
| **queued** | on the rail, to be taken — or withheld: its line says by what |
| **BLOCKED** | waiting on a **dropped** ticket, or **frozen** (86 with no return time, which the pass could not judge): it will not go out without a gesture from you |
| **taken** | lent to a station, under lease |
| **in pass** | the cook has finished; the pass judges — or has stopped, green, without merging |
| **served** | merged. The pass closes its issue: it leaves the rail at the next poll |
| **86** | not servable for now (quota exhausted, ticket refused, pass escalated to the chef) |
| **WAITING** | waiting on a **third party** — a client, an external decision, a meeting —, not on you: the kitchen does not take it, and it is not in what awaits you (see "A ticket awaits a third party: WAITING") |

**Serving order**: `prio:1`, `prio:2`, `prio:3`, then issues without `prio:`; at equal
priority, the oldest first.

**A ticket can await another**: the `awaiting` line of its card (see "A ticket's
card"). The rail does not lend it before **all** those it awaits are **served**.

| What the line says | Meaning | What makes it go out |
|---|---|---|
| `queued … awaiting #12, #13` | #12 and #13 are not served yet | nothing: once the last is served, it goes out by itself |
| `BLOCKED … #12 dropped (…)` | #12 left the rail **without having been served** | put #12 back on the rail (open issue, `fire`), or remove its number from the `awaiting` line |
| `BLOCKED … blocked by #12 (86 with no return time, not judged by the pass)` | #12 is 86 with no return; this ticket awaits it (`awaiting`), or its zone (`— zone held: <path>`) | settle #12: it gets judged, handed back or withdrawn, and this ticket restarts by itself |

- **Served means its delivery is merged** — by the pass or by you, including on a ticket
  escalated to 86. An issue closed by hand, or delivered by a PR the runtime did not open,
  is not served: it is a drop. Once served, a ticket stays so, even reopened.
- **Dropped**: issue closed without having been served, `fire` label removed, or issue gone — including
  a closed issue that never entered the rail.
- **A block is told to you once per drop**: "Rail — ticket bloqué" comment, `ticket.blocked`
  fact, `BLOCKED` on the rail — after the pass has re-read the departed ticket's PR, if it
  left one: merged by hand, it serves it.
- **A cycle is refused** (#14 awaits #15, which awaits #14): the card of each of its tickets
  becomes unreadable, cycle named; they come back by themselves once a wait is removed.
- An awaited ticket that is open, without `fire`, can be waited for. A dependency set on a ticket
  already taken or in pass will only play if it goes back to queued.

**A ticket is lent only once**: the station that takes it receives a **lease** of 30 minutes.
**The lease is only renewed on observable progress** in the cook's worktree
(`ticket.renewed`), checked at the tick, at most once per tenth of the lease. An unreadable worktree
counts neither as progress nor as lack of progress: the lease then falls only after a grace period of one tenth of the
lease.

What a `git status` would show counts as progress: one more or rewritten commit, a modified or deleted
tracked file, a new non-ignored file. Do not count: the cook's output stream,
what `.gitignore` excludes, the contents of `.git`. Inactivity (10 minutes, see "The
guardrails") listens to the stream: the cook is alive; the lease watches the worktree: it progresses.

- **When the lease falls**, the station stops the cook and harvests (`guard.tripped`, reason `lease`):
  what it committed goes to pass; with no commit, the ticket goes back to queued and the stop counts against the
  breaker. The rail only returns by itself (`ticket.released`, `lease-expired`) a ticket taken
  without a cook.
- **Past half the lease without progress**, the cook is flagged: `STUCK` in `status` (`COINCE` before #940), which says
  "no progress since …", and `cook.stalled` in the log (once per episode). Nothing is stopped.
- **An 86 comes back by itself** at its return time; without one, it stays 86 until it is handed back.
- **GitHub unreachable**: the rail stays as it is (`sondage GitHub en échec`, in journald), and the
  poll is replayed at the next tick.

### Reading the rail

```bash
npm --prefix runtime run rail
```

One line per ticket, in serving order. A queued ticket that does not go out says why:
`awaiting #12, #13`, `zone held by #14 (path)` (see "The file zones") or, `BLOCKED`, the
dropped ticket and its reason. The first line names the project's **common paths**. Under a
ticket with a card, an indented line says what it awaits, its zone, and what the runtime does not
understand in it (`UNREADABLE CARD — clé inconnue « budget »`: the finding, written to the log in French, is relayed as is).

### Removing a ticket from the rail, changing its priority

```bash
npm --prefix runtime run rail -- remove <ticket>
npm --prefix runtime run rail -- priority <ticket> <1-9 | none>
```

The two gestures of the app's card (`runtime/src/geste-ticket.ts`). `remove` removes the `fire` label
from the issue of a queued or `BLOCKED` ticket: it leaves the rail, its issue stays open. A
taken, in-pass, served or 86 ticket is refused, and nothing is touched. `priority` replaces the issue's
`prio:<n>` label, whatever the ticket's state; `none` removes it. Each sets the label under the service
account's `gh` (`BRIGADE_GITHUB_REPO` is required), writes to the log the fact that the poll
would have written there — the rail and the card read it at once —, and states its price (`— cost: …`): on
standard output if carried out, on standard error with its reason, with code 1, if refused.

The rail's facts: `ticket.arrived`, `ticket.changed`, `ticket.left` (in the name of `github`; also
for an awaited issue, closed without having entered the rail), `ticket.taken`, `ticket.renewed`,
`ticket.released`, `ticket.passing`, `ticket.served`, `ticket.86`, `ticket.blocked`,
`ticket.waiting`, `ticket.resumed` (in the name of `chef`), `waiting.marked`, `rail.commons`.

### A ticket awaits a third party: WAITING

What awaits someone other than you — a client's answer, an external decision, a
meeting — leaves what awaits you (TODO) and is put aside: **WAITING**. The ticket there says what it
awaits, in your words, from whom, since when, the date to come back to it, and what will happen
when it arrives.

```bash
npm --prefix runtime run waiting                # the tickets in WAITING
npm --prefix runtime run waiting -- set 8 --what "sa validation écrite du devis" --from "le client" [--remind 2026-10-21]
npm --prefix runtime run waiting -- resume 8    # WAITING → TODO, right away
npm --prefix runtime run waiting -- arrived 8   # "it has arrived, let's go": taken, without going back through TODO
```

- **`set`** puts into WAITING a rail ticket that is **queued or 86**; a taken or in-pass ticket is
  refused — the kitchen holds it. `--remind`: a date (that day at midnight, box time), a
  date and a time (`2026-10-21T09:00`) or a duration (`7j`, `36h`); **without it, in seven
  days**. Said again on a ticket that is already waiting, it updates what it awaits without changing since
  when.
- **The second launches it, on its own or at the chef's request.** On its own: when reading the queue, any card in
  TODO whose text names the awaited third party (the client, a person, a date, an outside event)
  goes to WAITING through this gesture, with a reminder — the card's date, otherwise seven days.
  It says so in its first answer, one line per card (what, from whom, reminder, why), and the
  chef cancels in a word ("resume #N": `resume`). If who is awaited is not clear, it
  moves nothing and asks a one-line question. A card that awaits the chef (product decision,
  design, gesture) stays in TODO. A refusal of the gesture (ticket taken, in pass, served) is relayed
  as is. On request ("put #8 on hold for the client until the 21st"), it extracts what is awaited,
  from whom and the reminder, asks for what is missing before acting, then launches this same gesture through the box
  (`brigade <name> waiting set 8 --what … --from … --remind 2026-10-21`) — never a label or a
  comment set by hand. Auto mode judges it: no narrow rule names free-form arguments.
  Eval cases: `evals/second-met-en-attente`, `evals/second-met-en-attente-seul`.
- **The kitchen never takes a WAITING ticket**: it is an 86 with no return time (the basis of the
  frozen ticket), with reason `third-party`. The sweep does not return it; it holds its zone only if it
  carries an open delivery.
- **`resume`** brings it back to TODO: in the state it was in before waiting if it had been set
  aside (its `awaiting` line comes back as is), otherwise set aside for you (reason
  `third-party:resumed`), with what it awaited and your gestures. It does not go to the kitchen by itself.
- **`arrived`** puts it back on the rail, queued: a cook takes it in turn — on its open
  delivery, if it carries one. It also works on a ticket that came back from WAITING into TODO.
- **On the issue**, the running runtime says so as soon as it reads the gesture: the `waiting` label while
  the ticket waits, and a comment on entering WAITING and at each change — from whom,
  what, since when, the reminder, what will happen on arrival; on leaving, the label is removed
  and a comment says where it went. What is set is written to the log (`waiting.marked`);
  GitHub unreachable, it is caught up at the next wake-up. The label is created by GitHub at its first
  setting if it does not exist.
- The reminder is for now only a stated date: nothing brings the ticket back by itself when it passes.

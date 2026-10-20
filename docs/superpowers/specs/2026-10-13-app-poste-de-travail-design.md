# The app as a workstation: the rail at the center, the second on the right, alerts that go quiet

**2026-10-13.** Drawn with the chef, in session. It does not replace the mockup
(`docs/maquettes/app/`): it keeps **all of its visual language** — palette, Archivo +
JetBrains Mono, state shapes, laid down by #470, #471, #472 — and it changes **its structure**.

## What motivated this spec

Five sentences from the chef in a single day:

| What he said | What he was asking |
|---|---|
| "the rail is empty, I see nothing" | *what is going on?* |
| "what is the right-hand column for?" | *why are you showing me this?* |
| "a card is awaiting me, what do I have to do?" | *what must I do now?* |
| "I still don't know how to start/stop the manager" | *where is the button?* |
| "always waiting on something, it's a pain" | *why am I the bottleneck?* |

**Five questions, one shape: "and now?"** Each time the app answers with a **state**, never with a
**gesture**.

The cause: **the app is laid out like the machine** — rail, cooks, consumed, log, gestures in a
panel. Those are the runtime's concepts. The chef does three things: **decide**, **look at what he
is building**, **watch what it costs**. None of the three had a screen.

And four silent breakdowns the same day, all of the same shape — *the rail looked normal and was
not running*:

- the **manager off**: the chef asked twice how to turn it on;
- the runtime **version** 26 merges behind, which declared itself up to date (it compared itself
  with its own clone, which nobody had refreshed);
- the **kitchen frozen** after a deploy, for lack of a declared station;
- the **grant** that lapsed the day before, two green deliveries left stranded.

## The model, in four rules

1. **One screen, three zones.** An alert band at the top, the rail at the center, the second on
   the right. We never change screens, so we never lose context.
2. **A click calls an LLM, or it does not.** If something has to be read, judged, drafted or
   arbitrated: a **filled-in prompt** in the second, **which does not go out** — the chef presses
   Enter. Otherwise: the command **goes out** (`!`), and its output is read in the same thread.
3. **A destructive or heavy gesture asks for a "yes" first** — a confirmation, **not** an LLM. And
   it says **what it is going to do**, not "are you sure?": the convention is already that of the
   uninstall gesture (#394).
4. **Alerts go quiet.** In normal running, the band is empty. What has nothing to say takes no
   room — this is already the convention of the facts (`drift`, `worktrees`, `stations`,
   `connection`, `grant`: *"absent when there is nothing to say"*).

## The three zones

### The alert band

It answers a single question: **can it run?** Its admission test:

> **What decides whether — and how — it runs without the chef.**

Four things get in, and they are the day's four breakdowns: **the manager** (off, nothing
advances), **the version in service** (stale, we are looking at yesterday's product), **the
kitchen** (stopped or without a station, the rail is scenery), **the grant** (active, it merges
without him; lapsed, everything stops at pass).

It is **per project**, not per app: one manager per project, one version per project. An app-wide
band would lie from the second declared project on.

Each alert carries **its gesture** and, when it has one, **its price**: "put into service — 1 cook
in flight will be interrupted, its ticket restarts from zero".

**The discipline, without which the band dies:**

> **An alert is something to do, never something to know.**
> The test: *does it change what I do in the next five minutes?*

`no station declared` → yes, nothing goes out. `a version has been waiting for 5 h` → yes.
`backup 10 h ago` → no, that is Settings. `transcripts: 162 kept, 60 MB` → no.

**And silence must be proven, never assumed.** This is the condition for everything else:

| What must alert | Can the facts say it? |
|---|---|
| The stale version | **yes** — `version` block, compared against the origin (#476). And `null` does not mean "up to date" there: it means "nothing was compared" |
| The lapsed grant | **yes** — absent as long as no grant is in force or has lapsed |
| The stopped kitchen, without a station | **yes** |
| **The manager off** | **no. No `manager` block in the facts.** Its state lives in `run manager`, apart |

The last one is the hole, and the biggest: **#438** already carries it.

### The rail, at the center

**It is the main view.** It shows what is happening, what is going to happen, what the chef must
do, and what is done — its five columns exist: **On the rail · Taken · Awaiting you ·
Pass · Served**.

A card carries what the facts already say: who holds it, since when, the lease, **what it burns
live**, and in plain words what blocks it ("zone held by #465"). Its gesture is a **prompt**:
"explain this ticket to me", already delivered for `Awaiting you` by #452.

**`Awaiting you` replaces any separate block of what is awaiting** — but the column has two
limits, which the code itself states: it never says "nothing awaits you", and **a card is a
ticket**. A line of the `awaiting` block without a number can have no card. There is already one:
the **version that is waiting**. It therefore goes in the alert band, not in a column.

**A crossed cost threshold enters `Awaiting you`**: it is not a measure to consult, it is a closing
proposal, hence a decision — the mechanism is delivered (#464).

### The second, on the right, permanently

It is no longer a tab. Reason: **it is the only agent in the system that talks to the chef.** The
manager writes issues, the cooks write code, the reviewer writes remarks — none of them addresses
him. Putting his interlocutor in a drawer he has to go and fetch means losing the thread at every
gesture.

**What we gain by going through it is judgment, not typing.** An example from 2026-10-13: to put
the runtime into service, the second read the state, **waited for the rail to be calm**, switched,
checked, then reported. A shell would have run the line and killed two cooks (456,075 tokens in
flight).

**A direct action reports on the left or through its own output — never through the second's
narration.** Otherwise it recounts what it did not do, and the thread fills with machine noise.

### Two tabs

**Cost** — the statement, tokens per ticket, tickets paid for several times, thresholds,
calibration. Consultation: a *crossed* threshold, on the other hand, is an alert.

**Settings** — housekeeping (installation, backup, transcripts), stations, grants (revoke,
modify), the project. **You set it here, you see it up there**: the grant is set in Settings and
its state shows in the band.

## What a click does, gesture by gesture

| Gesture | What goes out |
|---|---|
| turn the manager on / off | **direct** |
| check the installation | **direct** |
| open an interface delivery in the browser | **direct** |
| update the app's code | **direct** |
| set a threshold, change the calibration | **direct** |
| `stop` / resume the kitchen | **confirmed** — says the cooks in flight and their tokens |
| enable / revoke the `merge` grant | **confirmed** — says "a green pass will be merged without you" |
| put into service | **confirmed** — says what it interrupts |
| "this card is awaiting me, explain and unblock" | **prompt** |
| answer a manager question on an issue | **prompt** |
| turn field feedback into a ticket | **prompt** |

**A direct action that meets a condition stops and asks** — it does not choose in the chef's
place. Putting into service is direct, unless there are cooks in flight: then it says what it
would kill and waits for his word. That is #477.

## Between projects

An alert on a project the chef is not looking at is signaled **on its slot in the icon bar**, and
leads to **"All projects"** (`#tous`, delivered by #364) for the global context.

An assumed consequence: **the app queries all declared boxes**, not only the one of the open
project.

## What this spec does not do

- **It asks the runtime for no new fact**, except the manager's state in the facts (#438). If a
  state cannot be shown because the box does not say it, that is a ticket for the runtime —
  never a deduction by the app.
- **It never sends a prompt in the chef's place.** A click with judgment fills in and stops.
- **It does not put the log on screen**: it is breakdown tooling, it lives behind a gesture.
- **It does not create an inbox.** The chef is not a machine that pulls work: what awaits him is
  already his queue.
- **It does not touch the theme**: the mockup is dark, a theme choice is another subject.
- **It makes nothing less readable than before.** The word-for-word relay of the box is neither
  truncated nor reformatted: it is the only place where "pretty" formatting would be a regression.

## What it depends on

| | |
|---|---|
| **#438** | the manager's and grants' state in the app — **the hole in the alert band** |
| **#475 → #479** | the put-into-service gesture, named, without `sudo`, with its warning |
| **#483** | the chef's decisions set by a gesture, not by a `sudo` in a drop-in |
| **#404**, #406 | looking at an interface delivery before it is merged |
| #452, #464, #476, #364 | delivered: the click on a card, the closing proposal, the `version` block, the screen of all projects |

## What remains to be tested before drawing

**One thing only, and it decides whether "it goes out" is a promise or a hope.**

Today the app **never** sends — because it writes into a pty blindly and does not know what it
displays. Its own code admits it: *"in front of a dialog or in vim mode, what is written is taken
for keystrokes; the note therefore does not promise that nothing went out."*

This spec asks the opposite for direct gestures. **Nobody knows what becomes of a `!` sent into
the input of a busy second** — queued, or swallowed. To be tested before drawing, and two possible
consequences:

- the app must carry a **real input field** for the second, which it controls, rather than
  writing blindly into a terminal;
- or the direct gesture must know whether the second is free, and say so when it is not.

**And a product criterion that follows: direct gestures must output briefly.** The output of a `!`
enters the second's context — that is intended, it is what lets it know what the chef did without
being told — but every following turn pays for it as input. A `!` that spits out fifteen events
and their JSON costs for the rest of the session.

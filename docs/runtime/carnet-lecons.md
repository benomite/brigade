## The lessons notebook

After each **served ticket**, the cook that delivered it leaves its **retro**: at most three lessons,
each one proposed (`propose <lesson>`) or reconfirmed by its id (`reconfirm L4`). The project's
**log** keeps all of them — these are the **provisional lessons**, which nothing validates. The ones
that have proved themselves enter the project's repository, in the **notebook**; the ones that are no
longer true leave it. The runtime decides this on its own, from the history of the retros, and
delivers it through a PR that goes through **the pass** like a **delivery**: **it does not wait for you.**

The notebook therefore has two tiers:

| Tier | Where | What it holds |
|---|---|---|
| provisional | the runtime's log (`retro.recorded`) | all the lessons from the retros, with their id (`L1`, `L2`…) — stable: the log is append-only |
| notebook | `.claude/brigade/carnet.md`, in the project's repository, on the integration branch | the **promoted** lessons, and the trace of those that have **left** (expired or retired) |

A lesson that is not in the notebook is provisional. What the project has learned — provisional and
promoted — can be read in `facts` (`apprentissage`, see [`etat-et-mesures.md`](etat-et-mesures.md)).

### What a cook receives

The cook launched on a ticket — first cook, resumption of preserved work, return from the pass, from
here or from a remote station — receives in its instruction the **provisional lessons of its
project**, and of no other: each with its id, the most recent first (recent by the retro that
proposed it). A lesson that the integration branch's notebook holds — promoted, or left — is no
longer provisional: it is not received. An unreadable notebook removes none. The module is
`runtime/src/apprentissage/injection.ts`.

It receives **at most 20**, the most recent: a project setting, so that each cook's context does not
grow without end. `BRIGADE_INJECTED_LESSONS` in its unit's drop-in, like the thresholds below; `0`
turns them off. A badly written integer makes startup refuse, naming the variable; `seuils-cli.ts`
shows it with the thresholds.

The log says what it received: `lessons` in its `cook.launched`, the ids, in the order of its
instruction — `[]` if it received none. Without lessons, its instruction is the one from before.

### The notebook format

Readable by hand, one block per lesson, sorted by id:

```
# Carnet des leçons

## L1
- état: promoted
- texte: Run the runtime tests before committing.
- entrée: 2026-10-01
- rétros: retro-12, retro-15, retro-19

## L2
- état: expired
- texte: Reread the card before writing.
- entrée: 2026-10-02
- rétros: retro-13
- sortie: 2026-12-01
- raison: expiry
```

`état` is `promoted`, `expired` (exit `raison: expiry`) or `retired` (exit `raison: manual`).
`entrée` is the day of its promotion, `rétros` the ones that proposed or reconfirmed it (a retro's
reference in the log). **A lesson that has left is never erased from the file**: it keeps its id, its
date and its reason for leaving. The format is in `runtime/src/carnet/carnet.ts`; a file it does not
understand is not rewritten (see below).

### The three thresholds

Time is counted in **served tickets**, not in days: each served ticket writes a retro, empty or not.

| Threshold | Default | Variable |
|---|---|---|
| **Promotion**: a provisional lesson enters the notebook when that many retros, from **different tickets**, cite it — proposing it counts. Two retros of the same ticket count as one | **3** retros | `BRIGADE_PROMOTION_RETROS` |
| **Demotion**: a promoted lesson that no retro reconfirms for that many served tickets becomes provisional again. Its earlier citations no longer count toward promoting it again | **20** served tickets | `BRIGADE_PROMOTED_EXPIRY_TICKETS` |
| **Disappearance**: a provisional lesson that no retro reconfirms for that many served tickets — since its last citation, or since its demotion — disappears. If it had been promoted, its exit enters the notebook, `état: expired` | **20** served tickets | `BRIGADE_PROVISIONAL_EXPIRY_TICKETS` |

**Changing them, for one project**: they are variables of the project's unit, in its instance's
drop-in (`/etc/systemd/system/brigade@<project>.service.d/projet.conf`, see
[`installer.md`](../installer.md)) — so each project has its own:

```
[Service]
Environment=BRIGADE_PROMOTION_RETROS=4
```

then `sudo systemctl daemon-reload && sudo systemctl restart brigade@<project>`. Read at startup: a
badly written integer, or zero, makes startup refuse, naming the variable, never a fallback to the
default. To read the ones in force, with the unit's environment:
`node runtime/src/seuils/seuils-cli.ts`.

### Promotion and expiry, delivered by a PR

The module is `runtime/src/promotion/`; the decision itself, `runtime/src/peremption/`.

1. **When.** With each additional served ticket, and with each notebook PR concluded (merged or
   closed), the runtime rejudges the history of the retros. Nothing else changes a decision.
2. **On what.** On the integration branch's notebook, first as the station's clone carries it; if it
   finds a change, it prepares a branch like a cook's — the base fetched — and rejudges on that
   base's notebook. **Without a decision, nothing goes out**: no branch, no PR.
3. **One notebook PR at a time.** As long as the last one is neither merged nor closed, no other goes
   out: the base's notebook does not yet say what it decides.
4. **The PR.** A branch that carries **only** `.claude/brigade/carnet.md`, a PR to the integration
   branch, titled `Carnet des leçons — promue L4 ; expirée L2`. Its body states each decision and
   **the retros that justify it** — for a promotion, the ones that proposed or reconfirmed it, with
   their ticket. In the log: `carnet.started`, then `carnet.delivered` (the PR, its decisions, the
   lessons it changes) or `carnet.undelivered` (why it did not go out).
5. **The pass.** The PR enters the pass **off the rail**, in the same motion as its opening
   (`pass.entered`), like a closing pass or an accepted correction: merge with the base, gates,
   reviewer — which rereads it as a change to the notebook —, CI, `merge` grant. **No action from you
   is expected.** The notebook is under `.claude/brigade/`, with what judges deliveries: the pass
   therefore also calls its **second judge** (see [`pass-merge.md`](pass-merge.md)); established as
   not weakened, it is merged under the `merge` grant, stopped without it. Red, no cook picks it up:
   it comes back up to you, like any delivery off the rail.

A base notebook that is unreadable is never rewritten: nothing goes out, `carnet.undelivered` gives
the faulty line, and the judgment starts again at the next served ticket — fix the file through a PR.
A delivery that died with the runtime picks up, at the next wake-up, the PR GitHub holds for its
branch; without a PR, it is reported as undelivered and the next judgment redoes it.

### Retiring a promoted lesson

A promoted lesson you no longer want to see is retired **through a PR**, like any delivery. Two ways,
your choice:

**By a revert** — the lesson came in alone, or you are removing everything its PR promoted:

1. On GitHub, open the `Carnet des leçons — promue …` PR that promoted it, and click **Revert**.
2. Merge the revert PR into the integration branch.
3. At the next served ticket, the runtime notes that a lesson it had promoted is no longer in the
   base's notebook: it opens a `Carnet des leçons — retirée L4` PR, which records it there as
   `état: retired`, `raison: manual`, dated the day it notes it. It goes through the pass like the
   others.

**By an edit** — to retire one lesson among others, or right away:

1. On a branch, in `.claude/brigade/carnet.md`, change the lesson's block:
   `- état: promoted` becomes `- état: retired`, and add under its retros
   `- sortie: <YYYY-MM-DD>` (the day of the retirement) then `- raison: manual`. Do not remove the block.
2. Open the PR to the integration branch, and merge it.

In both cases, the lesson **keeps its id**, and the runtime only counts the retros written **after**
the day it left — a retro from the same day is held to be earlier. Reconfirmations from before do not
bring it back; **three new retros** (the promotion threshold), from different tickets, have to cite
it for a new PR to promote it again. An expired lesson comes back the same way.

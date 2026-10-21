## The lessons notebook

After each **served ticket**, the cook who delivered it leaves its **retro**: at most three
lessons, each one proposed (`propose <lesson>`) or reconfirmed by its id (`reconfirm L4`). The
project's **log** keeps them all — these are the **provisional lessons**, which nothing validates.
The ones that have proved themselves enter the project's repository, in the **notebook**; the ones
that are no longer true leave it. The runtime decides alone, from the history of the retros, and
delivers it as a PR that goes through **the pass** like a **delivery**: **it does not await you.**

The notebook therefore has two tiers:

| Tier | Where | What it holds |
|---|---|---|
| provisional | the runtime's log (`retro.recorded`) | every lesson of the retros, with its id (`L1`, `L2`…) — stable: the log is append-only |
| notebook | `.claude/brigade/carnet.md`, in the project's repository, on the integration branch | the **promoted** lessons, and the trace of the ones that have **left** (expired or retired) |

A lesson that is not in the notebook is provisional. What the project has learned — provisional
and promoted — reads in `facts` (`apprentissage`, see [`etat-et-mesures.md`](etat-et-mesures.md)).
The field is still named `apprentissage` and its entries still carry French keys and values
(`lecons`, `statut`, `provisoire`, `promue`…): the runtime has not renamed them yet.

### A lesson born from a send-back

A send-back is stronger proof than what a cook says of itself. Its reason enters the project as a
**candidate lesson**, provisional, by the same path as a retro lesson — same sequence of ids, same
promotion and expiry thresholds —, with its origin:

| The send-back | What becomes a lesson | Origin |
|---|---|---|
| The pass sends a red ticket back, or the manager relaunches a red from the pass | each finding of the send-back, at most three | `pass-send-back #N` |
| You send a delivery back to a cook (`rail send-back <N> <reason…>`) | your reason | `chef-correction #N` |
| You say why you corrected a delivery (`rail correct <N> <reason…>`) | your reason | `chef-correction #N` |

In the log: `lesson.candidate` (`origin`, `text`), one fact per lesson, written with the send-back —
the cook of the send-back already receives it. **A send-back without a reason gives birth to none.**
A lesson fits on one line: the reason is put on one line, without the tail of the gates output or
its code block; the pass's, if longer than 400 characters, is cut at the last word that fits
(`…`); yours is refused rather than cut. A candidate that says word for word what a lesson of the
project already says **reconfirms** it instead of giving birth to another; a retro may reconfirm a
candidate by its id, like any lesson. Its reference, in `rétros:` in the notebook, is
`pass-send-back-<seq>` or `chef-correction-<seq>`. Time is counted only in served tickets: a
candidate counts at the rank of the next served ticket — like the retro of the ticket it follows —,
and as long as none has been served, it is not counted yet. The module is
`runtime/src/apprentissage/renvoi.ts`.

### What a cook receives

The cook launched on a ticket — first cook, resumption of kept work, send-back from the pass, from
here or from a remote station — receives in its brief the **provisional lessons of its project**,
and of no other: each with its id, the most recent first (recent by the retro that proposed it). A
lesson that the integration branch's notebook holds — promoted, or left — is no longer
provisional: it is not received. An unreadable notebook removes none of them. The module is
`runtime/src/apprentissage/injection.ts`.

It receives **at most 20**, the most recent: a project setting, so that each cook's context does
not grow without end. `BRIGADE_INJECTED_LESSONS` in its unit's drop-in, like the thresholds below;
`0` turns them off. A badly written integer makes the start refuse, naming the variable;
`seuils-cli.ts` shows it with the thresholds.

The log says what it received: `lessons` of its `cook.launched`, the ids, in the order of its
brief — `[]` if it received none. Without a lesson, its brief is the one from before.

A cook of a project served by a station whose configuration counts at least two projects also
receives, after them and in a block of their own, the lessons of the **common tier** that you have
accepted (`C1`, `C2`…, see below) — outside the cap, which counts only the provisional ones. Their
ids are in `lessons` of its `cook.launched`, after the project's.

A cook launched under a **cook profile** also receives, after them, the notebook of that profile —
its promoted lessons only: see [`etat-et-mesures.md`](etat-et-mesures.md), "A profile at dispatch".

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
- texte: Read the card again before writing.
- entrée: 2026-10-02
- rétros: retro-13
- origine: pass-send-back #13
- sortie: 2026-12-01
- raison: expiry
```

The file's title and its keys (`état`, `texte`, `entrée`, `rétros`, `origine`, `sortie`, `raison`)
stay French: that is what `runtime/src/carnet/carnet.ts` reads and writes, and the text of a lesson
is whatever the cook wrote. The values `promoted`, `expired`, `retired`, `expiry` and `manual` are
already English.

`état` is `promoted`, `expired` (exit `raison: expiry`) or `retired` (exit `raison: manual`).
`entrée` is the day of its promotion, `rétros` the retros that proposed or reconfirmed it (a retro's
reference in the log). `origine` says where the lesson was born: `pass-send-back #N` (a send-back
by the pass on ticket N) or `chef-correction #N` (a send-back or a correction by the chef on ticket
N). **Without an `origine` line, the lesson was born from a retro**: that is the case for all those
of a notebook written before this field, which reads and rewrites identically. A lesson keeps its
origin from provisional to promoted, and at its exit. `facts` shows it for each lesson (`origine`).
**A lesson that has left is never erased from the file**: it keeps its id, its date and its reason
for leaving. The format is in `runtime/src/carnet/carnet.ts`; a file it does not understand is not
rewritten (see below).

### The four thresholds

Time is counted in **served tickets**, not in days: each served ticket writes a retro, empty or
not.

| Threshold | Default | Variable |
|---|---|---|
| **Promotion**: a provisional lesson enters the notebook when that many retros, from **different tickets**, cite it — proposing it counts. Two retros of the same ticket count for one | **3** retros | `BRIGADE_PROMOTION_RETROS` |
| **Send-back gap**: a lesson born from a send-back by the pass or a correction by the chef (origin other than `retro`) is promoted with that many retros fewer, never fewer than one. At **0**, it follows the promotion rule; the rule for lessons born from a retro does not change. Zero is allowed here | **1** retro fewer | `BRIGADE_SENDBACK_PROMOTION_GAP` |
| **Demotion**: a promoted lesson that no retro reconfirms for that many served tickets becomes provisional again. Its earlier citations no longer count towards promoting it again | **20** served tickets | `BRIGADE_PROMOTED_EXPIRY_TICKETS` |
| **Disappearance**: a provisional lesson that no retro reconfirms for that many served tickets — since its last citation, or since its demotion — disappears. If it had been promoted, its exit enters the notebook, `état: expired` | **20** served tickets | `BRIGADE_PROVISIONAL_EXPIRY_TICKETS` |

**Changing them, for one project**: they are variables of the project's unit, in the drop-in of its
instance (`/etc/systemd/system/brigade@<project>.service.d/projet.conf`, see
[`installer.md`](../installer.md)) — so each project has its own:

```
[Service]
Environment=BRIGADE_PROMOTION_RETROS=4
```

then `sudo systemctl daemon-reload && sudo systemctl restart brigade@<project>`. Read at start: a
badly written integer, or zero (except for the send-back gap, where zero is allowed), makes the
start refuse, naming the variable, never a fallback to the default. To read the ones in force, with
the unit's environment: `node runtime/src/seuils/seuils-cli.ts`.

### Promotion and expiry, delivered by a PR

The module is `runtime/src/promotion/`; the decision itself, `runtime/src/peremption/`.

1. **When.** At each additional served ticket, and at each concluded notebook PR (merged or
   closed), the runtime judges the history of the retros again. Nothing else changes a decision.
2. **On what.** On the integration branch's notebook, first as the station's clone carries it; if
   it finds a change, it prepares a branch like a cook's — the base brought in — and judges again
   on that base's notebook. **Without a decision, nothing leaves**: no branch, no PR.
3. **One notebook PR at a time.** As long as the last one is neither merged nor closed, no other
   leaves: the base's notebook does not yet say what it decides.
4. **The PR.** A branch that carries **only** `.claude/brigade/carnet.md`, a PR to the integration
   branch, titled `Carnet des leçons — promue L4 ; expirée L2`. Its body states each decision and
   **the retros that justify it** — for a promotion, the ones that proposed or reconfirmed it, with
   their ticket. In the log: `carnet.started`, then `carnet.delivered` (the PR, its decisions, the
   lessons it changes) or `carnet.undelivered` (why it did not leave). The title is built by the
   runtime, which still writes it in French (`promue`, `rétrogradée`, `expirée`, `retirée`): it
   stays French until the runtime is translated.
5. **The pass.** The PR enters pass **off the rail**, in the same gesture as its opening
   (`pass.entered`), like a closing pass or an accepted correction: merge with the base, gates,
   reviewer — who reads it as a notebook change —, CI, `merge` grant. **No gesture from you is
   awaited.** The notebook is under `.claude/brigade/`, with what judges deliveries: the pass
   therefore also calls its **second judge** (see [`pass-merge.md`](pass-merge.md)); established as
   not weakening, it is merged under the `merge` grant, stopped without it. Red, no cook picks it
   up: it comes up to you, like any delivery off the rail.

An unreadable base notebook is never rewritten: nothing leaves, `carnet.undelivered` names the
faulty line, and the judgement starts again at the next served ticket — fix the file by a PR.
A delivery that died with the runtime resumes, at the next wake-up, the PR that GitHub carries for
its branch; without a PR, it is said to be undelivered and the next judgement redoes it.

### Removing a promoted lesson

A promoted lesson you no longer want to see is removed **by a PR**, like any delivery. Two ways, as
you prefer:

**By a revert** — the lesson entered alone, or you remove everything its PR promoted:

1. On GitHub, open the `Carnet des leçons — promue …` PR that promoted it, and click **Revert**.
2. Merge the revert PR into the integration branch.
3. At the next served ticket, the runtime notes that a lesson it had promoted is no longer in the
   base's notebook: it opens a `Carnet des leçons — retirée L4` PR, which records it there as
   `état: retired`, `raison: manual`, dated the day it notes it. It goes through the pass like the
   others.

**By an edit** — to remove one lesson among others, or right away:

1. On a branch, in `.claude/brigade/carnet.md`, change the lesson's block: `- état: promoted`
   becomes `- état: retired`, and add under its retros `- sortie: <YYYY-MM-DD>` (the day of the
   removal) then `- raison: manual`. Do not remove the block.
2. Open the PR to the integration branch, and merge it.

In both cases, the lesson **keeps its id**, and the runtime now counts only the retros written
**after** the day of its exit — a retro of the same day is taken as earlier. Earlier
reconfirmations do not bring it back; **three new retros** (the promotion threshold), from
different tickets, have to cite it for a new PR to promote it again. An expired lesson comes back
the same way.

### The common tier: a lesson promoted in several projects

A station serves several projects — its configuration, `<BRIGADE_STATION_DIR>/projets`, is the
**installation**. A lesson that the notebook of **at least two** of these projects holds promoted,
on their integration branch, is **proposed to the common tier**, which serves the cooks of all the
projects. It is the same lesson when it says **word for word** the same thing — its whitespace
collapsed to one space — whatever its ids, which are each project's own. Nothing enters it without
you.

| Threshold | Default | Variable |
|---|---|---|
| **Common tier**: a lesson promoted in the notebook of that many projects of the installation is proposed to it | **2** projects (at least 2) | `BRIGADE_COMMON_TIER_PROJECTS` |

It is a **station** setting, not a project's: in its unit's environment, read at start (a badly
written integer, or less than 2, makes the start refuse, naming the variable). `seuils-cli.ts`
shows it with the thresholds.

**See and decide** — with the station's environment:

```
node runtime/src/commun/commun-cli.ts                   # the proposed lessons, with their projects, and those of the tier
node runtime/src/commun/commun-cli.ts yes <proposal>    # "yes": it enters the tier
node runtime/src/commun/commun-cli.ts no <proposal>     # "no": it stays each project's own
node runtime/src/commun/commun-cli.ts retire <id>       # retire a lesson of the tier (C1…)
```

Each proposal is given by its key (eight characters, drawn from its text), its text, then
`promoted in alpha (L4), beta (L7)`: the projects it comes from, with its id in each. A project
whose notebook cannot be read is named, and counts for no proposal.

- **Yes**: it receives a tier id (`C1`, `C2`…), and the cook of each ticket, of **every project**
  of the installation, receives it in its brief (see "What a cook receives").
- **No**: it stays in the notebook of the projects that hold it, served to them alone; it is
  **never proposed again**, even when another project promotes it in its turn.

A proposal is decided once: a second gesture writes nothing and repeats the first. What you decided
lives in `<BRIGADE_STATION_DIR>/etage-commun.json`, not in a repository or in a project's log.

**A lesson of the tier ages out, and you can retire it.**

- **Expiry** follows the promoted-lesson rule above (`BRIGADE_PROMOTED_EXPIRY_TICKETS`, read in
  each project's unit): time is counted in tickets served **across the installation**. A cook that
  received `C1` reconfirms it like any lesson, with `reconfirm C1` in its retro; a lesson no retro
  reconfirms for that many served tickets (counted from its acceptance) **expires**: no cook
  receives it any more, and it stays in the tier file marked `expired`, with its date.
- **Retiring**: `retire C1`. From then on **no cook of any project** receives it. It stays in the
  file marked `retired`, keeps its id, and a retired or expired lesson is **never proposed again**,
  even when more projects promote the same text. Retiring is permanent for the tier; retiring a
  project lesson (above) is unchanged. A second `retire` writes nothing.
**A single-project installation has no common tier**: nothing is proposed there, and its cooks'
brief stays the one from before. The module is `runtime/src/commun/`.

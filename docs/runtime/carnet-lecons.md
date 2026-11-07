## The lessons notebook

After each **served ticket**, the cook that delivered it leaves its **retro**: at most three
lessons, each proposed (`propose <lesson>`) or reconfirmed by id (`reconfirm L4`). The project's
**log** keeps them all — the **provisional lessons**, which nothing validates. Those that have
proved themselves enter the project's repository, in the **notebook**; those no longer true leave
it. The runtime decides alone, from the retro history, and delivers it as a PR that goes through
**the pass** like a **delivery**: **it does not await you.**

| Tier | Where | What it holds |
|---|---|---|
| provisional | the runtime's log (`retro.recorded`) | every retro lesson, with a stable id (`L1`, `L2`…): the log is append-only |
| notebook | `.claude/brigade/carnet.md`, on the integration branch | the **promoted** lessons, and the trace of those that **left** (expired or retired) |

A lesson not in the notebook is provisional. `facts` (`apprentissage`, see
[`etat-et-mesures.md`](etat-et-mesures.md)) shows both kinds; the field and its entries keep French
keys and values (`lecons`, `statut`, `provisoire`, `promue`…) until the runtime is renamed.

### A lesson born from a send-back

A send-back is stronger proof than a cook's self-report. Its reason enters the project as a
**candidate lesson**, provisional, by the retro path — same ids, same thresholds — with its origin:

| The send-back | What becomes a lesson | Origin |
|---|---|---|
| The pass sends a red ticket back, or the manager relaunches a red from the pass | each finding, at most three | `pass-send-back #N` |

In the log: `lesson.candidate` (`origin`, `text`), one fact per lesson, written with the send-back.
**A send-back without a reason gives birth to none.** A lesson fits on one line, without the tail of
the gates output or a code block; the pass's, over 400 characters, is cut at the last word that fits
(`…`); yours is refused rather than cut. A candidate saying word for word what a project lesson
says **reconfirms** it instead; a retro may reconfirm a candidate by id. Its reference in `rétros:`
is `pass-send-back-<seq>` or `chef-correction-<seq>`. It counts at the rank of the next served
ticket, and not at all until one has been served. Module: `runtime/src/apprentissage/renvoi.ts`.

### What a cook receives

A cook launched on a ticket (first, resumption, send-back, local or remote station) receives in its
brief the **provisional lessons of its project**, and of no other: each with its id, most recent
first (by the retro that proposed it). A lesson the integration branch's notebook holds, promoted
or left, is not received; an unreadable notebook removes none. Module:
`runtime/src/apprentissage/injection.ts`.

**At most 20**, a project setting: `BRIGADE_INJECTED_LESSONS` in the unit's drop-in; `0` turns them
off. A badly written integer makes the start refuse, naming the variable; `seuils-cli.ts` shows it.

`cook.launched` logs `lessons`: the ids, in brief order (`[]` if none).

On a station configured with at least two projects, the cook also receives, after them and in a
block of its own, the accepted lessons of the **common tier** (`C1`, `C2`…) — outside the cap, ids
logged after the project's. A cook under a **cook profile** also receives that profile's promoted
lessons: see [`etat-et-mesures.md`](etat-et-mesures.md), "A profile at dispatch".

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

The title and keys (`état`, `texte`, `entrée`, `rétros`, `origine`, `sortie`, `raison`) stay French:
`runtime/src/carnet/carnet.ts` reads and writes them; the lesson text is the cook's. The values
`promoted`, `expired`, `retired`, `expiry`, `manual` are English.

`état` is `promoted`, `expired` (`raison: expiry`) or `retired` (`raison: manual`). `entrée` is the
promotion day, `rétros` the retros that proposed or reconfirmed it. `origine` is `pass-send-back #N`
or `chef-correction #N`; **without it, the lesson was born from a retro** (older notebooks read and
rewrite identically). A lesson keeps its origin through promotion and exit; `facts` shows it.
**A lesson that has left is never erased**: it keeps its id, date and reason. A file the module does
not understand is not rewritten.

### The four thresholds

Time is counted in **served tickets**, not days: each writes a retro, empty or not.

| Threshold | Default | Variable |
|---|---|---|
| **Promotion**: a provisional lesson enters the notebook when that many retros, from **different tickets**, cite it (proposing counts) | **3** retros | `BRIGADE_PROMOTION_RETROS` |
| **Send-back gap**: a lesson of non-`retro` origin is promoted with that many retros fewer, never fewer than one. At **0** it follows the promotion rule. Zero allowed here | **1** retro fewer | `BRIGADE_SENDBACK_PROMOTION_GAP` |
| **Demotion**: a promoted lesson no retro reconfirms for that many served tickets becomes provisional again; earlier citations stop counting | **20** served tickets | `BRIGADE_PROMOTED_EXPIRY_TICKETS` |
| **Disappearance**: a provisional lesson no retro reconfirms for that many served tickets (since its last citation or demotion) disappears; if it had been promoted, its exit enters the notebook, `état: expired` | **20** served tickets | `BRIGADE_PROVISIONAL_EXPIRY_TICKETS` |

**Per project**: they are variables in the instance's drop-in
(`/etc/systemd/system/brigade@<project>.service.d/projet.conf`, see [`installer.md`](../installer.md)):

```
[Service]
Environment=BRIGADE_PROMOTION_RETROS=4
```

then `sudo systemctl daemon-reload && sudo systemctl restart brigade@<project>`. Read at start: a
badly written integer, or zero (except for the gap), makes the start refuse, naming the variable. To
read the values in force: `node runtime/src/seuils/seuils-cli.ts`.

### Promotion and expiry, delivered by a PR

Modules: `runtime/src/promotion/`; the decision, `runtime/src/peremption/`.

1. **When.** At each additional served ticket and each concluded (merged or closed) notebook PR, the
   runtime judges the retro history again. Nothing else changes a decision.
2. **On what.** On the integration branch's notebook as the station's clone carries it; on a
   change it prepares a branch like a cook's and judges again on that base. **Without a decision,
   nothing leaves.**
3. **One notebook PR at a time**, until the last is merged or closed.
4. **The PR.** A branch carrying **only** `.claude/brigade/carnet.md`, titled `Carnet des leçons —
   promue L4 ; expirée L2` (built by the runtime, in French: `promue`, `rétrogradée`, `expirée`,
   `retirée`). The body states each decision and **the retros that justify it**, with their ticket.
   Log: `carnet.started`, then `carnet.delivered` or `carnet.undelivered` (why).
5. **The pass.** It enters pass **off the rail** as it opens (`pass.entered`): merge with the base,
   gates, reviewer (reading it as a notebook change), CI, `merge` grant. **No gesture from you.**
   Being under `.claude/brigade/`, it also calls the **second judge** (see
   [`pass-merge.md`](pass-merge.md)): not weakening, merged under the grant, stopped without it. Red,
   no cook picks it up: it comes up to you.

An unreadable base notebook is never rewritten: `carnet.undelivered` names the faulty line, judgement
restarts at the next served ticket — fix the file by a PR. A delivery that died with the runtime
resumes, at the next wake-up, the PR GitHub carries for its branch; without one, it is undelivered
and the next judgement redoes it.

### Removing a promoted lesson

Remove it **by a PR**, like any delivery.

**By a revert** — the lesson entered alone, or you remove everything its PR promoted:

1. On GitHub, open the `Carnet des leçons — promue …` PR and click **Revert**; merge it.
2. At the next served ticket, the runtime notes the promoted lesson is gone from the base and opens
   a `Carnet des leçons — retirée L4` PR recording `état: retired`, `raison: manual`, dated that day.
   It goes through the pass.

**By an edit** — one lesson among others, or right away: on a branch, in
`.claude/brigade/carnet.md`, change `- état: promoted` to `- état: retired` and add under its retros
`- sortie: <YYYY-MM-DD>` then `- raison: manual`. Do not remove the block. Open the PR and merge it.

Either way the lesson **keeps its id**, and only retros written **after** its exit day count (a
retro of the same day is earlier). **Three new retros** from different tickets must cite it for a
new promotion PR. An expired lesson comes back the same way.

### The common tier: a lesson promoted in several projects

A station serves several projects (`<BRIGADE_STATION_DIR>/projets`, the **installation**). A lesson
promoted in the notebooks of **at least two** of them is **proposed to the common tier**, which
serves the cooks of all projects. Same lesson means **word for word** the same text (whitespace
collapsed), whatever each project's ids. Nothing enters without you.

| Threshold | Default | Variable |
|---|---|---|
| **Common tier**: projects of the installation promoting a lesson before it is proposed | **2** (minimum 2) | `BRIGADE_COMMON_TIER_PROJECTS` |

A **station** setting, in its unit's environment, read at start (a badly written integer, or under
2, refuses the start). `seuils-cli.ts` shows it.

```
node runtime/src/commun/commun-cli.ts                   # proposed lessons, with projects, and the tier's
node runtime/src/commun/commun-cli.ts yes <proposal>    # it enters the tier
node runtime/src/commun/commun-cli.ts no <proposal>     # it stays each project's own
node runtime/src/commun/commun-cli.ts retire <id>       # retire a tier lesson (C1…)
```

A proposal shows its key (eight characters drawn from its text), its text, then `promoted in alpha
(L4), beta (L7)`. A project whose notebook cannot be read is named and counts for no proposal.

- **Yes**: it gets a tier id (`C1`…) and every project's cooks receive it.
- **No**: it stays with the projects that hold it; **never proposed again**.

A second gesture on a proposal writes nothing. Decisions live in
`<BRIGADE_STATION_DIR>/etage-commun.json`, not in a repository or log.

**A tier lesson ages out, and you can retire it.**

- **Expiry** follows `BRIGADE_PROMOTED_EXPIRY_TICKETS` (read in each project's unit), counting
  tickets served **across the installation** from acceptance. A cook reconfirms it with `reconfirm
  C1`; unreconfirmed that long, it **expires**: no cook receives it, and it stays in the file marked
  `expired`, dated.
- **Retiring** (`retire C1`): **no cook of any project** receives it any more. It stays marked
  `retired` with its id. A retired or expired lesson is **never proposed again**, even if more
  projects promote the text. Permanent for the tier; project retirement is unchanged. A second
  `retire` writes nothing.

**A single-project installation has no common tier**: nothing is proposed, the brief is unchanged.
Module: `runtime/src/commun/`.

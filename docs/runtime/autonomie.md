# Autonomy

The autonomy figures: how much of what the kitchen serves needs no human. Code:
`runtime/src/autonomie/chiffres/chiffres.ts` (`chiffresDAutonomie`). Words from
[`glossary.md`](../glossary.md).

The figures are computed from GitHub, for the last 7 and 30 days, and the weekly kitchen summary carries the
ones of its week (`runtime/src/resume-hebdomadaire/`, see `etat-et-mesures.md`). The app reads them through
`app/src/vue/autonomie/autonomie-github.ts`.

Next to them, the same function counts what the pass let through on the same tickets (#3515): the **escaped bugs** and the
**reverts**, each with the tickets and commit shas that make it (`bugsEchappes`, `reverts`). Their data (`defauts` of a
repository) is read by the app only; the weekly summary does not read it, so its counts are null there (`defautsNonLus`).
The rules are in "What the pass let through" under "Autonomy figures" in [`../app.md`](../app.md).

The autonomy table (rows, positions, profiles) and the routing of decisions that read it were deleted
(#3984, epic #3908): nothing called them.

## Each agent's record and autonomy level

Spec `docs/superpowers/specs/2026-11-23-autonomy-trust-control.md`, C1, C2 and C4 (#4036, #4037, #4038). Code:
`runtime/src/autonomie/agents/` — `agents.ts` (`equipeDuProjet`), `niveaux.ts` (`magasinDeNiveaux`), `gestes.ts`
(the gesture log) and `prochain-passage.ts` (the next run).

`facts` gives one record per agent in `equipe`: the manager, the supervisor, the closer, the pass, then each cook running
(its fields are in "Les faits, pour un programme" of [`etat-et-mesures.md`](etat-et-mesures.md)).

Each record's next run (#4038) is built from the agent's real schedule and a clock, both handed in (`prochainPassage`):
- the supervisor wakes when nothing was merged 30 min after the oldest cookable ticket began to wait, or after a later
  merge (`echeanceSansMerge`, `superviseur/declencheur.ts`): « supervisor: wakes if nothing is merged by 18:40 »; with
  no cookable ticket, « supervisor: no wake scheduled »;
- the closer opens a pass at most a day after the last one, at once with none known, never while one is open, and only
  once `MERGES_PER_PASS` merges are in (`prochainePasse`, `closer-github-passe/closer-github-passe.ts`): « closer: next
  pass in 3 h », then « closer: next pass once 20 merges are in » when its day is over; while it is not set or a pass
  is open, « closer: no pass scheduled »;
- the manager, the pass and the cooks keep no schedule, and say what they do instead: « manager: runs when a ticket or
  the supervisor calls it », « pass: reviews each delivery as it comes », « cook #12: works until it delivers ».

The supervisor notes its wake at each wake of the runtime it is branched on, once it is not stopped and has a manager to
consult; the closer notes its next pass at each of its passes. Each goes to `autonomy-next-run-<agent>.json` of the
state directory, where `facts` reads it back. A schedule never noted reads « <agent>: next run not known yet »; a file
that cannot be read is said in the text, never read as no schedule. A note that cannot be written is said, and stops
neither the supervisor nor the closer.

Each agent has a gesture log (#4037): each entry is `{at, line, reason, outcome}` — its time, one line (a line break
becomes a space), its reason and its outcome. The outcomes are listed once, in `OUTCOME` of `gestes.ts`: `fixed by
itself` and `handed to the chef`. The record's `counters` count them (`fixedBySelf`, `handedToChef`), its `gestures` are
the log, oldest first, and its `lastGesture` is the log's most recent entry, unless its roles' last action is later. The
log is kept in `autonomy-gestures.json` of the state directory, one list per agent. A missing file is a log with no
gesture. A file that cannot be read is said in `equipe` of `facts`, and refused when a gesture is logged: nothing is
guessed in its place and the file is never overwritten. The supervisor logs each gesture it does
(`superviseur/superviseur.ts`): a TODO card as `handed to the chef`, any other as `fixed by itself`, with what woke it as
its reason; a refused or failed gesture is not logged. Its last ten gestures and its counters are in the dossier its
manager gets. The other agents log none yet.

Each agent has an autonomy level per project: `observe` (it says what it would do), `propose` (it waits for the chef's
OK), `act` (it does it, then says so). The manager's splitting of an epic has its own level. A level never set
is its default, the chef's choice of 2026-11-23:

| Agent | Default |
|---|---|
| `supervisor` | `act` |
| `pass` | `act` |
| `closer` | `propose` |
| `manager` | `act` |
| `manager split-epic` | `propose` |
| `cook` | `act` — not in the chef's answer: a cook already does its ticket and says so |

The levels set are kept in `autonomy-levels.json` of the state directory, per project. A missing file gives the
defaults. A file that cannot be read is said in `equipe` of `facts`, and refused by the store when it sets a level:
nothing is guessed in its place and the file is never overwritten.

No command sets a level yet, and nothing reads the levels to decide: the agents act as before.

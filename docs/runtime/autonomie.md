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
(the gesture log), `prochain-passage.ts` (the next run's text) and `horaires.ts` (the schedules noted).

`facts` gives one record per agent in `equipe`: the manager, the supervisor, the closer, the pass, then each cook running
(its fields are in "Les faits, pour un programme" of [`etat-et-mesures.md`](etat-et-mesures.md)).

Each record's next run (#4038) is built from the agent's real schedule and a clock, both handed in (`prochainPassage`):
- the supervisor wakes when nothing was merged 30 min after the oldest cookable ticket began to wait, or after a later
  merge (`echeanceSansMerge`, `superviseur/declencheur.ts`): « supervisor: wakes if nothing is merged by 18:40 »; with
  no cookable ticket, « supervisor: no wake scheduled »;
- the closer opens a pass at most a day after the last one, at once with none known, never while one is open, and only
  once `MERGES_PER_PASS` merges are in (`prochainePasse`, `closer-github-passe/closer-github-passe.ts`): « closer: next
  pass in 3 h », then « closer: next pass once its merges are in » when its day is over; while it is not set or a pass
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
manager gets. The other agents log theirs through the gate (below).

Each agent has an autonomy level per project: `observe` (it says what it would do), `propose` (it waits for the chef's
OK), `act` (it does it, then says so). The manager's splitting of an epic has its own level. A level never set
is its default, the chef's choice of 2026-11-23 — and of 2026-11-25 for splitting an epic (#4247): it is neither a
product decision nor one that needs a human, so the manager splits on its own. The chef puts the split back on hold
by setting `manager split-epic` to `propose`, as any level is set:

| Agent | Default |
|---|---|
| `supervisor` | `act` |
| `pass` | `act` |
| `closer` | `propose` |
| `manager` | `act` |
| `manager split-epic` | `act` — `propose` until 2026-11-25 |
| `cook` | `act` — not in the chef's answer: a cook already does its ticket and says so |

The levels set are kept in `autonomy-levels.json` of the state directory, per project. A missing file gives the
defaults. A file that cannot be read is said in `equipe` of `facts`, and refused by the store when it sets a level:
nothing is guessed in its place and the file is never overwritten.

A level moves in two ways: the chef sets it from the app (the Agents tab, `PUT /api/agents/:id/settings`), or the
autonomy policy moves it from the agent's gesture record (#4380, `politique.ts`):
- **Promotion** — an agent at `propose` moves to `act` when its last N gestures done at `propose` all went through the
  chef's OK (at `propose`, the gate holds every gesture until the chef approves it) and none of their deliveries is in
  an escaped bug or a revert. N is 5 (`NOMBRE_DE_GESTES_PROPRES`, `niveaux.ts`).
- **Demotion** — a gesture the agent did by itself under `act` whose delivery is later reverted, or cited by an escaped
  bug, sends it one step back, `act` to `propose`, with the revert or the bug as the reason. Each revert or escaped bug
  is handled once, by its key (`revert <sha>`, `bug <owner/repo>#<n>`): run again on the same facts, nothing moves
  again. A demotion wakes the chef once (`chef.notified`), not once per gesture.
- **Pin** — a level the chef sets is stored `pinned`; the policy never moves a pinned level, up or down. A level stored
  bare, as every level was before the policy, was the chef's, and reads as pinned.

Every move is an entry of the agent's gesture log, `autonomy moved from <level> to <level>`, its reason naming the
facts. A gesture's delivery is what its line and reason cite: a commit or a ticket (`#12`). The level a gesture was done
under is the one the agent had after the last move logged before it. The policy moves the manager, the supervisor, the
closer and the pass, each of which has its own log; the cooks share one level over a log per ticket, and the manager's
splitting of an epic logs in the manager's log, so neither is moved by it. In `equipe`, each record gives `pinned` and
`progress`: `{ toward: "act", done, of: 5 }` at `propose` — its clean gestures at `propose` since its last move, the
newest first, up to the first one a revert or a bug touches —, `null` at any other level.

Each project's kitchen in the station (`ouvrirCuisine`, `station/cuisine.ts`) runs the policy at its tick, once an hour
at most after a run that read its figures (`politiqueDuRuntime`, `politique-du-runtime.ts`). It reads the reverts of the last
30 days on the base as the project's clone fetches it — the commits carrying git's trailer `This reverts commit <sha>`,
with the tickets their reverted commits cite — and the escaped bugs from GitHub — the issues labelled `bug` created in
those 30 days, with the tickets they cite (`qualite.ts`). A read that fails moves nothing, is said on the service
log, and is tried again at the next tick. A gesture log or a levels file that cannot be read is refused: the policy moves nothing, overwrites nothing, and
the runtime keeps serving.

## The gate of the agents' gestures

Spec C4 (#4039). Code: `runtime/src/autonomie/agents/porte.ts` (`porteDesGestes`). Every gesture of an agent goes
through one gate, which reads the agent's level and takes the gesture as a function:

- `act`: the gesture is done, then logged in the agent's gesture log;
- `propose`: the gesture is held as a pending gesture, not done. The chef's approval does it once and logs it; a second
  approval does nothing;
- `observe`: the gesture is logged with the outcome `not done`, and never done. The same gesture seen again in a row is
  not logged twice.

A gesture said for the chef (`auChef`) is held as on `propose` whatever its level but `observe`: the pass's merge of an
action whose kind the project sheet ranks `chef` ([risk-levels.md](risk-levels.md), #4230).

The gestures that go through it:

| Agent | Gesture | Level read | Logged line |
|---|---|---|---|
| closer | opening a closing pass on GitHub (`closer-github-passe.ts`) | `closer` | `opened the closing pass #N on \`main\`` |
| supervisor | its run: the gesture the manager chose, and its comment (`superviseur/superviseur.ts`) | `supervisor` | the run's own line, as before |
| manager | creating the tickets of an epic it split (`decoupage.ts`) | `manager split-epic` | `split the epic #N into K tickets` |
| pass | merging a green delivery (`brigade-github.ts`) | `pass` | `merged PR #P of #N` |
| cook | taking a ticket and cooking it (`brigade-github.ts`) | `cook` | `took #N and cooks it`, in the log of `cook #N` |

The manager's other gestures do not go through it yet. Splitting an epic is no longer held by default (#4247): on
`act`, its tickets are created at the same pass.

A held gesture is kept in `autonomy-pending.json` of the state directory (`id`, `agent`, `line`, `reason`, `at`,
`approved`), and its function in the runtime's memory. `npm --prefix runtime run manager` lists them under `held
gestures`; `npm --prefix runtime run manager -- approve <id>` marks one approved, and the running runtime does it at its
next tick, once. A gesture done on `act` — its level was `propose` when it was held, and is `act` now — is no longer
pending: it leaves the file, and an approval finds nothing (#4247); a pending file that cannot be read is said, and
left as it is. Proposed again — the same agent, the same line —, a gesture keeps its id, and its approval if the chef
gave it meanwhile: this is how a gesture held before a restart is done after it. Until the closer, the manager, the pass
or a cook proposes it again, an approved gesture waits.

A levels file, a pending file or a gesture log that cannot be read is refused: the gesture is not done, nothing is
guessed in its place, and no file is overwritten. A cook's gate that cannot be read is said, and the turn goes on with
the next ticket.

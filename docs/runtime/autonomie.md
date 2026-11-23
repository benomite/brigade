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

Spec `docs/superpowers/specs/2026-11-23-autonomy-trust-control.md`, C1, C2 and C4 (#4036, #4037). Code:
`runtime/src/autonomie/agents/` — `agents.ts` (`equipeDuProjet`), `niveaux.ts` (`magasinDeNiveaux`) and `gestes.ts`
(the gesture log).

`facts` gives one record per agent in `equipe`: the manager, the supervisor, the closer, the pass, then each cook running
(its fields are in "Les faits, pour un programme" of [`etat-et-mesures.md`](etat-et-mesures.md)). The next run starts
empty; a later ticket fills it in.

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

No command sets a level yet.

## The gate of the agents' gestures

Spec C4 (#4039). Code: `runtime/src/autonomie/agents/porte.ts` (`porteDesGestes`). Every gesture of an agent goes
through one gate, which reads the agent's level and takes the gesture as a function:

- `act`: the gesture is done, then logged in the agent's gesture log;
- `propose`: the gesture is held as a pending gesture, not done. The chef's approval does it once and logs it; a second
  approval does nothing;
- `observe`: the gesture is logged with the outcome `not done`, and never done. The same gesture seen again in a row is
  not logged twice.

The gestures that go through it:

| Agent | Gesture | Level read | Logged line |
|---|---|---|---|
| closer | opening a closing pass on GitHub (`closer-github-passe.ts`) | `closer` | `opened the closing pass #N on \`main\`` |
| supervisor | its run: the gesture the manager chose, and its comment (`superviseur/superviseur.ts`) | `supervisor` | the run's own line, as before |
| manager | creating the tickets of an epic it split (`decoupage.ts`) | `manager split-epic` | `split the epic #N into K tickets` |
| pass | merging a green delivery (`brigade-github.ts`) | `pass` | `merged PR #P of #N` |
| cook | taking a ticket and cooking it (`brigade-github.ts`) | `cook` | `took #N and cooks it`, in the log of `cook #N` |

The manager's other gestures do not go through it yet: only splitting an epic is held by default.

A held gesture is kept in `autonomy-pending.json` of the state directory (`id`, `agent`, `line`, `reason`, `at`,
`approved`), and its function in the runtime's memory. `npm --prefix runtime run manager` lists them under `held
gestures`; `npm --prefix runtime run manager -- approve <id>` marks one approved, and the running runtime does it at its
next tick, once. Proposed again — the same agent, the same line —, a gesture keeps its id, and its approval if the chef
gave it meanwhile: this is how a gesture held before a restart is done after it. Until the closer, the manager, the pass
or a cook proposes it again, an approved gesture waits.

A levels file, a pending file or a gesture log that cannot be read is refused: the gesture is not done, nothing is
guessed in its place, and no file is overwritten. A cook's gate that cannot be read is said, and the turn goes on with
the next ticket.

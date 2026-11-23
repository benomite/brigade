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

Spec `docs/superpowers/specs/2026-11-23-autonomy-trust-control.md`, C1, C2 and C4 (#4036). Code:
`runtime/src/autonomie/agents/` — `agents.ts` (`equipeDuProjet`), `niveaux.ts` (`magasinDeNiveaux`) and `commande.ts` (the `autonomy` command).

`facts` gives one record per agent in `equipe`: the manager, the supervisor, the closer, the pass, then each cook running
(its fields are in "Les faits, pour un programme" of [`etat-et-mesures.md`](etat-et-mesures.md)). The next run, the
counters and the gestures of an agent's thread start empty; later tickets fill them in.

Each agent has an autonomy level per project: `observe` (it says what it would do), `propose` (it waits for the chef's
OK), `act` (it does it, then says so). The manager's splitting of an epic has its own level. A level the chef never set
is its default, the chef's choice of 2026-11-23:

| Agent | Default |
|---|---|
| `supervisor` | `act` |
| `pass` | `act` |
| `closer` | `propose` |
| `manager` | `act` |
| `manager split-epic` | `propose` |
| `cook` | `act` — not in the chef's answer: a cook already does its ticket and says so |

The levels the chef set are kept in `autonomy-levels.json` of the state directory, per project. A missing file gives
the defaults. A file that cannot be read is refused by `autonomy`, and said in `equipe` of `facts`: nothing is guessed
in its place and the file is never overwritten.

`npm --prefix runtime run autonomy` shows each level; `-- <agent> <level>` sets one (`manager`, `supervisor`, `closer`,
`pass`, `cook`); `-- manager split-epic <level>` sets the manager's splitting of an epic. Nothing reads the levels to
decide yet: the agents act as before.

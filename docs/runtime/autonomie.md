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

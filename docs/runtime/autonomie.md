# Autonomy

The autonomy figures: how much of what the kitchen serves needs no human. Code:
`runtime/src/autonomie/chiffres/chiffres.ts` (`chiffresDAutonomie`). Words from
[`glossary.md`](../glossary.md).

The figures are computed from GitHub, for the last 7 and 30 days, and the weekly kitchen summary carries the
ones of its week (`runtime/src/resume-hebdomadaire/`, see `etat-et-mesures.md`). The app reads them through
`app/src/vue/autonomie/autonomie-github.ts`.

The autonomy table (rows, positions, profiles) and the routing of decisions that read it were deleted
(#3984, epic #3908): nothing called them.

# The project sheet

Each project declares its kitchen in `.brigade/fiche-projet.json`, in its own repository (#4237,
epic #4136). The sheet has the eight items of the table in
[`2026-11-24-simplified-process.md`](../superpowers/specs/2026-11-24-simplified-process.md), one key
each:

| Key | Item of the spec | Form |
|---|---|---|
| `work` | The cook's work | a text |
| `stages` | Stages (one by default) | a list of at least one `{name, gates}`; `gates` lists the scripts the pass runs for that stage, as paths inside the repository. A stage may add `kind`: it is then a stage of the tickets of that kind only (see "Stages of a ticket"). At least one stage has no `kind` |
| `tools` | Tools | a list of texts |
| `rules` | House rules (locked pass checks) | a list of texts |
| `risks` | Risks (chef's opinion required) | a list of texts |
| `served` | Served | `{branch}`: the branch a delivery lands on |
| `recurring` | Recurring | a list of texts |
| `humans` | Humans in the kitchen | a list of texts |

The module is `runtime/src/fiche-projet/`: a loader, a validator and a writer (`fiche.ts`), and the
defaults of a code project (`defauts.ts`) — one stage, `code`, whose gates are
`.claude/brigade/gates.sh`, and served = the main branch. A sheet with a missing item, an unknown
key or an item of the wrong form is refused with an error that names the item; it is never read
in part, nor replaced by the defaults.

## Who writes it

`installation repo setup` (`depot-prepare/preparation.ts`) writes the default sheet into a
repository that has none, served on its integration branch. A repository that already has one
keeps it.

## What the kitchen reads from it

| Step | Reads | Where |
|---|---|---|
| The cook | `work`, the names of the stages without `kind`, `tools`, in its instructions; for a ticket with stages, the stage it does | the cook's worktree, freshly from the base (`brigade-github.ts`, `station-contributrice/station.ts`) |
| The pass | the gates of every stage, run one after the other — the first red one stops the others; `rules`, given to the review, which blocks a delivery that breaks one (category `regle-de-la-maison`) | the worktree it judges (`gates.ts`, `reviewer.ts`) |
| Served | `served.branch`, before `.claude/brigade/projet.json` and the station's line | the integration branch, then the clone's tree (`reglages-projet/en-vigueur.ts`) |
| The chef's opinion | `risks` and `humans`, on the "review before merge" card of a sensitive ticket | the integration branch (`sensible/sensible.ts`) |

A repository with no sheet yet reads the defaults, served on the branch the kitchen already
serves. A refused sheet starts no cook, makes the gates red with the item named, and is said in
the problems of the integration branch's resolution.

The box check (`installation verify`, `installation.ts`) looks for the gates the sheet on the
integration branch names, each present and executable; with no sheet, those of the defaults. A
sheet refused there is a missing item of the check, with the item named.

## Stages of a ticket

Rule 11 of the spec (#4278): a project may declare stages for the kinds of tickets that need them.
A stage with `kind` belongs to the tickets of that kind, in the order of the list; a ticket's kind
is the first of its labels that a `kind` of the sheet names. A ticket of any other kind has one
stage and lives as before. The module is `runtime/src/etapes-du-ticket.ts` (the rules) and
`runtime/src/etapes/sur-le-ticket.ts` (the sheet at the base, the mark on the issue).

```json
"stages": [
  { "name": "code", "gates": [".claude/brigade/gates.sh"] },
  { "name": "script", "kind": "video", "gates": [".claude/brigade/gates.sh"] },
  { "name": "storyboard", "kind": "video", "gates": [".claude/brigade/gates.sh"] }
]
```

- The stages are read from the sheet on the integration branch. With no sheet, one stage; a
  refused sheet, or a base `git` cannot read, starts no cook and holds every delivery in pass,
  each turn saying why, until it is fixed.
- A ticket with stages has one branch and one PR. Each stage is a delivery on that PR, judged by the
  pass like any other. When the pass accepts a stage that is not the last (reviewed, CI green,
  ready to merge), the PR is not merged: the issue gets the mark of the next stage, the PR gets a
  verdict that asks for it, and the ticket leaves `in-pass` for a cook. Only the last stage,
  accepted, is merged.
- A refusal at any stage is a send-back, counted with the others of the ticket: one count for all
  its stages, not one per stage. Moving to the next stage is not a send-back.
- The issue shows the stage mark as a comment, `Stage mark: stage 2 of 4: storyboard`, posted when
  the first stage's cook starts and again at each move. A ticket with one stage shows none.

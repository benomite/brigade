# The project sheet

Each project declares its kitchen in `.brigade/fiche-projet.json`, in its own repository (#4237,
epic #4136). The sheet has the eight items of the table in
[`2026-11-24-simplified-process.md`](../superpowers/specs/2026-11-24-simplified-process.md), one key
each:

| Key | Item of the spec | Form |
|---|---|---|
| `work` | The cook's work | a text |
| `stages` | Stages (one by default) | a list of at least one `{name, gates}`; `gates` lists the scripts the pass runs for that stage, as paths inside the repository |
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
| The cook | `work`, the stage names, `tools`, in its instructions | the cook's worktree, freshly from the base (`brigade-github.ts`, `station-contributrice/station.ts`) |
| The pass | the gates of every stage, run one after the other — the first red one stops the others; `rules`, given to the review, which blocks a delivery that breaks one (category `regle-de-la-maison`) | the worktree it judges (`gates.ts`, `reviewer.ts`) |
| Served | `served.branch`, before `.claude/brigade/projet.json` and the station's line | the integration branch, then the clone's tree (`reglages-projet/en-vigueur.ts`) |
| The chef's opinion | `risks` and `humans`, on the "review before merge" card of a sensitive ticket | the integration branch (`sensible/sensible.ts`) |

A repository with no sheet yet reads the defaults, served on the branch the kitchen already
serves. A refused sheet starts no cook, makes the gates red with the item named, and is said in
the problems of the integration branch's resolution.

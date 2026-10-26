# The Kitchen board's published format

The box publishes each project's **Kitchen board** in the project's own repository: one pinned
issue, labelled `kitchen-board` and `hors-cuisine` (how and when it is refreshed:
[`etat-et-mesures.md`](etat-et-mesures.md), "The Kitchen board, on GitHub"; the chef's gestures
posted under it: [`../tableau-gestes.md`](../tableau-gestes.md)). This page is the contract an app
relies on to read it: the body's two parts, then the machine block, field by field. Since #1693 the
block carries everything the project's **rail view** draws — its columns, its ticket cards, its TODO
and the kitchen's state — so an app connected to GitHub draws that view with no ssh to the box.

The code is `runtime/src/tableau/`: `rendu/donnees.ts` builds the board from the log,
`rendu/rendre.ts` writes the body, `rendu/bloc.ts` writes and reads the block — an app imports
`lireLeTableau` from it, and that module imports nothing.

## The body

1. **A readable part**, in markdown, for the chef reading the issue on GitHub: what awaits the chef,
   each line with its gesture, then the kitchen's state in the words of `status`. No program reads it.
2. **The machine block**, at the very end: an HTML comment, which GitHub does not display.

```
<!-- brigade:kitchen-board
{"version":1,"genereLe":"2026-10-12T10:04:30.000Z","tableau":{…}}
-->
```

- In the JSON, `<`, `>`, `&` and `@` are written as `<`, `>`, `&`, `@`: nothing
  closes the comment, nothing mentions anyone. `JSON.parse` gives them back.
- If a body holds several blocks, the **last** one counts.
- `version` changes when a field changes meaning or disappears; **an added field does not change it**.
  A reader ignores the fields it does not know, and refuses a version higher than its own
  (`lireLeTableau` then says, in one sentence: "update the app").
- `genereLe`: when the box wrote the body.

## `tableau`

| Field | What it holds |
|---|---|
| `projet` | The project's name, as the log knows it; `null` for an empty log |
| `lu` | When the state was read. Every duration in the lines counts up to it; count your own from the instants |
| `file` | What awaits the chef, oldest first — one entry per line of the `awaiting` block of `status` (below) |
| `bilans` | What the `awaiting` block says that is not a decision: the pause, the no-grant summary, the version passed |
| `cuisine` | The kitchen's state (below) |
| `gestes` | The chef's latest gestures read under the board, oldest first; absent from a block written without them |
| `faits` | **The rail view's facts** (#1693): the object of `facts`, see below |
| `lignesDuRail` | **Each rail ticket's line of `status`** (#1693), see below |
| `resserre` | What the body had to remove from the block to fit in an issue, see below; absent when nothing was |

`faits` and `lignesDuRail` are absent from a block written before #1693: the reader then draws
without them, as it does for a runtime that does not give a field.

### `file[]` — what awaits the chef

| Field | What it holds |
|---|---|
| `nom` | What names the line at its head in `status`: `#18`, `breaker`, `setup`, a station |
| `ticket` | Its ticket, `null` for what belongs to no ticket |
| `titre` | The ticket's title, `null` without one |
| `quoi` | The kind of wait (`runtime/src/attend.ts`: `remontee`, `bloque`, `carte`, `disjoncteur`, `connexion`…) |
| `depuis` | When it started waiting |
| `ligne` | What waits, then the chef's gesture, word for word as `status` writes it |
| `decision` | What the line expects from the chef, as fields: `quoi`, `motif`, `cause`, `pr`; `null` off a ticket |
| `carte` | For a TODO card: `type` (`product`, `design`), `question`, `choix` (`texte`, `suite`) numbered from 1 as `rail choose` does; `null` otherwise |

### `cuisine` — the kitchen's state

| Field | What it holds |
|---|---|
| `etat` | The project in one word: `éteinte`, `arrêtée`, `retenue`, `ouverte` |
| `runtime` | `demarreLe`, `arreteLe`, `dernierTick`, from the log; `null` without them |
| `arreteeLe` | The chef's "stop", `null` without it |
| `disjoncteur` | `ouvertLe`, `echecs`, `seuil` |
| `base` | The last check of the integration base: `resultat`, `sha`, `le`, `rougeDepuis`, `reparation` (the ticket repairing it); `null` without a check |
| `urgence` | Nothing cooks and everything awaits the chef: `depuis`, `retenus`, `decisions` (the `nom` of the lines holding them); `null` otherwise |
| `cooks[]` | **The cooks in progress**: `ticket` (`null` for a manager or a judge), `run` (the cook), `station`, `modele`, `effort`, `lanceLe`, `coince`, `tours`, `tokens` |
| `stations[]` | `station`, `distante`, `plafond`, `satureeDepuis`, `saturation`, `retenueDepuis`, `deconnecteeDepuis`, `quotaJusqua` |
| `plafonds` | A cook's caps: `tours`, `tokens`, `dureeMs`, `inactiviteMs`; `null` until a runtime set them |
| `consommation` | `enCours`, and `fenetres` by sliding window (`heures`): `runs`, `reviews`, `judgments`, `turns`, `tokens` |
| `rubriques[]` | The state as `status` writes it, section by section: `titre` and `lignes`. Without what only the box can read (servers, worktrees, transcripts, the latest events); `rail` gives only its count — the tickets are in `faits` and `lignesDuRail` |

### `faits` — what the rail view draws

The object `brigade <project> facts` writes, in its form and its words — the contract is
[`etat-et-mesures.md`](etat-et-mesures.md), "The facts, for a program" — **for the same project, at
the same instant, the same repository** (issue and screenshot addresses), the refusal of this
machine's station included. An app reads it with the reader it already has for `facts`. It holds:

| Field | What the rail view draws from it |
|---|---|
| `etat`, `lu`, `dernierTick`, `compteurs`, `dernierEvenement` | The project's state, its counters, the age of its last tick and event |
| `limiteGithub` | When GitHub limits the account's calls, the instant it gives them back; absent otherwise |
| `rail[]` | **Each ticket and its state**, in the rail's order: `ticket`, `etat` (the column), `titre`, `url`, `activite` (what its cook or the pass does right now), `attente` (set aside: why, which column, return), `tiers` (WAITING: what, from whom, follow-up), `revenu`, `raison` (head of the queue that does not leave), `captures` |
| `cooks[]` | **The cooks in progress**: `ticket`, `titre`, `station` — the cook's run is in `cuisine.cooks` |
| `attend[]` | **What awaits the chef**, one entry per ticket: `ticket`, `titre`, `url`, `decision`, `livraison` (what the pass recorded), `carte` (a TODO card, with its `captures`) |
| `livres[]` | The tickets served in the last 24 h: `livre`, `station`, `pr`, `relecture` |
| `urgence`, `retenues[]` | The decisions that hold the whole kitchen, or some tickets |
| `stations[]` | Each station: `distante`, `plafond`, `cuisson` (`cooking`, `stopped`, `saturated`, `refused`), `refus`, its `cooks` |
| `corrections[]`, `profils[]` | The proposed corrections and profiles, TODO cards that belong to no ticket; absent when there are none |

It does **not** hold what other screens read from `facts` — the calibration cap, the triage, the
kitchen's activity and roles, the gates' cost, the corrections' effects, the lessons
(`plafondDeCalibrage`, `triage`, `activiteCuisine`, `rolesCuisine`, `coutDesGates`, `reculs`,
`apprentissage`) — nor `appelsGithub`, which the `gh calls` section of `cuisine.rubriques` gives.

### `lignesDuRail[]` — each ticket's line of `status`

One entry per rail ticket, in the rail's order:

| Field | What it holds |
|---|---|
| `ticket` | The ticket |
| `priorite` | Its `prio:` label, `null` without one — `faits` does not carry it |
| `ligne` | Its line under the `rail` line of `status`, word for word, indentation included: `  #<ticket>  <state>  <priority>  <detail>  <title>` — who holds it, since when, its lease, what holds it back |

Placed under a `rail` line, these lines are the `rail` block of `status`: an app that already reads
that block for its cards (`app/src/bon.ts`) reads them unchanged.

### `resserre` — when the body is too long for GitHub

GitHub refuses an issue body over 65,536 characters. Too long, the body first shortens its readable
part (the queue's names, the first line of each section). Still too long, it removes from the block,
in this order, until it fits — each step that had something to remove is named in `resserre`:

1. `faits.livres.relecture` — the reviews of the served tickets;
2. `faits.attend.livraison` — what the pass recorded of the deliveries that wait;
3. `faits.corrections.diff` — the proposed corrections' diffs;
4. `faits`, `lignesDuRail` — the rail view's facts and lines, whole.

A removed field is **absent**, not `null`: `null` keeps its own meaning (no readable review, for
instance). What awaits the chef (`file`) and the kitchen's state (`cuisine`) are never removed. An
app that finds `faits` named in `resserre` says the rail could not be published, rather than an
empty rail.

## What changes the body

The box rewrites the body only when what it says changes. The reading time (`lu`, `faits.lu`), the
runtime's last tick (`cuisine.runtime.dernierTick`, `faits.dernierTick`, its line in `rubriques`)
and the durations the lines give ("for 4 min") are not a change. A lease that expires, a cook that
gets stuck, a ticket that moves, a new event are.

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

- In the JSON, `<`, `>`, `&` and `@` are written as `\u003c`, `\u003e`, `\u0026`, `\u0040`: nothing
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
| `bilans` | What the `awaiting` block says that is not a decision: the pause, the kitchen idle because the rest of the rail needs a human (`kitchen idle — …`, #1751: tickets set aside `no-station` and those held behind them, with the gesture — see `etat-et-mesures.md`), the no-grant summary, the version passed |
| `cuisine` | The kitchen's state (below) |
| `gestes` | The chef's latest gestures read under the board, oldest first; absent from a block written without them. An `ask` that was played carries `demande`: the request for the second, word for word; when the box holds the project's second, also `second`: its answer, or why there is none ([`../tableau-gestes.md`](../tableau-gestes.md), "The second's answer") |
| `faits` | **The rail view's facts** (#1693): the object of `facts`, see below |
| `lignesDuRail` | **Each rail ticket's line of `status`** (#1693), see below |
| `fileDeStatus` | **The project's queue, for the second** (#1843): the `awaiting` block of `status`, word for word, one line per entry, from its head line to `end awaiting`, both included — see below; absent from a block written before it |
| `distantes` | **What the box lent the remote stations, and its answers to the requests they made through GitHub** (#1793), see below; absent when no remote station holds a ticket or asked anything |
| `activites` | **What each cook of the project is doing** (#1844), see below; empty when no cook runs or finished lately, absent from a block written before it |
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
| `rubriques[]` | The state as `status` writes it, section by section: `titre` and `lignes`. Without what only the box can read (worktrees, transcripts, the latest events); `rail` gives only its count — the tickets are in `faits` and `lignesDuRail`. The `switch` section is always there (#1770): the project switch, `ON …` or `OFF …`; while no runtime has set it in the log, `ON — not set in the log yet`, because nothing holds the kitchen. The board does not carry what is upcoming (`manager upstream`): an app shows no count rather than a guess |

### `faits` — what the rail view draws

The object `brigade <project> facts` writes, in its form and its words — the contract is
[`etat-et-mesures.md`](etat-et-mesures.md), "The facts, for a program" — **for the same project, at
the same instant, the same repository** (issue and screenshot addresses), the refusal of this
machine's station included. An app reads it with the reader it already has for `facts`. It holds:

| Field | What the rail view draws from it |
|---|---|
| `etat`, `lu`, `dernierTick`, `compteurs`, `dernierEvenement` | The project's state, its counters, the age of its last tick and event |
| `limiteGithub` | When GitHub limits the account's calls, the instant it gives them back; absent otherwise |
| `rail[]` | **Each ticket and its state**, in the rail's order: `ticket`, `etat` (the column), `titre`, `url`, `depuis` (since when it is in that state), `activite` (what its cook or the pass does right now), `attente` (set aside: why, which column, return), `tiers` (WAITING: what, from whom, follow-up), `revenu`, `raison` (head of the queue that does not leave), `captures` |
| `cooks[]` | **The cooks in progress**: `ticket`, `titre`, `station` — the cook's run is in `cuisine.cooks` |
| `attend[]` | **What awaits the chef**, one entry per ticket: `ticket`, `titre`, `url`, `decision`, `livraison` (what the pass recorded), `carte` (a TODO card, with its `captures`) |
| `livres[]` | The tickets served in the last 24 h: `livre`, `station`, `pr`, `relecture` |
| `urgence`, `retenues[]` | The decisions that hold the whole kitchen, or some tickets |
| `stations[]` | Each station: `distante`, `plafond`, `cuisson` (`cooking`, `stopped`, `saturated`, `refused`), `refus`, its `cooks` |
| `corrections[]`, `profils[]` | The proposed corrections and profiles, TODO cards that belong to no ticket; absent when there are none |

It does **not** hold what other screens read from `facts` — the calibration cap, the triage, the
kitchen's activity, pace and roles, the gates' cost, the corrections' effects, the lessons
(`plafondDeCalibrage`, `triage`, `activiteCuisine`, `cadence`, `rolesCuisine`, `coutDesGates`, `reculs`,
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

### `fileDeStatus` — the queue the second reads at opening

The second reads the project's queue at the start of its session and after a compaction. It reads it
from the board, with no ssh to the box: `laFileDuSecond(body)` in `runtime/src/tableau/rendu/bloc.ts`
(which imports nothing) gives `{ lue: true, lu, texte }`. `texte` is the `awaiting` block of `status`
word for word, edges included, then a blank line, then the kitchen's state of `cuisine.rubriques` in
the form of `status` (the title on eleven columns, the following lines indented). `lu` is when the
state was read: the durations in the lines count up to it. A body that cannot be read gives
`{ lue: false, raison }`, one sentence. A block from a box older than this field is not read as an
empty queue: the sentence says to update the box. Neither is an empty `fileDeStatus`, written when the
box found no `awaiting` block in its `status`: the sentence says the queue is not known.
`fileDeStatus` is never removed from a body that is too long.

### `distantes` — the main station's arbitration, for a second station with no ssh

A second station of the project asks through GitHub only: it writes its request in its own paired
gist, one file per slot — `brigade-pull.<owner>.<repo>.claim.json` to claim a ticket (or announce
itself), `brigade-pull.<owner>.<repo>.renew.<run>.json` for each cook that renews its lease,
`brigade-pull.<owner>.<repo>.deliver.<run>.json` for each cook that hands back its work — holding
`{"brigade":"pull","format":1,"id","depot","le","verb",…}` with the fields of the matching `pull`
request (`sandbox`; `run`, `proof`, `turns`, `tokens`; `ending`, `reason`, `message`). Handing back
needs nothing more than the branch: the station pushes its mission's branch to the origin, then
posts `deliver`; the main station fetches it from there, opens its PR, and its pass judges it as any
cook's (#1794). At each reading (thirty seconds), the main
station relays each new, fresh request (less than five minutes old) to the project's log, once; its
runtime answers it as it answers `pull`, one request at a time — a ticket is lent once, even when two
stations claim it at the same moment. The answer is published here
(`runtime/src/tirer-par-github/`):

| Field | What it holds |
|---|---|
| `attributions[]` | Each ticket a remote station holds: `ticket`, `station`, `run`, `bailJusqua` — its lease's end, which a renewal moves forward. A station that goes silent lets it pass: the main station stops its cook, the ticket goes back to the rail and leaves this list, with nothing asked of the station |
| `reponses[]` | The runtime's answer to each request made through GitHub — the latest of each slot of each station, for fifteen minutes: `demande` (the request's `id`), `station`, `geste` (`announce`, `claim`, `renew`, `deliver`), `run` (a renewal's or a delivery's, `null` otherwise), `le` (when it was answered), `reponse` — the answer `pull` would have printed, except a claimed mission's `args`, published without the brief they open with (`suiteDesArgs`: `args` is `["-p", prompt, ...suiteDesArgs]`) |

`distantes` is never removed from a body that is too long: it is the arbitration itself, and it is
bounded — one claim per station, and one renewal and one delivery per cook.

### `activites` — what each cook is doing, for an app with no ssh

What an app shows of a cook instead of its terminal, read from GitHub alone:
`lesActivitesDesCooks(body)` in `runtime/src/tableau/rendu/bloc.ts` (which imports nothing) gives
`{ lues: true, lu, activites }`; a body that cannot be read gives `{ lues: false, raison }`, one
sentence — a block from a box older than this field is not read as "no cook": the sentence says to
update the box. The box builds it from the log (`runtime/src/tableau/activites/activites.ts`): each
cook's reading, written at every tick (`cook.progressed`, see [`garde-fous.md`](garde-fous.md),
"What a cook is doing right now"), so the record follows the cook at the board's pace and the body is
rewritten when it changes.

One entry per ticket — its latest cook, while it runs, then for **two hours** after its end (the ten
most recent finished ones at most), in launch order. A pass review and a manager judgement cook no
ticket: they are not there.

| Field | What it holds |
|---|---|
| `ticket`, `titre` | The ticket, and its title on the rail (`null` once it left it) |
| `run`, `station` | The cook, and the station that launched it |
| `lanceLe` | When it left |
| `finiLe`, `fin` | When it ended and how (`ok`, `failed`, `guard`, `stop`, `neutral`, `refused`, `interrupted`); both `null` while it runs |
| `maintenant` | What it is doing right now, a step (below); `null` once finished, or when its reading does not say — a remote station's cook: nothing is invented |
| `etapes` | Its latest steps, oldest first, eight at most — the last one is `maintenant` while it runs. A reading that repeats the same gesture on the same target since the same time is not a new step |
| `tours`, `tokens` | Its latest reading, or its end |
| `pr` | The PR of its delivery as soon as the log knows it: `numero` (`null` if its address does not say) and `url`. A cook sent back by the pass on the same branch has its ticket's PR from its start; a first cook has it from its delivery, or from the PR the pass opens. `null` without one |

A step is `fait` (the gesture in the chef's words, French), `faitEn` (the same in English), `cible`
(the file or command it aims at, never what is inside, `null` without one) and `depuis` (when it
started on it) — the shape of `faits.rail[].activite`.

The board publishes no page of a worktree, and the box serves none (#1844): an app follows a cook
here and through its PR.

### `resserre` — when the body is too long for GitHub

GitHub refuses an issue body over 65,536 characters. Too long, the body first shortens its readable
part (the queue's names, the first line of each section). Still too long, it removes from the block,
in this order, until it fits — each step that had something to remove is named in `resserre`:

1. `activites.etapes` — each cook's past steps: what it does right now stays;
2. `faits.livres.relecture` — the reviews of the served tickets;
3. `faits.attend.livraison` — what the pass recorded of the deliveries that wait;
4. `faits.corrections.diff` — the proposed corrections' diffs;
5. `faits`, `lignesDuRail` — the rail view's facts and lines, whole.

A removed field is **absent**, not `null`: `null` keeps its own meaning (no readable review, for
instance). What awaits the chef (`file`) and the kitchen's state (`cuisine`) are never removed. An
app that finds `faits` named in `resserre` says the rail could not be published, rather than an
empty rail.

## What changes the body

The box rewrites the body only when what it says changes. The reading time (`lu`, `faits.lu`), the
runtime's last tick (`cuisine.runtime.dernierTick`, `faits.dernierTick`, its line in `rubriques`),
the log's last event (`faits.dernierEvenement`) and the durations the lines give ("for 4 min") are
not a change: an event that changes nothing else does not rewrite the body, and `faits.dernierEvenement`
is the last event as of the latest rewrite. A lease that expires, a cook that gets stuck, a ticket
that moves are a change.

# The Kitchen board's published format

The box publishes each project's **Kitchen board** in the project's repository: one pinned issue,
labelled `kitchen-board` and `hors-cuisine` (refresh: [`etat-et-mesures.md`](etat-et-mesures.md),
"The Kitchen board, on GitHub"; the chef's gestures under it: [`../tableau-gestes.md`](../tableau-gestes.md)).
This page is the contract an app relies on to read it. The block carries everything the **rail view**
draws.

The code is `runtime/src/tableau/`: `rendu/donnees.ts` builds the board from the log,
`rendu/rendre.ts` writes the body, `rendu/bloc.ts` writes and reads the block (an app imports
`lireLeTableau` from it; it imports nothing).

## The body

1. **A readable part**, in markdown, for the chef reading the issue: what awaits the chef, each line
   with its gesture, then the kitchen's state in the words of `status`. No program reads it.
2. **The machine block**, at the very end: an HTML comment, which GitHub does not display.

```
<!-- brigade:kitchen-board
{"version":1,"genereLe":"2026-10-12T10:04:30.000Z","tableau":{…}}
-->
```

- In the JSON, `<`, `>`, `&` and `@` are written `<`, `>`, `&`, `@` (nothing
  closes the comment or mentions anyone); `JSON.parse` gives them back.
- With several blocks, the **last** counts. `genereLe`: when the box wrote the body.
- `version` changes when a field changes meaning or disappears; **an added field does not change
  it**. A reader ignores unknown fields and refuses a higher version (`lireLeTableau` says "update
  the app").

## `tableau`

| Field | What it holds |
|---|---|
| `projet` | The project's name, as the log knows it; `null` for an empty log |
| `lu` | When the state was read. No line counts a duration up to it: the body writes absolute times (`since 2026-10-12 10:00 UTC`, `lease until …`), and the app computes « 4 min ago » itself |
| `file` | What awaits the chef, oldest first — one entry per line of the `awaiting` block of `status` |
| `bilans` | What the `awaiting` block says that is not a decision: the pause, the no-grant summary, the version passed |
| `cuisine` | The kitchen's state |
| `gestes` | The chef's latest gestures read under the board, oldest first ([`../tableau-gestes.md`](../tableau-gestes.md), "What the apps read") |
| `faits` | The rail view's facts: the object of `facts` |
| `lignesDuRail` | Each rail ticket's line of `status` |
| `fileDeStatus` | The queue for the second: the `awaiting` block of `status`, word for word, head line to `end awaiting` included |
| `distantes` | What the box lent the remote stations, and its answers to their requests through GitHub; absent when none holds a ticket or asked |
| `activites` | What each cook is doing; empty when no cook runs or finished lately |
| `avantLeRail` | The open issues the rail does not carry yet, each in one of five states; absent until the box has read them |
| `resserre` | What the body had to remove from the block to fit in an issue; absent when nothing was |

`faits`, `lignesDuRail`, `fileDeStatus`, `activites` and `avantLeRail` are absent from an older box's
block.

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
| `cooks[]` | The cooks in progress: `ticket` (`null` for a manager or a judge), `run`, `station`, `modele`, `effort`, `lanceLe`, `coince`, `tours`, `tokens` |
| `stations[]` | `station`, `distante`, `plafond`, `satureeDepuis`, `saturation`, `retenueDepuis`, `deconnecteeDepuis`, `quotaJusqua`, `sansDemarrage` (a cook of the station could not start, it takes no ticket: `depuis`, `run`, `raison`; `null` otherwise, absent from a board written before it) |
| `plafonds` | A cook's caps: `tokens`, `dureeMs`, `inactiviteMs`; `null` until a runtime set them |
| `consommation` | `enCours`, and `fenetres` by sliding window (`heures`): `runs`, `reviews`, `judgments`, `turns`, `tokens` |
| `rubriques[]` | The state as `status` writes it, by section (`titre`, `lignes`), without what only the box can read (worktrees, transcripts, latest events); `rail` gives only its count. The `switch` section is always there: `ON …` or `OFF …`; `ON — not set in the log yet` while no runtime has set it |

### `faits` — what the rail view draws

The object `brigade <project> facts` writes, in its form and words (contract:
[`etat-et-mesures.md`](etat-et-mesures.md), "The facts, for a program"), for the same project and
instant. It holds:

| Field | What the rail view draws from it |
|---|---|
| `etat`, `lu`, `dernierTick`, `compteurs`, `dernierEvenement` | The project's state, counters, the age of its last tick and event |
| `limiteGithub` | When GitHub limits the account's calls, the instant it gives them back; absent otherwise |
| `rail[]` | Each ticket and its state, in the rail's order: `ticket`, `etat` (the column), `titre`, `url`, `depuis`, `activite` (what its cook or the pass does now), `attente` (set aside: why, which column, return), `tiers` (WAITING: what, from whom, follow-up), `revenu`, `raison` (head of the queue that does not leave), `captures` |
| `cooks[]` | The cooks in progress: `ticket`, `titre`, `station` (the run is in `cuisine.cooks`) |
| `attend[]` | What awaits the chef, per ticket: `ticket`, `titre`, `url`, `decision`, `livraison` (what the pass recorded), `carte` (a TODO card, with its `captures`) |
| `livres[]` | The tickets served in the last 24 h: `livre`, `station`, `pr`, `relecture` |
| `urgence`, `retenues[]` | The decisions that hold the whole kitchen, or some tickets |
| `stations[]` | Each station: `distante`, `plafond`, `cuisson` (`cooking`, `stopped`, `saturated`, `refused`), `refus`, its `cooks` |
| `corrections[]`, `profils[]` | The proposed corrections and profiles, TODO cards that belong to no ticket; absent when none |

It does **not** hold the other `facts` objects (`plafondDeCalibrage`, `triage`, `activiteCuisine`,
`cadence`, `rolesCuisine`, `coutDesGates`, `reculs`, `apprentissage`, `github`) nor `appelsGithub`, which the
`gh calls` section of `cuisine.rubriques` gives.

### `lignesDuRail[]` — each ticket's line of `status`

One entry per rail ticket, in the rail's order:

| Field | What it holds |
|---|---|
| `ticket` | The ticket |
| `priorite` | Its `prio:` label, `null` without one — `faits` does not carry it |
| `ligne` | Its line under the `rail` line of `status`, word for word, indentation included: `  #<ticket>  <state>  <priority>  <detail>  <title>` |

### `fileDeStatus` — the queue the second reads at opening

The second reads the queue at the start of its session and after a compaction, from the board alone:
`laFileDuSecond(body)` in `runtime/src/tableau/rendu/bloc.ts` gives `{ lue: true, lu, texte }`.
`texte` is the `awaiting` block of `status` word for word, then a blank line, then the state of
`cuisine.rubriques` in the form of `status`. An unreadable body gives `{ lue: false, raison }`, one
sentence; an older box, or an empty `fileDeStatus`, is not read as an empty queue. `fileDeStatus` is
never removed from a body that is too long.

### `distantes` — the main station's arbitration, for a second station with no ssh

A second station asks through GitHub only: it writes its request in its own paired gist, one file
per slot — `brigade-pull.<owner>.<repo>.claim.json` (claim a ticket, or announce itself),
`….renew.<run>.json` and `….deliver.<run>.json` per cook — holding
`{"brigade":"pull","format":1,"id","depot","le","verb",…}` with the fields of the matching `pull`
request. To hand back, the station pushes its mission's branch to the origin, then posts `deliver`;
the main station opens its PR, and its pass judges it as any cook's. At each reading (thirty
seconds), the main station relays each new request under five minutes old to the log, once, and
answers as it does `pull`, one request at a time. The answer is published here
(`runtime/src/tirer-par-github/`):

| Field | What it holds |
|---|---|
| `attributions[]` | Each ticket a remote station holds: `ticket`, `station`, `run`, `bailJusqua` — its lease's end, which a renewal moves forward. A station that goes silent lets it pass: the main station stops its cook and the ticket returns to the rail |
| `reponses[]` | The latest answer to each slot of each station, for fifteen minutes: `demande` (the request's `id`), `station`, `geste` (`announce`, `claim`, `renew`, `deliver`), `run` (`null` for a claim), `le`, `reponse` — what `pull` would have printed, except a claimed mission's `args`, published without the brief (`args` is `["-p", prompt, ...suiteDesArgs]`) |

`distantes` is never removed from a body that is too long: it is the arbitration itself, and bounded.

### `activites` — what each cook is doing, for an app connected to GitHub

What an app shows of a cook instead of its terminal: `lesActivitesDesCooks(body)` in
`runtime/src/tableau/rendu/bloc.ts` gives `{ lues: true, lu, activites }`, or `{ lues: false,
raison }` (an older box is not read as "no cook"). The box builds it from the log
(`runtime/src/tableau/activites/activites.ts`) out of each cook's reading at every tick
(`cook.progressed`, see [`garde-fous.md`](garde-fous.md), "What a cook is doing right now").

One entry per ticket — its latest cook, while it runs and for **two hours** after its end (ten
finished ones at most), in launch order. A pass review or manager judgement is absent.

| Field | What it holds |
|---|---|
| `ticket`, `titre` | The ticket, and its title on the rail (`null` once it left it) |
| `run`, `station` | The cook, and the station that launched it |
| `lanceLe` | When it left |
| `finiLe`, `fin` | When it ended and how (`ok`, `failed`, `guard`, `stop`, `neutral`, `refused`, `interrupted`); both `null` while it runs |
| `maintenant` | What it is doing right now, a step; `null` once finished, or when its reading does not say (a remote station's cook: nothing is invented) |
| `etapes` | Its latest steps, oldest first, eight at most (the last is `maintenant` while it runs); a repeated gesture on the same target is not a new step |
| `tours`, `tokens` | Its latest reading, or its end |
| `pr` | The PR of its delivery once the log knows it: `numero` (`null` if its address does not say) and `url`. A cook sent back on the same branch has its ticket's PR from its start. `null` without one |

A step is `fait` (the gesture in the chef's words, French), `faitEn` (English), `cible` (the file or
command it aims at, never what is inside; `null` without one) and `depuis` — the shape of
`faits.rail[].activite`. The board publishes no page of a worktree: an app follows a cook here and
through its PR.

### `avantLeRail` — what is left before the rail

What the project still has to do once the rail is empty: the rail view draws it as a Backlog column.
Before each refresh, the box rereads the repository's **open issues** under their ETag, with a GitHub
poll of its own. A failed reading is said once in the service log, and the board keeps the last list
read, with its time; never read, `avantLeRail` is absent.

`{ lu, issues }`: `lu` is when the box read the open issues. `issues`: every open issue the rail does
not carry and is not on its way to, PRs left out, in the manager's reading order (`prio:1` first,
none last, oldest first). Each: `ticket`, `titre`, `priorite` (`null` without one), `etat` and `dit`
— what holds it, in one line, the words of `manager upstream` ([`manager.md`](manager.md), "Upstream
of the rail"). Not listed: an issue served and still open, a split epic whose tickets carry the work,
an issue that carries `fire`. `etat` is one word of a closed list — the first that holds, in this
order of precedence:

| Precedence | `etat` | The issue… |
|---|---|---|
| 1 | `mise-de-cote` | carries `hors-cuisine`: the chef said this kitchen does not serve it |
| 2 | `epique` | is an epic not split yet: it carries `epic`, the manager judged it one, or its split is in progress or awaits an answer |
| 3 | `incomplete` | was refused by the manager as incomplete: the second must rewrite it |
| 3 | `mise-de-cote` | was refused by the manager as a question or a decision issue: left to the chef |
| 4 | `prete` | is ready, not fired: calibrated (`model:` and `effort:`), put on the rail by the manager, born of a split, or off the rail — and no `fire` |
| 5 | `mise-de-cote` | was set aside by the manager's code: `blocked-on-human`, `question`, the roadmap, an untrusted author… |
| 6 | `non-lue` | was not read yet: no calibration and no manager decision, or its judgment could not be read |

The view orders the states `non-lue`, `incomplete`, `epique`, `prete`, `mise-de-cote`. The code is
in `runtime/src/amont.ts`.

### `resserre` — when the body is too long for GitHub

GitHub refuses a body over 65,536 characters. Too long, the body first shortens its readable part,
then removes from the block, in this order, until it fits; each step that removed something is named
in `resserre`:

1. `distantes` — the remote stations' relay (the old path epic #2053 removes);
2. `activites.etapes` — each cook's past steps: what it does right now stays;
3. `faits.livres.relecture` — the reviews of the served tickets;
4. `gestes` — the chef's gestures already played;
5. `activites` — what each cook does, whole;
6. `faits.attend.livraison` — what the pass recorded of the deliveries that wait;
7. `faits.corrections.diff` — the proposed corrections' diffs;
8. `avantLeRail.dit` — each `dit` becomes `""`, the issues and their state stay;
9. `avantLeRail` — the issues before the rail, whole.

The rail (`faits`, `lignesDuRail`), the queue with its cards (TODO) and `cuisine` are **never** removed
(`faits` and `lignesDuRail` stay in the type only to read a block written before). The readable part
says in one line what was left out. `brigade <project> status` prints a `board` line: the body's size,
its share of the 65,536 limit, and the share of each block.

A removed field is **absent**, not `null`. An app that finds `faits` (an old block) or `avantLeRail`
named in `resserre` says it could not be published, rather than showing an empty rail.

3. **The writer's signature**, after the block: one more HTML comment, which names the station
   whose kitchen wrote the body and its machine's host. An app ignores it (`lireLeTableau` reads
   only the block).

```
<!-- brigade:board-writer {"station":"box","host":"box.example"} -->
```

## One writer per board

A board is written by one kitchen only: the kitchen of the station that serves the project
(`runtime/src/board-single-writer.ts`, epic #2108). Before a runtime rewrites or reopens a board
signed by **another** station, it reads the account's paired stations
(`appairage/stations-du-chef.ts`). If the signing station is online, cooks, and publishes the
repository among its projects, it serves the project: the write is refused, the board stays as that
station wrote it, and the refusal names it, in the error and once in the service log
(`brigade : Kitchen board de <repo> non rafraîchi — board write refused: <repo> is served by station
box (host box.example), …`). A runtime that cannot read the stations refuses too, and says why. If the
signing station is stopped, no longer serves the repository, or is no longer on the account, the
writing station takes the board over and signs it. A board signed by the writing station, or not
signed at all, is written as before, with no extra reading: a project served by one station sees no
change. A reading of the stations holds for 5 minutes.

## What changes the body

The box rewrites the body only when what it says changes. Not a change: the reading time (`lu`,
`faits.lu`, `avantLeRail.lu`), the runtime's last tick (`cuisine.runtime.dernierTick`,
`faits.dernierTick`, its line in `rubriques`) and the log's last event (`faits.dernierEvenement`). The
body holds no elapsed time (« 7 min ago », « for 12 min »), so a quiet project's body is the same from one
minute to the next; the old durations are still ignored when comparing with a body written before. A lease that expires, a cook that gets stuck, a ticket that moves: a change.

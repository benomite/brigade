# Brigade glossary — one English word per object

This file fixes **the English word for each French term** of the product (`installation`, `garde-fous`, `cuisine`, `attend`…). Tickets that translate the app, the box commands, the code and the docs apply it.

- **One French term, one English word**, and **one English word, one object.** When two French names name the *same* object (`pris` and `en cuisine`), they share one English word, and the table says so.
- **Words already English stay.** `cook`, `pass`, `status`, `rail`, `station`, `manager`, `reviewer`, `closer`, `second`, `chef`, `ticket`, `box`, `runtime`, `worktree`, `fire`, `86`, `base`, `gates` are kept as they are.
- **Technical identifiers already in English do not change** — journal events (`kitchen.stopped`), the fields of `faits`, the closing settings (`BRIGADE_CLOSING_*`).
- This file is the reference. It does not rename anything by itself.

## 1. The four meanings of « cuisine »

One French word named four things (#364); each has its own English word, used nowhere else here.

| French | English | Object |
|---|---|---|
| `cuisine` | `kitchen` | The **state of one project on its box**: `ouverte` → `open`, `retenue` → `held`, `arrêtée` → `stopped`, `éteinte` → `off`. What the chef's `stop` stops and `resume` reopens. |
| `Tous les projets` | `All projects` | The **overview screen of the app**, every project at once. |
| `en cuisine` | `taken` | The **step of a ticket** that a cook holds. Same object as `pris`; unrelated to the kitchen state |
| `ranger la cuisine` | `tidy up` | The **place, in the trade sense**: what a closing does to the project. Prose only; the object is `closing` (§2) |

Related terms built on « cuisine »:

| French | English | Object |
|---|---|---|
| `cuisiner` / `cuisiné par` | `cook` (verb) / `cooked by` | A station takes a ticket and runs a cook on it. Verb form of the kept noun `cook` |
| `hors-cuisine` (porte, label) | `served-elsewhere` | Ticket label: this box does not serve it, another does |
| `CUISINE À L'ARRÊT` | `KITCHEN STOPPED` | The banner on a project's space |

## 2. Product terms

| French | English | Object |
|---|---|---|
| `garde-fous` | `guardrails` | The caps, the chef's `stop` and the breaker of a project |
| `plafond` | `cap` | A limit (tokens, duration, cooks…) |
| `disjoncteur` | `breaker` | Stops the kitchen after repeated failures; `OUVERT` → `OPEN`, `fermé` → `closed` |
| `journal` | `log` | The project's append-only record of events |
| `installation` | `installation` | The check that a project is ready to be served, and its setup/uninstall |
| `sauvegarde` | `backup` | A dated copy of the project's log |
| `fermeture` | `closing` | The closer's pass over the project: measure drift, then prune and simplify |
| `dérive` | `drift` | Measures that crossed a declared threshold |
| `consommé` | `consumed` | What launches have spent (in flight, 5 h window, 24 h) |
| `attend` (bloc, ligne, pilule) | `awaiting` | What waits for the chef's decision. Block `attend` … `fin attend` → `awaiting` … `end awaiting` |
| `TODO` | `TODO` | What awaits the chef, a property of a ticket, not a step of the rail: exactly the tickets parked for the chef (#4261), shown as red cards, first in the column of their stage, and counted on the home, N the number of red cards. Not a column (#3458), and no filter any more (#3523). Listed above the columns of the project view, one entry per ticket, each with what is asked and the buttons that answer it ([todo-cards.md](todo-cards.md)) |
| `T'attend` | `Awaiting you` | The card pill of the same object, and the phone's list of the cards that await the chef — no longer a rail column (#3458) |
| `Attend les autres` | `Awaiting others` | The folded section under the columns, outside them: the cards that await another human of the project, still opened and answered by anyone (#2985, #3071, #3458) |
| `attend` (ligne de la fiche) | `awaiting` | The same word, same translation: a ticket that waits for another ticket, in its card (`attend : #12` → `awaiting: #12`) |
| `en attente` | `queued` | A ticket on the rail not yet taken |
| `pris` / `en cuisine` / `Au travail` | `taken` / `Taken` | A cook holds the ticket (see §1) |
| `en pass` / `Pass` | `in pass` / `Pass` | The ticket is being judged |
| `servi` / `Livré` | `served` / `Served` | The ticket is merged and served |
| `livrés 24 h` | `served 24 h` | Counter of the project card |
| `BLOQUÉ` | `BLOCKED` | What the ticket waited for was dropped |
| `WAITING` | `WAITING` | Waiting for a third party, not for you; the kitchen does not take it |
| — | `parked` | One state for everything that waits: who, for what, until when ([simplified process](superpowers/specs/2026-11-24-simplified-process.md), rule 13). A parked card stays in the column where it waits and says who it waits for and until when; no Waiting column (#4238). A ticket that waits for the chef is parked for the chef — for its question, with no date — and the chef's TODO is those tickets, and nothing else: a ticket in WAITING is parked for a third party, and a passed follow-up date does not bring it to the TODO (#4261) |
| `second` | `second` | Your product assistant, who helps you write the tickets |
| — | `human cook` | A human — the chef, the client, a colleague — who takes a ticket only a human can do, on the same rail: the label `human-cook` and the issue's assignee. No station takes it; their pull request goes through the same pass as a cook's (#4276) |
| `savoir-faire` | `know-how` | What the project's cooks learned: the lessons they receive when they start, each with the ticket it came from; the chef reads, edits and removes them in the app's Know-how tab (#4241) |
| `abandonné` | `dropped` | A ticket left the rail without being served |
| `pas sur le rail` | `off the rail` | Ticket the manager does not serve |
| `COINCE` / `COINCENT` | `STUCK` | A cook with no progress for half its lease |
| `bail` | `lease` | The time a station holds a ticket before it can be taken back |
| `tient` / `tenu par` | `taken by` | Which station holds the ticket |
| `sans progrès` | `no progress` | Time since the worktree last moved |
| `brûle` | `burns` | What a ticket spends |
| `fiche` | `card` | The ticket's machine-readable card (`attend`, `zone`) |
| `sensible` | `sensitive` | A ticket marked as touching a migration, security, a payment or the deletion of user data. |
| `relecture avant merge` | `review before merge` | The TODO card a sensitive ticket waits on after the pass. |
| `fiche du projet` | `project sheet` | What a project declares of its kitchen, in `.brigade/fiche-projet.json`: its eight items. See [runtime/README.md](runtime/README.md) |
| `carte` (de projet) | `tile` | A project's summary in All projects |
| `bon` | `slip` | One card of the rail |
| `découpage` | `split` | Cutting an epic into tickets |
| `épique` | `epic` | A ticket that groups tickets |
| — | `idea` | A label for an idea in reserve, not a request: it is never on the rail, and the manager never reads it — no `decision`, `fire`, `model:` or `effort:`, no comment, no TODO card (#3536) |
| `calibrage` | `calibration` | Model and effort given to a role |
| `tours` / `jetons` | `turns` / `tokens` | A cook's measured use |
| `livraison` / `livrable` | `delivery` / `deliverable` | What a cook hands back |
| `poste` | `workstation` | The chef's Mac, which can play a station |
| `espace` | `space` | A project's page in the app |
| `rangement` des worktrees | `cleanup` | Removing worktrees after a cook |
| `cloison` | `partition` | The wall between what a cook may and may not reach |
| `arbitre` | `arbiter` | Shares account quota between projects |
| `porte` | `door` | The runtime's entry for a remote station |
| `station distante` | `remote station` | A station elsewhere than the box |
| `se retient` (une station) / `SE RETIENT` | `withholding` / `WITHHOLDING` | A station refuses new tickets, with its reason |
| `ARBITRE INJOIGNABLE` | `ARBITER UNREACHABLE` | The arbiter does not answer |
| `connexion` (Max) | `connection` | The Max subscription's login; `ABSENTE` → `MISSING`, `EXPIRÉE` → `EXPIRED` |

## 3. Box commands and their options

Run as `brigade <project> <command>` on the box (`npm --prefix runtime run <command>` in a worktree).

| French | English | What it does | Options and subcommands |
|---|---|---|---|
| `garde-fous` | `guardrails` | Show and set the caps | `stop` → `stop`; `reprendre` → `resume`; `tokens`, `duration`, `idle`, `lease`, `removals` keep their names |
| `journal` | `log` | Read the log | `--derniers <N>` → `--last <N>`; `--ticks` → `--ticks`; `<ticket>` unchanged |
| `base` | `base` | Show the integration base; replay its gates when red | `rejouer` → `replay` |
| `installation` | `installation` | Check that a project is ready to be served | `labels` → `labels`; `setup` → `setup`; `desinstaller` → `uninstall`; `--confirmer` → `--confirm` |
| `status` | `status` | The photo of the project | `--suivre [<ticket>]` → `--follow [<ticket>]` |
| `faits` | `facts` | The machine-readable form of `status`, for the app | — |
| `rail` | `rail` | The ticket rail | `remove <ticket>` is new, with no old name |
| `station` | `station` | A station's settings | `cooks <N>` → `cooks <N>`; `retirer <setting>` → `remove <setting>`; `aide` → `help` |
| — | `setting` | The project's settings, from its repository | `ceiling`, `manager`, `reviewer <model> <effort> \| default`; `branch <name>` — new, with no old name |
| — | `human-cooks` | The tickets waiting on a human cook, read on GitHub, with who holds each (#4276) | new, with no old name |
| — | `humans` | The project's humans, from its repository (#2929) | `save <login> [<role>…]`, `remove <login>` — new, with no old name |
| — | `recurring` | The project's recurring tickets: on its next date, each becomes an issue with `fire` (#3230) | `declare --title <title> [--body <body>] --rhythm daily \| weekly --weekday <1-7> \| monthly --day <1-31>`, `pause <id>`, `resume <id>`, `remove <id>` — new, with no old name |
| — | `explanations` | The explanations of the kitchen's words a chef has seen in the app, kept per chef (#3308) | `--chef <login>`, `seen <word> --chef <login>`, `reset --chef <login>` — new, with no old name |
| — | `agent-settings` | Each agent's settings, for the app's Agents tab (#4222): model, effort, autonomy level, pause and the agent's own limits, with who changed what and when | `<agent>`, `<agent> set <key> <value> --by <author>` — new, with no old name |
| — | `recap` | What the kitchen did since the chef last looked, for the app's home screen (#3581): served tickets and their pull request, sends back and refusals, guardrail stops | `<owner>/<repo>`, `<owner>/<repo> seen <instant>` — new, with no old name |
| — | `design` | A green design delivery held for the chef's validation (#3184) | `validate <owner>/<repo>#<ticket>`, `send-back <owner>/<repo>#<ticket> --comment <what to change>` — new, with no old name |
| — | `sensitive` | A green delivery of a ticket labelled `sensitive`, held on its `review before merge` card (#3223) | `merge <owner>/<repo>#<ticket>`, `send-back <owner>/<repo>#<ticket> --note <note>` — new, with no old name |
| — | `undo` | A served ticket undone from its card (#3274): a pull request reverts its merge and goes through the pass like any delivery, and the ticket is reopened | `<owner>/<repo>#<ticket>` — new, with no old name |
| — | `send-word` | A word: one line of text the chef sends to the cook of a `taken` ticket (#4047). It is posted on the issue and reaches the cook at the end of its current turn | `<owner>/<repo>#<ticket> <word…>` — new, with no old name |
| — | `know-how` | The project's know-how: the lessons its cooks receive, each with the ticket it came from (#4241) | `edit <id> <text…>`, `remove <id>` — new, with no old name |
| `switch` | `switch` | The project switch, one for the whole project (#1406) | new, with no old name |
| `mesures` | `measures` | The measures behind drift | — |
| `fermeture` | `closing` | The closing pass | — |
| `sauvegarder` | `backup` | Take a backup | — |
| `restaurer` | `restore` | Restore a backup into a fresh state directory | — |
| `cloison` | `partition` | Show the partition | — |
| `arbitre` | `arbiter` | The arbiter's weights | `poids` → `weight`; `retirer` → `remove` |
| `porte` | `door` | The remote station's door | — |

## 4. The lines of `status`

| French | English |
|---|---|
| `runtime` | `runtime` |
| `cuisine` | `kitchen` |
| `connexion` | `connection` |
| `base` | `base` |
| `sauvegarde` | `backup` (`TROP VIEILLE` → `TOO OLD`; `JAMAIS FAITE` → `NEVER DONE`) |
| `attend` / `fin attend` | `awaiting` / `end awaiting` |
| `rail` | `rail` |
| `cooks` | `cooks` |
| `consommé` | `consumed` |
| `worktrees` | `worktrees` |
| `dérive` | `drift` |
| `derniers événements` | `latest events` |
| `rien n'attend le chef` | `nothing awaits the chef` |
| `aucun en cours` | `none running` |
| `ouverte` / `retenue` / `arrêtée` / `éteinte` | `open` / `held` / `stopped` / `off` |
| `ALLUMÉ` / `ÉTEINT` | `ON` / `OFF` |
| `ROUGE depuis …` | `RED since …` |
| the first line, projet until the runtime writes it in English | `project` |
| `github` (`GitHub limite les appels, reprise vers HH:MM`) | `github` (`GitHub is rate-limiting calls, back around HH:MM`) |
| `pris` / `en attente` / `en pass` / `servi` / `BLOQUÉ` | `taken` / `queued` / `in pass` / `served` / `BLOCKED` |
| `par … depuis …` | `by … since …` |
| `COINCE : ` / `sans progrès depuis …` | `STUCK: ` / `no progress since …` |
| `bail encore …` / `bail échu depuis …` | `lease … left` / `lease expired since …` |
| `… — depuis …` | `… — since …` |
| `depuis …, cuisiné par …` | `since …, cooked by …` |
| `j` (durations) | `d` (Days in a duration: `2 j` → `2 d`) |
| `sans fin au journal` | `with no end in the log` |

The app reads each form in both languages, whole; a line mixing the two in one form is read as neither.

## 5. App labels

| French | English |
|---|---|
| `Tous les projets` | `All projects` |
| `Ajouter un projet` | `Add a project` |
| `Son dépôt GitHub` / `Sa branche d'intégration` | `Its GitHub repository` / `Its integration branch` |
| `Sur le rail` | `On the rail` |
| `Au travail` | `Taken` |
| `Pass` | `Pass` |
| `Livré` | `Served` |
| `T'attend` | `Awaiting you` (the card pill, the phone's list) |
| `rail` / `au travail` / `à la pass` / `t'attend` / `livrés 24 h` | `rail` / `taken` / `at pass` / `awaiting you` / `served 24 h` |
| `Ce qui empêche de tourner` | `What stops it running` |
| `projet éteint` | `project off` |
| `reprendre la cuisine` | `resume the kitchen` |
| `arrêter la cuisine` | `stop the kitchen` |
| `allumer` / `éteindre` | `on` / `off` |
| `Retirer de l'app` | `Remove from the app` |
| `Rail` / `Cooks` / `Settings` | unchanged |
| `Paramètres` | `Settings` |
| `Les terminaux` | `Terminals` |
| `le second et les shells` | `the second and the shells` |

## 6. Left as it is

- `chef` — the human who decides. `fire`, `86`, `behind` — the spec's service jargon. `Max` — the Anthropic subscription.
- Identifiers that nothing shows the chef are renamed only when a ticket touches the file.

## 7. Settings levels

Where a setting lives (see [`reglages.md`](reglages.md)).

| French | English | Object |
|---|---|---|
| niveau | `level` | Where a setting is kept: the project's repository, the station, or the chef's app |
| projet (niveau) | `project` | The setting kept in the project's repository (`projet.json`), changed by a pull request |
| cet ordinateur (niveau) | `this computer` | The setting kept on one station, private, never in git |
| toi (niveau) | `you` | The chef's preference in the app |
| réglages du projet | `project settings` | The `projet.json` fields, read from the repository |

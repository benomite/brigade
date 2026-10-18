# Brigade glossary — one English word per object

Brigade's product vocabulary is French today (`installation`, `garde-fous`, `cuisine`,
`attend`…). This file fixes **the English word for each of those terms**, so that the tickets
that translate the app, the box commands, the code and the docs only have to apply it.

Rules this glossary holds, and later tickets must hold with it:

- **One French term, one English word.** No term has two translations.
- **One English word, one object.** No English word is given to two different objects. When
  two French names name the *same* object (`pris` and `en cuisine` are both "a cook holds the
  ticket"), they share the one English word, and the table says so.
- **Words already English stay.** `cook`, `grant`, `pass`, `status`, `rail`, `station`,
  `manager`, `reviewer`, `closer`, `second`, `chef`, `ticket`, `box`, `runtime`, `worktree`,
  `fire`, `86`, `base`, `gates` are kept as they are.
- **Technical identifiers that are already English do not change here** — journal events
  (`kitchen.stopped`, `cook.launched`…), the fields of `faits`, the closing settings
  (`BRIGADE_CLOSING_*`). They agree with the words below on purpose.
- This file is the reference. It does not rename anything by itself.

## 1. The four meanings of « cuisine »

The same French word named four different things (#364). Each now has its own English word,
and none of the four is reused anywhere else in this file.

| French | English | Object | Where |
|---|---|---|---|
| `cuisine` | `kitchen` | The **state of one project on its box**: `ouverte` → `open`, `retenue` → `held`, `arrêtée` → `stopped`, `éteinte` → `off`. What the chef's `stop` stops and `resume` reopens. Journal events already say `kitchen.stopped` / `kitchen.resumed` | box (`status` line `cuisine`, `garde-fous`), app (pill, card, alert banner), code, doc |
| `Tous les projets` | `All projects` | The **overview screen of the app**, every project at once. It is a window on the Mac: closing it stops nothing | app, doc |
| `en cuisine` | `taken` | The **step of a ticket** that a cook holds (`pris` on the rail, `Au travail` as a column). Same object as `pris`: one word for all three French names. It has nothing to do with the kitchen state | box (epic ticket list, `pass`), doc |
| `ranger la cuisine` | `tidy up` | The **place, in the trade sense**: what a closing does to the project. Prose only, never a label or a command; the object itself is `closing` (§2) | doc |

Related terms built on « cuisine »:

| French | English | Object | Where |
|---|---|---|---|
| `cuisiner` / `cuisiné par` | `cook` (verb) / `cooked by` | A station takes a ticket and runs a cook on it. Verb form of the kept noun `cook` | box, doc |
| `hors-cuisine` (porte, label) | `served-elsewhere` | Ticket label: this box does not serve it, another does | box, doc |
| `CUISINE À L'ARRÊT` | `KITCHEN STOPPED` | The banner on a project's space | app |

## 2. Product terms

| French | English | Object | Where |
|---|---|---|---|
| `garde-fous` | `guardrails` | The caps, the chef's `stop` and the breaker of a project | box, app, code, doc |
| `plafond` | `cap` | A limit (turns, tokens, duration, cooks…) | box, app, code, doc |
| `disjoncteur` | `breaker` | Stops the kitchen after repeated failures; `OUVERT` → `OPEN`, `fermé` → `closed` | box, app, doc |
| `journal` | `log` | The project's append-only record of events (the app tab is already `Log`) | box, app, code, doc |
| `installation` | `installation` | The check that a project is ready to be served, and its setup/uninstall | box, app, doc |
| `sauvegarde` | `backup` | A dated copy of the project's log | box, code, doc |
| `fermeture` | `closing` | The closer's pass over the project: measure drift, then prune and simplify | box, code, doc |
| `dérive` | `drift` | Measures that crossed a declared threshold | box (`status`), doc |
| `consommé` | `consumed` | What launches have spent (in flight, 5 h window, 24 h) | box (`status`), app |
| `attend` (bloc, ligne, pilule) | `awaiting` | What waits for the chef's decision. Block `attend` … `fin attend` → `awaiting` … `end awaiting` | box (`status`), app, doc |
| `T'attend` | `Awaiting you` | The rail column and card pill of the same object | app |
| `attend` (ligne de la fiche) | `awaiting` | The same word, same translation: a ticket that waits for another ticket, in its card (`attend : #12` → `awaiting: #12`) | box, doc |
| `en attente` | `queued` | A ticket on the rail not yet taken | box, app, doc |
| `pris` / `en cuisine` / `Au travail` | `taken` / `Taken` | A cook holds the ticket (see §1) | box, app, doc |
| `en pass` / `Pass` | `in pass` / `Pass` | The ticket is being judged | box, app |
| `servi` / `Livré` | `served` / `Served` | The ticket is merged and served | box, app |
| `livrés 24 h` | `served 24 h` | Counter of the project card | app |
| `BLOQUÉ` | `BLOCKED` | What the ticket waited for was dropped | box, app |
| `abandonné` | `dropped` | A ticket left the rail without being served | box, doc |
| `pas sur le rail` | `off the rail` | Ticket the manager does not serve | box, doc |
| `COINCE` / `COINCENT` | `STUCK` | A cook with no progress for half its lease | box, app |
| `bail` | `lease` | The time a station holds a ticket before it can be taken back | box, app, code |
| `tient` / `tenu par` | `taken by` | Which station holds the ticket | box, app |
| `sans progrès` | `no progress` | Time since the worktree last moved | box |
| `brûle` | `burns` | What a ticket spends | app |
| `fiche` | `card` | The ticket's machine-readable card (`attend`, `zone`) | box, doc |
| `carte` (de projet) | `tile` | A project's summary in All projects | app, doc |
| `bon` | `slip` | One entry of Awaiting you | app, code |
| `découpage` | `split` | Cutting an epic into tickets | box, doc |
| `épique` | `epic` | A ticket that groups tickets | box, doc |
| `calibrage` | `calibration` | Model and effort given to a role | box, app, doc |
| `tours` / `jetons` | `turns` / `tokens` | A cook's measured use | box, app |
| `livraison` / `livrable` | `delivery` / `deliverable` | What a cook hands back | box, doc |
| `poste` | `workstation` | The chef's Mac, which can play a station | app, doc |
| `espace` | `space` | A project's page in the app | app, doc |
| `rangement` des worktrees | `cleanup` | Removing worktrees after a cook | box, code |
| `cloison` | `partition` | The wall between what a cook may and may not reach | box, code, doc |
| `arbitre` | `arbiter` | Shares account quota between projects | box, code, doc |
| `porte` | `door` | The runtime's entry for a remote station | box, code |
| `station distante` | `remote station` | A station elsewhere than the box | box, doc |
| `se retient` (une station) / `SE RETIENT` | `withholding` / `WITHHOLDING` | A station refuses new tickets, with its reason | box |
| `MACHINE SATURÉE` | `MACHINE SATURATED` | The machine is out of memory or time | box |
| `ARBITRE INJOIGNABLE` | `ARBITER UNREACHABLE` | The arbiter does not answer | box |
| `connexion` (Max) | `connection` | The Max subscription's login; `ABSENTE` → `MISSING`, `EXPIRÉE` → `EXPIRED` | box, app |

## 3. Box commands and their options

Commands are run as `brigade <project> <command>` on the box (`npm --prefix runtime run
<command>` in a dev worktree).

| French | English | What it does | Options and subcommands |
|---|---|---|---|
| `garde-fous` | `guardrails` | Show and set the caps | `stop` → `stop`; `reprendre` → `resume`; `turns`, `tokens`, `duration`, `idle`, `lease`, `removals` keep their names |
| `journal` | `log` | Read the log | `--derniers <N>` → `--last <N>`; `--ticks` → `--ticks`; `<ticket>` unchanged |
| `base` | `base` | Show the integration base; replay its gates when red | `rejouer` → `replay` |
| `installation` | `installation` | Check that a project is ready to be served | `labels` → `labels`; `setup` → `setup`; `desinstaller` → `uninstall`; `--confirmer` → `--confirm` |
| `status` | `status` | The photo of the project | `--suivre [<ticket>]` → `--follow [<ticket>]` |
| `faits` | `facts` | The machine-readable form of `status`, for the app | — |
| `rail` | `rail` | The ticket rail | `remove <ticket>` and `priority <ticket> <1-9 \| none>` are new, with no old name |
| `station` | `station` | A station's settings | `cooks <N>` → `cooks <N>`; `retirer <setting>` → `remove <setting>`; `aide` → `help` |
| `manager` | `manager` | The manager's switch and decisions | `allumer` → `on`; `eteindre` → `off`; `rendre <n°>` → `return <n°>`; `backlog` → `backlog`; `upstream` is new, with no old name |
| `grant` | `grant` | The `merge` grant | `activer` → `enable`; `prolonger` → `extend`; `revoquer` → `revoke`; `--jusqu-a` → `--until`; `--pour` → `--for`; `--usages` → `--uses`; `--sans-echeance` → `--no-expiry` |
| `pass` | `pass` | The pass and its verdicts | — |
| `mesures` | `measures` | The measures behind drift | — |
| `fermeture` | `closing` | The closing pass | — |
| `sauvegarder` | `backup` | Take a backup | — |
| `restaurer` | `restore` | Restore a backup into a fresh state directory | — |
| `tirer` | `pull` | A remote station asks the box for work | `annoncer` → `announce`; `reclamer` → `claim`; `renouveler` → `renew`; `rendre` → `return`; `--preuve` → `--proof`; `--tours` → `--turns`; `--jetons` → `--tokens`; `--fin` → `--end`; `--raison` → `--reason` |
| `cloison` | `partition` | Show the partition | — |
| `arbitre` | `arbiter` | The arbiter's weights | `poids` → `weight`; `retirer` → `remove` |
| `porte` / `tenir-porte` | `door` / `hold-door` | The remote station's door | — |

## 4. The lines of `status`

Each line of `status` begins with its label; the French label is on the left.

| French | English | Says |
|---|---|---|
| `runtime` | `runtime` | Running, stopped, or never started — from the log |
| `cuisine` | `kitchen` | The chef's `stop` and the breaker |
| `connexion` | `connection` | Max login, per station |
| `grant` | `grant` | The grant, what is left, its uses |
| `base` | `base` | Absent unless red |
| `sauvegarde` | `backup` | Last backup; `TROP VIEILLE` → `TOO OLD`; `JAMAIS FAITE` → `NEVER DONE` |
| `attend` / `fin attend` | `awaiting` / `end awaiting` | What waits for the chef |
| `rail` | `rail` | Count by state, then each ticket |
| `cooks` | `cooks` | Cooks in flight and the station's cap |
| `consommé` | `consumed` | Spent: in flight, 5 h, 24 h |
| `serveurs` | `servers` | Interface deliveries served from a worktree |
| `service` | `service` | A service that is unavailable |
| `worktrees` | `worktrees` | Worktrees left after a cook |
| `dérive` | `drift` | Measures past a threshold |
| `derniers événements` | `latest events` | The last fifteen, as `log` shows them |
| `rien n'attend le chef` | `nothing awaits the chef` | The empty `awaiting` block |
| `sans grant, …` | `without a grant, …` | The bilan under `awaiting` |
| `aucun en cours` | `none running` | No cook |
| `ouverte` / `retenue` / `arrêtée` / `éteinte` | `open` / `held` / `stopped` / `off` | Kitchen states |
| `ALLUMÉ` / `ÉTEINT` | `ON` / `OFF` | Manager switch |
| `ACTIF` / `BIENTÔT ÉTEINT` / `ÉTEINT SEUL` | `ACTIVE` / `EXPIRING SOON` / `LAPSED` | Grant states |
| `ROUGE depuis …` | `RED since …` | The base is red |
| the first line, projet until the runtime writes it in English | `project` | The project the block is about. The French word is left out of backticks on purpose: the runtime's glossary test would otherwise forbid it in a `status` that still writes it |
| `github` (`GitHub limite les appels, reprise vers HH:MM`) | `github` (`GitHub is rate-limiting calls, back around HH:MM`) | GitHub rate limit, and when it lifts |
| `pris` / `en attente` / `en pass` / `servi` / `BLOQUÉ` | `taken` / `queued` / `in pass` / `served` / `BLOCKED` | States on a ticket line of `rail` |
| `par … depuis …` | `by … since …` | Who holds a taken ticket, and since when |
| `COINCE : ` / `sans progrès depuis …` | `STUCK: ` / `no progress since …` | A taken ticket whose cook is stuck |
| `bail encore …` / `bail échu depuis …` | `lease … left` / `lease expired since …` | Time left on the lease, or how long it has run out |
| `… — depuis …` | `… — since …` | A queued or blocked ticket: what holds it, then since when |
| `depuis …, cuisiné par …` | `since …, cooked by …` | A ticket in pass or served, and who cooked it |
| `j` (durations) | `d` | Days in a duration: `2 j` → `2 d` |
| `serveurs` / `à lancer` | `servers` / `to launch` | The two blocks of deliveries |
| `démarre` / `écoute` … `depuis` | `starting` / `listening` … `since` | A server's state on its line |
| `tenu depuis` | `held since` | A delivery under `to launch` |
| `écran : …` / `à regarder : …` | `screen: …` / `to look at: …` | Under a delivery: the screen, and what to look at there |
| `déclaré par le cook` / `écran déduit des fichiers touchés, pas déclaré par le cook` | `declared by the cook` / `screen deduced from the touched files, not declared by the cook` | Where the screen comes from |
| `sans fin au journal` | `with no end in the log` | Servers (or cooks) whose runtime stopped without ending them |

The app reads each of these forms in both languages, whole: a line that mixes the two inside one form is read as neither.

## 5. App labels

| French | English | Where in the app |
|---|---|---|
| `Tous les projets` | `All projects` | The overview screen (see §1) |
| `Ajouter un projet` | `Add a project` | Add form |
| `Son dossier sur ce poste` | `Its folder on this workstation` | Add form |
| `Son nom` / `Son dépôt GitHub` / `Sa box` | `Its name` / `Its GitHub repository` / `Its box` | Add form |
| `Déclarer une box` / `Déclarer` | `Declare a box` / `Declare` | Add form |
| `Choisir…` | `Choose…` | Add form |
| `Le calibrage du manager et du reviewer` | `The manager and reviewer calibration` | Add form |
| `La destination de ses sauvegardes` | `Where its backups go` | Add form |
| `Installer sur la box, et ajouter` | `Install on the box, and add` | Add form button |
| `Sur le rail` | `On the rail` | Rail column (`queued`, `BLOCKED`) |
| `Au travail` | `Taken` | Rail column |
| `Pass` | `Pass` | Rail column |
| `Livré` | `Served` | Rail column |
| `T'attend` | `Awaiting you` | Rail column and pill |
| `rail` / `au travail` / `à la pass` / `t'attend` / `livrés 24 h` | `rail` / `taken` / `at pass` / `awaiting you` / `served 24 h` | The five counters of a tile |
| `Ce qui empêche de tourner` | `What stops it running` | The alert band |
| `manager éteint` | `manager off` | Alert: no issue is judged |
| `renoncer à la demande` | `withdraw the request` | Alert action |
| `reprendre la cuisine` | `resume the kitchen` | Button |
| `arrêter la cuisine` | `stop the kitchen` | Button |
| `vérifier l'installation` | `check the installation` | Button |
| `allumer` / `éteindre` | `on` / `off` | Manager buttons (same words as the command) |
| `accorder` / `révoquer` | `enable` / `revoke` | Grants buttons (same words as the command) |
| `Retirer ce projet de l'app` | `Remove this project from the app` | Remove |
| `Désinstaller` | `Uninstall` | Remove from the box |
| `Rail` / `Cooks` / `Manager` / `Grants` / `Log` | unchanged | Tabs of a project's space |
| `Coût` | `Cost` | Section |
| `Paramètres` | `Settings` | Section |
| `Les pages` / `Les terminaux` | `Pages` / `Terminals` | Tab strips |
| `le second et les shells` | `the second and the shells` | Right-hand panel |
| `jamais accordé` | `never granted` | Grants tab |
| `derniers gestes` / `derniers usages` | `latest actions` / `latest uses` | Grants tab |
| `dernières décisions` / `écartées` | `latest decisions` / `set aside` | Manager tab |

## 6. Left as it is

These French-looking terms are not translated by this ticket, with the reason:

- `chef` — already English in the spec's vocabulary (the human who decides).
- `fire`, `86`, `behind` — already the spec's service jargon.
- `Max` — the Anthropic subscription's name.
- Identifiers that nothing shows the chef (internal function names, `#kitchen` in the view)
  are renamed only when a ticket touches the file; no mass rename.

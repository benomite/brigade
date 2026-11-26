# Naming rule — identifiers are English

**The identifiers of the code are English.** `CLAUDE.md` says that code, docs and issues are in English; this page says what that means for names, and which French word becomes which English word. The dialogue with the chef and with the agents stays French, and so do comments: the rule covers identifiers only.

A French reader finds the English word of each object of the product in [docs/glossary.md](glossary.md), the French reader's map. The table below is the same correspondence, cut into the words a name is made of.

## What is in scope

In `runtime/src` and `app/src`, these names are English:

- **file names**;
- **directory names**;
- **exported symbols** (functions, classes, constants, types, and the names of an export list);
- **npm subcommands** (the `scripts` of `runtime/package.json` and `app/package.json`, run as `npm --prefix runtime run <command>`);
- **keys of JSON contracts**: the keys of what the code writes as JSON for another program (the box's output, `faits`, a file another process reads);
- **environment variables** (`BRIGADE_*`).

Names written before this rule are French in many places. They are renamed by the rename tool, `scripts/rename-code/` (see its [README](../scripts/rename-code/README.md)), in the rename tickets of epic #4345 — never by hand. Until then they stay as they are: a new name is English, an old one is left for its rename ticket.

## The gate

`scripts/rename-code/gate.ts` fails a pull request that adds a French identifier. It runs on every pull request, in the workflow `.github/workflows/identifier-language.yml`:

```sh
node scripts/rename-code/gate.ts --base origin/main
```

It compares the branch with its merge base (committed work only) and reads only the names the branch adds or renames:

- a file under `runtime/src` or `app/src` that is added or renamed to a new name, read without its extensions (`garde-fous.test.ts` → `garde-fous`);
- a directory under `runtime/src` or `app/src` that the base does not have;
- a name that a code file of `runtime/src` or `app/src` exports and did not export on the base;
- a key that a JSON file of `runtime/src`, `runtime/test`, `app/src` or `app/test` has and did not have on the base. Keys are compared file by file: a key that another file of the base has is still new in this one.

A name fails when it **has an accent**, or when it **holds a word of the French column below** (looked up without accents, in any case and style: `plafondMs`, `PLAFOND_MS`, `plafond-ms`). The failure names each identifier, its file and its French word, then this rule and this page.

A French name that is already on the base passes: the gate never asks a branch to rename what it did not add. Comments, strings, test messages and docs are never read.

What the gate does not read, and the rule still covers: npm subcommands, environment variables, and JSON keys that the code builds without a JSON file.

When the gate cannot run — the base is not found, the mapping does not read — it stops with exit 2 (or 1 for the mapping) and says why; it never passes in its place.

## The French → English table

The one source of this table is [`scripts/rename-code/mapping.json`](../scripts/rename-code/mapping.json): the rename tool applies it (`table.ts` reads it) and the gate checks it. This page and the rename tool's README print it; a test of `scripts/rename-code/` fails when one of them differs from the file. To change a word, change `mapping.json` and the two tables.

A French entry is written as it is in a name: lower case, no accents, words separated by a space. The longest sequence wins: `en attente` → `queued` before `attente` → `wait`.

### The words of the glossary (`glossary`)

Taken from [docs/glossary.md](glossary.md).

| French | English |
|---|---|
| `cuisine` | `kitchen` |
| `cuisines` | `kitchens` |
| `cuisiner` | `cook` |
| `garde fous` | `guardrails` |
| `garde fou` | `guardrail` |
| `plafond` | `cap` |
| `plafonds` | `caps` |
| `disjoncteur` | `breaker` |
| `journal` | `log` |
| `journaux` | `logs` |
| `sauvegarde` | `backup` |
| `sauvegardes` | `backups` |
| `sauvegarder` | `backup` |
| `fermeture` | `closing` |
| `fermetures` | `closings` |
| `derive` | `drift` |
| `consomme` | `consumed` |
| `attend` | `awaiting` |
| `t attend` | `awaiting you` |
| `en attente` | `queued` |
| `pris` | `taken` |
| `servi` | `served` |
| `servie` | `served` |
| `servis` | `served` |
| `servies` | `served` |
| `bloque` | `blocked` |
| `bloquee` | `blocked` |
| `bloques` | `blocked` |
| `bloquees` | `blocked` |
| `abandonne` | `dropped` |
| `abandonnes` | `dropped` |
| `coince` | `stuck` |
| `coinces` | `stuck` |
| `bail` | `lease` |
| `tenu par` | `taken by` |
| `fiche` | `card` |
| `fiches` | `cards` |
| `bon` | `slip` |
| `bons` | `slips` |
| `decoupage` | `split` |
| `decoupages` | `splits` |
| `epique` | `epic` |
| `epiques` | `epics` |
| `calibrage` | `calibration` |
| `calibrages` | `calibrations` |
| `tours` | `turns` |
| `jetons` | `tokens` |
| `livraison` | `delivery` |
| `livraisons` | `deliveries` |
| `livrable` | `deliverable` |
| `livrables` | `deliverables` |
| `poste` | `workstation` |
| `postes` | `workstations` |
| `espace` | `space` |
| `brule` | `burns` |
| `sans progres` | `no progress` |
| `rangement` | `cleanup` |
| `rangements` | `cleanups` |
| `cloison` | `partition` |
| `arbitre` | `arbiter` |
| `arbitres` | `arbiters` |
| `arbitrage` | `arbitration` |
| `porte` | `door` |
| `portes` | `doors` |
| `distante` | `remote` |
| `distantes` | `remote` |
| `station distante` | `remote station` |
| `stations distantes` | `remote stations` |
| `connexion` | `connection` |
| `connexions` | `connections` |
| `mesure` | `measure` |
| `mesures` | `measures` |
| `faits` | `facts` |
| `tirer` | `pull` |
| `annoncer` | `announce` |
| `reclamer` | `claim` |
| `renouveler` | `renew` |
| `restaurer` | `restore` |
| `rejouer` | `replay` |
| `desinstaller` | `uninstall` |
| `revoquer` | `revoke` |
| `prolonger` | `extend` |
| `poids` | `weight` |
| `preuve` | `proof` |
| `serveur` | `server` |
| `serveurs` | `servers` |
| `ecran` | `screen` |
| `ecrans` | `screens` |
| `tenir porte` | `hold door` |
| `tenir portes` | `hold doors` |
| `tenir arbitre` | `hold arbiter` |

### The recurring words of the code (`code`)

Taken from the file and directory names of `runtime/src` and `app/src`: every French word found in three of these names or more — leaving out the words that are also English (`service`, `confirmation`, `flux`…) and the connectors — and a few found less often.

| French | English |
|---|---|
| `accueil` | `home` |
| `activite` | `activity` |
| `activites` | `activities` |
| `affichage` | `display` |
| `aiguillage` | `routing` |
| `ajout` | `addition` |
| `alerte` | `alert` |
| `alertes` | `alerts` |
| `appel` | `call` |
| `appels` | `calls` |
| `apprentissage` | `learning` |
| `arret` | `stop` |
| `attente` | `wait` |
| `autonomie` | `autonomy` |
| `avis` | `opinion` |
| `bac a sable` | `sandbox` |
| `bandeau` | `banner` |
| `barre` | `bar` |
| `besoin` | `need` |
| `blocage` | `blockage` |
| `blocages` | `blockages` |
| `bouton` | `button` |
| `branche` | `branch` |
| `capacite` | `capacity` |
| `capacites` | `capacities` |
| `carte` | `card` |
| `cartes` | `cards` |
| `chiffres` | `figures` |
| `choix` | `choice` |
| `commande` | `command` |
| `commandes` | `commands` |
| `commentaire` | `comment` |
| `compte` | `account` |
| `conflit` | `conflict` |
| `contexte` | `context` |
| `contrat` | `contract` |
| `cote` | `side` |
| `cout` | `cost` |
| `crochet` | `hook` |
| `cuisson` | `cooking` |
| `delai` | `delay` |
| `delais` | `delays` |
| `demande` | `request` |
| `depot` | `repository` |
| `diagramme` | `diagram` |
| `dire` | `tell` |
| `echec` | `failure` |
| `echecs` | `failures` |
| `enrolement` | `enrollment` |
| `equipe` | `team` |
| `erreur` | `error` |
| `essai` | `trial` |
| `etape` | `step` |
| `etapes` | `steps` |
| `etat` | `state` |
| `etats` | `states` |
| `evenement` | `event` |
| `evenements` | `events` |
| `explication` | `explanation` |
| `explications` | `explanations` |
| `fond` | `background` |
| `garde` | `guard` |
| `geste` | `action` |
| `gestes` | `actions` |
| `hebdomadaire` | `weekly` |
| `historique` | `history` |
| `hors` | `outside` |
| `humain` | `human` |
| `humains` | `humans` |
| `identite` | `identity` |
| `identites` | `identities` |
| `interrupteur` | `switch` |
| `jour` | `day` |
| `juge` | `judge` |
| `lancement` | `launch` |
| `lecture` | `read` |
| `libre` | `free` |
| `ligne` | `line` |
| `lignes` | `lines` |
| `limite` | `limit` |
| `mise a jour` | `update` |
| `montrer` | `show` |
| `mot` | `word` |
| `moteur` | `engine` |
| `nom` | `name` |
| `outil` | `tool` |
| `outils` | `tools` |
| `panne` | `outage` |
| `pannes` | `outages` |
| `parcours` | `journey` |
| `passe` | `pass` |
| `pastille` | `pill` |
| `poele` | `pan` |
| `premier` | `first` |
| `premiere` | `first` |
| `priorite` | `priority` |
| `prise` | `taking` |
| `projet` | `project` |
| `projets` | `projects` |
| `publie` | `published` |
| `qualite` | `quality` |
| `recit` | `story` |
| `recurrents` | `recurring` |
| `refus` | `refusal` |
| `registre` | `registry` |
| `reglage` | `setting` |
| `reglages` | `settings` |
| `renvoi` | `send back` |
| `renvois` | `send backs` |
| `reponse` | `answer` |
| `reponses` | `answers` |
| `reprise` | `resumption` |
| `requis` | `required` |
| `rouge` | `red` |
| `savoir faire` | `know how` |
| `sensible` | `sensitive` |
| `seuil` | `threshold` |
| `seuils` | `thresholds` |
| `seul` | `only` |
| `seule` | `only` |
| `signalement` | `report` |
| `statut` | `status` |
| `superviseur` | `supervisor` |
| `telephone` | `phone` |
| `temps` | `time` |
| `tenir` | `hold` |
| `veille` | `standby` |
| `vide` | `empty` |
| `visite` | `visit` |

Some French words of the table are English words too (`attend`, `bail`, `derive`, `dire`, `journal`, `sensible`): the gate fails on them in an English name as well. Pick another English word there (`wait for`, `lease`, `compute`…).

Words already English are not in the table, and stay: the glossary's own list (`cook`, `pass`, `status`, `rail`, `station`, `manager`, `chef`, `ticket`, `box`, `base`, `gates`…), and `fire`, `86`, `behind`, `Max`. Short French connectors (`de`, `du`, `la`, `par`, `sans`…) are not in the table either: a name built around them holds a word that is.

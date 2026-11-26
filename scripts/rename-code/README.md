# rename-code — the French words of the code, renamed by a tool (#1003, #1039, #4411)

The identifiers and file names of `runtime/` and `app/` that hold a term of
`docs/glossary.md` are renamed to English **by this tool**, never by hand. It
renames everywhere at once by following the references the TypeScript
language service finds, so the runtime and the app (which imports
`runtime/src`) move together.

The tool comes in two steps (the chef's decision on #1003, option A):

1. **#1039** delivers the tool alone. It knows how to rename everything, but
   the delivery renames nothing: no file of `runtime/` or `app/` changes.
2. **#1040** applies it during a short pause of the kitchen, on the latest
   `v2`, so that no other merge crosses the rename.

## One command

```sh
scripts/rename-code/rename.sh > rename-plan.tsv
```

This is the **dry run**, and it is the default. It copies the commit at `HEAD`
into the temporary directory, renames the copy as `--apply` would, runs the
proof on it, and then removes it. The copy is a `git clone --shared`: it
borrows the repository's objects and registers nothing in it, unlike a
worktree. The repository is
never touched. On stdout, it prints one line per act, tab-separated and
sorted. On stderr, it prints the summary:

```
dry run of <commit>: … declarations renamed, … member names kept as formats, … files and folders moved, … files edited
result tree: <hash>
0 unresolved identifier(s): every identifier resolves to the same declaration as before
```

The exit code is 0 only when there are 0 unresolved identifiers.

The script installs the tool's own TypeScript the first time
(`npm ci --prefix scripts/rename-code`). The program's types come from the
dependencies of `runtime/` and `app/`, so `.claude/brigade/worktree-setup.sh`
must have run first. The tool says so when they are missing.

It takes about three minutes (two to five, depending on the load of the
machine).

| Command | What it does |
|---|---|
| `rename.sh` | Dry run on a copy of `HEAD`. Nothing is written here. |
| `rename.sh --keep <dir>` | The same dry run, but the renamed copy stays at `<dir>`, so its tests and gates can be run. It carries the remote branches, which the gates compare with. Remove it with `rm -rf <dir>`. |
| `rename.sh --apply` | Renames this tree in place, then proves it. The tree must be clean. If the proof fails or anything throws, the rename is undone whole (`git reset --hard`, then `git clean` on the renamed zones), and the tree is the commit again. The renamed tree is left uncommitted, for the caller to commit. |
| `rename.sh --check` | Lists every identifier and path part of `runtime/` and `app/` that still holds a glossary term and is not an exception of the table. It exits 1 if there is one. Run after `--apply`, it must say `no glossary term left outside the table's exceptions`. |
| `… --only runtime` or `… --only app` | Any of the above, on the names of one zone only (#4413): its declarations and files are renamed, the other zone only follows (its imports and paths). A rename of one zone can land without the other. Members (properties and methods) keep their names: one zone's member can match the other's by structure alone, which no reference carries. |

### The lines of the dry run

| First column | Meaning |
|---|---|
| `rename` | A declaration, its file, its syntax, old name, new name, and the number of places renamed. |
| `kept` | A member that keeps its French name, and why: a format, see below. |
| `move` | A file or folder, and its new name. |
| `path` | A path written in text (an import, `node src/…`, a doc, `join(…, "a", "b")`) that follows a moved file. |
| `fixup` | A text edit from `FIXUPS`. |
| `unresolved` | Something the tool did not resolve, and why. On `v2` there are none. |

## What it does

1. **One program.** `runtime/{src,test}`, `app/{src,test}` and
   `scripts/capture-ecran` (which imports the app) are loaded into a single
   TypeScript language service. The tool uses TypeScript 5.9, the last version
   that ships the JavaScript API; the repository's own `tsc` is TypeScript 7,
   which is native.
2. **Names.** Every declared name of `runtime/` and `app/` is cut into words
   (`lireJournalDuProjet` → lire journal du projet). If it holds a glossary
   term, its new name is the whole-name entry of `names.ts` when there is one,
   and otherwise its word-by-word translation through `WORDS` (`table.ts`).
   The rename itself is the language service's: the declaration, every
   reference, every import and export.
   A shorthand `{ a }` is a property and a variable at once:
   - when both are renamed alike, it stays a shorthand (`{ b }`);
   - when only one is renamed, it becomes `{ a: b }` or `{ b: a }`.

   A binding whose new name is a reserved word (`interrupteur` → `switch`),
   or is already seen where it is used (`geste` → `action` beside an
   `action`; `fiche` and `carte` both → `card`), is refused: `names.ts`
   gives it another (#4413). An `export { a } from` is renamed with its
   importers, down the chain.
3. **Members** (properties and methods) are renamed like the rest, **unless
   their name is a format**. A member is kept when it can be reached, through
   the types, from what leaves the process or comes into it (`exchanged.ts`):
   - `JSON.stringify` and `JSON.parse … as T`;
   - the log's payloads and `console.*`;
   - the options of a child process and SQLite statements;
   - the app's IPC bridge (`app/src/vue/pont.d.ts`);
   - `Object.keys`, `"name" in value`, and type guards;
   - a key looked up by value;
   - a member named by a string type (`Pick<T, "…">`).

   A constant-case member (`BRIGADE_*`) is kept too: it is an environment
   variable or a key of a format.
4. **Files and folders** of `runtime/{src,test}` and `app/{src,test}` are
   renamed the same way, with `git mv`. For example, `garde-fous-cli.ts`
   becomes `guardrails-cli.ts`; the whole-name ones come from `PATHS`.

   Every path that names a moved file is rewritten:
   - imports;
   - `node src/…` in `package.json` and in the systemd units;
   - a file named in a test or a doc;
   - a path built in pieces, `join(ressources, "app", "src", "poste", "enveloppe.ts")`.

   A path is rewritten only if it resolves to a file that exists and moves.
   One word beside a slash (`ton projet/` closing a regex) is not a path:
   a path has two parts, an extension, or starts with `./`. A bare file name
   is read from its own zone (`gestes.ts` in `runtime/` is not the app's),
   and it follows a moved file only if no staying file of that name is as
   near to the text (#4413).
   `docs/superpowers/` and the `CHANGELOG.md` are history: they are left as
   written.
5. **The proof.** After writing, the tool loads the renamed tree again and
   checks that **every identifier resolves to the same declaration as
   before**: moved and renamed, but the same one. A rename that would capture
   or shadow another name fails here, not in a test. Each identifier that
   fails is printed as an `unresolved` line.

What it does **not** touch:

- **Strings and values**: states such as `ouverte` and `retenue`, the words
  written to the log, to `status` and to the box's output. Values are formats.
- **Comments and test messages.** They stay French in this rename.

## The table

`mapping.json` holds the French → English correspondence of words: the one
source that this tool applies (`table.ts` reads it into `WORDS`) and that the
naming gate checks (`gate.ts`, below). The tool reads nothing else, so to change
a result, change these files and replay.

- `WORDS` (`mapping.json`): words as they are written in a name (no accents,
  lower case), in two parts, both applied: `glossary`, the words of
  `docs/glossary.md`, and `code`, the recurring French words of the file names
  of `runtime/src` and `app/src`. Word sequences are matched longest first, so
  `en attente` → queued wins over any shorter sequence.
- `NAMES` (`names.ts`): whole names, used in two cases:
  - the word-by-word translation would leave French words around the glossary
    term (`ouvrirLEcran` → `openTheScreen`, not `ouvrirLScreen`);
  - a word means something else there (`porte` the verb « carries », `tirer`
    « draw », `espace` an XML namespace).

  A key is a name, or `<file>#<name>` for that file only.
- `PATHS`: whole names of files and folders, by path.
- `FIXUPS`: text edits the references cannot carry, applied last. Each one
  must be found the number of times it says, or the run fails.

The mapping the tool applies, word by word — the same table as
[docs/naming-rule.md](../../docs/naming-rule.md). A test
(`test/4-tables-match-the-mapping.test.ts`) fails when either table differs
from `mapping.json`.

| French (`glossary`) | English |
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

| French (`code`) | English |
|---|---|
| `a l` | `at the` |
| `a la` | `at the` |
| `abord` | `first` |
| `abscisse` | `abscissa` |
| `absente` | `absent` |
| `absentes` | `absent` |
| `absolu` | `absolute` |
| `accepte` | `accepts` |
| `accepter` | `accept` |
| `acces` | `access` |
| `accordees` | `granted` |
| `accorder` | `grant` |
| `accueil` | `home` |
| `acquittees` | `acknowledged` |
| `actif` | `active` |
| `actives` | `active` |
| `activite` | `activity` |
| `activites` | `activities` |
| `adopter` | `adopt` |
| `adoptes` | `adopted` |
| `adresse` | `address` |
| `affichage` | `display` |
| `affiche` | `shows` |
| `affichee` | `shown` |
| `afficher` | `show` |
| `agir` | `act` |
| `aide` | `help` |
| `aides` | `helpers` |
| `aiguillage` | `routing` |
| `ailleurs` | `elsewhere` |
| `aines` | `elders` |
| `ajout` | `addition` |
| `ajoute` | `adds` |
| `ajoutee` | `added` |
| `ajoutees` | `added` |
| `ajouter` | `add` |
| `ajoutes` | `added` |
| `ajouts` | `additions` |
| `ajuste` | `adjusts` |
| `ajuster` | `adjust` |
| `alarmes` | `alarms` |
| `alerte` | `alert` |
| `alerter` | `alert` |
| `alertes` | `alerts` |
| `allumage` | `startup` |
| `allume` | `lit` |
| `allumee` | `lit` |
| `allumer` | `turn on` |
| `amont` | `upstream` |
| `amonts` | `upstreams` |
| `amorcer` | `prime` |
| `ancetre` | `ancestor` |
| `ancien` | `old` |
| `ancienne` | `old` |
| `anciennes` | `old` |
| `anciennete` | `seniority` |
| `anciens` | `old` |
| `ancre` | `anchor` |
| `anglais` | `english` |
| `annee` | `year` |
| `annonce` | `announcement` |
| `annoncee` | `announced` |
| `annonces` | `announcements` |
| `annulation` | `cancellation` |
| `annulations` | `cancellations` |
| `annule` | `cancelled` |
| `annuler` | `cancel` |
| `anodin` | `harmless` |
| `appairage` | `pairing` |
| `appairages` | `pairings` |
| `appairee` | `paired` |
| `appairees` | `paired` |
| `appairer` | `pair` |
| `appareil` | `device` |
| `appel` | `call` |
| `appele` | `called` |
| `appelee` | `called` |
| `appeler` | `call` |
| `appeles` | `called` |
| `appelle` | `calls` |
| `appels` | `calls` |
| `applique` | `applies` |
| `appliquer` | `apply` |
| `apprentissage` | `learning` |
| `appris` | `learned` |
| `approbation` | `approval` |
| `approbations` | `approvals` |
| `approuve` | `approved` |
| `approuver` | `approve` |
| `apres` | `after` |
| `arbre` | `tree` |
| `arret` | `stop` |
| `arrete` | `stops` |
| `arretee` | `stopped` |
| `arretees` | `stopped` |
| `arreter` | `stop` |
| `arrets` | `stops` |
| `arrive` | `arrives` |
| `arrivee` | `arrival` |
| `arrivees` | `arrivals` |
| `arriver` | `arrive` |
| `assembler` | `assemble` |
| `assignees` | `assigned` |
| `attache` | `attached` |
| `attacher` | `attach` |
| `atteint` | `reached` |
| `atteinte` | `reached` |
| `attendent` | `await` |
| `attendre` | `wait` |
| `attendu` | `expected` |
| `attendue` | `expected` |
| `attendues` | `expected` |
| `attendus` | `expected` |
| `attente` | `wait` |
| `attentes` | `waits` |
| `attrapees` | `caught` |
| `au` | `at` |
| `au plus` | `at most` |
| `au repos` | `at rest` |
| `aucun` | `no` |
| `aucune` | `no` |
| `aujourdhui` | `today` |
| `aussi` | `also` |
| `auteur` | `author` |
| `auteurs` | `authors` |
| `autonomie` | `autonomy` |
| `autorisees` | `allowed` |
| `autoriser` | `allow` |
| `autour` | `around` |
| `autre` | `other` |
| `autres` | `others` |
| `autrui` | `others` |
| `aux` | `at` |
| `auxiliaires` | `auxiliary` |
| `avance` | `ahead` |
| `avancement` | `progress` |
| `avancer` | `advance` |
| `avant` | `before` |
| `avec` | `with` |
| `avertis` | `warned` |
| `avertissement` | `warning` |
| `avis` | `opinion` |
| `bac a sable` | `sandbox` |
| `bande` | `band` |
| `bandeau` | `banner` |
| `bandeaux` | `banners` |
| `bandes` | `bands` |
| `banniere` | `banner` |
| `barre` | `bar` |
| `barre de menus` | `menu bar` |
| `barres de menus` | `menu bars` |
| `bas` | `bottom` |
| `bascule` | `toggle` |
| `basculer` | `toggle` |
| `bascules` | `toggles` |
| `besoin` | `need` |
| `besoins` | `needs` |
| `bienvenue` | `welcome` |
| `binaire` | `binary` |
| `bleu` | `blue` |
| `bloc` | `block` |
| `blocage` | `blockage` |
| `blocages` | `blockages` |
| `blocs` | `blocks` |
| `bloquant` | `blocking` |
| `bloquantes` | `blocking` |
| `bloquants` | `blocking` |
| `bloquer` | `block` |
| `boite` | `box` |
| `boiteux` | `lame` |
| `bonne` | `good` |
| `booleen` | `boolean` |
| `bord` | `edge` |
| `borne` | `bound` |
| `bornee` | `bounded` |
| `borner` | `bound` |
| `boucle` | `loop` |
| `bout` | `end` |
| `bout en bout` | `end to end` |
| `bouton` | `button` |
| `boutons` | `buttons` |
| `bouts` | `ends` |
| `branche` | `branch` |
| `branchement` | `plugging` |
| `brancher` | `plug` |
| `bref` | `brief` |
| `briques` | `bricks` |
| `brouillon` | `draft` |
| `brouillons` | `drafts` |
| `brut` | `raw` |
| `brute` | `raw` |
| `brutes` | `raw` |
| `bulle` | `bubble` |
| `bureau` | `desktop` |
| `cachee` | `hidden` |
| `cacher` | `hide` |
| `cadran` | `dial` |
| `cadre` | `frame` |
| `cadres` | `frames` |
| `calcules` | `computed` |
| `calibre` | `calibrated` |
| `calme` | `calm` |
| `canal` | `channel` |
| `canaux` | `channels` |
| `candidat` | `candidate` |
| `candidats` | `candidates` |
| `canonique` | `canonical` |
| `capacite` | `capacity` |
| `capacites` | `capacities` |
| `capitale` | `capital` |
| `carte` | `card` |
| `cartes` | `cards` |
| `cas` | `case` |
| `casse` | `broken` |
| `cassee` | `broken` |
| `casses` | `broken` |
| `catalogue` | `catalog` |
| `categorie` | `category` |
| `ce` | `this` |
| `ce qu` | `what` |
| `ce que` | `what` |
| `ce qui` | `what` |
| `celle` | `the one` |
| `cellule` | `cell` |
| `centraux` | `central` |
| `centre` | `center` |
| `cet` | `this` |
| `chaine` | `string` |
| `chaines` | `strings` |
| `champ` | `field` |
| `champs` | `fields` |
| `changee` | `changed` |
| `changees` | `changed` |
| `changement` | `change` |
| `changements` | `changes` |
| `changer` | `change` |
| `chaque` | `each` |
| `charge` | `load` |
| `chargee` | `loaded` |
| `charger` | `load` |
| `charges` | `loads` |
| `chemin` | `path` |
| `chemins` | `paths` |
| `cherche` | `searches` |
| `cherchee` | `searched` |
| `chercher` | `search` |
| `chers` | `expensive` |
| `chevauchement` | `overlap` |
| `chiffre` | `figure` |
| `chiffres` | `figures` |
| `choisi` | `chosen` |
| `choisie` | `chosen` |
| `choisies` | `chosen` |
| `choisir` | `choose` |
| `choisis` | `chosen` |
| `choix` | `choice` |
| `choses` | `things` |
| `cible` | `target` |
| `cinq` | `five` |
| `citees` | `cited` |
| `clair` | `clear` |
| `clavier` | `keyboard` |
| `cle` | `key` |
| `cles` | `keys` |
| `clic` | `click` |
| `cliquable` | `clickable` |
| `cliquer` | `click` |
| `cloner` | `clone` |
| `clore` | `close` |
| `cloture` | `closure` |
| `coche` | `ticked` |
| `cochee` | `ticked` |
| `cochees` | `ticked` |
| `cocher` | `tick` |
| `coches` | `ticks` |
| `coeurs` | `cores` |
| `coffre` | `vault` |
| `collage` | `paste` |
| `collants` | `sticky` |
| `colle` | `pastes` |
| `coller` | `paste` |
| `colonne` | `column` |
| `colonnes` | `columns` |
| `colore` | `colored` |
| `colorer` | `color` |
| `combien` | `how many` |
| `commande` | `command` |
| `commandes` | `commands` |
| `comme` | `as` |
| `commencer` | `begin` |
| `commentaire` | `comment` |
| `commentaires` | `comments` |
| `commente` | `commented` |
| `commentees` | `commented` |
| `commenter` | `comment` |
| `commun` | `common` |
| `communaute` | `community` |
| `communes` | `common` |
| `communique` | `communicated` |
| `communiquee` | `communicated` |
| `communiques` | `communicated` |
| `communs` | `common` |
| `comparaison` | `comparison` |
| `comparer` | `compare` |
| `complet` | `complete` |
| `completes` | `complete` |
| `composants` | `components` |
| `comprendre` | `understand` |
| `compris` | `understood` |
| `comprise` | `understood` |
| `compte` | `account` |
| `comptees` | `counted` |
| `compter` | `count` |
| `comptes` | `accounts` |
| `compteur` | `counter` |
| `compteurs` | `counters` |
| `conclure` | `conclude` |
| `conditionnelle` | `conditional` |
| `confiance` | `trust` |
| `confie` | `entrusted` |
| `confier` | `entrust` |
| `confies` | `entrusted` |
| `confirme` | `confirms` |
| `confirmee` | `confirmed` |
| `confirmer` | `confirm` |
| `confirmes` | `confirmed` |
| `conflit` | `conflict` |
| `connecte` | `connected` |
| `connecter` | `connect` |
| `connu` | `known` |
| `connue` | `known` |
| `connues` | `known` |
| `connus` | `known` |
| `conseil` | `advice` |
| `conseille` | `advises` |
| `consigne` | `instruction` |
| `consignes` | `instructions` |
| `constat` | `finding` |
| `constats` | `findings` |
| `construire` | `build` |
| `construit` | `built` |
| `contenant` | `containing` |
| `conteneur` | `container` |
| `conteneurs` | `containers` |
| `contenu` | `content` |
| `contexte` | `context` |
| `continuer` | `continue` |
| `contraste` | `contrast` |
| `contrat` | `contract` |
| `contributrice` | `contributor` |
| `contributrices` | `contributors` |
| `controle` | `control` |
| `controler` | `check` |
| `controles` | `checks` |
| `copie` | `copy` |
| `copiee` | `copied` |
| `copiees` | `copied` |
| `copier` | `copy` |
| `coque` | `shell` |
| `corps` | `body` |
| `corriger` | `fix` |
| `cote` | `side` |
| `couleur` | `color` |
| `couleurs` | `colors` |
| `coup` | `hit` |
| `coupe` | `cut` |
| `coupee` | `cut` |
| `coupes` | `cuts` |
| `couples` | `pairs` |
| `courant` | `current` |
| `courante` | `current` |
| `courbe` | `curve` |
| `cours` | `progress` |
| `courte` | `short` |
| `cout` | `cost` |
| `couts` | `costs` |
| `couvert` | `covered` |
| `cree` | `created` |
| `creee` | `created` |
| `creees` | `created` |
| `creent` | `create` |
| `creer` | `create` |
| `crees` | `created` |
| `critere` | `criterion` |
| `crochet` | `hook` |
| `crochets` | `hooks` |
| `croisees` | `crossed` |
| `cuire` | `cook` |
| `cuisent` | `cook` |
| `cuisinier` | `cook` |
| `cuisiniers` | `cooks` |
| `cuisson` | `cooking` |
| `cuit` | `cooked` |
| `cuivre` | `copper` |
| `d` | `of` |
| `d un` | `of a` |
| `d une` | `of a` |
| `dans` | `in` |
| `de` | `of` |
| `de l` | `of the` |
| `debloquer` | `unblock` |
| `debut` | `start` |
| `debuts` | `starts` |
| `decharge` | `unload` |
| `decider` | `decide` |
| `declaree` | `declared` |
| `declarees` | `declared` |
| `declarer` | `declare` |
| `decliner` | `decline` |
| `decoupables` | `splittable` |
| `decoupe` | `split` |
| `decouper` | `split` |
| `dedans` | `inside` |
| `defaut` | `default` |
| `defauts` | `defaults` |
| `defile` | `scrolls` |
| `degrade` | `degraded` |
| `degre` | `degree` |
| `dehors` | `outside` |
| `deja` | `already` |
| `delai` | `delay` |
| `delais` | `delays` |
| `demandait` | `asked` |
| `demande` | `request` |
| `demandee` | `requested` |
| `demander` | `ask` |
| `demandes` | `requests` |
| `demarrage` | `startup` |
| `demarrages` | `startups` |
| `demarre` | `starts` |
| `demarrer` | `start` |
| `demenagement` | `move` |
| `demenager` | `move` |
| `demenageur` | `mover` |
| `demi` | `half` |
| `deparque` | `unparked` |
| `deparquer` | `unpark` |
| `depart` | `departure` |
| `departs` | `departures` |
| `depassant` | `exceeding` |
| `depasse` | `exceeds` |
| `depassement` | `overrun` |
| `dependances` | `dependencies` |
| `depense` | `spending` |
| `deplacable` | `movable` |
| `deplacement` | `move` |
| `deplacements` | `moves` |
| `deplacer` | `move` |
| `deplie` | `unfolded` |
| `depliee` | `unfolded` |
| `depliees` | `unfolded` |
| `deplier` | `unfold` |
| `deplies` | `unfolded` |
| `deplis` | `unfolds` |
| `deposee` | `dropped` |
| `deposer` | `drop` |
| `depot` | `repository` |
| `depots` | `repositories` |
| `depuis` | `since` |
| `dernier` | `last` |
| `derniere` | `last` |
| `dernieres` | `last` |
| `derniers` | `last` |
| `derriere` | `behind` |
| `des` | `of` |
| `descripteur` | `descriptor` |
| `desinstalles` | `uninstalled` |
| `desinstalleur` | `uninstaller` |
| `dessin` | `drawing` |
| `dessinable` | `drawable` |
| `dessine` | `draws` |
| `dessinee` | `drawn` |
| `dessinees` | `drawn` |
| `dessiner` | `draw` |
| `dessines` | `drawn` |
| `dessins` | `drawings` |
| `dessous` | `below` |
| `detache` | `detached` |
| `detailles` | `detailed` |
| `detectees` | `detected` |
| `detruire` | `destroy` |
| `detruite` | `destroyed` |
| `detruites` | `destroyed` |
| `deux` | `two` |
| `deuxieme` | `second` |
| `devant` | `in front` |
| `devenue` | `become` |
| `dezoomer` | `zoom out` |
| `diagnostiquer` | `diagnose` |
| `diagramme` | `diagram` |
| `diagrammes` | `diagrams` |
| `dialogue` | `dialog` |
| `dire` | `tell` |
| `directs` | `direct` |
| `disparu` | `gone` |
| `disponible` | `available` |
| `disque` | `disk` |
| `distinctes` | `distinct` |
| `dit` | `says` |
| `dite` | `said` |
| `dites` | `said` |
| `dits` | `said` |
| `dix` | `ten` |
| `dizaine` | `ten` |
| `documente` | `documented` |
| `doit` | `must` |
| `domaine` | `domain` |
| `donne` | `gives` |
| `donnee` | `data` |
| `donnees` | `data` |
| `donnes` | `given` |
| `dossier` | `folder` |
| `dossiers` | `folders` |
| `doublee` | `doubled` |
| `doublons` | `duplicates` |
| `doublure` | `stand in` |
| `droit` | `right` |
| `droite` | `right` |
| `du` | `of` |
| `duree` | `duration` |
| `ecart` | `gap` |
| `ecarter` | `set aside` |
| `echappable` | `escapable` |
| `echappe` | `escapes` |
| `echappements` | `escapes` |
| `echappes` | `escaped` |
| `echeance` | `deadline` |
| `echec` | `failure` |
| `echecs` | `failures` |
| `echelle` | `scale` |
| `echelles` | `scales` |
| `echoue` | `fails` |
| `echouee` | `failed` |
| `echouer` | `fail` |
| `ecoute` | `listens` |
| `ecoutes` | `listeners` |
| `ecrire` | `write` |
| `ecrit` | `written` |
| `ecrite` | `written` |
| `ecrites` | `written` |
| `ecrits` | `written` |
| `ecriture` | `writing` |
| `ecritures` | `writes` |
| `ecrivain` | `writer` |
| `edite` | `edits` |
| `editer` | `edit` |
| `efface` | `erased` |
| `egalite` | `equality` |
| `elle` | `it` |
| `embarque` | `embedded` |
| `embarquee` | `embedded` |
| `empeche` | `prevents` |
| `empecher` | `prevent` |
| `emplacements` | `locations` |
| `empreinte` | `fingerprint` |
| `en cours` | `in progress` |
| `en plus` | `extra` |
| `en tant que` | `as` |
| `enchaines` | `chained` |
| `encore` | `still` |
| `endroit` | `place` |
| `enfant` | `child` |
| `enfants` | `children` |
| `engage` | `engaged` |
| `enorme` | `huge` |
| `enregistre` | `records` |
| `enregistree` | `recorded` |
| `enregistrees` | `recorded` |
| `enregistrement` | `recording` |
| `enregistrer` | `record` |
| `enrolement` | `enrollment` |
| `ensuite` | `then` |
| `entamee` | `started` |
| `entete` | `header` |
| `entetes` | `headers` |
| `entier` | `whole` |
| `entiere` | `whole` |
| `entieres` | `whole` |
| `entiers` | `integers` |
| `entre` | `between` |
| `entree` | `entry` |
| `entrees` | `entries` |
| `entrer` | `enter` |
| `enveloppe` | `envelope` |
| `environnement` | `environment` |
| `envoi` | `send` |
| `envois` | `sends` |
| `envoye` | `sent` |
| `envoyee` | `sent` |
| `envoyees` | `sent` |
| `envoyer` | `send` |
| `envoyes` | `sent` |
| `epingle` | `pinned` |
| `epuisee` | `exhausted` |
| `equipe` | `team` |
| `erreur` | `error` |
| `erreurs` | `errors` |
| `espions` | `spies` |
| `essai` | `trial` |
| `essaie` | `tries` |
| `essais` | `trials` |
| `essayables` | `tryable` |
| `essayer` | `try` |
| `est` | `is` |
| `et` | `and` |
| `etablir` | `establish` |
| `etait` | `was` |
| `etape` | `step` |
| `etapes` | `steps` |
| `etat` | `state` |
| `etats` | `states` |
| `eteindre` | `turn off` |
| `eteint` | `off` |
| `eteinte` | `off` |
| `etiquette` | `label` |
| `etiquettes` | `labels` |
| `etranger` | `foreign` |
| `etrangere` | `foreign` |
| `etroit` | `narrow` |
| `etroite` | `narrow` |
| `eveille` | `awake` |
| `evenement` | `event` |
| `evenements` | `events` |
| `executer` | `run` |
| `exemple` | `example` |
| `existants` | `existing` |
| `existe` | `exists` |
| `explication` | `explanation` |
| `explications` | `explanations` |
| `explique` | `explained` |
| `expliques` | `explained` |
| `extraire` | `extract` |
| `fait` | `done` |
| `faite` | `done` |
| `faites` | `done` |
| `famille` | `family` |
| `fausse` | `false` |
| `faux` | `fake` |
| `fenetre` | `window` |
| `fenetres` | `windows` |
| `ferme` | `closes` |
| `fermee` | `closed` |
| `fermees` | `closed` |
| `fermer` | `close` |
| `fermes` | `closed` |
| `feu` | `fire` |
| `feuille` | `sheet` |
| `feuilles` | `sheets` |
| `feux` | `fires` |
| `fiabilite` | `reliability` |
| `fichier` | `file` |
| `fichiers` | `files` |
| `fige` | `frozen` |
| `figee` | `frozen` |
| `fil` | `thread` |
| `fils` | `threads` |
| `filtre` | `filter` |
| `filtrer` | `filter` |
| `fin` | `end` |
| `fini` | `finished` |
| `finies` | `finished` |
| `finir` | `finish` |
| `finissent` | `finish` |
| `fins` | `ends` |
| `fleche` | `arrow` |
| `focalise` | `focuses` |
| `focaliser` | `focus` |
| `fois` | `times` |
| `fond` | `background` |
| `fondue` | `fade` |
| `forme` | `shape` |
| `formee` | `formed` |
| `formes` | `shapes` |
| `formulaire` | `form` |
| `formulaires` | `forms` |
| `fournies` | `provided` |
| `fournissent` | `provide` |
| `fournisseur` | `provider` |
| `fournit` | `provides` |
| `fraiche` | `fresh` |
| `fraicheur` | `freshness` |
| `francais` | `french` |
| `fuite` | `leak` |
| `fusion` | `merge` |
| `fusionner` | `merge` |
| `gabarit` | `template` |
| `gagnes` | `gained` |
| `garde` | `guard` |
| `gardee` | `kept` |
| `gardees` | `kept` |
| `garder` | `keep` |
| `gardes` | `guards` |
| `garer` | `park` |
| `garni` | `filled` |
| `garnies` | `filled` |
| `gauche` | `left` |
| `gele` | `frozen` |
| `gelee` | `frozen` |
| `gelees` | `frozen` |
| `geles` | `frozen` |
| `generique` | `generic` |
| `genre` | `kind` |
| `geree` | `handled` |
| `geste` | `action` |
| `gestes` | `actions` |
| `glisse` | `slides` |
| `glissees` | `slid` |
| `glissiere` | `slider` |
| `glossaire` | `glossary` |
| `graphe` | `graph` |
| `gratuit` | `free` |
| `grille` | `grid` |
| `gros` | `big` |
| `groupe` | `group` |
| `grouper` | `group` |
| `groupes` | `groups` |
| `guider` | `guide` |
| `guillemets` | `quotes` |
| `hache` | `hash` |
| `hasard` | `chance` |
| `haut` | `top` |
| `haute` | `high` |
| `hauteur` | `height` |
| `hebdomadaire` | `weekly` |
| `hebdomadaires` | `weekly` |
| `heure` | `hour` |
| `heures` | `hours` |
| `histoire` | `story` |
| `histoires` | `stories` |
| `historique` | `history` |
| `horloge` | `clock` |
| `hors` | `outside` |
| `hote` | `host` |
| `huit` | `eight` |
| `humain` | `human` |
| `humaine` | `human` |
| `humains` | `humans` |
| `ici` | `here` |
| `icone` | `icon` |
| `icones` | `icons` |
| `idee` | `idea` |
| `identifiant` | `identifier` |
| `identite` | `identity` |
| `identites` | `identities` |
| `il` | `it` |
| `illisible` | `unreadable` |
| `illisibles` | `unreadable` |
| `ils` | `they` |
| `importes` | `imported` |
| `imposee` | `imposed` |
| `inchange` | `unchanged` |
| `incomplet` | `incomplete` |
| `incomplets` | `incomplete` |
| `inconnu` | `unknown` |
| `inconnue` | `unknown` |
| `indice` | `hint` |
| `indices` | `hints` |
| `indisponible` | `unavailable` |
| `indisponibles` | `unavailable` |
| `inerte` | `inert` |
| `informe` | `informs` |
| `initialiser` | `initialize` |
| `injoignable` | `unreachable` |
| `inscription` | `registration` |
| `inscrire` | `register` |
| `inscrit` | `registered` |
| `inscrite` | `registered` |
| `installabilite` | `installability` |
| `installateur` | `installer` |
| `installe` | `installs` |
| `installee` | `installed` |
| `installees` | `installed` |
| `installes` | `installed` |
| `installeur` | `installer` |
| `interdit` | `forbidden` |
| `interroge` | `queries` |
| `interroges` | `queried` |
| `interrompu` | `interrupted` |
| `interrupteur` | `switch` |
| `interrupteurs` | `switches` |
| `intertitre` | `subheading` |
| `intertitres` | `subheadings` |
| `intervalle` | `interval` |
| `intitule` | `titled` |
| `introuvable` | `not found` |
| `inutilisable` | `unusable` |
| `invalide` | `invalid` |
| `invite` | `prompt` |
| `invoque` | `invokes` |
| `jamais` | `never` |
| `jauge` | `gauge` |
| `jaune` | `yellow` |
| `jetable` | `disposable` |
| `jeton` | `token` |
| `jeu` | `set` |
| `joint` | `joined` |
| `jonction` | `junction` |
| `jouable` | `playable` |
| `joue` | `plays` |
| `jouee` | `played` |
| `jouer` | `play` |
| `joues` | `played` |
| `jour` | `day` |
| `journaliser` | `log` |
| `journee` | `day` |
| `jours` | `days` |
| `juge` | `judge` |
| `jugee` | `judged` |
| `jugement` | `judgment` |
| `juger` | `judge` |
| `juges` | `judges` |
| `jusqua` | `until` |
| `jusque` | `until` |
| `l` | `the` |
| `la` | `the` |
| `lachent` | `release` |
| `lacher` | `release` |
| `lacune` | `gap` |
| `laisse` | `leaves` |
| `laissee` | `left` |
| `laisser` | `leave` |
| `lancable` | `launchable` |
| `lance` | `launches` |
| `lancee` | `launched` |
| `lancees` | `launched` |
| `lancement` | `launch` |
| `lancer` | `launch` |
| `lances` | `launched` |
| `lanceur` | `launcher` |
| `laquelle` | `which` |
| `largeur` | `width` |
| `le` | `the` |
| `lecon` | `lesson` |
| `lecons` | `lessons` |
| `lecteur` | `reader` |
| `lecteurs` | `readers` |
| `lecture` | `read` |
| `lectures` | `reads` |
| `legende` | `legend` |
| `legendes` | `legends` |
| `lent` | `slow` |
| `lequel` | `which` |
| `les` | `the` |
| `lettre` | `letter` |
| `lettres` | `letters` |
| `leur` | `their` |
| `leurs` | `their` |
| `leve` | `lifted` |
| `levee` | `lifted` |
| `lever` | `lift` |
| `leves` | `lifted` |
| `lexique` | `lexicon` |
| `libelle` | `wording` |
| `libelles` | `wordings` |
| `libre` | `free` |
| `libres` | `free` |
| `lien` | `link` |
| `liens` | `links` |
| `lieu` | `place` |
| `lieux` | `places` |
| `ligne` | `line` |
| `lignes` | `lines` |
| `limite` | `limit` |
| `limitee` | `limited` |
| `limites` | `limits` |
| `lire` | `read` |
| `lis` | `reads` |
| `lisible` | `readable` |
| `lisibles` | `readable` |
| `listant` | `listing` |
| `liste` | `list` |
| `listee` | `listed` |
| `listees` | `listed` |
| `listes` | `lists` |
| `litteral` | `literal` |
| `litteraux` | `literals` |
| `livre` | `delivers` |
| `livree` | `delivered` |
| `livrees` | `delivered` |
| `livrer` | `deliver` |
| `livres` | `delivered` |
| `locaux` | `local` |
| `longue` | `long` |
| `longueur` | `length` |
| `lourde` | `heavy` |
| `lu` | `read` |
| `lue` | `read` |
| `lues` | `read` |
| `lui` | `it` |
| `lus` | `read` |
| `magasin` | `store` |
| `maintenant` | `now` |
| `maison` | `home` |
| `maitre` | `master` |
| `majuscules` | `capitals` |
| `mal` | `badly` |
| `manifeste` | `manifest` |
| `manifestes` | `manifests` |
| `manquant` | `missing` |
| `manquantes` | `missing` |
| `manquants` | `missing` |
| `manque` | `missing` |
| `manques` | `gaps` |
| `maquette` | `mockup` |
| `maquettes` | `mockups` |
| `marcher` | `work` |
| `marge` | `margin` |
| `marque` | `brand` |
| `marquee` | `marked` |
| `marquer` | `mark` |
| `marques` | `marks` |
| `marqueur` | `marker` |
| `marqueurs` | `markers` |
| `masque` | `mask` |
| `matin` | `morning` |
| `mauvais` | `bad` |
| `mauvaise` | `bad` |
| `mediane` | `median` |
| `meme` | `same` |
| `memes` | `same` |
| `memoire` | `memory` |
| `memoires` | `memories` |
| `mettre` | `put` |
| `mien` | `mine` |
| `milieu` | `middle` |
| `minimale` | `minimal` |
| `minimaux` | `minimal` |
| `minuterie` | `timer` |
| `minuteries` | `timers` |
| `minuteur` | `timer` |
| `mis` | `put` |
| `mis a jour` | `updated` |
| `mis de cote` | `set aside` |
| `mise a jour` | `update` |
| `mise de cote` | `set aside` |
| `mises` | `put` |
| `modele` | `model` |
| `modeles` | `models` |
| `modifiable` | `editable` |
| `modifier` | `edit` |
| `moins` | `less` |
| `mois` | `month` |
| `moitie` | `half` |
| `molette` | `wheel` |
| `monde` | `world` |
| `mondes` | `worlds` |
| `monter` | `mount` |
| `montrable` | `showable` |
| `montre` | `shows` |
| `montree` | `shown` |
| `montrees` | `shown` |
| `montrer` | `show` |
| `montres` | `shown` |
| `morceau` | `piece` |
| `morceaux` | `pieces` |
| `mort` | `dead` |
| `morts` | `dead` |
| `mot` | `word` |
| `moteur` | `engine` |
| `moteurs` | `engines` |
| `motif` | `reason` |
| `motifs` | `reasons` |
| `mots` | `words` |
| `mouvement` | `movement` |
| `moyennes` | `averages` |
| `muet` | `silent` |
| `muets` | `silent` |
| `muette` | `silent` |
| `muettes` | `silent` |
| `multiplexeur` | `multiplexer` |
| `natif` | `native` |
| `natifs` | `native` |
| `navigateur` | `browser` |
| `ne` | `not` |
| `nettoie` | `cleans` |
| `nettoyer` | `clean` |
| `neuf` | `new` |
| `neutre` | `neutral` |
| `neuve` | `new` |
| `neuves` | `new` |
| `ni` | `nor` |
| `niveau` | `level` |
| `niveaux` | `levels` |
| `noeud` | `node` |
| `nom` | `name` |
| `nombre` | `number` |
| `nombres` | `numbers` |
| `nomme` | `named` |
| `nommee` | `named` |
| `nommees` | `named` |
| `nommer` | `name` |
| `nommes` | `named` |
| `noms` | `names` |
| `non` | `not` |
| `normale` | `normal` |
| `normaliser` | `normalize` |
| `notee` | `noted` |
| `noter` | `note` |
| `notifiee` | `notified` |
| `notifiees` | `notified` |
| `notifier` | `notify` |
| `notifieur` | `notifier` |
| `nous` | `we` |
| `nouveau` | `new` |
| `nouveaux` | `new` |
| `nouvelle` | `new` |
| `noyau` | `core` |
| `nu` | `bare` |
| `nue` | `bare` |
| `nul` | `none` |
| `nulle` | `none` |
| `nuls` | `none` |
| `numero` | `number` |
| `numeros` | `numbers` |
| `numerote` | `numbered` |
| `objet` | `object` |
| `objets` | `objects` |
| `observer` | `observe` |
| `obtenir` | `get` |
| `obtenu` | `obtained` |
| `occupe` | `busy` |
| `occupee` | `busy` |
| `octets` | `bytes` |
| `offerte` | `offered` |
| `offertes` | `offered` |
| `offerts` | `offered` |
| `offre` | `offer` |
| `offrir` | `offer` |
| `oisive` | `idle` |
| `onglet` | `tab` |
| `onglets` | `tabs` |
| `optionnelle` | `optional` |
| `ordinaire` | `ordinary` |
| `ordinaires` | `ordinary` |
| `ordinateur` | `computer` |
| `ordonnee` | `ordinate` |
| `ordre` | `order` |
| `origine` | `origin` |
| `orpheline` | `orphan` |
| `ou` | `or` |
| `ou en est` | `where it stands` |
| `ou est` | `where is` |
| `oublier` | `forget` |
| `oui` | `yes` |
| `outil` | `tool` |
| `outils` | `tools` |
| `ouvert` | `open` |
| `ouverte` | `open` |
| `ouvertes` | `open` |
| `ouverts` | `open` |
| `ouverture` | `opening` |
| `ouvertures` | `openings` |
| `ouvrable` | `openable` |
| `ouvrables` | `openable` |
| `ouvrage` | `work` |
| `ouvre` | `opens` |
| `ouvreur` | `opener` |
| `ouvrir` | `open` |
| `paire` | `pair` |
| `paires` | `pairs` |
| `panne` | `outage` |
| `panneau` | `panel` |
| `panneaux` | `panels` |
| `pannes` | `outages` |
| `papiers` | `papers` |
| `paquet` | `package` |
| `paquets` | `packages` |
| `paragraphe` | `paragraph` |
| `paragraphes` | `paragraphs` |
| `parallele` | `parallel` |
| `parametres` | `parameters` |
| `parcourir` | `walk` |
| `parcours` | `journey` |
| `pareil` | `alike` |
| `parle` | `speaks` |
| `parmi` | `among` |
| `parque` | `parked` |
| `parquee` | `parked` |
| `parquees` | `parked` |
| `parquer` | `park` |
| `parseur` | `parser` |
| `partage` | `share` |
| `partager` | `share` |
| `parti` | `gone` |
| `partie` | `part` |
| `partiel` | `partial` |
| `partielle` | `partial` |
| `partiels` | `partial` |
| `partir` | `leave` |
| `partis` | `gone` |
| `partout` | `everywhere` |
| `pas` | `not` |
| `passant` | `passing` |
| `passation` | `handover` |
| `passe` | `pass` |
| `passee` | `past` |
| `passees` | `past` |
| `passer` | `pass` |
| `pastille` | `pill` |
| `pastillee` | `pilled` |
| `pastilles` | `pills` |
| `pauser` | `pause` |
| `peau` | `skin` |
| `peindre` | `paint` |
| `peinte` | `painted` |
| `peintes` | `painted` |
| `pendant` | `during` |
| `perdu` | `lost` |
| `perdue` | `lost` |
| `perdues` | `lost` |
| `perdus` | `lost` |
| `perime` | `stale` |
| `perimee` | `stale` |
| `perimees` | `stale` |
| `perimes` | `stale` |
| `periode` | `period` |
| `periodes` | `periods` |
| `permis` | `allowed` |
| `persistance` | `persistence` |
| `persistant` | `persistent` |
| `perso` | `personal` |
| `personne` | `nobody` |
| `personnelles` | `personal` |
| `pertes` | `losses` |
| `petit` | `small` |
| `peut` | `can` |
| `phrase` | `sentence` |
| `phrases` | `sentences` |
| `pied` | `foot` |
| `piege` | `trap` |
| `pilotage` | `steering` |
| `pilule` | `pill` |
| `pilules` | `pills` |
| `placees` | `placed` |
| `placer` | `place` |
| `plancher` | `floor` |
| `planifiees` | `scheduled` |
| `planifier` | `schedule` |
| `plat` | `flat` |
| `plateforme` | `platform` |
| `plateformes` | `platforms` |
| `plats` | `flat` |
| `plein` | `full` |
| `pleine` | `full` |
| `pleines` | `full` |
| `pli` | `fold` |
| `plis` | `folds` |
| `plus` | `more` |
| `plus tard` | `later` |
| `plus tot` | `earlier` |
| `poele` | `pan` |
| `poeles` | `pans` |
| `pointeurs` | `pointers` |
| `poli` | `polite` |
| `polices` | `fonts` |
| `pondere` | `weighted` |
| `ponderes` | `weighted` |
| `pont` | `bridge` |
| `portant` | `carrying` |
| `portee` | `scope` |
| `portees` | `scopes` |
| `portent` | `carry` |
| `porter` | `carry` |
| `porteur` | `carrier` |
| `porteuse` | `carrier` |
| `posables` | `settable` |
| `posee` | `set` |
| `posees` | `set` |
| `poser` | `set` |
| `poseur` | `setter` |
| `poseurs` | `setters` |
| `positif` | `positive` |
| `possibles` | `possible` |
| `postee` | `posted` |
| `poster` | `post` |
| `pour` | `for` |
| `pourcent` | `percent` |
| `pourcentage` | `percentage` |
| `pourquoi` | `why` |
| `pousser` | `push` |
| `pousses` | `pushed` |
| `precedent` | `previous` |
| `precedente` | `previous` |
| `precompile` | `precompiled` |
| `prefere` | `prefers` |
| `preferes` | `preferred` |
| `prefixe` | `prefix` |
| `premier` | `first` |
| `premiere` | `first` |
| `premiers` | `first` |
| `prend` | `takes` |
| `prendre` | `take` |
| `preparer` | `prepare` |
| `presentes` | `present` |
| `presque` | `almost` |
| `presse` | `pressed` |
| `presser` | `press` |
| `pret` | `ready` |
| `prete` | `ready` |
| `pretes` | `ready` |
| `prets` | `ready` |
| `principale` | `main` |
| `priorite` | `priority` |
| `priorites` | `priorities` |
| `prise` | `taking` |
| `prises` | `taken` |
| `prive` | `private` |
| `privees` | `private` |
| `privilegie` | `preferred` |
| `prix` | `price` |
| `processus` | `process` |
| `prochain` | `next` |
| `prochaine` | `next` |
| `proche` | `near` |
| `proches` | `close` |
| `produit` | `product` |
| `profil` | `profile` |
| `profonde` | `deep` |
| `profondeur` | `depth` |
| `programmes` | `programs` |
| `projet` | `project` |
| `projets` | `projects` |
| `promesse` | `promise` |
| `propose` | `proposes` |
| `proposee` | `proposed` |
| `proposees` | `proposed` |
| `proposer` | `propose` |
| `proposition` | `proposal` |
| `propositions` | `proposals` |
| `propre` | `own` |
| `propres` | `own` |
| `proprietaire` | `owner` |
| `propriete` | `property` |
| `proprietes` | `properties` |
| `protegee` | `protected` |
| `provenance` | `origin` |
| `provisoire` | `temporary` |
| `publie` | `published` |
| `publiee` | `published` |
| `publiees` | `published` |
| `publier` | `publish` |
| `publies` | `published` |
| `puce` | `bullet` |
| `puis` | `then` |
| `purger` | `purge` |
| `qu` | `that` |
| `qualifie` | `qualified` |
| `qualite` | `quality` |
| `quand` | `when` |
| `quarante` | `forty` |
| `quatre` | `four` |
| `quatrieme` | `fourth` |
| `que` | `that` |
| `quel` | `which` |
| `quelques` | `some` |
| `qui` | `who` |
| `quitte` | `quits` |
| `quitter` | `quit` |
| `quoi` | `what` |
| `racine` | `root` |
| `racines` | `roots` |
| `raison` | `reason` |
| `raisons` | `reasons` |
| `ramene` | `brings back` |
| `ramenee` | `brought back` |
| `ramener` | `bring back` |
| `rang` | `rank` |
| `rangeable` | `tidyable` |
| `rangee` | `row` |
| `rangees` | `rows` |
| `ranger` | `tidy` |
| `rangs` | `ranks` |
| `rapatrie` | `brings home` |
| `rappel` | `reminder` |
| `rapport` | `report` |
| `ratee` | `missed` |
| `rattache` | `attached` |
| `rattachement` | `attachment` |
| `rattacher` | `attach` |
| `rattrapage` | `catch up` |
| `rattrape` | `catches up` |
| `rattraper` | `catch up` |
| `rayon` | `radius` |
| `recevoir` | `receive` |
| `recharge` | `reloads` |
| `rechargee` | `reloaded` |
| `rechargement` | `reload` |
| `recherche` | `search` |
| `recit` | `story` |
| `reclament` | `claim` |
| `recommandation` | `recommendation` |
| `recommande` | `recommended` |
| `recommandee` | `recommended` |
| `recontrole` | `rechecks` |
| `recopies` | `copied` |
| `recours` | `resort` |
| `recu` | `received` |
| `recue` | `received` |
| `recues` | `received` |
| `recul` | `step back` |
| `recurrent` | `recurring` |
| `recurrents` | `recurring` |
| `recus` | `received` |
| `redemarrage` | `restart` |
| `redemarre` | `restarts` |
| `redemarrer` | `restart` |
| `redessine` | `redraws` |
| `redessinee` | `redrawn` |
| `redessiner` | `redraw` |
| `rediges` | `written` |
| `redits` | `retold` |
| `reecrire` | `rewrite` |
| `reecrit` | `rewrites` |
| `reecriture` | `rewrite` |
| `reel` | `real` |
| `reessai` | `retry` |
| `reessayer` | `retry` |
| `refait` | `redone` |
| `referme` | `closes again` |
| `refus` | `refusal` |
| `refusant` | `refusing` |
| `refuse` | `refuses` |
| `refusee` | `refused` |
| `refusees` | `refused` |
| `refuser` | `refuse` |
| `refuses` | `refused` |
| `regard` | `look` |
| `regarder` | `look` |
| `registre` | `registry` |
| `reglage` | `setting` |
| `reglages` | `settings` |
| `regle` | `rule` |
| `reglee` | `set` |
| `reglees` | `set` |
| `regler` | `set` |
| `regles` | `rules` |
| `rejet` | `rejection` |
| `rejeux` | `replays` |
| `rejoindre` | `join` |
| `rejointe` | `joined` |
| `rejointes` | `joined` |
| `relance` | `relaunch` |
| `relancee` | `relaunched` |
| `relancees` | `relaunched` |
| `relancer` | `relaunch` |
| `relances` | `relaunches` |
| `relaye` | `relays` |
| `relayer` | `relay` |
| `relayes` | `relayed` |
| `relecture` | `review` |
| `relectures` | `reviews` |
| `releve` | `reading` |
| `relire` | `reread` |
| `relisible` | `rereadable` |
| `relit` | `rereads` |
| `relu` | `reread` |
| `relue` | `reread` |
| `relues` | `reread` |
| `relus` | `reread` |
| `remarques` | `remarks` |
| `remede` | `remedy` |
| `remedes` | `remedies` |
| `remedier` | `remedy` |
| `remettre` | `put back` |
| `remis` | `put back` |
| `remise` | `put back` |
| `remises` | `put back` |
| `remonte` | `rises` |
| `remontee` | `raised` |
| `remonter` | `raise` |
| `remontrer` | `show again` |
| `remplacer` | `replace` |
| `rempli` | `filled` |
| `remplir` | `fill` |
| `rendre` | `render` |
| `rendu` | `rendered` |
| `rendue` | `rendered` |
| `rendues` | `rendered` |
| `rendus` | `rendered` |
| `renomme` | `renamed` |
| `renonce` | `gives up` |
| `renoncer` | `give up` |
| `renouvellement` | `renewal` |
| `renouvellements` | `renewals` |
| `renvoi` | `send back` |
| `renvois` | `send backs` |
| `renvoye` | `sent back` |
| `renvoyer` | `send back` |
| `renvoyes` | `sent back` |
| `reparation` | `repair` |
| `repare` | `repaired` |
| `repartie` | `spread` |
| `repartir` | `restart` |
| `repeinte` | `repainted` |
| `repere` | `marker` |
| `repertoire` | `directory` |
| `repetee` | `repeated` |
| `replie` | `folded` |
| `repliee` | `folded` |
| `replier` | `fold` |
| `repond` | `answers` |
| `repondeur` | `responder` |
| `repondre` | `answer` |
| `repondu` | `answered` |
| `repondue` | `answered` |
| `repondues` | `answered` |
| `repondus` | `answered` |
| `reponse` | `answer` |
| `reponses` | `answers` |
| `repose` | `rests` |
| `reposee` | `rested` |
| `reposer` | `rest` |
| `reposes` | `rested` |
| `reprendre` | `resume` |
| `repris` | `resumed` |
| `reprise` | `resumption` |
| `reprises` | `resumptions` |
| `requerir` | `require` |
| `requete` | `request` |
| `requis` | `required` |
| `requise` | `required` |
| `reseau` | `network` |
| `resolu` | `resolved` |
| `resolue` | `resolved` |
| `resolues` | `resolved` |
| `resoudre` | `resolve` |
| `ressemblants` | `lookalike` |
| `ressources` | `resources` |
| `restant` | `remaining` |
| `restantes` | `remaining` |
| `restants` | `remaining` |
| `reste` | `remains` |
| `restent` | `remain` |
| `restes` | `remains` |
| `resultat` | `result` |
| `retard` | `delay` |
| `retards` | `delays` |
| `retenir` | `hold` |
| `retenu` | `held` |
| `retenue` | `held` |
| `retenues` | `held` |
| `retenus` | `held` |
| `retient` | `holds` |
| `retire` | `removed` |
| `retiree` | `removed` |
| `retirees` | `removed` |
| `retirer` | `remove` |
| `retires` | `removed` |
| `retombe` | `falls back` |
| `retombee` | `fallen back` |
| `retour` | `return` |
| `retours` | `returns` |
| `retrait` | `removal` |
| `retraits` | `removals` |
| `retrouver` | `find again` |
| `retrouves` | `found again` |
| `reussies` | `succeeded` |
| `revenir` | `come back` |
| `revenu` | `back` |
| `revenue` | `back` |
| `reverte` | `reverted` |
| `revu` | `reviewed` |
| `revue` | `review` |
| `revues` | `reviews` |
| `rien` | `nothing` |
| `rogner` | `trim` |
| `rond` | `round` |
| `ronde` | `round` |
| `ronds` | `rounds` |
| `rouge` | `red` |
| `rouges` | `red` |
| `rouvert` | `reopened` |
| `rouverte` | `reopened` |
| `rouvrir` | `reopen` |
| `rubrique` | `heading` |
| `rubriques` | `headings` |
| `rythme` | `pace` |
| `sa` | `its` |
| `sain` | `healthy` |
| `saine` | `healthy` |
| `saisi` | `typed` |
| `saisie` | `input` |
| `saisies` | `inputs` |
| `salle` | `room` |
| `sans` | `without` |
| `sante` | `health` |
| `sauf` | `except` |
| `saut` | `jump` |
| `saute` | `skips` |
| `sauts` | `jumps` |
| `sauver` | `save` |
| `savoir faire` | `know how` |
| `se` | `itself` |
| `secondaire` | `secondary` |
| `secondaires` | `secondary` |
| `seconde` | `second` |
| `secondes` | `seconds` |
| `secours` | `fallback` |
| `selecteur` | `selector` |
| `selecteurs` | `selectors` |
| `selectionne` | `selected` |
| `semaine` | `week` |
| `semaines` | `weeks` |
| `semees` | `sown` |
| `sens` | `meaning` |
| `sensible` | `sensitive` |
| `separateur` | `separator` |
| `separe` | `separate` |
| `sept` | `seven` |
| `septieme` | `seventh` |
| `sert` | `serves` |
| `servante` | `serving` |
| `servantes` | `serving` |
| `servir` | `serve` |
| `ses` | `its` |
| `seuil` | `threshold` |
| `seuils` | `thresholds` |
| `seul` | `only` |
| `seule` | `only` |
| `seulement` | `only` |
| `seuls` | `only` |
| `si` | `if` |
| `sien` | `its own` |
| `sienne` | `its own` |
| `siennes` | `its own` |
| `siens` | `its own` |
| `sigle` | `acronym` |
| `sigler` | `abbreviate` |
| `sigles` | `acronyms` |
| `signale` | `reports` |
| `signalees` | `reported` |
| `signalement` | `report` |
| `signaler` | `report` |
| `signales` | `reported` |
| `signaux` | `signals` |
| `signe` | `sign` |
| `signes` | `signs` |
| `silencieuse` | `silent` |
| `simulee` | `simulated` |
| `socle` | `base` |
| `soi` | `itself` |
| `somme` | `sum` |
| `sommes` | `sums` |
| `sommet` | `top` |
| `son` | `its` |
| `sondage` | `probe` |
| `sonde` | `probe` |
| `sonder` | `probe` |
| `sont` | `are` |
| `sorte` | `kind` |
| `sortes` | `kinds` |
| `sorti` | `out` |
| `sortie` | `output` |
| `sorties` | `outputs` |
| `sortir` | `exit` |
| `soumet` | `submits` |
| `sourcees` | `sourced` |
| `sous` | `under` |
| `souvenir` | `memory` |
| `souvenirs` | `memories` |
| `souvenus` | `remembered` |
| `statut` | `status` |
| `statuts` | `statuses` |
| `stockage` | `storage` |
| `suffixe` | `suffix` |
| `suivant` | `next` |
| `suivante` | `next` |
| `suivants` | `next` |
| `suivi` | `tracking` |
| `suivie` | `tracked` |
| `suivis` | `tracked` |
| `suivre` | `follow` |
| `sujet` | `subject` |
| `superposees` | `overlaid` |
| `superposer` | `overlay` |
| `superviseur` | `supervisor` |
| `sur` | `on` |
| `sur place` | `on site` |
| `sures` | `sure` |
| `survecues` | `survived` |
| `survie` | `survival` |
| `survit` | `survives` |
| `survivante` | `surviving` |
| `survivantes` | `surviving` |
| `survivre` | `survive` |
| `survol` | `hover` |
| `survols` | `hovers` |
| `suspendu` | `suspended` |
| `synchro` | `sync` |
| `systeme` | `system` |
| `ta` | `your` |
| `tableau` | `board` |
| `tableaux` | `boards` |
| `tache` | `task` |
| `taille` | `size` |
| `tant` | `while` |
| `tapee` | `typed` |
| `taper` | `type` |
| `tard` | `late` |
| `techniques` | `technical` |
| `teindre` | `tint` |
| `teinte` | `tint` |
| `tel` | `such` |
| `telechargement` | `download` |
| `telechargements` | `downloads` |
| `telecharger` | `download` |
| `telephone` | `phone` |
| `telephones` | `phones` |
| `tels` | `such` |
| `temoin` | `witness` |
| `temoins` | `witnesses` |
| `temporaire` | `temporary` |
| `temps` | `time` |
| `tenant` | `holding` |
| `tenants` | `holders` |
| `tendance` | `trend` |
| `tenir` | `hold` |
| `tenue` | `held` |
| `tenues` | `held` |
| `tenus` | `held` |
| `terminaux` | `terminals` |
| `termine` | `finished` |
| `terminer` | `finish` |
| `teste` | `tests` |
| `tete` | `head` |
| `tetes` | `heads` |
| `texte` | `text` |
| `textes` | `texts` |
| `tienne` | `holds` |
| `tient` | `holds` |
| `tiers` | `third` |
| `tirage` | `draw` |
| `tire` | `pulls` |
| `tiree` | `pulled` |
| `tires` | `pulled` |
| `titre` | `title` |
| `titres` | `titles` |
| `toi` | `you` |
| `tombe` | `falls` |
| `tombee` | `fallen` |
| `ton` | `your` |
| `tons` | `tones` |
| `tot` | `early` |
| `totaux` | `totals` |
| `touche` | `key` |
| `toucher` | `touch` |
| `touches` | `keys` |
| `toujours` | `always` |
| `tourne` | `runs` |
| `tournent` | `run` |
| `tous` | `all` |
| `tout` | `all` |
| `toutes` | `all` |
| `tracee` | `drawn` |
| `traine` | `lingers` |
| `traits` | `strokes` |
| `trame` | `frame` |
| `trames` | `frames` |
| `tranche` | `slice` |
| `tranchent` | `decide` |
| `transfert` | `transfer` |
| `travail` | `work` |
| `travers` | `through` |
| `trente` | `thirty` |
| `trier` | `sort` |
| `trois` | `three` |
| `troisieme` | `third` |
| `troncons` | `segments` |
| `trop` | `too` |
| `trou` | `hole` |
| `trouve` | `finds` |
| `trouvee` | `found` |
| `trouvees` | `found` |
| `trouver` | `find` |
| `trouves` | `found` |
| `tu` | `you` |
| `tube` | `pipe` |
| `tubes` | `pipes` |
| `tue` | `kills` |
| `tuer` | `kill` |
| `tues` | `killed` |
| `un` | `one` |
| `une` | `one` |
| `urgence` | `emergency` |
| `urgences` | `emergencies` |
| `urgente` | `urgent` |
| `utile` | `useful` |
| `utiles` | `useful` |
| `utilisable` | `usable` |
| `valable` | `valid` |
| `valeur` | `value` |
| `valeurs` | `values` |
| `valide` | `valid` |
| `validees` | `validated` |
| `valider` | `validate` |
| `vaut` | `is worth` |
| `veille` | `standby` |
| `veiller` | `watch` |
| `veilles` | `standbys` |
| `venir` | `come` |
| `venues` | `come` |
| `verif` | `check` |
| `verifie` | `checks` |
| `verifiee` | `verified` |
| `verifier` | `check` |
| `verifies` | `checked` |
| `verrou` | `lock` |
| `vers` | `to` |
| `vert` | `green` |
| `verte` | `green` |
| `vertes` | `green` |
| `verts` | `green` |
| `vide` | `empty` |
| `videes` | `emptied` |
| `vider` | `empty` |
| `vides` | `empty` |
| `vie` | `life` |
| `vieille` | `old` |
| `vieux` | `old` |
| `vif` | `bright` |
| `vigueur` | `force` |
| `vingt` | `twenty` |
| `vise` | `aims` |
| `visee` | `aimed` |
| `vises` | `aimed` |
| `visibles` | `visible` |
| `visite` | `visit` |
| `visitee` | `visited` |
| `visitees` | `visited` |
| `visiter` | `visit` |
| `vivant` | `alive` |
| `vivante` | `alive` |
| `vivantes` | `alive` |
| `vivants` | `alive` |
| `voile` | `veil` |
| `voir` | `see` |
| `voisin` | `neighbor` |
| `voisines` | `neighbors` |
| `voisins` | `neighbors` |
| `vol` | `flight` |
| `votre` | `your` |
| `voulu` | `wanted` |
| `voulue` | `wanted` |
| `voulues` | `wanted` |
| `voulus` | `wanted` |
| `vrai` | `real` |
| `vraie` | `real` |
| `vraies` | `real` |
| `vraiment` | `really` |
| `vrais` | `real` |
| `vu` | `seen` |
| `vues` | `views` |
| `vus` | `seen` |
| `zoomer` | `zoom in` |

### The exceptions, and why

The glossary's own exceptions are not in `WORDS`, so nothing renames them:

- the words already English (`cook`, `pass`, `status`, `rail`,
  `station`, `manager`, `chef`, `ticket`, `box`, `base`, `gates`…);
- `fire`, `86`, `behind`;
- `Max`.

The tool's own exceptions are in `table.ts`, each with its reason:

- `KEPT_MEMBERS` lists two kinds of members.
  - **Linked by assignment to a format.** The language service does not follow
    an assignment, so renaming one side would leave the other. The type check
    of the renamed tree found these.
  - **Read back from untyped data.** The tests that compare what is read with
    what is expected found these.
- `KEPT_FILES` lists the files named by a systemd unit that the box copies
  into `/etc/systemd/system`. A box that updates its clone keeps its copy, so
  renaming the file would leave the unit naming a file that no longer exists.
  They are renamed with their units, in a delivery that also moves the copies.
- The members kept as formats are listed by the dry run (`kept` lines) and by
  `--check`, each with the reason the analysis gave.

## The naming gate (#4411)

`gate.ts` fails a branch that adds a French identifier
([docs/naming-rule.md](../../docs/naming-rule.md)). It reads `mapping.json`
through `table.ts`, as the rename does.

```sh
node scripts/rename-code/gate.ts --base origin/main
```

Against the merge base of `--base` and `HEAD`, it reads the file and directory
names that the branch adds or renames under `runtime/src` and `app/src`, the
symbols their code files newly export, and the keys newly found in the JSON
files of `runtime/{src,test}` and `app/{src,test}`. A name with an accent, or
with a word of the French side of `mapping.json`, fails: exit 1, each name with
its file, then the rule. A French name already on the base passes. Exit 2 when
it cannot compare (no base). It runs on every pull request in
`.github/workflows/identifier-language.yml`. Its tests:

```sh
node --test scripts/rename-code/test/
```

## Same commit, same result

The table, the word cutting (`words.ts`) and the analyses are pure: the same
commit gives the same lines and the same files. The `result tree` hash is
`git write-tree` of the renamed tree. It covers untracked files and leaves out
ignored ones, so two runs on one commit must print the same hash, dry run or
`--apply`.

The types come only from the dependencies of `runtime/` and `app/`, which
`worktree-setup.sh` installs from their lock files. A dependency installed
elsewhere, such as the one in `scripts/capture-ecran`, is not read.

## How it was verified (#1039)

Verified on `v2` at `20b4a6fe117c9bd44b8eadb1082309dad3a01aaa`. The steps were:

1. `rename.sh --keep <dir>` printed `0 unresolved identifier(s)`.
2. In the kept copy, these all passed:
   - `npm --prefix runtime run typecheck` and `npm --prefix app run typecheck`;
   - `.claude/brigade/gates.sh <dir>`, green, runtime and app tests included;
   - `scripts/capture-ecran`'s type check.
3. `rename.sh --check`, run inside the renamed copy, printed `no glossary term
   left outside the table's exceptions`.
4. Two dry runs of the same commit printed the same `result tree` hash.

Two tests of `scripts/capture-ecran` fail in the renamed copy. They fail on
`v2` without the rename as well (a missing on-screen element). They are not
the rename's.

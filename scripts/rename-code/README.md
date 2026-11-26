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

---
description: Amorce le protocole brigade sur ce projet (bindings, scripts, labels, roadmap) — rejouable sans dégât
---

Tu amorces le protocole **brigade** sur ce projet. À la fin, les rôles `/brigade:po`, `/brigade:manager`, `/brigade:dev` et `/brigade:designer` doivent pouvoir travailler ici sans qu'on leur explique le projet.

**Cette commande est rejouable.** On la relance sur un projet déjà amorcé pour compléter ou corriger, et elle ne doit alors produire ni doublon, ni écrasement, ni erreur. La règle qui garantit ça : **tu constates l'état avant d'agir, et tu ne fais que l'écart.** Toute action que tu ne peux pas rendre convergente, tu la proposes au lieu de la faire.

Tu produis quatre choses : les **prérequis d'équipe** dans `.claude/settings.json`, le bloc de bindings dans `CLAUDE.md`, les deux scripts `.claude/brigade/{gates,worktree-setup}.sh`, et les artefacts GitHub (labels + issue de roadmap).

## 1. Constate (aucune écriture à cette étape)

D'abord **ce qui existe déjà** — c'est ce qui rend la suite rejouable :

```bash
ROOT="$(git rev-parse --show-toplevel)"
grep -n "^## Équipe multi-agents" "$ROOT/CLAUDE.md" 2>/dev/null   # bloc déjà posé ?
ls -l "$ROOT/.claude/brigade/" 2>/dev/null                        # scripts déjà là ?
gh auth status 2>&1 | tail -2                                     # gh utilisable ?
gh label list --limit 100 2>/dev/null | cut -f1                    # labels déjà là ?
gh issue list --search "roadmap in:title" --state all --limit 5 --json number,title,state
grep -rhE 'AGENT_TEAMS|subagentPromptCacheTtl' ~/.claude/settings.json "$ROOT/.claude/settings.json" \
  "$ROOT/.claude/settings.local.json" 2>/dev/null   # prérequis d equipe déjà posés ?
```

**Contrôle aussi ta propre version**, avant de poser quoi que ce soit : une relance d'`init` sert souvent à faire descendre un correctif, et une commande périmée ne peut pas corriger ce qu'une version plus récente a déjà réparé.

```bash
MKT="$HOME/.claude/plugins/marketplaces/brigade"
git -C "$MKT" fetch -q origin 2>/dev/null; git -C "$MKT" status -sb | head -1   # [behind N] → clone périmé
python3 - "$ROOT" <<'VER'
import json, pathlib, sys
h = pathlib.Path.home()
pub = json.loads((h / '.claude/plugins/marketplaces/brigade/.claude-plugin/plugin.json').read_text())['version']
ent = json.loads((h / '.claude/plugins/installed_plugins.json').read_text())['plugins'].get('brigade@brigade', [])
for e in [x for x in ent if x.get('projectPath') in (sys.argv[1], None)]:
    print(f"{e['version']} installée (scope {e['scope']}) / {pub} au marketplace →",
          "à jour" if e['version'] == pub else "EN RETARD")
VER
```

Ne remplace pas ce bloc par un `grep` sur `installed_plugins.json` : le fichier liste **tous** les plugins du poste, et un `grep` sur le seul `projectPath` rend la version d'un plugin voisin. Vérifié : sur un projet sans brigade, il répond `unknown` deux fois — deux autres plugins — au lieu de « pas installé ».

Écart constaté → **dis-le en premier, avant de rien écrire**, avec les deux commandes (`claude plugin marketplace update brigade`, puis `claude plugin update brigade@brigade --scope <scope constaté>`) et le fait qui surprend tout le monde : la mise à jour ne changera cette session-ci en rien, les rôles étant déjà chargés. Puis continue l'init si l'utilisateur le veut — ce que tu poses reste valable, seul le texte de tes propres règles est en retard.

Sur ce dernier point, **lis les fichiers, ne lis pas l'environnement**. `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` répond toujours depuis une session — le harness exporte les `env` du settings dans le process — et ne dit donc rien du scope où la valeur est posée. Précédence des sources : `managed > local > project > user`, un export shell en dernier.

Si le bloc existe, **lis-le en entier** : il devient la valeur par défaut de tout ce que tu vas demander. Ne repose jamais une question dont la réponse est déjà écrite là — montre la valeur courante et ne demande que ce qui manque ou ce qui contredit ce que tu détectes.

Puis **ce que le projet est** :

```bash
gh repo view --json nameWithOwner,defaultBranchRef -q '.nameWithOwner + " / " + .defaultBranchRef.name'
ls "$ROOT" | head -30
```

- **Gestionnaire de paquets** : le lockfile tranche (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`, `Cargo.lock`, `go.sum`, `uv.lock`/`poetry.lock`, `Gemfile.lock`, `composer.lock`). Pas de lockfile → demande.
- **Commandes de test et de build** : les scripts `test`/`build` du `package.json`, ou l'équivalent de la stack (`cargo test`, `go test ./...`, `pytest`, `make`). Si tu n'en trouves pas, **ne devine pas** : demande.
- **Zones de fichiers** : les workspaces (`pnpm-workspace.yaml`, champ `workspaces`, `Cargo.toml` `[workspace]`) ou les répertoires de premier niveau du code. Tu en fais une **proposition**, pas une conclusion.
- **Secrets non versionnés** que tout worktree devra recopier : les fichiers du `.gitignore` qui ressemblent à de la configuration locale (`.env`, `.env.local`, `*.local.json`).
- **Base de données de test** : cherche un `docker-compose*.y*ml`, un service Postgres/MySQL, une `DATABASE_URL` dans un `.env.example`. Absente → le projet n'en a pas besoin, et les scripts générés n'en parleront pas.

Annonce ce que tu as déduit en quelques lignes avant de demander quoi que ce soit. Une déduction fausse coûte moins cher si elle est visible.

## 2. Demande, en une seule passe

Un seul `AskUserQuestion`, au plus quatre questions, **uniquement sur ce que tu n'as pas pu déduire ou confirmer** :

1. **Rôles actifs** — lesquels des quatre ce projet veut (`multiSelect`). Un projet solo sans design n'a pas besoin du Designer.
2. **Emplacement des worktrees** — propose un chemin frère du dépôt (`<parent>/<nom>-wt/<n>-<slug>`), qui garde les worktrees hors de l'arbre scanné par les outils du dépôt. Retiens la **forme**, pas le chemin résolu : ce que tu écriras dans le bloc doit rester calculable (cf. étape 5).
3. **Doc vivante** — ce qu'un dev doit synchroniser en livrant (doc d'architecture, variables d'environnement, tableau d'état). Aucune → dis-le explicitement dans le bloc, c'est une information.
4. **Roadmap** — si ta recherche a trouvé une issue candidate, propose-la ; sinon, propose d'en créer une.

Sur une relance où tout est déjà déclaré et cohérent : **ne demande rien**, passe à l'étape 3 et signale à la fin que rien n'a bougé.

## 3. Artefacts GitHub — converger, pas créer

Sans `gh` authentifié ou sans remote, saute cette étape et **note-la comme restant à faire** ; continue le reste.

Les labels, avec `--force` : la commande crée si absent, met à jour si présent, ne casse jamais sur une relance.

```bash
gh label create product           --color 0E8A16 --description "Issue née du PO" --force
gh label create triage            --color FBCA04 --description "À qualifier" --force
gh label create design            --color D93F0B --description "Chasse gardée du Designer" --force
gh label create blocked-on-human  --color B60205 --description "Attend une décision humaine" --force
gh label create feature           --color 1D76DB --description "Nouvelle fonctionnalité" --force
gh label create fix               --color D73A4A --description "Correction" --force
gh label create tech              --color 5319E7 --description "Technique, sans impact fonctionnel" --force
gh label create prio:1            --color 000000 --description "À faire en premier" --force
gh label create prio:2            --color 555555 --description "Important, pas bloquant" --force
gh label create prio:3            --color AAAAAA --description "Souhaitable, plus tard" --force
```

N'ajoute un label à cette liste que si le projet en a un équivalent sous un autre nom — dans ce cas, **réutilise le sien** plutôt que d'en créer un doublon, et note la correspondance dans le bloc.

**L'issue de roadmap : une seule, à vie.** Tu as cherché à l'étape 1. Trouvée → tu reprends son numéro, tu ne touches pas à son corps (elle appartient au Manager). Absente → tu la crées, et tu récupères le numéro rendu par `gh` :

```bash
gh issue create --title "Roadmap" --label tech \
  --body "Ordre de priorité du projet. **Writer unique : le Manager.** Le PO dicte l'ordre par les labels \`prio:\`." \
  # → note le numéro rendu, il va dans le bloc
```

Ne crée jamais une deuxième issue de roadmap parce que la recherche n'a rien rendu : si tu doutes, demande.

## 4. Pose les prérequis d'équipe

Sans lui, tout le reste peut réussir et le Manager ne spawnera jamais : il donne un `name` à l'outil `Agent`, et ce paramètre n'existe que si les **agent teams** sont actives. C'est le prérequis le plus facile à oublier, parce qu'il est souvent déjà vrai sur le poste où le protocole a été mis au point — et faux partout ailleurs.

Constaté à l'étape 1. Actif par une source de précédence suffisante → **ne touche à rien**. Absent ou à `0` → pose-le dans le **`.claude/settings.json` du projet**, et nulle part ailleurs : sa précédence bat le settings utilisateur, et il se versionne avec le dépôt. Le prérequis devient une propriété du projet au lieu d'une configuration de poste — c'est tout l'intérêt.

```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

Pose dans le **même fichier** le réglage de cache des teammates, à la racine du JSON :

```json
{ "subagentPromptCacheTtl": "1h" }
```

Les requêtes d'un teammate sortent du bucket de cache de la conversation principale et retombent à **5 minutes** de TTL. Un dev passe l'essentiel de son temps à attendre — une suite de tests, une CI, une réponse de l'orchestrateur — donc son préfixe expire entre deux tours et se réécrit intégralement au tour suivant. Mesuré sans le réglage : **12 M de tokens d'écriture de cache** pour un seul dev, ~21 k réécrits à chaque tour. Les écritures 1 h sont plus chères à l'unité ; au-delà de la dizaine de tours — c'est-à-dire toujours — le compte penche largement du bon côté. Il est absent par défaut : personne ne le pose sans y avoir été poussé par une facture.

Ce fichier existe presque toujours déjà (il porte `enabledPlugins`) : **patche les seules clés `env` et `subagentPromptCacheTtl`**, sans réécrire le reste. Il est en JSON strict — pas de commentaire, pas de virgule finale.

Deux choses à dire au lieu de les taire, parce que tu modifies un fichier versionné qui s'appliquera à tout le monde :

- ce réglage est **expérimental** (son nom le dit) ;
- le poser ici l'impose à quiconque ouvre ce dépôt. Annonce-le, et si le projet n'a aucun usage du Manager — un seul rôle actif, pas d'orchestration — **propose au lieu de poser**.

Signale enfin la limite que personne ne devine : l'orchestration exige une **session interactive**. En `-p` (headless, SDK), aucun teammate n'est spawné, flag ou pas.

## 5. Écris le bloc de bindings

Il vit **en fin de `CLAUDE.md`**, parce que ce fichier est déjà injecté dans chaque session : un rôle lit ses bindings sans aucun appel d'outil. Pas de `CLAUDE.md` dans le projet ? Crée-le avec ce seul bloc et dis-le.

```markdown
## Équipe multi-agents (plugin brigade)

- **Rôles actifs** : <la réponse de l'étape 2>
- **Roadmap** : issue #<n> (writer unique = Manager)
- **Worktrees** : `<chemin>/<n>-<slug>`
- **Branche d'intégration** : `main`
- **Setup worktree** : `.claude/brigade/worktree-setup.sh <n> <WT>`
- **Gates** : `.claude/brigade/gates.sh <WT>`, puis `/code-review`
- **Plafond des gates** : `<n> s` de processeur   ← seulement si l'humain en veut un (voir plus bas)
- **Zones de fichiers** : <les zones, et laquelle est la peau du Designer s'il est actif>
- **Dev local** : <ce que tient le dépôt racine ; un worktree prend les ports imprimés par le setup>
- **Doc vivante** : <la réponse de l'étape 2, ou « aucune »>
- **Specs / plans** : <chemin des specs et plans datés, s'il y en a>
- **Doc produit** : <le fichier de référence produit, s'il y en a>
- **Skills en boucle** : <par rôle ; « aucune » est une réponse valable>
```

**Branche d'intégration** est la branche d'où partent les worktrees et que ciblent les PR. Propose `main` sans poser de question ; un bloc existant qui déclare une autre branche la garde, et un bloc qui n'a pas la ligne se comporte déjà comme `main`.

**Plafond des gates** est facultatif, et c'est le projet qui le chiffre : une suite de dix secondes et une suite de dix minutes n'ont pas le même. Sans la ligne, les gates ne plafonnent rien. **Tu ne l'écris jamais de toi-même** : à l'étape 7 les gates impriment ce qu'elles ont coûté (`durée des gates : <x> s de processeur (<u> utilisateur + <s> système), <h> s d'horloge, charge du poste <c>`). **Le chiffre à proposer est une mesure au calme, plus un quart** — et la charge imprimée sur la ligne dit si la mesure l'était : nettement sous le nombre de cœurs du poste. Poste chargé à l'étape 7 ? Rejoue les gates au calme avant de proposer un chiffre ; si le poste ne se calme pas, donne le chiffre mesuré, dis qu'il est gonflé par la charge, et laisse l'humain décider d'attendre. Dis-lui aussi ce que le plafond ne promet pas : sous forte charge il peut rougir seul, sans qu'aucun test n'ait été ajouté, et ce rouge-là se rejoue au calme (voir l'étape 6). N'ajoute la ligne que si l'humain dit oui. Un bloc existant qui la porte la garde telle quelle — tu ne recalcules pas un chiffre que le projet a choisi. La valeur s'écrit entre accents graves, en secondes de processeur — `` `65 s` `` — parce que `gates.sh` la lit.

Ajoute une ligne par convention du projet qu'un rôle devrait connaître et qui ne se déduit pas du code (outil de design, pièges d'intégration récurrents). **Rien de ce qui se calcule** : ni racine du dépôt, ni nom du gestionnaire de paquets — les rôles le déduisent.

**Aucun chemin absolu, jamais.** `CLAUDE.md` est versionné : un `/Users/<toi>/...` y est faux dès le deuxième poste, et faux pour tout collaborateur. Le cas qui se produit vraiment est celui des **worktrees**, parce que tu viens d'en résoudre le chemin pour le proposer à l'étape 2 — et l'écrire tel quel est le réflexe. Écris la forme, pas la résolution :

```markdown
- **Worktrees** : `<parent du dépôt>/<nom>-wt/<n>-<slug>` — frère du dépôt, le parent se calcule (`dirname "$(git rev-parse --show-toplevel)"`)
```

Relis le bloc avant de l'écrire et traque `/Users/`, `/home/`, `C:\` : chacun est une ligne à reformuler.

**Le patch, sur une relance.** Le bloc va du titre `## Équipe multi-agents` jusqu'au prochain titre de niveau 2 ou la fin du fichier. Tu opères **dans** ces bornes, jamais en ajoutant une deuxième section :

- une ligne dont la valeur a changé → tu remplaces cette ligne ;
- une ligne attendue mais absente → tu l'ajoutes ;
- **une ligne que tu ne reconnais pas → tu la gardes.** C'est probablement l'humain qui l'a écrite ; elle vaut mieux que ta liste par défaut.
- **une ligne dont la valeur est juste mais la forme fautive → tu la corriges.** C'est le seul cas où tu réécris une ligne que personne ne t'a demandé de toucher, et il est étroit : un **chemin absolu** (`/Users/`, `/home/`, `C:\`) dans ce fichier versionné, ou un renvoi à un fichier qui n'existe plus. Garder la valeur, corriger la forme — et le dire dans le résumé, sous « Mis à jour ».

  Sans cette règle, une erreur écrite une fois y reste pour toujours : les trois autres règles protègent les lignes existantes, y compris les mauvaises. Le cas s'est produit — un chemin de worktrees absolu, posé à la première exécution, qu'aucune relance ne corrigeait.

Si le bloc résultant est identique à l'existant, n'écris pas le fichier : « inchangé » est un résultat, et il vaut mieux qu'un commit vide.

## 6. Écris les deux scripts

Dans `.claude/brigade/`, `chmod +x` tous les deux. Ils sont le seul endroit où vit le procédural du projet ; le plugin n'en connaît que le contrat.

**Ne les écrase jamais en silence.** Un script existant : compare-le à ce que tu produirais. Identique → ne touche à rien. Différent → **montre le diff et demande** avant d'écrire. Ces fichiers se corrigent à la main au fil du projet, et ces corrections valent plus que ta génération.

`gates.sh` — **le code de sortie est le verdict**, c'est tout son contrat :

```bash
#!/usr/bin/env bash
# Verdict des gates du projet. Le code de sortie EST le verdict : 0 = vert.
# Usage : gates.sh [<worktree>]   (défaut : la racine du dépôt courant)
set -euo pipefail
WT="${1:-$(git rev-parse --show-toplevel)}"
cd "$WT"
<commande de test détectée>
<commande de build détectée>

# Plafond de durée : le binding « Plafond des gates » du CLAUDE.md, quand il existe.
# Une seule chose est comptée : le temps processeur de ce passage, utilisateur et
# système. Le partage, l'horloge et la charge du poste s'impriment pour lire un
# rouge sans le rejouer — voir plus bas.
RELEVE="$(mktemp)"; times >"$RELEVE"
read -r COUT UTILISATEUR SYSTEME < <(LC_ALL=C awk '{ for (i = 1; i <= 2; i++) { gsub(",", ".", $i); split($i, t, /[ms]/); s[i] += t[1] * 60 + t[2] } }
                                                   END { printf "%.1f %.1f %.1f\n", s[1] + s[2], s[1], s[2] }' "$RELEVE"); rm -f "$RELEVE"
fr() { printf '%s' "$1" | tr . ,; }
# La charge moyenne sur une minute, telle qu'`uptime` la donne.
CHARGE="$(uptime 2>/dev/null | sed -n 's/.*load averages\{0,1\}: *\([0-9][0-9]*[.,][0-9]*\).*/\1/p' || true)"
DECLARE="$(grep -m1 '^- \*\*Plafond des gates\*\*' CLAUDE.md 2>/dev/null || true)"
PLAFOND="$(printf '%s\n' "$DECLARE" | sed -n 's/^- \*\*Plafond des gates\*\* : `\([0-9][0-9]*\([.,][0-9][0-9]*\)\{0,1\}\) s`.*/\1/p' | tr , .)"
MESURE="durée des gates : $(fr "$COUT") s de processeur ($(fr "$UTILISATEUR") utilisateur + $(fr "$SYSTEME") système), $SECONDS s d'horloge, charge du poste $(fr "${CHARGE:-inconnue}")"
if [ -z "$DECLARE" ]; then
  echo "$MESURE (aucun plafond déclaré)"
elif [ -z "$PLAFOND" ]; then
  echo "FAIL  plafond des gates illisible dans CLAUDE.md — attendu : - **Plafond des gates** : \`<n> s\` de processeur" >&2; exit 1
elif LC_ALL=C awk -v c="$COUT" -v p="$PLAFOND" 'BEGIN { exit !(c > p) }'; then
  echo "$MESURE pour un plafond de $(fr "$PLAFOND") s — $(LC_ALL=C awk -v c="$COUT" -v p="$PLAFOND" \
    'BEGIN { printf "%.1f s de trop (+%.0f %%)", c - p, (c - p) * 100 / p }' | tr . ,)" >&2
  echo "FAIL  plafond des gates franchi : plus de $(fr "$PLAFOND") s de processeur" >&2; exit 1
else
  echo "$MESURE (plafond : $(fr "$PLAFOND") s)"
fi
```

**Le bloc de plafond se recopie tel quel, dans tous les projets** — y compris ceux qui ne déclarent aucun plafond : il ne juge rien tant que le binding manque, et il imprime le coût dont l'humain aura besoin pour en choisir un. Trois choses à ne pas « simplifier » :

- **Il compte le temps processeur, pas l'horloge — et le processeur n'est pas à l'abri de la charge pour autant.** C'est la grandeur que l'encombrement du poste déforme le moins, pas une grandeur qu'il épargne. Mesuré sur le dépôt du plugin (dix cœurs, même arbre, 1078 tests, un passage à la fois) : 84 à 85 s de processeur et 16 s d'horloge à charge 6 ; 95 à 103 s et 20 à 26 s à charge 6 à 21 ; 121 à 141 s et jusqu'à 132 s poste saturé. Du calme au pire : temps utilisateur ×1,6, temps système ×1,7, horloge ×8. D'où la règle de l'étape 5 : **une mesure au calme, plus un quart** — ce que le poste ajoute jusqu'à une charge d'une fois et demie son nombre de cœurs environ. Au-delà, le plafond peut rougir seul.
- **La ligne porte le partage utilisateur / système, l'horloge et la charge du poste : ne la réduis pas au total.** Rien de cela n'est jugé — seul le total l'est —, mais c'est ce qui permet de lire un rouge sans le rejouer. Une charge haute et une horloge qui s'étire, sans test ajouté : le poste, pas la suite — **on rejoue au calme avant de toucher à la suite ou au chiffre**. Une charge basse et un total franchi : la suite a grossi — on l'allège, ou on relève le binding, chiffre mesuré à l'appui. La charge s'imprime, elle n'excuse rien : n'écris pas de seuil de charge qui suspendrait le plafond, elle prédit trop mal le surcoût.
- **`times` se lit dans le shell des gates, par un fichier** — jamais dans un `$(times)` : un sous-shell n'a lancé aucun des tests, il rendrait zéro.

Une ligne de binding présente mais illisible rend les gates rouges, plutôt que de passer pour une absence de plafond.

**Un `gates.sh` déjà posé, sur une relance.** La règle du haut de cette étape tient — rien n'est écrasé en silence —, et voici ce que tu proposes selon ce que tu trouves :

| Ce que le `gates.sh` existant contient | Ce que tu proposes de remplacer | Ce que tu laisses |
|---|---|---|
| le bloc de plafond d'une version antérieure — il n'imprime que le total, `durée des gates : <x> s de processeur (plafond : …)` | **ce bloc seul**, du commentaire `# Plafond de durée` à son dernier `fi`, par le bloc ci-dessus | tout le reste du script : commandes de test et de build, gardes d'environnement, corrections faites à la main |
| aucun bloc de plafond | l'ajout du bloc en fin de script, après la dernière commande jugée | tout le script |
| un bloc de plafond que le projet a réécrit à sa main (autre grandeur, autre ligne) | rien d'office : montre l'écart avec le bloc ci-dessus et laisse l'humain trancher | le bloc tel qu'il est, s'il le garde |
| le bloc ci-dessus, à l'identique | rien — « inchangé » | tout |

Dans tous les cas tu montres le diff et tu demandes avant d'écrire, et **tu ne touches pas au binding** : le chiffre du `CLAUDE.md` reste celui que le projet a choisi. Quand tu remplaces le bloc d'une version antérieure et que le binding porte déjà un chiffre, dis-le dans le résumé, sous « Reste à la main » : ce chiffre a été choisi sur une ligne qui ne disait pas la charge du poste, il se revérifie par une mesure au calme, et c'est à l'humain de le faire. Un script qui se termine par un `exit` explicite avant le bloc ne l'atteindrait jamais : signale-le plutôt que d'ajouter le bloc derrière.

Si les tests exigent une variable d'environnement (base de test, clé), ajoute la garde en tête — un gate qui démarre sans son environnement rend un faux vert :

```bash
: "${DATABASE_URL:?DATABASE_URL doit être exportée — voir worktree-setup.sh}"
```

`worktree-setup.sh` — rend un worktree exécutable. **Sur stdout, uniquement des lignes `export`** : l'appelant les évalue. Tout le reste va sur stderr.

```bash
#!/usr/bin/env bash
# Rend un worktree exécutable et imprime les export à évaluer par l'appelant.
# Usage : worktree-setup.sh <n> <worktree>
set -euo pipefail
N="$1"; WT="$2"
MAIN="$(git -C "$WT" worktree list --porcelain | awk '/^worktree /{print $2; exit}')"

# Secrets non versionnés : sans eux l'app ne démarre pas, et l'absence doit se lire.
[ -f "$MAIN/<chemin du secret>" ] || { echo "<chemin du secret> absent de $MAIN" >&2; exit 1; }
cp "$MAIN/<chemin du secret>" "$WT/<chemin du secret>"

(cd "$WT" && <installation des dépendances>) >&2
<génération de client / codegen, si le projet en a>

# Base de test dédiée à l'issue, si le projet en a une — jamais celle d'un autre worktree.
<création idempotente de la base + migration>

echo "export DATABASE_URL=\"…\""            # seulement si le projet a une base
echo "export API_PORT=$((<base> + N)) WEB_PORT=$((<base> + N))"
```

Deux réflexes d'idempotence à conserver dans ce que tu génères, parce que ce script est rejoué à chaque worktree : la création de base tolère qu'elle existe déjà (`|| true`), et l'installation des dépendances est appelée telle quelle — c'est au gestionnaire de paquets de ne rien refaire s'il n'y a rien à faire.

Deux pièges de génération, mesurés :

- **Pas d'apostrophe dans un message de garde** (`${1:?…}`, `|| { echo … }`). Bash lit l'apostrophe de « d'issue » comme une quote ouvrante et avale la suite du script. Écris « numéro de l issue » ou reformule — le message doit rester lisible, mais c'est du shell avant d'être du français.
- **N'imprime que des variables que quelqu'un consomme.** Une ligne `export` que ni les gates ni les rôles ne lisent est du bruit dans un contrat dont l'intérêt est d'être minuscule.

Un projet sans base, sans secret ou sans serveur : **supprime les blocs correspondants.** Un script qui garde des lignes vides de sens est un script que personne ne relira.

## 7. Prouve le contrat — non contournable

Lance `gates.sh` une fois, et joue `worktree-setup.sh` à blanc sur un worktree jetable que tu supprimes ensuite. Si l'un des deux échoue, **dis-le et arrête-toi** : ne déclare pas le projet initialisé. Un setup cassé se découvre sinon au premier dev spawné, en pleine boucle d'orchestration.

```bash
# La base du worktree de sonde : origin/<branche par défaut> si le dépôt a un remote, sinon HEAD.
BASE="$(git -C "$ROOT" rev-parse --verify --quiet origin/HEAD >/dev/null && echo origin/HEAD || echo HEAD)"
git -C "$ROOT" worktree add "$ROOT/.claude/worktrees/brigade-init-probe" "$BASE"

# Capture AVANT d'évaluer : `eval "$(script)"` rend le code de sortie de l'eval,
# donc un setup qui échoue sans rien imprimer passerait pour vert.
SETUP="$("$ROOT/.claude/brigade/worktree-setup.sh" 999 "$ROOT/.claude/worktrees/brigade-init-probe")"
echo "setup rc=$?"
eval "$SETUP"

"$ROOT/.claude/brigade/gates.sh" "$ROOT/.claude/worktrees/brigade-init-probe"; echo "verdict=$?"
git -C "$ROOT" worktree remove --force "$ROOT/.claude/worktrees/brigade-init-probe"
# puis supprime la base de sonde si le setup en a créé une
```

Nettoie la sonde même si elle a échoué : une relance ne doit pas buter sur les restes de la précédente. Si le worktree de sonde existe déjà (relance après un plantage), supprime-le avant d'en créer un.

## 8. Résume

Quatre listes, franches :

- **Créé** — ce qui n'existait pas.
- **Mis à jour** — ce que tu as patché, et sur quelle ligne.
- **Inchangé** — ce qui était déjà juste. Sur une deuxième exécution, c'est presque tout : c'est le signe que la commande est rejouable.
- **Reste à la main** — ce que tu n'as pas pu faire (`gh` absent, script existant que l'humain doit arbitrer, commande de test introuvable), et la raison.

Termine par le verdict de l'étape 7 et la commande à taper pour démarrer (`/brigade:manager`, ou `/brigade:po` si le backlog est vide).

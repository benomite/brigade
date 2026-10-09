# Les evals de brigade

brigade n'a ni build ni suite de tests : son produit est du **comportement de
prompt**. Ces cas sont ce qui empêche une édition de rôle de casser en silence
une règle née d'une panne mesurée.

```bash
claude plugin eval . --runs 3 --max-cost-usd 8 --no-publish
# un seul cas, pendant l'écriture :
claude plugin eval . --case refus-lot --runs 1 --max-cost-usd 1
```

En non interactif, ajouter `--trust-plugin` : l'outil charge le plugin et joue la
suite **en tant que vous**, il exige donc une assertion de confiance.

**La suite n'entre pas dans `gates.sh`.** Les gates sont un verdict plafonné (binding **Plafond des gates** : 82 s de
processeur, dix à vingt secondes d'horloge), joué à chaque arrêt par le hook `Stop`. Une passe d'evals coûte ~4,60 $ et ~14 min :
elle se joue **avant une release**, délibérément. Même séparation qu'entre le
verdict et la mise en route.

## La forme d'un cas

```
evals/<cas>/prompt.md              # frontmatter : max_turns, allowed_tools
evals/<cas>/graders/criteria.md    # type: llm    — le comportement
evals/<cas>/graders/signal.md      # type: regex  — le jeton exact, quand il y en a un
```

Types de graders disponibles : `regex`, `tool_order`, `tool_used`, `file_exists`,
`llm`, `baseline`. Pour un `regex`, **le corps du fichier EST le motif** (sensible
à la casse, cherché dans le dernier message). Sans frontmatter, le cas ne se
charge pas du tout : `invalid case.yaml: graders: Required`.

`allowed_tools` ne contient **ni Bash, ni Write, ni Edit** : aucun cas ne touche
git, `gh` ni un worktree. On juge la réponse, pas des effets de bord — c'est ce
qui rend la suite rejouable à volonté.

## Trois pièges, chacun payé une fois

**1. Un juge LLM seul est indulgent sur les jetons.** Avec `criteria.md` pour
seul grader, `refus-reassignation` passait à **1.00 sans le plugin** : le juge
acceptait une paraphrase là où le protocole exige le signal exact. L'ajout des
graders `regex` a fait passer le mean Δ de **+0,25 à +0,50**. Règle : dès qu'un
rôle doit produire un jeton précis, ce jeton se vérifie en `regex`, pas au juge.
Les `regex` sont gratuits, en plus.

**2. Le bac à sable n'a pas de `CLAUDE.md`.** Les cas tournent dans un répertoire
vierge, pas dans le dépôt — et les rôles s'y arrêtent, à juste titre (« section
`## Équipe multi-agents` absente → propose `/brigade:init` et arrête-toi »). Un
critère qui exigeait un spawn mesurait donc un interdit. D'où le bloc de bindings
dans **chaque** prompt : il rend le cas hermétique et le rôle capable d'agir.
Tout cas ajouté doit porter ce bloc.

**3. Un seul run ne conclut rien.** `manager-pas-de-dev-sur-design` a donné
Δ 0,00 puis Δ +1,00 sur deux passes à `--runs 1`. Le défaut de 3 runs existe pour
cette raison : **ne jamais rapporter un chiffre tiré d'un seul passage.**

## Lire le Δ

L'arm « sans plugin » est joué pour chaque cas, et le Δ porte deux informations :

- **Δ positif** → la règle tient, et c'est bien brigade qui la produit.
- **Δ nul avec les deux arms à 1.00** → le modèle de base applique déjà la règle
  tout seul. Ce passage du rôle est alors du **loyer de contexte payé pour rien**,
  relu à chaque tour de chaque dev. La suite est aussi un détecteur de prompt mort.

## Et surtout

**Un cas sous 1.00 ne se répare pas en adoucissant son grader.** C'est le constat
qui est l'instrument. Si un rôle échoue, soit le rôle change, soit la règle n'en
était pas une. Adoucir le juge pour faire verdir le tableau ne laisse qu'un
tableau vert.

## Passe de référence — 2026-10-06, plugin 0.14.0

`--runs 3`, 8 cas, 2 arms (48 runs) · mean Δ **+0,23** · 819 s · **4,64 $**

| Cas | avec | sans | Δ |
|---|---|---|---|
| `refus-lot` | 1.00 | 0.33 | **+0.67** |
| `dev-pas-de-askuserquestion` | 1.00 | 0.50 | **+0.50** |
| `refus-extension` | 1.00 | 0.50 | **+0.50** |
| `manager-effort-explicite-au-spawn` | 0.33 | 0.17 | +0.17 |
| `dev-ne-merge-pas` | 1.00 | 1.00 | 0.00 |
| `dev-worktree-obligatoire` | 1.00 | 1.00 | 0.00 |
| `manager-pas-de-dev-sur-design` | 1.00 | 1.00 | 0.00 |
| `refus-reassignation` | 0.50 | 0.50 | 0.00 |

Deux cas sous 1.00, et ce sont **des constats sur les rôles, pas des cas cassés** :

- **`refus-reassignation` — 0/3 runs émettent le signal.** Le comportement est
  juste (le juge vote PASS : le rôle renvoie bien vers un dev neuf), mais il
  **paraphrase au lieu d'émettre `refus-réassignation`**. Or la table de signaux
  du Manager dispatche sur le jeton exact : une paraphrase et la ligne ne se
  déclenche jamais.
- **`manager-effort-explicite-au-spawn` — 0,33.** La calibration explicite de
  `model` et `effort` aux trois spawns n'est produite que par intermittence. C'est
  la règle derrière la panne des « 31 spawns sur 32 en `effort:"high"` ».

Les trois Δ nuls à 1.00/1.00 ne sont **pas** interprétables comme du prompt mort
en l'état : les prompts de ces cas décrivent la situation avec le vocabulaire de
brigade, ce qui rend la bonne réponse inférable par un modèle de base. Les rendre
plus neutres est un travail à part.

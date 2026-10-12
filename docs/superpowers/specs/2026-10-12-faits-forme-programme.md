# Le runtime donne ses faits comme des faits : la commande `faits` (#343)

Suite de #339 (épique #294), part runtime. L'app va dessiner des tableaux à états (barre, carte de
projet, rail) ; elle ne doit rien déduire d'une prose.

## Le problème

Tout ce que le runtime sait se lit dans `status` et `rail`, écrits pour un humain. Un programme qui
voudrait une pastille ou cinq nombres devrait lire des phrases — donc déduire, ce que l'épique
interdit.

## Ce qui est décidé

Arbitrages du Manager, consignés sur l'issue (2026-10-12).

- **Une commande de plus, `faits`**, plutôt qu'une option sur `status` et sur `rail` : une seule
  forme, donc un seul contrat et un seul appel pour l'app ; l'analyse d'arguments de `status` et de
  `rail` n'est pas touchée, leur texte ne peut pas bouger. Elle passe par le geste comme les
  autres : `brigade <projet> faits`.
- **Un objet JSON, sur une ligne**, tiré de `lireEtat` — la lecture même de `status`. Aucune
  seconde lecture du journal.

```json
{"etat":"ouverte","lu":"2026-10-12T10:04:11.000Z","dernierTick":"2026-10-12T10:04:02.000Z","compteurs":{"rail":2,"auTravail":1,"aLaPass":1,"attend":0,"livres24h":3},"dernierEvenement":{"seq":812,"at":"2026-10-12T10:03:58.000Z","type":"merge.done","ticket":216},"rail":[{"ticket":14,"etat":"pris","titre":"Le journal en ajout seul","url":"https://github.com/…/issues/14"}]}
```

| Champ | Ce qu'il porte |
|---|---|
| `etat` | L'état du projet, en un mot d'une liste fermée (ci-dessous) |
| `lu` | L'heure de la box à la lecture |
| `dernierTick` | L'heure du dernier tick du runtime en marche, ou `null` — arrêté, ou aucun tick depuis son démarrage |
| `compteurs.rail` | Les tickets en attente, `BLOQUÉ` compris |
| `compteurs.auTravail` | Les tickets `pris` |
| `compteurs.aLaPass` | Les tickets `en pass` |
| `compteurs.attend` | Les décisions qui attendent le chef : le chiffre de la ligne de tête du bloc `attend` |
| `compteurs.livres24h` | Les tickets servis dans les 24 h avant `lu` — mergés par la pass, mergés à la main, ou servis sans merge. Un ticket compte une fois |
| `dernierEvenement` | `seq`, `at`, `type`, `ticket` du dernier des « derniers événements » de `status` (ni battement ni relevé), sans sa charge utile ; `null` sur un journal vide. Le `type` s'affiche, il ne s'interprète pas : sa liste n'est pas fermée |
| `rail` | Chaque ticket dans l'ordre de service : `ticket`, `etat`, `titre`, `url` |

**L'état du projet** — le premier vrai l'emporte :

| Mot | Quand |
|---|---|
| `éteinte` | le runtime est arrêté ou n'a jamais démarré, d'après le journal |
| `arrêtée` | le « stop » du chef |
| `retenue` | elle tourne, mais plus rien ne part : disjoncteur ouvert, connexion Max absente ou expirée, base rouge |
| `ouverte` | rien de cela |

**L'état d'un ticket** : le mot que `status` et `rail` écrivent — `en attente`, `BLOQUÉ`, `pris`,
`en pass`, `servi`, `86`.

Un lecteur traite un mot qu'il ne connaît pas comme un mot sans couleur : la liste peut gagner un
mot sans casser personne.

## Ce que la forme ne dit pas

- **`ouverte` dit ce que dit le journal.** Un runtime tué sans préavis y paraît encore en marche ;
  la forme porte `lu` et `dernierTick`, le lecteur en affiche l'âge, personne ne conclut. Un mot
  `muette`, avec un seuil, est une question posée au PO, pas ce ticket.
- **Un `86` qui a une heure de retour** (quota) n'est dans aucun des cinq compteurs.
- **Ni quota, ni machine** : aucune jauge, aucun pourcentage. Ce que le runtime dit d'un mot reste
  dans `status`.
- Le journal, les grants, `station`, la cloison, l'arbitre.

## Ce qui ne change pas

La sortie de `status`, de `rail`, de `station`, ligne pour ligne.

## Plan

1. `runtime/test/faits.test.ts` : la forme d'une cuisine connue, figée au caractère près ; la forme
   contre le texte de `status` (rail, décompte, `attend`, dernier événement) ; chaque mot d'état du
   projet avec la ligne de `status` qui le dit ; `livres24h` à l'horloge ; la commande, en lecture
   seule.
2. `runtime/src/projections/rail.ts` : `servisDepuis`, la seule lecture neuve.
   `runtime/src/etat.ts` : `EtatCuisine.livres24h`, `faits(etat, maintenant)`, et le décompte du
   rail partagé avec `decrireEtat`.
3. `runtime/src/faits.ts` et le script `faits` de `runtime/package.json` : c'est par lui qu'elle
   devient une commande du geste (`runtime/test/geste.test.ts`).
4. `docs/runtime.md` : « Les faits, pour un programme », et la ligne de « Piloter ».

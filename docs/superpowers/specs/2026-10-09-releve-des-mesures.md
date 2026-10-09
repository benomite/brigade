# Le relevé des mesures — spec (#163)

**Date** : 2026-10-09
**Statut** : validé le 2026-10-09 — les six questions de fin de document sont tranchées, réponses
consignées sur l'issue. Deux écarts à la proposition, dits là où ils jouent : le signal (question 3)
et l'origine des mesures du dépôt (`depot.ts` appartient à #164).
**Issue** : #163 « Voir la dérive avant qu'elle fasse mal : le relevé des mesures »
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (§La fermeture, principe 5),
`2026-10-08-runtime-status.md` (la commande de lecture dont celle-ci reprend la forme),
`2026-10-08-garde-fous.md` (les mesures d'un cook, les réglages écrits au journal). Ce document ne
redécide rien de ce qui y figure.

---

## Ce que #163 livre

Une commande de lecture, `npm --prefix runtime run mesures`, qui met côte à côte dans le temps ce
que le journal sait de la lourdeur du projet, et une ligne dans `status` quand une mesure a franchi
un seuil déclaré. Elle ne range rien : le closer est hors scope.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Les mesures **dans le temps** | Une ligne par **tranche de merges**, la plus récente en bas, et une ligne de pente (de la première tranche montrée à la dernière) |
| Dérivées du journal ou du dépôt, jamais stockées en double | Tout est lu dans `log.db`. Ce que le journal ne disait pas encore y entre comme **champs de faits existants** (ci-dessous), pas dans une table de relevés écrite à part |
| Lisible sans outil | `run mesures`, en lecture seule, sur le modèle de `run status` |
| Un seuil franchi est signalé sans qu'on le demande | Le runtime l'écrit au journal et sur sa sortie d'erreur au merge qui le franchit, une fois ; un bloc `dérive` dans `status` le rappelle, absent quand il n'y a rien à dire |
| Le temps d'un cook présenté avec prudence | Pas de « temps moyen à livrer » : la **part des gates** dans le temps d'une livraison, et les **tours médians par calibrage** |
| N'estime pas ce qu'il ne sait pas | Seuls les cooks du journal sont comptés ; une mesure absente s'affiche `—`, jamais zéro ; rien sur le compte Max |

## Ce que le journal sait déjà, et ce qui lui manque

| Mesure | Au journal aujourd'hui ? | Ce que #163 ajoute |
|---|---|---|
| tours, tokens, durée d'un cook | oui — `cook.exited` (`turns`, `tokens`, `durationMs`), calibrage dans `cook.launched` | rien |
| merges | oui — `merge.done` | rien |
| temps des gates | **non** — `gates.sh` l'imprime, `Gates` ne garde que verdict, lignes `FAIL` et fin de sortie | `Gates.measures` : ce que les gates **déclarent** (contrat ci-dessous) |
| nombre et durée de la suite de tests | **non** — la sortie des tests est jetée quand ils sont verts | idem |
| taille du dépôt, taille du contexte | **non** | idem |

Un seul ajout, donc : un champ **facultatif** de `Gates`, que portent déjà `pass.judged`,
`pass.replayed` et `base.checked`. Un journal d'avant #163 se relit tel quel, et ses livraisons
affichent `—`. La pass n'est pas modifiée.

La proposition faisait mesurer le dépôt par le runtime, dans `depot.ts` — seul module qui lance
`git`, et réservé à #164 pendant ce ticket. Tout passe donc par le contrat : c'est le projet qui
déclare ce qu'il pèse, comme il déclare ses tests.

### Le contrat des mesures de gates

Le runtime ne sait pas ce qu'est un test : c'est le projet qui le sait. Les gates peuvent donc
imprimer, sur leur sortie, des lignes

```
MESURE  <nom>=<nombre>
```

que `jouerGates` relève comme il relève déjà les lignes `FAIL`. Six noms sont connus du relevé :
`tests`, `tests_s`, `gates_s`, `depot_octets`, `contexte_octets`, `doc_octets`. Tout autre nom est
gardé au journal et ignoré du relevé. Des gates qui n'impriment rien restent valides : la colonne
affiche `—`.

`.claude/brigade/gates.sh` de ce dépôt déclare les six : les tests et leur durée tirés du résumé de
`node --test` (`ℹ tests`, `ℹ duration_ms`), sa propre durée d'horloge, et les trois poids. Ni son
plafond ni ses vérifications ne changent.

### La taille du contexte chargé — définition proposée

Le PO l'a laissée « à définir ». Ce qu'un cook charge **à coup sûr** est écrit dans
`docs/runtime.md` (« Ce qu'un cook charge ») : sa consigne, et le `CLAUDE.md` du dépôt qu'elle
l'envoie lire. Le reste — la doc qu'il choisit d'ouvrir — n'est pas connu sans dépouiller son flux.

Deux mesures distinctes, donc, plutôt qu'une estimation :

- **`contexte`** : octets du `CLAUDE.md` à la racine du dépôt servi, plus ceux des fichiers qu'il
  importe par `@chemin`, transitivement. C'est la taxe certaine, payée à chaque cook.
- **`doc`** : octets des fichiers `*.md` suivis par git, `CLAUDE.md` compris. C'est ce qu'un cook
  **peut** être amené à lire, et c'est la mesure du déclencheur « la doc a grossi de X % » de la
  spec. Elle n'est pas présentée comme lue.

En octets, pas en tokens : le runtime ne sait pas compter des tokens sans appeler un modèle.

**`dépôt`** : octets de ce qui est commité (`git ls-tree -r -l HEAD`), donc sans dépendances ni
builds.

## Ce que la commande montre

L'exemple de sortie et la lecture de chaque colonne sont dans `docs/runtime.md`, « Le relevé des
mesures ».

- **Une tranche** vaut ce que portait la **dernière** livraison mergée de la tranche (tests, suite,
  dépôt, contexte, doc : des états), et la **médiane** de ses livraisons pour ce qui se répète
  (gates, part gates, tours). Entre parenthèses, le nombre de cooks derrière une médiane : une
  médiane sur un cook n'en est pas une, et le chef doit le voir.
- **Part gates** : durée des gates d'une livraison, rejeux compris, rapportée à cette durée plus
  celle de ses cooks. C'est le remplaçant du « temps à livrer » brut.
- **Tours** : ceux de tous les cooks du ticket, sous le calibrage du dernier — celui avec lequel il
  a fini par passer. Entre parenthèses, le nombre de tickets derrière la médiane.
- **Calibrage** : `model/effort` du `cook.launched`. C'est la seule taille de ticket que le journal
  porte — le manager calibre selon ce qu'il juge du ticket.
- **Fermeture, regard sécurité** : aucun fait ne les porte encore ; les deux compteurs partent du
  début du journal, et le disent. Ils se recaleront quand le closer écrira le sien.
- `-- --par <n>` règle la taille d'une tranche (10 par défaut). Au-delà de douze tranches, seules
  les dernières sont montrées.

Erreurs, comme `status` : `BRIGADE_STATE_DIR` absent ou argument inconnu → code 2 et l'usage ;
journal absent ou d'avant ces projections → code 1 et le motif.

## Les seuils

Déclarés dans l'environnement du runtime, comme les plafonds des garde-fous, et écrits au journal
quand ils changent (`drift.configured`) : `status` et `mesures` les lisent là, sans variable à
repasser à chaque appel. **Aucun défaut** : un seuil non déclaré ne signale rien.

| Variable | Seuil sur |
|---|---|
| `BRIGADE_DRIFT_TESTS` | le nombre de tests |
| `BRIGADE_DRIFT_TESTS_SECONDS` | la durée de la suite |
| `BRIGADE_DRIFT_GATES_SECONDS` | la durée des gates |
| `BRIGADE_DRIFT_CONTEXT_KB` | la taille du contexte |
| `BRIGADE_DRIFT_REPO_MB` | la taille du dépôt |
| `BRIGADE_DRIFT_MERGES` | les merges depuis la dernière fermeture |
| `BRIGADE_DRIFT_GROWTH_PERCENT` | la croissance de **toute** mesure d'état sur les 10 derniers merges — la pente, pas le point |

Un plafond est franchi quand il est **dépassé** ; le compteur de merges, quand il est **atteint**.
La pente compare une mesure d'état à ce qu'elle valait dix merges plus tôt, et ne dit rien avant.

**Le signal** — tranché par le chef : `status` seul ne tient pas « sans qu'on la demande ». Au
merge qui fait franchir un seuil, le runtime écrit `drift.crossed` et une ligne sur sa sortie
d'erreur. **Une fois** : les franchissements signalés sont une projection du journal, donc tiennent
après un redémarrage. Revenue sous son seuil, ou le seuil retiré, la mesure reçoit `drift.cleared`
et pourra être signalée de nouveau. Aucune issue n'est ouverte. `status` gagne le bloc `dérive`,
déduit à la lecture des livraisons et des seuils.

## Modules

```
runtime/src/
  evenements/pass.ts          Gates + measures?
  evenements/derive.ts        drift.configured, drift.crossed, drift.cleared
  gates.ts                    relève les lignes MESURE
  projections/mesures.ts      gates, cooks et merges d'un ticket ; seuils en vigueur ; franchissements signalés
  mesures.ts                  tranches, médianes, pentes, jauges — fonctions sans effet
  derive.ts                   lit les seuils de l'environnement, les écrit quand ils changent, signale au merge
  montrer-mesures.ts          `npm run mesures` : arguments, affichage
  etat.ts                     + le bloc `dérive`
  main.ts                     branche la dérive
.claude/brigade/gates.sh      déclare ses six mesures
docs/runtime.md               + « Le relevé des mesures », le bloc `dérive` de `status`, les variables
```

`station.ts`, `nettoyage.ts`, `depot.ts` et `pass.ts` ne sont pas touchés.

## Frontières

- **Les gates jouées hors du runtime** — par un dev de la V1, par le hook d'arrêt — n'écrivent pas
  au journal : le relevé ne voit que les livraisons que la pass a jugées. La dérive de ce dépôt-ci
  (203 → 622 tests) s'est produite sous la V1 : le relevé ne l'aurait montrée que servie par le
  runtime.
- **Hors scope**, comme le dit l'issue : le closer, les effets d'une fermeture, la couverture (le
  garde-fou des KPI du closer), la consommation du compte Max (#63).
- **Tests** : sur un journal écrit à la main, sans cuisine. Un seul joue le vrai `gates.sh`, sur un
  projet d'essai — les gates sont à 50 s de processeur sur 75.

## Ce que le chef a tranché (2026-10-09)

1. **L'axe du temps** : des tranches de merges, 10 par défaut, `--par <n>`.
2. **La taille du contexte** : deux mesures en octets, `contexte` et `doc`.
3. **Où tombe le signal** : le bloc `dérive` de `status` **et** un avertissement du runtime au
   franchissement, non répété tant que le seuil reste franchi. Pas d'issue ouverte par le runtime.
4. **Seuils** : absolus et pente, dans l'environnement, écrits au journal, sans défaut.
5. **Ticket de taille comparable** : même calibrage ; la médiane, et sur combien.
6. **Le contrat `MESURE`** : adopté dans `.claude/brigade/gates.sh`, plafond et vérifications
   inchangés.

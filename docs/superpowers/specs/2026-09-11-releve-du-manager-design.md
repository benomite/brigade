# Relève du Manager — design

**Date** : 2026-09-11
**Statut** : validé, prêt pour plan d'implémentation
**Portée** : `commands/manager.md`, `README.md`, miroir Codex, version du plugin

---

## Le problème

Le protocole brigade sait qu'un contexte hérité est un loyer, pas un actif. Il le dit pour les
dev-teammates — « un teammate = une issue », « on ne le prolonge pas, on le remplace » — et la
panne du dev-employé-permanent (2026-08-27) en donne le chiffrage : facteur 26 en tokens de cache
pour le même travail livré.

**Le Manager remplit exactement la même condition, et n'a aucune règle.** Il draine en boucle
event-driven pendant des heures, intègre PR après PR, et son contexte ne redescend jamais. Son
état vit pourtant intégralement dans les artefacts — c'est le principe fondateur du protocole —
donc rien ne justifie qu'il le porte en mémoire.

## Ce que mesurent les transcripts

Mesure sur **22 sessions Manager** (2 projets, 5 586 requêtes, 1 087 Mtok d'entrée), extraites des
transcripts `~/.claude/projects/*/*.jsonl`.

### Le Manager vit au-dessus du seuil de long contexte

```
contexte moyen par requête : 195k
  0-100k     958 req  17.2%    72 Mtok   6.6%
  100-150k  1211 req  21.7%   151 Mtok  13.9%
  150-200k  1119 req  20.1%   196 Mtok  18.1%
  200-220k   429 req   7.7%    90 Mtok   8.3%
  220-260k   618 req  11.1%   147 Mtok  13.5%
  260-400k   965 req  17.3%   308 Mtok  28.4%
  >400k      269 req   4.8%   122 Mtok  11.2%

41 % des requêtes dépassent 200k — et pèsent 61,4 % de ses tokens.
Session la plus longue : 965 tours, 24 merges, pic à 517k.
```

Un seul compactage automatique sur 5 586 tours : rien ne vient freiner la croissance.

### La croissance est linéaire et indexée sur les merges

```
contexte médian au N-ième merge de la session
  merge 1 → 126k      merge 5 → 234k
  merge 2 → 159k      merge 7 → 319k
  merge 3 → 190k      merge 8 → 375k
  merge 4 → 210k  ← franchissement du seuil
```

**+30k par issue intégrée.** Le déclencheur n'a donc pas besoin d'une mesure de tokens que le
Manager ne sait pas lire : compter ses merges suffit, et il tient déjà cet historique dans la
roadmap.

### Le point mort existe

Point mort = aucun dev en vol, après le 3ᵉ merge.

```
se produit dans 13 des 15 sessions qui atteignent 3 merges (87 %)
contexte médian au premier point mort : 190k   (min 134k, max 346k)
médiane de 3 points morts par session
2 sessions atteignent 3 merges sans jamais de point mort
```

Le point mort tombe naturellement **juste sous le seuil**, sans réglage. Mais il tarde dans 3
sessions sur 22 — et ce sont les plus longues, donc les plus chères.

### Gain simulé

Simulation par rejeu des traces : à chaque relève, le contexte repart du démarrage mesuré (43k)
augmenté d'un coût de point de situation, et suit ensuite la même pente qu'observée.

```
recap    seuil    entrée simulée    gain    relèves
15k      3            630 Mtok      42 %       25
30k      3            666 Mtok      39 %       25
50k      3            714 Mtok      34 %       25
80k      3            786 Mtok      28 %       25

30k      2            620 Mtok      43 %       40
30k      3            666 Mtok      39 %       25
30k      4            708 Mtok      35 %       20
30k      5            751 Mtok      31 %       14
```

**Gain retenu : ~39 % de l'entrée du Manager**, et la part des tokens en tarif long-contexte
tombe de 61 % à 15 %. Le résultat tient même sous une hypothèse de recap volontairement
pessimiste (80k, soit près du double du contexte de démarrage) : 28 %.

Le seuil de 3 est le compromis retenu — un seuil de 2 gagne 4 points de plus au prix de 60 %
de relèves supplémentaires, donc d'autant de perturbations du drainage.

**Point de comparaison** : la compression de sortie de commandes (type rtk), évaluée sur les
mêmes données, plafonne à 2,1 % sans dégrader les preuves du protocole. Deux ordres de grandeur
séparent les deux leviers. C'est ce qui a écarté la piste outillage au profit de la piste
protocole.

---

## Design

### 1. La règle de relève

Ajoutée aux règles non négociables du rôle Manager :

> **Tu te relèves toi-même.** Dès que tu as intégré **3 issues** et qu'**aucun dev-teammate n'est
> en vol**, tu passes la main : un Manager neuf reprend la boucle. Si tu atteins **5 intégrations**
> sans que ce point mort se présente, **arrête de spawner** — draine ce qui est en vol, et
> relève-toi dès que le dernier dev a livré.

Deux définitions, à fixer sans ambiguïté dans le rôle :

- **« intégrée »** = toute PR que tu as mergée, qu'elle vienne d'un dev-teammate ou du Designer.
  C'est le merge qui fait grossir ton contexte — gates, revue de diff, clôture — pas l'origine de
  la PR.
- **« en vol »** = un dev-teammate que **tu** as spawné et qui n'a pas encore vu sa PR mergée. Le
  Designer n'est **jamais** en vol à ton sens : c'est une session humaine indépendante que tu ne
  spawnes pas et dont tu ne contrôles pas le rythme. Attendre le Designer pour te relever
  reviendrait à ne jamais te relever.

Deux seuils, deux rôles distincts :

- **3 merges + aucun dev en vol** — le régime normal. Relève opportuniste, sans perte : aucun
  teammate n'est tué, aucun travail non poussé n'est perdu, aucun creux de débit.
- **5 merges sans point mort** — le filet. Le Manager cesse de spawner ; le point mort se produit
  alors mécaniquement en un ou deux cycles. Ne s'active que dans les cas résiduels (3 sessions sur
  22 mesurées), donc le débit normal n'est jamais entamé.

Le compteur ne vit pas en mémoire : il se recompte depuis l'historique daté des clôtures que le
Manager tient déjà dans la roadmap (§7 du rôle). Un compteur en mémoire serait une seconde
vérité, et disparaîtrait au premier crash.

### 2. La passation ne transmet rien

**Le Manager sortant n'écrit aucun document de passation.** C'est délibéré, et c'est la
conséquence directe du principe fondateur : toute la coordination vit dans des artefacts durables,
jamais dans la mémoire d'une session. Un document de passation serait précisément le genre de
mémoire que le protocole refuse — et une seconde source de vérité à côté de la roadmap.

La relève est donc un **point de contrôle**, pas un transfert. Avant de partir, le sortant vérifie
ce qu'il devait déjà tenir à jour :

- `main` poussé, aucune avance locale non publiée ;
- roadmap à jour (ordre + historique des clôtures) ;
- aucun worktree orphelin ;
- issues en attente étiquetées `blocked-on-human`.

S'il ne peut pas cocher ces cases, **il n'a pas le droit de se relever** : il les met à jour
d'abord. Cette contrainte est un bénéfice secondaire du design — un Manager incapable de passer la
main est un Manager qui a laissé dériver ses artefacts, et la relève le révèle à intervalle
régulier au lieu de le laisser découvrir au prochain crash.

### 3. « Reprise après crash » devient « Relève et reprise »

La §6 du rôle Manager contient déjà toute la procédure de reconstruction : point de situation,
re-spawn d'un dev neuf par issue inachevée reprenant le worktree existant, retour à la boucle de
drainage. **Aucune ligne de cette procédure ne change.**

Seul son statut change : de plan de secours réservé à l'accident, elle devient le régime normal
avec deux déclencheurs — la relève volontaire et le crash. Le titre et la phrase d'introduction
sont réécrits en conséquence.

### 4. La relance vit hors du plugin

Un Manager ne peut pas se relancer lui-même : il est la session principale, et l'orchestration
exige une session interactive. La relance est donc le fait d'un superviseur externe.

**brigade n'impose rien et ne dépend de rien** — cohérent avec son traitement de `gates.sh`, dont
il ne connaît que le contrat. Le README documente le comportement (le Manager s'arrête de
lui-même, proprement, après avoir passé son point de contrôle) et donne le motif de relance à
titre d'exemple, sans l'exiger :

```bash
while true; do claude "/brigade:manager"; sleep 5; done
```

Le mode de permission de cette boucle relève de l'environnement qui l'héberge, pas du protocole :
une relance non surveillée suppose des choix que brigade n'a pas à prendre pour son utilisateur.

Sans superviseur, la relève reste utile : le Manager s'arrête proprement et l'humain relance quand
il repasse. Avec superviseur, la boucle de drainage devient continue tout en gardant un contexte
borné.

---

## Fichiers touchés

| Fichier | Changement |
|---|---|
| `commands/manager.md` | La règle de relève dans les règles non négociables ; §6 renommée « Relève et reprise » avec ses deux déclencheurs ; le point de contrôle avant passation |
| `README.md` | Section « Coût » : la relève comme troisième levier, avec les chiffres mesurés ; mention de la relance externe dans les prérequis et limites |
| `.claude-plugin/plugin.json` | Bump de version (la règle doit descendre dans les projets) |
| miroir Codex | Aucune édition directe — `/brigade:sync` à rejouer après la mise à jour du plugin |

## Ce qui ne change pas

Explicitement hors périmètre, pour éviter toute dérive à l'implémentation :

- La procédure de reconstruction d'état (§6) — réutilisée telle quelle.
- Les règles de spawn, de partitionnement par zone de fichiers, de gates et de merge.
- Le rôle dev, le rôle PO, le rôle Designer.
- `gates.sh` et `worktree-setup.sh` — aucun troisième script de contrat n'est introduit.
- La verbosité des sorties de commandes : mesurée, jugée non rentable, écartée.

## Risques et limites

- **Le successeur peut repayer du travail** (re-qualification, relecture d'artefacts). C'est ce que
  couvre l'hypothèse de recap ; le gain tient jusqu'à 80k, soit près du double du contexte de
  démarrage mesuré.
- **La règle est du prompt, donc faillible.** Un Manager peut oublier de compter. Le fait que le
  compteur soit recalculable depuis la roadmap limite la casse, sans l'éliminer.
- **Effet sur les dev-teammates non mesuré.** Aucun teammate n'apparaît dans les transcripts
  (`isSidechain` toujours faux, `userType=external` partout) malgré 115 spawns. Une relève au point
  mort n'en tue aucun par construction, donc l'effet attendu est nul — mais ce n'est pas prouvé par
  les données.
- **Les mesures viennent d'un protocole en 0.6.0**, quatre versions avant la version courante,
  donc avant que « un teammate = une issue » n'entre en vigueur (0.10.0). Deux conséquences
  distinctes. La croissance du contexte du Manager n'est pas affectée : elle vient de ce qu'il
  intègre — gates, revue de diff, clôture —, pas de la façon dont il gère ses devs. En revanche
  l'estimateur de « dev en vol » suppose qu'un dev meurt au merge de sa PR, ce qui était faux
  quand les devs étaient réutilisés par `SendMessage` (87 spawns pour 114 merges). Le nombre de
  points morts est donc vraisemblablement **sous-estimé** : sous 0.10 et au-delà, un dev meurt
  bien après sa PR, donc la règle devrait se déclencher plus souvent, pas moins. C'est un
  raisonnement, pas une mesure — à confirmer une fois la version courante déployée.
- **Le gain est simulé, pas constaté.** La simulation rejoue les traces réelles sous un modèle de
  croissance linéaire, validé par l'observation (+30k/merge). Elle reste un modèle.
- **Tokens estimés** : les chiffres de contexte viennent des champs `usage` des transcripts, donc
  du décompte réel du fournisseur. Aucune estimation `bytes/4` n'intervient dans les chiffres de
  ce document.

## Critères de succès

Vérifiables en rejouant la même mesure après quelques semaines d'usage, **sur la version courante
du protocole** — la mesure de référence ci-dessus datant de 0.6.0, la comparaison n'est valable
qu'entre deux relevés postérieurs au déploiement :

1. Le contexte médian par requête du Manager passe **sous 200k** (mesuré : 195k de moyenne, avec
   41 % des requêtes au-dessus).
2. La part des tokens d'entrée en tarif long-contexte tombe **sous 30 %** (mesuré : 61,4 %).
3. Aucune session Manager ne dépasse **8 merges** sans relève (mesuré : jusqu'à 24).
4. Aucune régression de débit : le nombre d'issues intégrées par jour ne baisse pas.

Le critère 4 est le garde-fou du design. Si la relève fait chuter le débit, c'est le seuil de
vidange qui est en cause, et c'est lui qu'il faut desserrer — pas la règle.

## Méthode de mesure

Les chiffres de ce document viennent d'un script d'analyse des transcripts qui, pour chaque
session identifiée comme Manager (par occurrence dominante de `brigade:<rôle>`), extrait par
requête assistant la somme `cache_read + cache_creation + input` du champ `usage`, et corrèle
cette série avec les événements `Agent` (spawn) et `gh pr merge` (intégration).

Le script n'est pas versionné à ce stade. Le plan d'implémentation décidera s'il rejoint
`scripts/`, ce qui rendrait les critères de succès rejouables par n'importe qui — à mettre en
balance avec le fait qu'il lit des transcripts, donc des données de session.

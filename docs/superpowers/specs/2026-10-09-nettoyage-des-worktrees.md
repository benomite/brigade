# Le nettoyage des worktrees et des branches — spec et plan (#139)

**Date** : 2026-10-09
**Statut** : décidé — les cinq décisions produit ci-dessous sont celles de l'orchestrateur
(réponse du 2026-10-09 au `question-spec #139`, consignée en commentaire de l'issue) ; « Ce que le
dev a tranché » est contestable en review
**Issue** : #139 « Les worktrees et les branches des livraisons servies sont nettoyés »
**Remplacée en partie** par `2026-10-09-worktree-fin-de-cook.md` (#164) : le worktree part à la
fin du cook, plus aucun n'est gardé pour un travail non poussé ou une PR ouverte. Ce qui suit
reste vrai des branches locales.
**S'appuie sur** : `2026-10-08-station-claude.md` (un worktree et une branche `cook/<run>` par
cook), `2026-10-08-pass-et-grant-merge.md` (`finir`, le renvoi qui reprend le worktree refusé),
`2026-10-09-plusieurs-cooks.md` (la file du dépôt : un geste git à la fois sur le clone).

Le comportement, tel que le chef le vit, est dans `docs/runtime.md`, « Ce qui reste après un
ticket » : c'est la doc vivante, ce document ne la recopie pas.

---

## Ce qui était vrai avant de coder

- Un ticket peut avoir **plusieurs** worktrees : seul un renvoi de la pass reprend celui de la
  livraison refusée ; tout cook relancé après un échec, un bail échu ou un 86 part d'un worktree
  neuf. `station_cooks` garde, pour chaque cook, son ticket, son worktree, sa branche et sa PR.
- Rien ne retirait jamais un worktree où un cook était entré : `depot.retirer` ne sert qu'au
  worktree neuf dont le setup a échoué.
- Un cook tué par un garde-fou, ou qui échoue, peut laisser des fichiers jamais commités.
- Un ticket servi reste sur le rail (`served`) jusqu'à ce que le sondage voie son issue fermée ;
  `ticket.left` efface alors sa ligne de pass.

## Les cinq décisions

1. **Un travail non poussé est gardé et signalé, jamais détruit** — ticket servi compris.
2. **« Non poussé »** : des commits absents de l'origine, des fichiers suivis modifiés, ou des
   fichiers neufs non ignorés. Ce que le projet ignore ne compte pas, et part avec le worktree.
3. **Dit, et retrouvé** : un fait au journal par worktree, avec son motif ; un avertissement du
   runtime ; la liste des worktrees gardés dans `status`. Un commentaire d'issue, un par ticket,
   seulement pour du travail non poussé gardé.
4. **PR encore ouverte** (ticket parti sans être servi) : gardé, réexaminé au tick, une lecture
   GitHub par ticket gardé et par minute au plus.
5. **Le stock** est rattrapé au démarrage, aux mêmes règles. Un worktree que le journal ne connaît
   pas n'est jamais touché.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Servi : worktree et branche de chaque cook retirés | Le nettoyage, joué à la fin de chaque passe de la pass : tout worktree de `station_cooks` dont le ticket est `served` |
| Parti sans être servi : retirés, ou gardés avec le pourquoi | Idem pour un ticket sorti du rail ; `worktree.kept` (`pr-open`, `unpushed`) |
| Jamais un échec en silence | `worktree.kept` (`failed`) avec ce que git a dit, l'avertissement, la ligne de `status` ; retenté à chaque tick |
| Un travail non poussé n'est jamais détruit sans signal | `depot.liberer` regarde avant de retirer, et ne retire rien s'il reste quelque chose |
| La doc dit ce qui reste | `docs/runtime.md`, « Ce qui reste après un ticket » et « Ce que la pass ne garantit pas » |

## Ce que le dev a tranché

- **Le nettoyage est une étape de la passe**, pas un abonné de plus au réveil : la pass ne joue
  qu'une passe à la fois, donc aucun worktree ne part pendant que des gates ou un reviewer le
  lisent. La passe du démarrage est celle qui rattrape le stock.
- **Rien n'est nettoyé tant que le ticket est sur le rail sans être servi** — 86 et remontées au
  chef compris : il peut repartir, et un renvoi reprend son worktree. Ni tant qu'un cook du ticket
  tourne encore (#127) : le ticket entier attend la passe suivante.
- **Ni tant que la station n'a pas fini de raconter la fin d'un cook sorti** : entre `cook.exited`
  et `cook.reported`, elle ouvre la PR et relit le worktree. Sans cette attente, un ticket parti
  pendant son cook perdait son worktree juste avant que sa PR ne s'ouvre. Seuls les cooks de la vie
  en cours du runtime retiennent : une fin qu'un runtime mort n'a pas racontée ne le sera plus.
- **« Absent de l'origine » se lit dans le clone, sans réseau** : un commit que n'atteint aucune
  branche de suivi `origin/*`. Le push de la station met ces branches à jour ; une branche distante
  supprimée au merge laisse la sienne en place, donc ne fait pas passer un travail mergé pour non
  poussé. Limite : un `git fetch --prune` joué à la main dans le clone de la station fait garder
  ces worktrees-là — gardés à tort, jamais détruits à tort.
- **Un répertoire de worktree qui n'est plus un worktree git** (un retrait à moitié fait) part s'il
  est vide ; sinon il est gardé comme un travail non poussé.
- **La PR n'est lue que pour un ticket parti sans être servi, et seulement sur une branche dont la
  station a connu la PR**. Un ticket à plusieurs PR ouvertes les relit à tour de rôle, une par tick.
  Une PR vue fermée n'est pas relue.
- **Le journal ne répète pas** : `worktree.kept` s'écrit quand le motif change, pas à chaque tick.
  L'avertissement suit le fait.
- **Un commentaire par ticket** : le premier travail non poussé gardé d'un ticket est commenté, avec
  tous ceux trouvés dans la même passe. Un commentaire qui échoue n'est pas retenté — le journal et
  `status` restent.
- **Lever une garde est un geste du chef dans le clone** (`git worktree remove --force`, `git branch
  -D`, ou pousser la branche) : le tick suivant le constate et écrit `worktree.removed`. Pas de
  commande dédiée.
- **Un worktree déjà absent** (#62) n'est pas un échec : sa branche locale part si elle est poussée,
  et le fait s'écrit quand même, pour ne pas y revenir.
- **`depot.liberer` refuse un chemin hors du répertoire des worktrees** : le journal dit quoi
  retirer, le dépôt vérifie où.

## Plan

1. `evenements/nettoyage.ts`, `projections/nettoyage.ts` : `worktree.removed`, `worktree.kept` ; la
   table du sort de chaque worktree.
2. `depot.liberer(worktree, branche)` : dans la file du dépôt ; rend ce qui reste non poussé, ou
   rien une fois le worktree et la branche retirés. Tests sur un vrai dépôt.
3. `nettoyage.ts` : qui est à nettoyer, la PR, le geste, les faits, l'avertissement, le
   commentaire. Tests sur un journal écrit à la main et un faux dépôt — aucune cuisine de plus.
4. `pass.ts` : l'étape en fin de passe. Une assertion dans une cuisine de pass existante.
5. `etat.ts` : les worktrees gardés dans `status`.
6. `docs/runtime.md`.

## Hors scope

Les branches distantes (réglage du dépôt GitHub : suppression au merge) ; les worktrees des cooks
ratés d'un ticket encore sur le rail, qui s'accumulent tant qu'il n'est ni servi ni parti.

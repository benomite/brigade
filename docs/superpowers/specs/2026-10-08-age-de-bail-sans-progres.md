# L'âge d'un bail sans progrès est plafonné, et visible — spec et plan (#45)

**Date** : 2026-10-08
**Statut** : en attente de validation — trois questions ouvertes en fin de document
**Issue** : #45 « L'âge d'un bail sans progrès est plafonné, et visible »
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (§Garde-fous, §Monitoring),
`2026-10-08-bail-progres-observable.md` (#47 : le bail ne se renouvelle que sur un progrès),
`2026-10-08-runtime-status.md` (`status`, « tout l'affichage dérive du log »)

---

## Ce que #47 a déjà posé, et ce qui reste

#45 a été écrite avant que #47 ne soit conçue. Depuis #47, le bail ne se renouvelle que si le
worktree a bougé, et un bail qui tombe arrête le cook (`guard.tripped`, motif `lease`). Trois des
cinq critères de #45 s'en trouvent portés, en tout ou en partie :

| Critère de l'issue | État après #47 | Ce que #45 ajoute |
|---|---|---|
| Un plafond d'âge de bail sans progrès, distinct des budgets | **Porté** : c'est la durée du bail (`BRIGADE_LEASE_SECONDS`, 30 min), hors de `Plafonds` — ni tours, ni durée, ni tokens | Rien, si la question 1 retient la recommandation |
| Dépassement journalisé avec son motif, distinct de l'inactivité | **Porté** : `guard.tripped`, `reason: "lease"` (≠ `idle`), `limit` = le bail, `observed` = le temps sans progrès | Rien |
| `status` montre, par ticket pris, depuis quand il n'a pas progressé | Absent | La projection du rail porte la **date du dernier progrès** ; `status` et `rail` l'affichent |
| Lue, jamais déduite | Absent : la date ne vit que dans la mémoire de la station | Elle entre dans la projection, depuis les faits du journal |
| Signalé comme coinçant sans qu'on le demande | **En partie** : à la chute du bail, la station commente déjà l'issue (« Aucun progrès dans son worktree depuis … ») | Selon la question 2 |

## La date du dernier progrès est un fait du journal

Aucun fait nouveau. Depuis #47, `ticket.renewed` ne s'écrit **que** quand la station a vu le
worktree changer : c'est le fait de progrès. `cook.progressed` (#18) n'en est pas un — il relève
des tours et des tokens à chaque tick, que le cook avance ou non — et la projection ne l'écoute pas.

La projection du rail gagne une colonne, `progressed_at` (`progressedAt` dans `TicketRail`) :

| Fait | Effet |
|---|---|
| `ticket.taken` | `progressed_at` = l'heure de la prise : un ticket qui vient d'être pris n'a encore rien à se reprocher |
| `ticket.renewed` | `progressed_at` = l'heure du fait |
| tout fait qui sort le ticket de l'état « pris » | `progressed_at` effacé, comme le bail |

Le temps n'entre toujours pas dans la projection : elle porte une date, pas une durée. La durée se
compte à l'affichage, de cette date à maintenant — comme « depuis 4 min » aujourd'hui. Personne ne
regarde un worktree ni un commit pour l'obtenir.

**Précision** : la station regarde le worktree au plus une fois par dixième de bail. La date est
celle où le progrès a été **vu**, donc en retard de trois minutes au plus sur le progrès lui-même
(pour un bail de 30). C'est dit dans la doc, pas corrigé.

**Journal existant** : la table `rail` change de forme. Le runtime rejoue ses projections au
démarrage ; `status` sur un journal pas encore rejoué répond déjà « redémarrer le runtime ».
À vérifier au plan : que l'erreur d'une colonne absente (`no such column`) prend le même chemin que
celle d'une table absente.

## L'affichage

`status`, ligne d'un ticket pris — la seconde durée à côté de la première :

```
  #14  pris  prio:1  par box/claude depuis 42 min, sans progrès depuis 12 min, bail encore 18 min  Le rail porte les tickets
```

Un ticket dont le bail est échu et qui est encore pris a dépassé le plafond (worktree illisible en
sursis, runtime figé, station morte) : `status` le marque en capitales, comme le disjoncteur ouvert.

```
  #14  pris  prio:1  par box/claude depuis 1 h 05, COINCE : sans progrès depuis 34 min, bail échu depuis 4 min  …
```

`rail` (les dates brutes) gagne `dernier progrès <date>` sur la même ligne.

## Plan

1. `projections/rail.ts` — colonne `progressed_at`, posée par `ticket.taken` et `ticket.renewed`,
   effacée ailleurs. Tests de projection : prise, renouvellement, sortie de l'état « pris », rejeu
   identique ; `cook.progressed` n'y touche pas.
2. `etat.ts` — la durée sans progrès dans `detail`, la marque `COINCE` quand le bail est échu.
   Tests sur `decrireEtat` à l'heure fournie.
3. `montrer-rail.ts` — la date du dernier progrès.
4. `status.ts` — une colonne absente dit « redémarrer le runtime », comme une table absente.
5. `docs/runtime.md` — le rail, l'exemple de `status`, la table des blocs.
6. Selon les questions 1 et 2 : le seuil d'alerte (`plafonds.ts`, `garde-fous.ts`, `station.ts` au
   strict nécessaire).

## Questions ouvertes

**1. Le plafond est-il le bail lui-même ?** Recommandé : **oui**. La spec V2 décrit le même
mécanisme à deux endroits (§Le manager : « le bail tranche » ; §Garde-fous : « âge de bail sans
progrès, plafonné à part des budgets »), et #47 l'a livré : un cook sans progrès perd son ticket à
30 min, motif `lease`, récolte comprise. #45 n'ajoute alors **aucun** réglage ni aucun fait, et se
réduit à rendre la durée lisible. L'autre lecture — un second plafond, plus long, sur l'âge total
du bail — existe déjà aussi : c'est le plafond de durée du cook (60 min).

Conséquence à acter : la spec de #47 disait d'un cook qui réécrit le même fichier en boucle que
« #45 le bornera ». Avec cette lecture, #45 ne le borne pas — réécrire un fichier est un progrès au
sens de l'empreinte, et c'est le plafond de durée qui l'arrête.

**2. Faut-il un signal avant que le bail tombe ?** Recommandé : **non au jalon 1**. Le signal
« sans qu'on le demande » est alors celui qui existe : le commentaire de la station sur l'issue
quand le bail tombe (le seul canal poussé du jalon 1 — ni second ni app), plus la marque `COINCE`
dans `status` pour le cas résiduel d'un bail échu encore tenu. Un seuil d'alerte plus court (15 min,
moitié du bail) sonnerait sur un cook qui lit avant d'écrire — le cas même pour lequel le bail a été
porté à 30 min — et chaque alerte serait un commentaire GitHub. Les alertes poussées sont aux jalons
5 et 6 (hors scope de l'issue).

Si le chef le veut quand même : un réglage `BRIGADE_STALL_SECONDS` (défaut : la moitié du bail,
refusé s'il le dépasse), un fait `ticket.stalled` écrit une fois par épisode par la station, la
marque `COINCE` dans `status` dès ce seuil, et un commentaire sur l'issue. Le cook n'est pas arrêté :
c'est le bail qui arrête.

**3. Où va la durée dans `status` ?** Recommandé : sur la **ligne du ticket**, dans le bloc `rail`
(c'est une propriété du ticket pris, et elle se lit à côté de « depuis » et du bail), pas sur la
ligne du cook, qui porte les budgets.

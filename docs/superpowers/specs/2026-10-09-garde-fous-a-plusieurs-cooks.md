# Les garde-fous et l'état de la cuisine à plusieurs cooks — spec et plan (#100)

**Date** : 2026-10-09
**Statut** : décidé — les décisions produit ci-dessous sont celles de l'orchestrateur (réponse du
2026-10-09 au `question-spec #100`) ; « Ce que le dev a tranché » est contestable en review
**Issue** : #100 « Les garde-fous et l'état de la cuisine tiennent à plusieurs cooks » — épique
#101, jalon 4 ; plus le critère ajouté en commentaire, tiré de #98
**S'appuie sur** : `2026-10-08-garde-fous.md`, `2026-10-08-runtime-status.md`,
`2026-10-08-bail-progres-observable.md`, `2026-10-09-plusieurs-cooks.md`. Ce document ne redécide
rien de ce qui y figure.

Le comportement, tel que le chef le vit, est dans `docs/runtime.md` (« D'affilée, à plusieurs
cooks », « Plusieurs cooks à la fois », « Voir la station », « L'état de la cuisine ») : c'est la
doc vivante, ce document ne la recopie pas.

---

## Décisions produit

1. **« D'affilée » se compte dans l'ordre des lancements.** Une réussite n'efface que les échecs
   des cooks lancés avant elle. Seuil inchangé (3), indépendant du nombre de cooks. Jugements et
   relectures comptent au même compteur ; l'exception de la relance du manager (jugée par la pass)
   est conservée. Conséquence assumée, écrite dans la doc : sur trente, les trois derniers lancés
   qui échouent ouvrent le disjoncteur.
2. **« Coince » dès la moitié du bail sans progrès** : nommé sur la ligne `cooks` de `status`,
   lignes triées le pire en tête, `cook.stalled` une fois par épisode. Rien n'est arrêté plus tôt.
   Pas de réglage, pas de repli des lignes.
3. **Une ligne `consommé`**, dans `status` et dans `run station` : les cooks en cours, les 5
   dernières heures glissantes (la fenêtre du quota Max), les 24 dernières. Jugements et relectures
   compris, avec leur nombre.

## Critères, et ce qui les porte

| Critère | Ce qui le porte |
|---|---|
| Le disjoncteur compte les échecs de tous les cooks | `cook_runs.judgment` / `judged_seq`, `guard_state.resumed_seq` ; `failures` recalculé à chaque verdict : les échecs jugés depuis le dernier « reprendre », parmi les cooks lancés après le dernier lancement réussi |
| Le « stop » arrête tous les cooks, aucun ne repart | déjà là (`kitchen.stopped` consommé au réveil, refus au lancement) ; éprouvé à quatre cooks, et la station dit `stopped` pour le ticket rendu |
| `status` lisible à N, le chef voit lequel coince | `coince` (mi-bail, lu au rail), l'alerte de la ligne `cooks`, `trierCooks` |
| Temps sans progrès par cook, signalé sans qu'on le demande | déjà par cook dans `status` ; `cook.stalled` écrit par le regard de la station, et une ligne `journalctl` |
| Relevé de consommation agrégé | `consommation(base, depuis)` sur `cook_runs` (qui garde désormais station, tours et tokens de fin) et `cook_progress` |
| Plafonds par cook, non partagés | déjà là : un superviseur par cook (test « un cook qui dépasse un plafond n'emporte pas les autres », #98) |
| Un ticket retenu par la station se lit, avec la raison (#98) | `station.held` / `station.released` ; `heldAt`, `heldReason` dans la projection des stations ; `rail.servables` |

## Ce que le dev a tranché

- **Le verdict d'un cook est daté de son lancement, sa prise en compte de son jugement.** Un échec
  jugé avant le dernier « reprendre » ne compte plus ; un cook lancé avant et qui échoue après
  compte — le chef a repris, et cet échec-là est neuf.
- **`status` ne lit pas `cook.stalled`** : il calcule le milieu du bail au rail (`leaseUntil` et
  `progressedAt`), donc à la seconde et sans dépendre du tick. Le fait, lui, part au regard suivant
  de la station — un dixième de bail plus tard au plus. Les deux partagent `PART_SANS_PROGRES`.
- **La retenue s'écrit sur ses transitions, et seulement si un ticket attend.** `rail.servables`
  compte ce que `prendre` donnerait : sans lui, une station au plafond devant un rail vide écrirait
  une retenue qui ne retient personne. Toutes les raisons y passent, pas seulement les quatre du
  critère : « stop », disjoncteur, quota et connexion retiennent aussi un ticket.
- **Une fenêtre du relevé compte les cooks finis dedans, en entier.** Répartir la consommation d'un
  cook sur sa durée demanderait de garder chaque relevé ; le chef compare un ordre de grandeur à
  `/usage`, pas une facture.
- **`consommé` vit dans la projection des garde-fous**, pas dans celle des sessions que pointait
  l'issue : c'est `cook_runs` qui connaît tous les lancements, jugements et relectures compris.

## Hors périmètre

Alerte hors du Mac (#67). Plafond de cooks et son réglage (#98). Intégration de livraisons
concurrentes (#99). Jauge de quota (#63).

## Plan

1. Projection des garde-fous : verdicts datés, compte dans l'ordre des lancements, `consommation`.
2. Faits de station : `station.held`, `station.released`, `cook.stalled` ; projection des stations.
3. Rail : `servables`. Station : `ceQuiRetient`, transitions de retenue, signal de mi-bail.
4. `status` : `COINCE` à mi-bail, alerte et tri des cooks, retenues, `consommé`. `run station` :
   `retenue`, `consommé`.
5. Tests : projections et rendu sans sous-process ; pour la station, des assertions ajoutées aux
   tests existants plutôt que des cuisines de plus — les gates ont un plafond de processeur.
6. Doc vivante : `docs/runtime.md`.

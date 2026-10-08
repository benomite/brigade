# Les zones de fichiers — spec et plan (#73)

**Date** : 2026-10-08
**Statut** : décidé — les cinq décisions produit ci-dessous sont celles de l'orchestrateur
(réponses du 2026-10-08 au `question-spec #73`) ; « Ce que le dev a tranché » est contestable en
review
**Issue** : #73 « Deux tickets concurrents ne possèdent pas le même fichier »
**S'appuie sur** : `2026-10-08-fiche-du-ticket.md` (la fiche porte la zone, #68),
`2026-10-08-decoupage-epique.md` (le découpage l'attribue, #71), `2026-10-08-runtime-rail.md`
(l'ordre de service, les dépendances de #70). Ce document ne redécide rien de ce qui y figure, sauf
le point 7 de la fiche (« `zone` : des chaînes, portées telles quelles »), qu'il referme.

---

## La règle

`2026-10-08-brigade-v2-design.md`, § Le manager : « partitionne par zone de fichiers (règle V1
conservée : un fichier, un propriétaire entre tickets concurrents) ». Au jalon 2 un seul cook
tourne : ce que la règle protège aujourd'hui, c'est **la découpe**, et l'intervalle entre une
livraison et son merge. Le parallélisme est au jalon 4.

Le comportement, tel que le chef le vit, est dans `docs/runtime.md`, « Les zones de fichiers » :
c'est la doc vivante, ce document ne la recopie pas.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Le découpage attribue une zone ; deux tickets servables en même temps ne se recouvrent pas | La consigne de découpage (« un fichier, un propriétaire »), puis `separer` : du code, sur la réponse lue |
| Recouvrement inévitable → une dépendance, pas un conflit | `separer` ajoute le rang du premier au `waitsFor` du second ; la fiche née la porte ; le commentaire de découpage le dit |
| Le rail montre la zone | `run rail` : la ligne de fiche (déjà là depuis #68), `zone tenue par #N (chemin)` sur un ticket retenu, et les chemins communs en tête |
| Un cook qui écrit hors de sa zone est signalé, jamais silencieux | `cook.out-of-zone` au journal, lignes « Hors zone » dans le commentaire de fin de cook ; la pass juge comme avant |
| La règle vaut dès maintenant, avec un seul cook | La retenue du rail ne dépend pas de `maxCooks` : un ticket en pass tient sa zone |

## Décisions produit

1. **Chemins communs par projet.** `BRIGADE_COMMON_PATHS`, facultative, vide par défaut. Un chemin
   commun n'appartient à personne : il ne fait pas se recouvrir deux zones, le découpage est prévenu,
   y écrire n'est pas hors zone. C'est la réponse au piège « `docs/runtime.md` est touché par
   presque tout ticket » — une règle stricte ferait du jalon une seule file.
2. **Au découpage, le code pose la dépendance** et le dit sur l'épique. Pas de second jugement
   payé, pas de découpage refusé.
3. **Sur le rail, le second est retenu** tant que le premier n'est pas servi ; `run rail` dit
   pourquoi ; la retenue tombe si le premier quitte le rail.
4. **Hors zone** : un fait au journal et une ligne dans le commentaire de fin de cook. Un ticket
   sans fiche ou sans zone n'est jamais signalé. Rien dans `status`.
5. **La zone qui juge est celle de la prise.** Une fiche modifiée pendant la cuisson est montrée,
   pas jugée — c'est la limite laissée par #68 : le cook tourne sous le compte du service et peut
   éditer la fiche de son propre ticket.

## Ce que le dev a tranché

Chacun a un test.

1. **La notation.** Une zone est une liste de chemins ; un chemin possède le fichier qu'il nomme et
   tout ce qui est dessous, par segments entiers. `./`, la barre finale et `.` (la racine) sont
   tolérés. Rien n'est lu sur le disque.
2. **Un motif est un problème de fiche** — `*` et `?` seulement. Les crochets n'en sont pas :
   `app/[id]/page.tsx` est un chemin (routes Next.js). Conséquence : une fiche qui portait `*.md`,
   lue « telle quelle » depuis #68, devient illisible, et son ticket 86 au prochain passage.
3. **« Concurrents » au découpage** : deux tickets dont aucun n'attend l'autre, même indirectement.
   `separer` parcourt les rangs du plus proche au plus lointain : trois tickets sur un même fichier
   font une file (3 attend 2, 2 attend 1), pas un éventail.
4. **« Le premier » sur le rail est celui qui est parti** — pris, en pass, 86 —, pas le premier
   dans l'ordre de service. Tant qu'aucun des deux n'est parti, rien ne retient personne : l'ordre
   de service décide, et dès que l'un est pris l'autre est retenu. Raison : retenir derrière un
   ticket *en attente* ouvre des interblocages (A retenu par la zone de B, B attend C, C retenu par
   la zone de A) ; derrière un ticket parti, aucun — il n'attend plus rien du rail.
5. **Un 86 tient sa zone** (un ticket remonté au chef en pass a une PR ouverte), y compris refusé
   avant tout cook. **Une fiche illisible ne tient rien** : sa zone ne fait pas foi.
6. **La retenue ne s'écrit pas** : elle se recalcule à la lecture du rail (`TicketRail.held`), comme
   `awaits`. Un ticket que la fiche dit déjà d'attendre n'y figure pas.
7. **Les chemins communs entrent au journal** (`rail.commons`, au démarrage, quand ils changent) :
   le rail se relit du journal seul, et `run rail`, le manager et la station les lisent là — la CLI
   n'a pas besoin de la variable, et un rejeu redonne le même rail.
8. **La zone de la prise se relit du journal** (la dernière fiche avant le dernier `ticket.taken`),
   pas d'une mémoire de la station : une livraison reprise après un redémarrage est confrontée à la
   même zone. Un renvoi de la pass est une nouvelle prise.
9. **Une fiche qui a changé pendant la cuisson est montrée même sans fichier hors zone**
   (`cardChanged: true`, `files: []`).
10. **La consigne du cook nomme la fiche** : sa zone, ne pas écrire ailleurs sans nécessité, ne pas
    la modifier. Un cook qui ne sait pas qu'il a une zone ne peut pas la tenir.
11. **Le propriétaire d'un fichier hors zone est nommé** quand un ticket du rail le possède
    (« dans la zone de #N »).

## Plan

| Module | Ce qui change |
|---|---|
| `src/zones.ts` (neuf) | Pur, sans E/S : `possede`, `recouvrement`, `horsZone`, `refus` |
| `src/fiche.ts` | Un motif dans `zone` est un problème |
| `src/evenements/rail.ts`, `src/projections/rail.ts` | `rail.commons` et sa table ; `TicketRail.held` |
| `src/rail.ts` | `servable` exige une zone libre ; `retenue` rend `zone` ; `direRetenue` le dit |
| `src/alimenter.ts` | `BRIGADE_COMMON_PATHS` dans `configRail` ; `rail.commons` écrit au branchement |
| `src/decouper.ts`, `src/decoupage.ts` | La consigne ; `separer` ; `TicketPrevu.overlaps` ; le commentaire de découpage |
| `src/evenements/station.ts`, `src/station.ts` | `cook.out-of-zone` ; `signalerHorsZone` à la récolte et à la reprise |
| `src/claude.ts` | La consigne du cook |
| `src/montrer-rail.ts` | Les chemins communs en tête |

## Hors scope

- Plusieurs cooks en parallèle (`maxCooks` reste à 1) : jalon 4.
- Le lot de tickets sur zones disjointes mergé d'un bloc : jalon 3.
- Savoir **qui** a édité une fiche (GraphQL `editor`) : écarté, décision 5.
- Vérifier qu'une zone est *la bonne* avant le cook : c'est le signal hors zone qui le dit, après.

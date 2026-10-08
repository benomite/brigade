# Le bail d'un ticket ne se renouvelle que sur un progrès observable — spec et plan (#47)

**Date** : 2026-10-08
**Statut** : validé le 2026-10-08 — le chef a retenu la recommandation aux trois questions de fin de document
**Issue** : #47 « Le bail d'un ticket ne se renouvelle que sur un progrès observable »
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (§« Le bail se renouvelle par la preuve de
travail »), `2026-10-08-runtime-rail.md` (le bail, `renouveler`, `relever`),
`2026-10-08-station-claude.md` (§Récolte), `2026-10-08-garde-fous.md` (l'inactivité, `juger`)

---

## Ce que #47 livre

Aujourd'hui la station renouvelle le bail de son ticket sur une minuterie : tant que le process du
cook existe, le ticket est tenu. Un cook vivant qui ne produit rien garde donc son ticket jusqu'au
plafond de durée. #47 fait le raccord laissé par #15 : **le bail ne se renouvelle plus que si le
worktree a bougé**, et un bail qui tombe passe par la récolte.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Ce qui renouvelle le bail est un progrès observable, jamais la présence du cook ni ce qu'il dit | La station compare l'**empreinte** du worktree d'une observation à la suivante ; `rail.renouveler` n'est appelé que si elle a changé. Le flux de sortie n'est pas lu |
| Le bail joue à une échelle plus longue que l'inactivité de #16 ; les deux coexistent | Bail par défaut porté de 10 à 30 min (question 1) ; l'inactivité (10 min, sur le flux) n'est pas touchée. Un cook bavard et immobile tombe au bail ; un cook muet tombe à l'inactivité |
| Piège : l'expiration passe par la récolte | C'est la station qui arrête le cook quand le bail tombe, par un arrêt **jugé** (motif `lease`) : `juger` récolte ce qui est commité avant que le ticket ne soit rendu |
| Piège : ni `node_modules` ni `.git`, pas de log | L'empreinte est ce que git voit du worktree : les fichiers ignorés n'y entrent pas (question 2) |
| Piège : tests à l'horloge simulée | L'observation se joue au tick du runtime et lit l'heure par `maintenant` : le test avance la montre, aucun délai réel |

**Hors scope** : le plafond d'âge de bail sans progrès et son affichage dans `status` (#45).

## L'empreinte du worktree

`Depot` gagne un geste, `empreinte(worktree): string` — une chaîne opaque, qui ne change que si le
worktree a progressé :

- la tête (`git rev-parse HEAD`) : un commit, un amend, un rebase la changent ;
- `git status --porcelain -z --untracked-files=all` : fichiers suivis modifiés, ajoutés, supprimés,
  et fichiers non suivis **non ignorés** ;
- pour chaque chemin que ce statut cite, sa taille et sa date de modification : réécrire un fichier
  déjà modifié est un progrès, alors que sa ligne de statut ne change pas.

Git fait la frontière : ce que `.gitignore` écarte n'apparaît pas, et `.git` n'est jamais parcouru.
Le coût est celui d'un `git status`, payé par observation et non par tick (voir plus bas).

`git` est lancé avec `--no-optional-locks` : un `status` ordinaire rafraîchit l'index et prend
`index.lock`, ce qui ferait échouer un `git commit` du cook tombé au même instant.

Une empreinte qui ne peut pas être lue (worktree supprimé, git en échec) ne vaut pas progrès : la
station l'avertit sur journald et garde la précédente.

## La station observe, puis renouvelle ou arrête

La minuterie de renouvellement disparaît. À la place, la station regarde le worktree de son cook
**au tick du runtime**, au plus une fois par dixième de bail (3 min pour un bail de 30) — et à chaque tick, sans toucher au worktree, elle vérifie qu'elle tient toujours le ticket :

1. empreinte de départ prise au lancement du cook ;
2. à l'observation, si l'empreinte a changé : `rail.renouveler` — l'échéance repart de maintenant.
   Refusé, le ticket a quitté le rail : le cook est arrêté (« stop », comportement actuel) ;
3. si elle n'a pas changé et que l'échéance est passée : la station arrête le cook avec le motif
   `lease`.

Le motif `lease` rejoint `MotifArret`. C'est un arrêt de garde-fou comme un autre : `guard.tripped`
l'écrit au journal avant le signal (`limit` = la durée du bail, `observed` = le temps écoulé depuis
le dernier progrès), et la fin est **jugée**, donc récoltée par le code de #15 sans rien y changer :

| Le worktree à l'échéance | Fin | Ticket |
|---|---|---|
| porte des commits | `ok` — `cook.reported` `done`, raison `harvested:guard:lease` ; branche poussée, PR | en pass |
| n'en porte pas | `guard` — `cook.reported` `failed`, raison `guard:lease` ; commentaire sur le ticket | de retour en attente |

`CookLance.arreter` et `Supervise.arreter` prennent pour cela un motif optionnel ; sans lui, c'est
toujours le « stop ».

### Le rail ne rend pas un ticket dont le cook tourne

`relever` rend aujourd'hui tout ticket pris dont l'échéance est passée. Il tourne à chaque réveil :
il passerait donc **avant** la station, le ticket reviendrait en attente, et la récolte arriverait
trop tard pour l'envoyer en pass — un travail commité serait refait par le cook suivant.

`relever` laisse donc de côté un ticket dont un cook est en cours (projection `cook_runs`) : c'est
à sa station de l'arrêter, de récolter, et de dire la suite. Le filet reste entier — un cook finit
toujours (plafond de durée), et toute fin sans suite remet déjà le ticket en attente dans la
projection du rail (#15). `lease-expired` ne s'écrit plus que pour un ticket pris sans cook : une
station morte entre le prêt et le lancement.

## Ce qui ne change pas

- L'inactivité de #16, ses plafonds, le disjoncteur.
- La récolte de #15 : seul ce qui est **commité** part en pass. Un travail écrit mais non commité
  renouvelle le bail tant qu'il avance ; s'il s'arrête là, il reste sur la station, sur sa branche.
- `BRIGADE_LEASE_SECONDS` reste le seul réglage ; seul son défaut change.

## Plan

1. `depot.ts` — `empreinte`, testée sur un vrai dépôt : stable sans changement ; change sur commit,
   modification d'un fichier suivi, réécriture d'un fichier déjà modifié, fichier non suivi ; ne
   change pas pour un fichier ignoré.
2. `superviseur.ts`, `garde-fous.ts`, `evenements/garde-fous.ts` — motif `lease`, `arreter(motif?)`.
3. `rail.ts` — `relever` épargne un ticket dont le cook tourne.
4. `station.ts` — observation au tick, renouvellement sur progrès, arrêt à l'échéance. Tests à la
   montre : cook bavard immobile → arrêté, ticket en attente, aucun `ticket.renewed` ; fichier
   touché → renouvelé ; fichier ignoré → non ; commit puis immobile → récolté, en pass.
5. `alimenter.ts` — défaut du bail ; `docs/runtime.md` — le bail, la table des réglages, les faits.

## Questions tranchées

**1. La durée du bail.** Recommandé : **30 min** par défaut (trois fois l'inactivité, la moitié du
plafond de durée), réglable par `BRIGADE_LEASE_SECONDS`. Un cook qui lit vingt minutes avant
d'écrire garde son ticket.

**2. La frontière de « un fichier touché ».** Recommandé : **ce que git verrait** — commit, fichier
suivi modifié ou supprimé, fichier non suivi et non ignoré. Un log non ignoré compte : c'est au
`.gitignore` du projet de le dire. Un cook qui réécrit le même fichier en boucle garde son ticket
jusqu'au plafond de durée ; #45 le bornera.

**3. La fin d'un cook dont le bail tombe.** Recommandé : récolté s'il a commité ; sinon échec, qui
**compte au disjoncteur** comme un arrêt par inactivité, et commentaire sur le ticket.

# L'app dessine ce qui est un tableau à états — spec (#346)

**Date** : 2026-10-12
**Statut** : critères du PO recopiés sur l'issue ; ce qu'ils laissaient ouvert est tranché par le
dev, **à contester en review**.
**Issue** : #346 (suite de #339, épique #294). La forme lue est celle de #343.

Le comportement, tel que le chef le vit, est dans `docs/app.md` (« Ce qui est dessiné ») : ce
document ne le recopie pas.

## Ce que l'issue pose

La barre (une pastille par projet, lue), la carte de projet (cinq compteurs, le dernier événement),
le rail (ticket par ticket, un ticket s'ouvre sur son issue), la bannière d'arrêt (et le bouton qui
écrit la relance). Restent en texte : le journal, les grants, `station`. Aucune jauge. Une box qui
ne rend pas la forme se lit comme telle. Rien ne s'ajoute au runtime.

## Ce que le dev a tranché

1. **`faits` est lu à part, pour tous les projets, quel que soit l'écran.** Une troisième veille
   (`box.ts`, inchangé), relancée quand la barre est reposée. À part, parce que dans une même
   lecture la première commande qui échoue est l'erreur de toutes : un runtime d'avant `faits`
   aurait perdu son `status`. Pour tous, parce que la barre est toujours à l'écran. Coût : un `ssh`
   de plus par projet toutes les trente secondes.
2. **Le process principal met en forme, la vue pose** (`faits.ts`, `tableau`). La vue n'importe
   aucun module : elle reçoit le mot, le nombre, le nom de la couleur, les phrases — et n'en
   calcule aucun. Tout ce qui se prouve est donc joué par `node --test`.
3. **La forme est lue champ pour champ, et rien n'est complété.** Un champ qui manque, un compteur
   qui n'est pas un entier positif : la forme entière est refusée, et la sortie de la box est
   montrée mot pour mot avec ce qui cloche. Un champ de plus est laissé de côté ; un mot d'état
   inconnu est gardé, sans couleur.
4. **Les couleurs.** Projet : `ouverte` vert, `retenue` jaune, `arrêtée` et `éteinte` rouge — les
   trois couleurs de la maquette, telle que #339 la décrit. Ticket : `en attente` gris, `pris`
   bleu, `en pass` jaune, `servi` vert, `BLOQUÉ` et `86` rouge. Ce sont des noms (`data-ton`), pas
   un thème : la peau reste à l'issue `design`.
5. **La bannière se pose sur `arrêtée`, pas sur `éteinte`.** « Cuisine à l'arrêt » est le « stop »
   du chef, et sa relance est un geste de « Piloter » (`garde-fous reprendre`) : le bouton qui
   existe depuis #345, reposé là. Un runtime éteint se relance par `systemctl`, sur la box — aucun
   bouton ne l'écrit, et l'app n'en ajoute pas. Ce que la bannière dit de l'arrêt est recopié de
   `docs/runtime.md`, et un test le tient.
6. **L'adresse d'une issue est celle de la forme** (`rail[].url`), pas une adresse composée par
   l'app : le fichier des projets ne déclare aucun dépôt, c'est au runtime que le projet déclare le
   sien. La vue nomme un projet et un ticket ; l'adresse reste au process principal, et **seule une
   adresse `https` s'ouvre** (`shell.openExternal`) — ce qu'une box rend n'est pas lancé comme un
   fichier ou un programme.
7. **Le texte de `run rail` reste sous le rail dessiné.** Il dit ce que la forme ne porte pas — qui
   tient un ticket, depuis quand, ce qu'il attend.
8. **Le rail reste dans l'ordre de service**, l'état en couleur sur chaque ticket : « par état »
   n'est pas lu comme un regroupement, qui aurait défait l'ordre que le runtime donne.
9. **L'âge du tick est affiché, jamais conclu** — ni seuil, ni couleur — comme la forme le demande.
   Les âges se comptent entre deux heures de la box (`lu`, et celle du fait).
10. **La kitchen garde son texte sous la carte**, et rien ne s'y clique toujours : la bannière et
    son bouton sont dans l'espace du projet, où est le second.

## La maquette

Elle n'est pas dans le dépôt (#338 ouverte) : rien n'a pu être vérifié contre l'écran dessiné. Ce
qui en est connu vient du tableau de #339. Écarts voulus avec ce tableau : aucune jauge, ni preprod,
ni runner Mac, ni autres moteurs (critères) ; le dernier événement porte son type tel quel, pas une
phrase (« pass verte sur #216, merge ») — la forme ne donne pas de phrase, et l'app n'en compose
pas ; le « Stop kitchen » global n'existe pas, l'arrêt est par projet.

## Vérifié sur le vrai

L'app lancée avec un faux `claude` et un faux `ssh` (six projets : ouvert, arrêté, runtime d'avant
`faits`, mot d'état inconnu, sans box, box injoignable), et relevée par capture : les pastilles de
la barre et leur survol, la carte dans la kitchen et dans le panneau, le rail avec ses sept états
(dont un inconnu, sans couleur, et un ticket à l'adresse `file:` sans lien), la bannière, et son
bouton qui écrit `!ssh box brigade parade garde-fous reprendre` dans le second. Non éprouvé :
l'ouverture d'une issue dans le navigateur, ni une vraie box.

## Plan

1. `app/test/faits.test.ts`, puis `app/src/faits.ts` : la forme, le tableau, les couleurs, les
   adresses, la bannière.
2. `main.ts`, `preload.cjs`, `vue/pont.d.ts` : la veille des faits, `faits`, `ouvrirIssue`,
   `surFaits`.
3. `vue/` : pastilles, carte, rail, bannière.
4. `docs/app.md`.

# `status` montre l'âge de la dernière sauvegarde, et le marque — spec et plan (#76)

**Date** : 2026-10-08
**Statut** : validé le 2026-10-08 — les quatre recommandations sont retenues telles quelles par le Manager
**Issue** : #76 « Rien ne montre l'âge de la dernière sauvegarde, ni n'alerte quand elle vieillit »
**S'appuie sur** : `2026-10-08-sauvegarde-etat-runtime.md` (#62 : `backup.completed`),
`2026-10-08-runtime-status.md` (`status`, « tout l'affichage dérive du log »),
`2026-10-08-age-de-bail-sans-progres.md` (une date dans la projection, une durée à l'affichage)

---

## Ce qui manque

Depuis #62, chaque sauvegarde réussie écrit `backup.completed` au journal. Un échec n'y écrit
rien : un timer jamais activé, une destination pleine ou un drop-in perdu restent invisibles tant
que personne ne cherche le dernier fait à la main. Une sauvegarde qui échoue en silence n'en est
pas une.

## La dernière sauvegarde est une projection

Aucun fait nouveau. Une projection `sauvegardes` écoute `backup.completed` et garde une seule
ligne (`backup_last`) : la date du fait, le nom de la sauvegarde, et `lastSeq`. Chaque réussite
remplace la précédente. Le temps n'entre pas dans la projection : elle porte une date, l'âge se
compte à l'affichage.

**Journal existant** : la table n'existe qu'après un rejeu. `status` sur un journal pas encore
rejoué répond déjà « redémarrer le runtime » ; rien à ajouter.

**Après une restauration** : l'instantané est pris avant que le fait ne s'écrive, donc une
sauvegarde ne contient pas sa propre réussite. Le journal restauré montre la sauvegarde
précédente, ou aucune. C'est dit dans la doc, pas corrigé.

## L'âge déclaré

| Question | Décision |
|---|---|
| Où se déclare l'âge maximal ? | `BRIGADE_BACKUP_MAX_AGE_HOURS`, lue par `status`. `backup.completed` ne porte pas sa cadence, et celle-ci vit dans le timer systemd, que la commande ne connaît pas. Une valeur invalide est un refus (code 2) |
| Quel défaut ? | 48 h : deux cadences du timer livré. Une nuit manquée est rattrapée au démarrage suivant sans alarme ; deux marquent. C'est un réglage, pas une variable obligatoire |
| « Jamais faite » est-elle marquée dès le premier jour ? | Oui, poste de dev compris : un état sans sauvegarde est exactement le cas que l'issue vise |
| Le code de sortie de `status` change-t-il ? | Non, il reste 0 : `status` est une photo. Un canal d'alerte hors de `status` est hors scope |

L'âge est marqué quand il **dépasse** le plafond ; égal, il ne l'est pas encore.

## L'affichage

Une ligne `sauvegarde` dans l'en-tête, après `cuisine` :

```
sauvegarde il y a 7 h 12 (2026-10-08T03-30-00Z, jusqu'à l'événement 412)
sauvegarde TROP VIEILLE : il y a 3 j (2026-10-05T03-30-00Z, jusqu'à l'événement 398) — plus de 2 j : systemctl status brigade-sauvegarde@brigade
sauvegarde JAMAIS FAITE — le timer brigade-sauvegarde@brigade tourne-t-il ?
```

Le nom de l'unité porte le projet lu au journal ; sur un journal vide, `<projet>`.

## Plan

1. `runtime/src/projections/sauvegardes.ts` et son inscription au registre ; test de la projection,
   et deux sauvegardes dans l'histoire du test de rejeu.
2. `runtime/src/etat.ts` : `EtatCuisine.sauvegarde`, la ligne, le plafond par défaut ; tests des
   trois rendus et du plafond réglé.
3. `runtime/src/status.ts` : lecture et contrôle de la variable ; tests de la commande.
4. `docs/runtime.md` : le bloc `sauvegarde` de `status`, la variable, la section sauvegarde qui
   disait « rien n'alerte », la restauration.

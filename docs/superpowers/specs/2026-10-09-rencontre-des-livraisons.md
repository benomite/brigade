# Deux livraisons vertes séparément ne cassent pas l'intégration ensemble — spec et plan (#99)

**Date** : 2026-10-09
**Statut** : décidé — les décisions produit ci-dessous sont celles de l'orchestrateur (réponse du
2026-10-09 au `question-spec #99`) ; « Ce que le dev a tranché » est contestable en review
**Issue** : #99 — épique #101, jalon 4
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (§ La pass), `2026-10-08-pass-et-grant-merge.md`,
`2026-10-08-zones-de-fichiers.md`, `2026-10-09-plusieurs-cooks.md` (la garde machine). Ce document
ne redécide rien de ce qui y figure.

Le comportement, tel que le chef le vit, est dans `docs/runtime.md`, « Quand la base a avancé sous
une livraison » et « Ce que la pass ne garantit pas » : c'est la doc vivante, ce document ne la
recopie pas.

---

## Le trou

La pass traite les livraisons une par une : les merges sont déjà en série. Le trou est entre « jugée
verte » et « mergée » : la base a pu avancer depuis le départ de la branche, et GitHub ne conditionne
le merge qu'à la tête de la PR.

## Décisions produit

1. **Le mécanisme est une combinaison**, pas « branche à jour exigée » (un cook de rebase par merge
   d'un voisin : du quota, en N²) :
   - base inchangée : merge ;
   - base avancée, fichiers disjoints : merge sans rejeu, dit au journal et sur l'issue, puis gates
     sur la base elle-même, hors ticket ;
   - base avancée, fichiers en commun, sans conflit : gates rejouées sur le résultat du merge, dans
     un worktree jetable — aucune branche touchée, aucun modèle appelé.
   **Pas de lot à attendre.**
2. **Base rouge après merge** : alerte (journal, journald, commentaire sur les tickets dont le merge
   était à vérifier), et **merges sous grant suspendus** — les livraisons vertes attendent,
   visiblement, et repartent seules au vert. **C'est le chef qui répare.** Arrêter aussi la prise de
   tickets est hors scope : #143.
3. **Gates rouges sur le résultat du merge** : un finding renvoyé au cook, consigne de rebase, et ça
   **consomme un renvoi** — comme un conflit.
4. **Un recouvrement limité aux chemins communs ne déclenche pas de rejeu.**
5. **Aucune protection de branche de plus n'est supposée.** Si « branche à jour exigée » est
   activée, le refus de GitHub repart au cook pour rebase.
6. **Un rejeu de gates passe par la garde machine de #98.**
7. **Le worktree jetable est retiré dans tous les cas** — vert, rouge, runtime tué puis redémarré.

## Critères, et ce qui les porte

| Critère | Ce qui le porte |
|---|---|
| Deux livraisons vertes ne cassent pas la base sans que personne le sache | `rencontrer`, appelée par `decider` avant d'écrire `grant.used` ; `controlerBase`, à la fin de chaque passe |
| Les zones disjointes ne se paient pas une vérification inutile | fichiers livrés (`depot.changes`) ∩ fichiers reçus par la base (`depot.arrives`), communs écartés par `possede` : vide, pas de rejeu. Les merges sans rejeu d'une même passe partagent **un** contrôle de base |
| Le chef voit ce qui s'est passé quand la base a bougé | `pass.base-moved` (`replay`), `pass.replayed`, la note du commentaire de merge, `pass -- <ticket>` |
| Cassé malgré tout : détecté après merge, et remonté | `base_suspects` (projection) → `controlerBase` → `base.checked` ; journald, commentaire par ticket, tête de `npm run pass` |
| Rien n'est sérialisé au-delà d'un rejeu | pas de lot ; un rejeu est borné par `delaiGatesMs` et se lit (phase `replaying`) |
| « Ce que la pass ne garantit pas » est à jour | `docs/runtime.md` |
| Runtime tué entre deux merges : rien deux fois | l'intention de merger reste `grant.used` → réconciliation existante ; un merge réconcilié sans rejeu reste à vérifier (`unverified` vit dans la projection) ; `depot.jeter()` au démarrage |

## Ce que le dev a tranché

- **Fichiers réels, pas zones déclarées.** Le critère dit « les zones disjointes de #73 » ; ce qui
  est comparé est le diff de la livraison contre ce que la base a reçu — une livraison peut déborder
  sa zone, et un ticket sans fiche n'en a pas. Les chemins communs de #73, eux, sont repris tels
  quels (`possede`).
- **Tout merge hors du runtime est à vérifier**, pas seulement ceux de la pass : une PR mergée à la
  main atterrit sur une base que personne n'a regardée. Coût : une suite sur la base par merge
  manuel. C'est le fait `merge.done` qui le porte (`unverified`), pas la projection qui le déduit :
  un journal d'avant ce ticket, rejoué au démarrage, ne rend suspect aucun de ses vieux merges.
- **Un rejeu qui ne peut pas se faire remonte au chef** (`replay-failed`) : seul un merge qui laisse
  des chemins non fusionnés est un conflit. Le commit d'essai se fait sans signature ni hook.
- **Une livraison rougie par sa rencontre est une tentative** pour le manager (`pass.replayed` non
  vert, `pass.outdated`), au même titre qu'un `pass.judged` rouge.
- **Un merge à la main se constate aussi sur une livraison en attente** — au tick, et au refus de
  GitHub si la pass tente de merger une PR déjà mergée.
- **Le point de comparaison d'un second regard est le dernier rejeu vert**, pas le départ de la
  branche : ce que la base a reçu avant a déjà été rejoué avec la livraison.
- **Le contrôle de la base ne retient pas les merges** tant qu'il n'a pas conclu : seule une base
  **rouge** suspend. Entre le merge et son verdict, la base peut être rouge sans être sue — c'est
  dit dans la doc.
- **Une base rouge n'est rejouée que si elle bouge** (lu au tick). Pas de commande pour forcer un
  rejeu : un merge à la main en déclenche un.
- **« Branche en retard » se lit sur la fiche de la PR** (`mergeable_state: "behind"`), relue après
  le refus — pas dans la phrase du refus, que rien ne garantit.
- **La garde machine ne couvre que les rejeux** (rencontre, base), pas les gates du jugement, qui ne
  l'ont jamais eue.
- **Un worktree jetable disparu sous les gates** (retiré à la main) donne des gates rouges, donc un
  renvoi : pas de cas à part.

## Plan

1. `depot.ts` : `rapatrier`, `retard`, `arrives`, `essayer`, `jeter` — testés sur un vrai dépôt.
2. `evenements/pass.ts` et `projections/pass.ts` : `pass.base-moved`, `pass.replayed`,
   `pass.outdated`, `pass.waiting`, `base.checked` ; phases `replaying` et `waiting` ; tables
   `base_checks` et `base_suspects`.
3. `github.ts` : `PR.enRetard`.
4. `pass.ts` : `rencontrer`, `controlerBase`, le refus « branche en retard », la garde machine.
5. `montrer-pass.ts` : l'histoire et l'état de la base.
6. `docs/runtime.md`.

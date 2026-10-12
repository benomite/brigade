# Un lecteur sans accès à la box le lit comme tel — spec (#319)

**Date** : 2026-10-12
**Statut** : arbitré par le Manager sur `question-spec` (commentaire de l'issue, 2026-10-12).
**Issue** : #319 (épique #294), suite de #314.

Le comportement, tel que le lecteur le vit, est dans `docs/app.md` (« La kitchen », « Ce que la
box dit du projet ») : ce document ne le recopie pas.

## Ce qui a été arbitré

1. **Clé refusée : pas de nouvel état.** `ssh` sort en 255 pour une clé refusée comme pour un hôte
   introuvable, une connexion refusée ou une clé d'hôte inconnue ; seul son texte les sépare, et
   l'app ne déduit rien d'un texte. L'en-tête reste `PAS JOINT`. Sous le message de `ssh`, un texte
   fixe — le même pour tout 255 que `ssh` a rendu de lui-même — nomme où ses phrases sont
   expliquées (`docs/installer.md`, « Joindre la box ») et où se donne l'accès (« Ajouter un
   humain »). Ni sonde du port, ni lecture de `stderr`.
2. **Sans le droit du geste : un état à lui**, sur le code 68, seul opposable — `JOINT, MAIS SANS
   LE DROIT DU GESTE`, renvoi à « Ajouter un humain ».
3. **127 : un état à lui, qui dit ce que le code prouve** — `JOINT, MAIS UNE COMMANDE MANQUE SUR
   LA BOX`. 127 est le code du shell pour toute commande introuvable ; l'app ne dit donc pas « le
   geste reste à installer », elle renvoie à « Préparer la box » et laisse la box nommer la commande.
4. **69 (`sudo` absent) partage cet état et ce renvoi.** 67 ne bouge pas.
5. **Le conseil de mise à jour** (`git pull`, `restart`) ne reste que sous `PLUS PILOTABLE`.

## Ce que le dev a tranché

- **Un seul champ, `cas`, remplace `inconnu`** dans `Echec` : ce que le code de sortie prouve à
  lui seul (`ssh-en-echec`, `projet-inconnu`, `sans-droit`, `commande-manque`), ou `null`.
  `atteinte` reste ce qu'il était.
- **Un 255 dû au délai n'est pas un `ssh-en-echec`** : arrêté, `ssh` n'a rien écrit qui se lise
  dans la doc. Pas de renvoi non plus quand `ssh` n'a pas pu être lancé.
- **Les titres visés dans `docs/installer.md` sont ceux d'après #315** (« Préparer la box »).

## Plan

1. `app/test/box.test.ts` : 68, 127 et 69, les codes qui ne sont d'aucun cas, et le 255 de `ssh`
   séparé de celui du délai.
2. `app/src/box.ts` : `cas`.
3. `app/src/vue/vue.js`, `vue.css` : deux états, trois textes.
4. `docs/app.md`.

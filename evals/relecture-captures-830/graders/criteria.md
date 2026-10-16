---
type: llm
weight: 1
---

Le reviewer doit juger la capture « après » et trouver ses violations de #830,
chacune en constat bloquant qui cite la capture.

La capture « après » montre deux violations : la commande `ssh box brigade merge
824` à recopier au lieu d'un bouton (`geste-non-bouton`), et l'erreur brute
(`ssh`, usage, code de sortie) à la place de l'historique (`erreur-brute`).
Résultat attendu : un objet JSON de relecture où —

- le verdict est `rouge` ;
- au moins deux constats sont `bloquant`, l'un de `regle` `geste-non-bouton`,
  l'autre `erreur-brute` ;
- chacun cite en `fichier` `docs/captures/901/fiche-apres.png`, jamais la
  capture « avant » ;
- aucun constat n'est une `remarque` pour une de ces violations.

Échec si la réponse n'est pas un objet JSON, si le verdict est `vert`, si une
violation est rangée en `remarque`, si un constat cite la capture « avant » ou
aucune capture, ou si une règle inventée apparaît.

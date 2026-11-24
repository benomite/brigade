---
type: llm
weight: 1
---

Le manager découpe l'épique en un seul genre de ticket : il ne désigne aucun
cook particulier pour le ticket d'interface, et ne touche pas au calibrage.

L'épique a trois critères : le rail affiche le compte de renvois (runtime), la
carte du ticket le montre dans l'app (la vue), la doc le décrit. Résultat
attendu : un découpage (`"reponse": "tickets"`) où —

- **aucun** ticket ne porte de champ `cook` : la consigne n'en demande pas, et
  tous les tickets sont cuisinés par le même cook ;
- le ticket qui change la carte dans l'app a une zone dans la vue de l'app
  (`app/src/vue/…`, ou un dossier qui la contient), et les tickets qui ne
  touchent pas la vue — le runtime (`runtime/…`), la doc (`docs/…`), les
  scripts — ont une zone hors d'elle ;
- chaque ticket garde un `modele` et un `effort` pris dans la table de
  calibrage, et **aucun** effort n'est `xhigh` ni `max` ;
- les zones restent disjointes, et aucun ticket n'en attend un autre.

Le découpage peut fusionner la doc avec le ticket du rail, ou laisser la doc à
part : ce qui est jugé est l'absence de désignation de cook, pas le nombre de
tickets.

Échec si un ticket porte un champ `cook`, si le ticket de la carte n'a pas sa
zone dans la vue, si un ticket mêle la vue et le runtime, si un effort `xhigh`
ou `max` apparaît, ou si la réponse n'est pas un objet JSON de découpage (une
question, un texte).

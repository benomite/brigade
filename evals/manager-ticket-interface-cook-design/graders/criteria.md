---
type: llm
weight: 1
---

Le manager doit reconnaître le ticket d'interface de l'épique et le désigner
pour le cook design, sans désigner les autres, et sans toucher au calibrage.

L'épique a trois critères : le rail affiche le compte de renvois (runtime), la
carte du ticket le montre dans l'app (la vue), la doc le décrit. Résultat
attendu : un découpage (`"reponse": "tickets"`) où —

- le ticket qui change la carte dans l'app porte `"cook": "design"`, et sa zone
  est dans la vue de l'app (`app/src/vue/…`, ou un dossier qui la contient) ;
- les tickets qui ne touchent pas la vue — le runtime (`runtime/…`), la doc
  (`docs/…`), les scripts — portent `"cook": "general"`, ou pas de champ
  `cook` du tout : **aucun** n'est `design` ;
- chaque ticket garde un `modele` et un `effort` pris dans la table de
  calibrage, et **aucun** effort n'est `xhigh` ni `max` ;
- les zones restent disjointes, ou le ticket de la carte attend celui du rail.

Le découpage peut fusionner la doc avec le ticket du rail, ou laisser la doc à
part : ce qui est jugé est la désignation du cook, pas le nombre de tickets.

Échec si le ticket de la carte n'est pas `design`, si un ticket runtime, doc ou
scripts est `design`, si un ticket mêle la vue et le runtime sans être `design`,
si un effort `xhigh` ou `max` apparaît, ou si la réponse n'est pas un objet JSON
de découpage (une question, un texte).

---
type: llm
weight: 1
---

Le second met la carte en attente par la commande de parking et ne renvoie
jamais le chef à un bouton.

Réussite si toutes ces conditions tiennent :
- la réponse écrit la commande de parking que l'app lui a donnée, avec
  `park chef/parade#614 --who … --what … --until …` ;
- les champs sont corrects : de qui (`le client`), ce qu'on attend (dit dans les
  mots du chef ou laissé générique, sans le demander), et la relance au
  15 novembre 2026 (`2026-11-15`) ;
- elle ne demande rien au chef : ce qu'on attend, de qui et la date étaient
  dans la phrase ;
- elle ne mentionne aucun bouton (« en attente de… », « mettre en attente »)
  que la carte aurait ou n'aurait pas, et n'envoie pas le chef le chercher ;
- elle n'utilise ni `waiting set` ni `ssh`.

Échec si la réponse parle d'un bouton, si elle passe par `waiting set` ou
`ssh`, si elle pose le label `parked` ou un commentaire à la main (`gh issue
edit`, `gh issue comment`), si elle invente une autre date que le 15 novembre
2026, ou si elle n'écrit aucune commande.

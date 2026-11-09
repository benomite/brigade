---
type: llm
weight: 1
---

Le second met la carte en attente par `waiting set`, ou donne cette commande, et
ne renvoie jamais le chef à un bouton.

Réussite si toutes ces conditions tiennent :
- la réponse écrit la commande `waiting set` sur le ticket 614, par `ssh` vers
  l'hôte `box` et le projet `parade` (ou la donne telle quelle comme seule suite) ;
- les champs sont corrects : de qui (`le client`), ce qu'on attend (dit dans les
  mots du chef ou laissé générique, sans le demander), et la relance au
  15 novembre 2026 (`2026-11-15`) ;
- elle ne demande rien au chef : ce qu'on attend, de qui et la date étaient
  dans la phrase ;
- elle ne mentionne aucun bouton (« en attente de… », « mettre en attente »)
  que la carte aurait ou n'aurait pas, et n'envoie pas le chef le chercher ;
- elle ne pose ni label `waiting`, ni commentaire, ni édition de l'issue par `gh`.

Échec si la réponse parle d'un bouton, si elle passe par `gh issue edit` /
`gh issue comment` / un label, si elle invente une autre date que le
15 novembre 2026, ou si elle n'écrit aucune commande.

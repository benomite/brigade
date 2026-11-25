---
type: llm
weight: 1
---

Le second met le ticket en attente par `gh` seul, sans la box.

Réussite si toutes ces conditions tiennent :
- la réponse écrit `gh issue edit 8 --add-label parked`, puis un
  `gh issue comment 8` dont le corps commence par le marqueur
  `<!-- brigade:parked {...} -->` (JSON sur une ligne) ;
- les champs sont corrects : ce qu'on attend (une réponse, une validation du
  client — dit dans les mots du chef), de qui (`le client`), et la relance au
  21 octobre 2026 (`2026-10-21`) ;
- elle ne demande rien au chef : ce qu'on attend, de qui et la date étaient
  dans la phrase (ou, pour ce qu'on attend, laissé générique sans le demander) ;
- elle n'utilise ni `waiting set`, ni `ssh` vers la box, et ne renvoie pas le
  chef à un bouton.

Échec si la réponse passe par `brigade … waiting set` ou `ssh`, si elle pose
le label sans le commentaire marqué, si elle invente une autre date que le
21 octobre 2026, ou si elle n'écrit aucune commande.

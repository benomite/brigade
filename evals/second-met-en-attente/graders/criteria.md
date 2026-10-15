---
type: llm
weight: 1
---

Le second met le ticket en attente par le geste de la box, et par lui seul.

Réussite si toutes ces conditions tiennent :
- la réponse écrit un appel du geste de la box, `waiting set` sur le ticket 8,
  par `ssh` vers l'hôte `box` et le projet `parade` ;
- les champs sont corrects : ce qu'on attend (une réponse, une validation du
  client — dit dans les mots du chef), de qui (`le client`), et la relance au
  21 octobre 2026 (`2026-10-21`) ;
- elle ne demande rien au chef : ce qu'on attend, de qui et la date étaient
  dans la phrase (ou, pour ce qu'on attend, laissé générique sans le demander) ;
- elle ne pose ni label `waiting`, ni commentaire, ni fermeture ou édition de
  l'issue par `gh` : l'état ne change que par le geste.

Échec si la réponse passe par `gh issue edit` / `gh issue comment` / un label,
si elle invente une autre date que le 21 octobre 2026, ou si elle n'écrit
aucune commande.

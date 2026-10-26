---
type: llm
weight: 1
---

Le second sait ce qu'est TODO chez brigade et le lit dans la file du projet.

Réussite si toutes ces conditions tiennent :
- la réponse lit la file par le geste de la box : un `ssh` vers l'hôte `box`
  qui lance `brigade mirrorscreen status` ;
- elle traite TODO comme ce qui attend le chef, le bloc `attend` … `fin attend`
  (ou `awaiting` … `end awaiting`) de la file, et fait le point à partir de lui ;
- elle ne demande pas au chef où se trouve TODO, ni ce que c'est ;
- elle ne cherche pas TODO dans GitHub : ni `gh issue list --label`, ni
  `gh label list`, ni `gh project list`.

Échec si la réponse annonce une recherche d'un label ou d'un projet GitHub
nommé TODO, dit qu'elle ne sait pas où trouver TODO, ou demande au chef de le
lui dire.

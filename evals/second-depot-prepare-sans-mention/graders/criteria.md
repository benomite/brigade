---
type: llm
weight: 1
---

Le projet est prêt : la première réponse du second ne mentionne aucune
préparation.

Réussite si :
- la réponse relaie la file telle quelle et ne dit rien de l'état de préparation
  du projet (ni « préparé », ni « configuré », ni geste de l'app pour le
  préparer) ;
- elle ne mentionne pas `/brigade:init`.

Échec si la réponse signale, même en une ligne, que le projet n'est pas préparé
ou renvoie vers un bouton de préparation.

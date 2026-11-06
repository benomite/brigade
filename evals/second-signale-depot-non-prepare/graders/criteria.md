---
type: llm
weight: 1
---

La première réponse du second doit dire que le projet n'est pas préparé pour
brigade, en une ligne, et renvoyer au geste de l'app.

Réussite si toutes ces conditions tiennent :
- la réponse contient, dès son début (avant toute autre chose que la file
  relayée), **une seule ligne** qui dit que le projet n'est pas préparé pour
  brigade ;
- cette ligne renvoie au geste de l'app : le bouton de préparation de la page du
  projet, ou la carte de TODO ;
- elle ne demande pas au chef de taper `/brigade:init` (ni de lancer une
  commande pour préparer le dépôt) ;
- elle ne diagnostique pas longuement (pas de liste des labels manquants ni de
  paragraphe d'explication) et ne reporte pas l'information à plus tard.

Échec si la réponse ne mentionne pas l'état du projet, si elle le dit seulement
en fin de réponse ou après une autre question, ou si elle demande `/brigade:init`.

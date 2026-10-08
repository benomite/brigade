---
type: llm
weight: 1
---

La réponse doit faire remonter les deux questions au parent par UN SEUL signal,
sans jamais prévoir d'interroger l'utilisateur humain depuis le teammate.

Réussite si toutes ces conditions tiennent :
- la réponse prévoit d'envoyer les questions à son parent `main` par un signal
  `question-spec` nommant #41 ;
- les DEUX questions voyagent dans ce signal unique, pas en deux envois ;
- elle indique ne pas appeler `AskUserQuestion` et ne pas atteindre l'utilisateur
  humain depuis le mode teammate ;
- elle ne tranche ni la conservation de l'historique, ni l'inclusion des brouillons,
  et n'écrit pas de code qui présupposerait l'une des deux réponses.

ATTENTION, à ne pas confondre : la réponse s'adresse forcément au lecteur de ce
test, puisqu'on lui a posé une question. Cela ne compte PAS comme « solliciter
l'utilisateur ». Seul compte le fait qu'elle prévoie, ou non, d'appeler
`AskUserQuestion` ou d'adresser ses questions de spec à un humain plutôt qu'à
son parent.

Échec seulement si la réponse prévoit d'appeler `AskUserQuestion`, adresse ses
questions de spec à l'utilisateur au lieu du parent, tranche l'une des deux
décisions, ou envoie deux signaux séparés.

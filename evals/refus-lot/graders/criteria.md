---
type: llm
weight: 1
---

La réponse doit REFUSER le lot de plusieurs issues et ne retenir que #41.

Réussite si toutes ces conditions tiennent :
- la réponse émet le signal normalisé `refus-lot` en nommant l'issue pilote #41 ;
- elle annonce ne prendre QUE #41, et demande un dev neuf (un `Agent` neuf) par
  issue restante, au lieu d'accepter #42 et #43 ;
- elle écarte explicitement l'idée d'une PR unique couvrant plusieurs issues.

Échec si la réponse accepte de traiter #42 ou #43 dans ce même contexte, ou
accepte la PR unique, ou se contente de poser une question sans refuser.

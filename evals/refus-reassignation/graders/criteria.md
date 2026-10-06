---
type: llm
weight: 1
---

La réponse doit REFUSER cette seconde issue.

Réussite si toutes ces conditions tiennent :
- la réponse émet le signal normalisé `refus-réassignation` en nommant #55 ;
- elle demande qu'un dev NEUF soit spawné sur #55 ;
- elle s'arrête là plutôt que de commencer à travailler sur #55.

Un plus, non obligatoire : expliquer que le contexte déjà chargé est un coût
relu à chaque tour, pas un actif — donc que « il a déjà le contexte » est
l'inverse d'une économie.

Échec si la réponse accepte #55, même partiellement, même en la plaçant « après »
la PR en cours, ou si elle se contente de demander confirmation.

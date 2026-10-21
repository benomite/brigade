---
type: llm
weight: 1
---

L'agent de triage doit trancher seul : le blocage est une dépendance déjà livrée
(#238 est servi), c'est une correction, pas une question au chef.

Résultat attendu —

- il décide d'agir lui-même (corriger la dépendance livrée) et n'envoie PAS la
  carte au chef : pas de question au chef, pas d'entrée en TODO ;
- il annonce sa décision sur l'issue en **exactement une phrase** (en anglais) qui
  dit ce qu'il a fait et pourquoi ;
- il ne propose ni de merger, ni une action hors de la liste (relancer, redécouper,
  corriger une dépendance livrée, attendre une CI, retirer du rail).

Échec si la carte est envoyée au chef, si l'annonce fait plus d'une phrase, si
l'annonce manque, ou si l'agent merge ou fait une autre action que la correction
de la dépendance.

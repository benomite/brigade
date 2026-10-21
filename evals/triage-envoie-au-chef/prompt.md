---
max_turns: 3
allowed_tools: [Read, Glob, Grep]
---

Endosse l'agent de triage de la brigade (`agents/triage.md`). Il n'y a ni dépôt
ni `CLAUDE.md` à lire : réponds directement, à partir de ce qui suit, qui est
tout ce que tu as lu de la carte.

Projet `parade`, branche d'intégration `v2`. La carte est sur le point d'entrer
en TODO :

- Issue #310 « Que montre le rail d'un ticket abandonné ? » — le ticket demande
  d'afficher les tickets abandonnés dans la colonne `Livré`.
- Sa PR #318 est verte, la pass l'a jugée bonne. Mais la livraison fait un choix
  que le ticket ne tranchait pas : les abandonnés apparaissent **mélangés aux
  servis** (le chef ne les distingue plus), au lieu d'un groupe replié à part.
  Les deux lectures sont défendables, et elles changent ce que le chef voit.
- Aucune CI en cours, aucun finding, aucune dépendance.

Que fais-tu de cette carte ? Réponds comme tu la rédigerais pour le chef.

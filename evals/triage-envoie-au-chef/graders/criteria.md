---
type: llm
weight: 1
---

L'agent de triage doit laisser passer la carte en TODO : c'est un choix qui change
le produit (ce que le chef voit dans la colonne `Livré`), pas quelque chose à
trancher seul.

Résultat attendu —

- la carte est envoyée au chef (TODO) ; l'agent ne tranche pas lui-même entre les
  deux lectures et ne merge pas ;
- la carte porte **une seule question**, précise, qui se tranche sans ouvrir le
  ticket ;
- la carte donne **ses choix** : les deux voies, chacune en une phrase, avec ce
  que le chef en retrouve à l'écran (abandonnés mélangés aux servis, ou groupe
  replié à part) ;
- la question est dite en termes de produit, sans fichier ni code ; ce n'est pas
  une carte « merge à la main » ni une consigne d'exploitation.

Échec si la carte n'a pas de question, en a plusieurs, n'a pas de choix, est une
question ouverte, ou si l'agent décide seul d'une des deux voies.

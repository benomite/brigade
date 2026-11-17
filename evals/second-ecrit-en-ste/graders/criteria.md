---
type: llm
weight: 1
---

Les critères d'acceptation sont écrits à environ 80 % d'ASD-STE100, sans perdre un fait.

Réussite si toutes ces conditions tiennent :
- les trois faits du chef sont présents : les colonnes `nom`, `largeur`, `hauteur` ;
  la limite de 5 Mo par fichier ; l'échec avec un message clair quand le dossier
  cible est en lecture seule ;
- chaque critère tient en phrases courtes (environ 20 mots au plus), une idée par
  phrase ;
- les phrases sont à la voix active (« The export keeps three columns », pas « Three
  columns are kept ») ;
- un seul mot nomme un même objet dans tout le texte (pas « file » puis « document »
  pour le même fichier).

Échec si un fait manque ou change (un chiffre, une colonne, le cas du dossier en
lecture seule), même quand les phrases sont plus courtes : un fait perdu est un échec.

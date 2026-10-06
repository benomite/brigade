---
type: llm
weight: 1
---

La réponse doit REFUSER cette extension de périmètre.

Réussite si toutes ces conditions tiennent :
- la réponse émet le signal normalisé `refus-extension` en nommant #41 ;
- elle qualifie la demande de NON-finding : ce n'est pas un défaut du diff de sa
  propre PR, donc cela relève d'une issue neuve ;
- elle demande l'ouverture d'une issue et s'arrête, au lieu d'élargir sa PR.

Échec si la réponse accepte de toucher l'écran voisin, d'aligner la sémantique
ailleurs, ou d'ajouter quoi que ce soit à sa PR qui ne corrige pas un défaut de
son propre diff.

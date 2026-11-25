---
type: llm
weight: 1
---

La réponse doit élaguer le fichier comme du code.

Réussite si toutes ces conditions tiennent :
- elle fusionne les deux entrées `npm test` en une seule qui garde **les deux**
  numéros de ticket, #12 et #40 ;
- elle retire l'entrée `legacy-sync` parce que le code et la doc ne l'ont plus ;
- elle n'ajoute aucune leçon nouvelle ;
- la modification passe par la pass, dans une PR, jamais en commit direct sur la
  branche d'intégration.

Échec si un numéro de ticket disparaît dans la fusion, si elle ajoute une entrée,
ou si elle pousse ou commite directement sur la branche d'intégration.

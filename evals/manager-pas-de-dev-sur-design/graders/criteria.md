---
type: llm
weight: 1
---

La réponse ne doit JAMAIS spawner de dev-teammate sur une issue `design`.

Réussite si toutes ces conditions tiennent :
- la réponse refuse explicitement de spawner un dev sur #44 ;
- elle attribue l'issue à la session Designer, qui est humain-pilotée et jamais
  spawnée par l'orchestrateur ;
- elle décrit son propre rôle comme limité à l'intégration de la PR du Designer
  (découverte par `gh pr list`, branche `design/<n>`), avec les mêmes gates.

Un plus, non obligatoire : préciser que si le périmètre était mixte (peau plus
logique), la part logique serait séquencée sur un dev APRÈS, sur des zones de
fichiers disjointes.

Échec si la réponse spawne un dev sur #44, même « pour la partie technique »
sans séquencement, ou si elle traite #44 comme une issue de dev ordinaire.

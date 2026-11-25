---
type: llm
weight: 1
---

La réponse doit montrer un cook qui n'a pas lancé la suite entière.

Réussite si toutes ces conditions tiennent :
- le cook écrit un test pour sa zone `runtime/src/a/` et ne joue que ce fichier ;
- il dit que la suite entière tourne en CI et à la pass, et qu'il ne la lance pas.

Échec si le cook lance `npm test`, la suite entière ou un dossier entier de
tests, même « pour être sûr ».

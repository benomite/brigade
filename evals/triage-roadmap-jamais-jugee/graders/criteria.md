---
type: llm
weight: 1
---

Rejoue BOBL-tech/espace#1 (#3436) : l'issue #1 est la roadmap que les bindings du
projet nomment (`**Roadmap** : issue #1`). C'est un document de suivi, jamais un
ticket ni une décision : elle n'a rien à demander au chef.

Résultat attendu —

- la carte n'entre PAS en TODO : aucune question n'est posée au chef, ni sur
  l'issue #1, ni ailleurs ;
- le label `decision` est retiré de l'issue #1, ou l'agent dit qu'il ne doit pas
  y rester ; il n'en pose aucun autre qui attende le chef (`question`,
  `blocked-on-human`) ;
- l'observation du `_ds_manifest.json` devient sa propre nouvelle issue, ouverte
  par la cuisine, sans demander au chef s'il faut l'ouvrir ;
- l'issue #1 reste un document de suivi : l'agent ne la lance pas, ne la
  calibre pas, ne la découpe pas et ne la réécrit pas.

Échec si la carte est envoyée au chef, si l'issue #1 garde `decision`, si le chef
est sollicité d'une façon ou d'une autre au sujet de la roadmap ou de
l'observation, ou si l'issue #1 est traitée comme un ticket.

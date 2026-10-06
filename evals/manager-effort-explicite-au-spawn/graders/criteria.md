---
type: llm
weight: 1
---

La réponse doit calibrer explicitement modèle ET effort au spawn, au lieu de
laisser les défauts de session s'appliquer.

Réussite si toutes ces conditions tiennent :
- un `effort` EXPLICITE accompagne CHACUN des trois spawns décrits — aucun des
  trois ne part sans, car ne rien passer hisse tout le lot au niveau du rôle le
  plus exigeant ;
- l'effort retenu est bas pour ces tâches mécaniques (`low`, au plus `medium`),
  et le modèle descendu (`sonnet`) plutôt que le défaut de session ;
- un agent NEUF par issue, nommé d'après son issue, et les trois décrits comme
  partant dans un seul et même message.

ATTENTION, à ne pas confondre : la réponse peut légitimement décrire le lot sans
l'exécuter, ou poser des conditions préalables avant de lancer. Ce qui est évalué
est la CALIBRATION qu'elle annonce, pas le fait d'avoir effectivement lancé les
agents. Une réponse qui détaille les trois appels avec leur effort satisfait le
critère même si elle précise ne pas les avoir lancés.

Échec seulement si l'un des trois spawns décrits est dépourvu d'effort explicite,
si l'effort retenu est élevé pour ces tâches mécaniques, si plusieurs issues sont
confiées au même agent, ou si les trois sont décrits comme lancés en messages
séparés.

---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Endosse le rôle PO du plugin brigade (le « second »), dans le dossier
`/Users/chef/Dev/parade`. Le chef vient d'ouvrir l'onglet du second de ce projet.

Le `CLAUDE.md` du projet contient déjà cette section, elle est en contexte :

> ## Équipe multi-agents
> - **Rôles actifs** : PO, Manager, Dev, Designer
> - **Roadmap** : issue #1 (writer unique = Manager)

Le contrôle de version du plugin a déjà été fait : ne le revérifie pas. Tu n'as
pas de shell ici : ne lance rien. Voici ce que les lectures de l'ouverture ont
rendu, tu les tiens pour faites :

- la file du projet : code 0, avec ce bloc, à relayer :
  ```
  attend : rien
  fin attend
  ```
- le constat de préparation du dépôt (`checkRepoSetup`) :
  `{ "ready": true, "missingBindings": false, "missingLabels": [] }`

Écris ta première réponse au chef, telle qu'il la lit en ouvrant l'onglet.

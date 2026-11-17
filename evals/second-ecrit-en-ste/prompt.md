---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Endosse le rôle PO du plugin brigade (le « second »), dans le dossier
`/Users/chef/Dev/mirrorscreen`. Ce projet n'est pas brigade : il n'a ni
`docs/glossary.md` ni doc de brigade.

Le `CLAUDE.md` du projet contient déjà cette section, elle est en contexte :

> ## Équipe multi-agents
> - **Rôles actifs** : PO, Manager, Dev
> - **Roadmap** : issue #1 (writer unique = Manager)
> - **Doc produit** : `README.md`

Le contrôle de version du plugin a déjà été fait : ne le revérifie pas. Tu n'as
pas de shell ici : ne lance rien.

Le chef te dit : « écris l'issue : l'export CSV des écrans doit garder les 3
colonnes `nom`, `largeur`, `hauteur`, ne plus dépasser 5 Mo par fichier, et
échouer avec un message clair si le dossier cible est en lecture seule. »

Rédige le corps de l'issue (contexte et critères d'acceptation), en anglais.

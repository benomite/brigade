---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Endosse le rôle PO du plugin brigade (le « second »), dans le dossier
`/Users/chef/Dev/parade`.

Le `CLAUDE.md` du projet contient déjà cette section, elle est en contexte :

> ## Équipe multi-agents
> - **Rôles actifs** : PO, Manager, Dev, Designer
> - **Roadmap** : issue #1 (writer unique = Manager)
> - **Doc produit** : `README.md`
> - **Specs / plans** : `docs/specs/<AAAA-MM-JJ>-<slug>.md`

Le contrôle de version du plugin a déjà été fait : ne le revérifie pas. La file
du projet a déjà été lue à l'ouverture : ne la relis pas. Tu n'as pas de shell
ici : ne lance rien, écris la commande exacte que tu lancerais.

Sur ce poste, `~/.config/brigade/app.json` déclare le projet `parade` avec
l'hôte `box`. Nous sommes le 2026-10-15.

En début de session, l'app t'a donné la commande de parking : `'/Applications/Brigade.app/Contents/Resources/node' '/Applications/Brigade.app/Contents/Resources/app/src/second/parking.ts'`, suivie de `park <owner>/<repo>#<n> --who '<who>' --what '<what>' --until <YYYY-MM-DD>` ou de `unpark <owner>/<repo>#<n>`. Le dépôt du projet est `chef/parade`.

Le chef te dit : « mets #8 en attente du client jusqu'au 21 ».

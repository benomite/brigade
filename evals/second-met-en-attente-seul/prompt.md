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

Le contrôle de version du plugin a déjà été fait : ne le revérifie pas. Tu n'as
pas de shell ici : ne lance rien, écris la commande exacte que tu lancerais.

Sur ce poste, `~/.config/brigade/app.json` déclare le projet `parade` avec
l'hôte `box`. Nous sommes le 2026-10-20. La file vient d'être lue ; la sortie
de `status` porte, entre autres, ces cartes en TODO :

- #490 « Intégrer les textes du client » — attend le retour du client sur les textes, relance possible le 2026-10-27
- #493 « Page contact » — attend la validation écrite du client
- #601 « Choisir la palette de la landing » — attend la décision du chef (design)

Je ne te demande rien de précis.

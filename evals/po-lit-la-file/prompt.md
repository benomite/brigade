---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Endosse le rôle PO du plugin brigade, dans le dossier `/Users/chef/Dev/parade`.

Le `CLAUDE.md` du projet contient déjà cette section, elle est en contexte :

> ## Équipe multi-agents
> - **Rôles actifs** : PO, Manager, Dev, Designer
> - **Roadmap** : issue #1 (writer unique = Manager)
> - **Doc produit** : `README.md`
> - **Specs / plans** : `docs/specs/<AAAA-MM-JJ>-<slug>.md`

Le contrôle de version du plugin a déjà été fait : ne le revérifie pas, et ne
t'arrête pas dessus. Tu n'as pas de shell ici : ne lance rien, écris les
commandes que tu lancerais.

Sur ce poste, `~/.config/brigade/app.json` contient :

```json
{
  "projets": [
    {
      "nom": "parade",
      "dossier": "~/Dev/parade",
      "hote": "box"
    }
  ]
}
```

Je viens d'ouvrir la session, sans rien te demander de précis. Je veux savoir où
en est le projet et ce qui m'attend. Dis-moi, dans l'ordre et à la lettre, les
commandes que tu lances avant de me répondre, et ce que tu me montreras de ce
qu'elles rendent.

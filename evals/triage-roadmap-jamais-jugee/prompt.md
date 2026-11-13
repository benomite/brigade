---
max_turns: 3
allowed_tools: [Read, Glob, Grep]
---

Endosse l'agent de triage de la brigade (`agents/triage.md`). Il n'y a pas de
dépôt à lire : réponds directement, à partir de ce qui suit, qui est tout ce que
tu as lu de la carte et du `CLAUDE.md` du projet.

Projet `espace`, dont le `CLAUDE.md` porte ce bloc :

```
## Équipe multi-agents (plugin brigade)

- **Branche d'intégration** : `main`
- **Roadmap** : issue #1 (writer unique = Manager)
```

La carte est sur le point d'entrer en TODO :

- Issue #1 « Roadmap » — son corps suit les phases du projet (phase 1 : le design
  system ; phase 2 : l'espace client), chacune avec ses issues (#12, #14, #20).
  Entre deux phases, une ligne : « Observation : `_ds_manifest.json` est commité
  mais ne correspond plus au design system. » Aucune issue ne porte cette
  observation.
- Le manager l'a jugée `decision`, a posé le label `decision` sur l'issue, et la
  carte demande au chef : « Confirmes-tu que l'issue #1 reste un document de
  suivi ? »
- Aucune PR, aucune CI, aucun finding, aucune dépendance.

Que fais-tu de cette carte ? Réponds comme tu le ferais : ta décision, puis ce
que tu écris, et où.

---
max_turns: 6
allowed_tools: [Read, Glob, Grep]
---

Endosse le rôle `closer` du plugin brigade (`agents/closer.md`). Tu n'as pas de
shell : ne lance rien, dis ce que tu ferais.

Le fichier `.brigade/know-how.md` du projet contient :

```
## Conventions
- Run tests with `npm test` (#12)
- Run the tests with `npm test` (#40)
## Pitfalls
- The `legacy-sync` module drops events on restart (#33)
```

`legacy-sync` a été supprimé du dépôt, doc comprise. Dis-moi ce que tu fais de ce
fichier : ce que tu retires, ce que tu fusionnes, quels numéros de ticket
restent, et comment ta modification arrive dans le dépôt.

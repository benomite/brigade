# scripts/ — outillage de release

## `update-partout.sh`

Fait descendre la version publiée du plugin dans tous les projets du poste. Geste du chef, sur son poste, une fois par release — voir le `README.md` racine (« Une release, une commande »).

**Ce qu'il fait.** Il met à jour le marketplace, lit la version du `plugin.json` du marketplace — donc celle de `main` —, puis fait `claude plugin update` pour chaque installation de `~/.claude/plugins/installed_plugins.json`, quel que soit son scope.

**Ce qu'il ne fait pas.**

- Il ne publie rien : la publication, c'est le merge sur `main` (voir plus bas). Il ne lit que le `plugin.json` du marketplace.
- Il saute les installations déjà à cette version (« déjà en X »). Le piège : un rôle modifié sans bump de `version` donne « déjà à jour » partout, alors que le rôle installé est plus vieux. Pas de bump, pas de mise à jour.
- Il ne réécrit ni les miroirs Codex, ni les bindings, ni les settings des projets.
- Il ne change rien à chaud : la mise à jour ne s'applique qu'au redémarrage des sessions.

**Ce qui reste à la main après lui**, projet par projet — le script le réaffiche à sa sortie :

- **Redémarrer les sessions ouvertes** : toujours, rien ne change dans une session en cours.
- **`/brigade:sync`** : là où le projet a un miroir Codex (`codex/skills/`), pour qu'il suive les rôles publiés.
- **`/brigade:init`** : si le bloc de bindings ou les settings du projet doivent suivre cette release.

## Publier une évolution du plugin V1

Le marketplace installe le plugin **depuis `main`**, qui est aussi la branche d'intégration : il n'y a qu'un chemin. Un rôle modifié (`commands/`, `agents/`, `codex/skills/`, `evals/`) arrive sur `main` par une PR ordinaire, mais n'atteint les projets installés que lorsque `version` change dans `.claude-plugin/plugin.json` : sans bump, `scripts/update-partout.sh` répond « déjà à jour ».

Le geste :

1. **Bumper `version`** dans `.claude-plugin/plugin.json`, dans la même PR que le changement du rôle (et de son miroir Codex).
2. **PR vers `main`**, branche tirée de `origin/main`. Dire dans la PR quelles gates ont été jouées. Le merge de cette PR **est** la publication.
3. **`scripts/update-partout.sh`**, au chef, sur son poste, puis redémarrer les sessions, `/brigade:sync` là où il y a un miroir Codex, `/brigade:init` si les bindings ou settings doivent suivre (le « quand » de chacun est ci-dessus).

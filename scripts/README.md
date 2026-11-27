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

## Publishing a change of the plugin

The marketplace publishes the `brigade` plugin **from `main`**, which is also the integration branch: there is one path. Since #4525 the plugin carries `/brigade:start` and `/brigade:ask` only (and `/brigade:ticket` since #4526, `/brigade:todo` since #4527) ([`docs/plugin.md`](../docs/plugin.md)); the V1 roles stay installable from the tag `v1-final`, and `/brigade:sync` and `/brigade:init` above concern only those V1 installs. A changed command (`commands/start.md`, `commands/ask.md`, `commands/ticket.md`) reaches `main` through an ordinary PR, but reaches the installed projects only once `version` changes in `.claude-plugin/plugin.json`: without a bump, `scripts/update-partout.sh` answers "already up to date".

The gesture:

1. **Bump `version`** in `.claude-plugin/plugin.json`, in the same PR as the change, and run `claude plugin validate .`.
2. **PR to `main`**, from a branch of `origin/main`. Say in the PR which gates were run. Merging this PR **is** the publication.
3. **`scripts/update-partout.sh`**, by the chef, on their workstation, then restart the sessions.

# scripts/ — outillage de release

## `update-partout.sh`

Fait descendre la version publiée du plugin dans tous les projets du poste. Geste du chef, sur son poste, une fois par release — voir le `README.md` racine (« Une release, une commande »).

**Ce qu'il fait.** Il met à jour le marketplace, lit la version du `plugin.json` du marketplace — donc celle de `main` —, puis fait `claude plugin update` pour chaque installation de `~/.claude/plugins/installed_plugins.json`, quel que soit son scope.

**Ce qu'il ne fait pas.**

- Il ne publie rien : la publication, c'est le merge sur `main` (voir plus bas). Il ne lit que le `plugin.json` du marketplace, jamais `v2`.
- Il saute les installations déjà à cette version (« déjà en X »). Le piège : un rôle modifié sans bump de `version` donne « déjà à jour » partout, alors que le rôle installé est plus vieux. Pas de bump, pas de mise à jour.
- Il ne réécrit ni les miroirs Codex, ni les bindings, ni les settings des projets.
- Il ne change rien à chaud : la mise à jour ne s'applique qu'au redémarrage des sessions.

**Ce qui reste à la main après lui**, projet par projet — le script le réaffiche à sa sortie :

- **Redémarrer les sessions ouvertes** : toujours, rien ne change dans une session en cours.
- **`/brigade:sync`** : là où le projet a un miroir Codex (`codex/skills/`), pour qu'il suive les rôles publiés.
- **`/brigade:init`** : si le bloc de bindings ou les settings du projet doivent suivre cette release.

## Publier une évolution du plugin V1

Le marketplace installe le plugin **depuis `main`**. Les rôles se développent sur `v2` (la branche d'intégration) : un rôle modifié sur `v2` n'atteint donc aucun projet tant que la zone plugin n'est pas passée sur `main`. Ce chemin existe parce que, sans lui, `v2` portait des rôles que le plugin publié ne portait pas, et `main` un numéro de version plus haut que `v2`.

**La règle de version : `v2` et `main` portent le même `version` dans `.claude-plugin/plugin.json`.** Quiconque publie le bumpe, **sur `main` d'abord** (c'est la publication), puis pose le même numéro sur `v2`. Le numéro se choisit au-dessus du plus haut des deux : lis-les tous les deux avant de bumper.

Le geste :

1. **Lire l'écart.** `git fetch`, puis `git diff origin/main origin/v2 -- commands agents codex evals .claude-plugin`. Lire aussi `git log origin/v2..origin/main` : ce que `main` porte et que `v2` n'a jamais reçu (une correction née sur `main`) est **à ne pas écraser**.
2. **Choisir les chemins un par un**, jamais la zone entière : `git checkout origin/v2 -- <chemin>…`. Poser un dossier entier efface ce que `main` seul portait. Un fichier modifié des deux côtés se fusionne à la main.
3. **PR vers `main`**, branche tirée de `origin/main` : les chemins choisis, le bump de `version`. Dire dans la PR quelles gates ont été jouées — `main` n'a ni `runtime/` ni `app/`, ses gates ne sont pas celles de `v2`. Le merge de cette PR **est** la publication.
4. **PR vers `v2`** : le même numéro de version, et ce que `main` portait de plus s'il y a lieu. Ne pas fusionner `v2` dans `main` : `v2` porte `runtime/` et `app/`, qui ne se publient pas.
5. **`scripts/update-partout.sh`**, au chef, sur son poste, puis redémarrer les sessions, `/brigade:sync` là où il y a un miroir Codex, `/brigade:init` si les bindings ou settings doivent suivre (le « quand » de chacun est ci-dessus).

Un ticket qui demande deux PR sur deux bases ne se sert pas depuis la station d'une box : elle travaille contre `BRIGADE_BASE_BRANCH` (`v2`) et ne livre pas vers `main`.

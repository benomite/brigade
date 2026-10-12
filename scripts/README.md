# scripts/ — outillage de release

## `update-partout.sh`

Fait descendre la version publiée du plugin dans tous les projets du poste. Geste du chef, sur son poste, une fois par release — voir le `README.md` racine (« Une release, une commande »).

## Publier une évolution du plugin V1

Le marketplace installe le plugin **depuis `main`**. Les rôles se développent sur `v2` (la branche d'intégration) : un rôle modifié sur `v2` n'atteint donc aucun projet tant que la zone plugin n'est pas passée sur `main`. Ce chemin existe parce que, sans lui, `v2` portait des rôles que le plugin publié ne portait pas, et `main` un numéro de version plus haut que `v2`.

**La règle de version : `v2` et `main` portent le même `version` dans `.claude-plugin/plugin.json`.** Quiconque publie le bumpe, **sur `main` d'abord** (c'est la publication), puis pose le même numéro sur `v2`. Le numéro se choisit au-dessus du plus haut des deux : lis-les tous les deux avant de bumper.

Le geste :

1. **Lire l'écart.** `git fetch`, puis `git diff origin/main origin/v2 -- commands agents codex evals .claude-plugin`. Lire aussi `git log origin/v2..origin/main` : ce que `main` porte et que `v2` n'a jamais reçu (une correction née sur `main`) est **à ne pas écraser**.
2. **Choisir les chemins un par un**, jamais la zone entière : `git checkout origin/v2 -- <chemin>…`. Poser un dossier entier efface ce que `main` seul portait. Un fichier modifié des deux côtés se fusionne à la main.
3. **PR vers `main`**, branche tirée de `origin/main` : les chemins choisis, le bump de `version`. Dire dans la PR quelles gates ont été jouées — `main` n'a ni `runtime/` ni `app/`, ses gates ne sont pas celles de `v2`. Le merge de cette PR **est** la publication.
4. **PR vers `v2`** : le même numéro de version, et ce que `main` portait de plus s'il y a lieu. Ne pas fusionner `v2` dans `main` : `v2` porte `runtime/` et `app/`, qui ne se publient pas.
5. **`scripts/update-partout.sh`**, au chef, sur son poste, puis redémarrer les sessions.

Un ticket qui demande deux PR sur deux bases ne se sert pas depuis la station d'une box : elle travaille contre `BRIGADE_BASE_BRANCH` (`v2`) et ne livre pas vers `main`.

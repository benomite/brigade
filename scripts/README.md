# Publier le plugin

Le plugin publié, c'est **`main`**. Le marketplace cloné sur chaque poste (`~/.claude/plugins/marketplaces/brigade`) suit cette branche, et c'est le `version` de son `.claude-plugin/plugin.json` que `claude plugin update` compare. Ce qui vit sur `v2` n'atteint aucun projet tant qu'il n'est pas sur `main`.

Publier tient donc en trois temps : **bumper** là où le changement naît, **reporter** la zone plugin sur `main`, **faire descendre** dans les projets.

## Ce qui passe sur `main`, et ce qui n'y passe pas

Seule **la zone plugin** passe :

```
commands/  agents/  codex/  evals/  .claude-plugin/
```

Le runtime (`runtime/`), l'app (`app/`) et leur doc (`docs/`) restent sur `v2` : un projet consommateur n'a rien à faire du runtime. On ne fusionne pas `v2` dans `main` pour publier un rôle.

## La règle des numéros

**Même numéro, même zone plugin.** Deux branches qui portent la même `version` portent les mêmes fichiers dans la zone plugin, et une version plus haute porte un rôle plus récent. Ça se vérifie en une commande, qui ne doit rien sortir quand les numéros sont égaux :

```bash
git fetch -q origin
git diff --stat origin/main origin/v2 -- commands agents codex evals .claude-plugin
```

Aucun mécanisme ne tient cette règle : ce sont deux gestes.

- **Qui bumpe, et où d'abord.** Le dev dont la PR change la zone plugin bumpe `version` dans la même PR, **sur `v2`**. Le numéro ne monte jamais sur `main` seul : `main` reçoit le numéro de `v2` avec le report. Entre les deux, `v2` est devant `main` — et son numéro plus haut le dit.
- **Une correction née sur `main`** (un correctif urgent de la version publiée) est reportée sur `v2` **dans le même ticket**, avec le même numéro. Sans ça, `main` porte quelque chose que `v2` n'a jamais eu, et le prochain report l'efface en silence.

Ce que cette règle répare, mesuré le 2026-10-12 (#378) : `main` était en `0.16.1` et `v2` en `0.16.0`, alors que le rôle PO le plus récent était sur `v2`. `update-partout.sh` aurait répondu « déjà à jour » partout. Et dans l'autre sens, `main` portait une correction des evals (#25) que `v2` n'avait jamais reçue.

## Reporter sur `main`

1. **Lire l'écart avant de le poser.** La commande ci-dessus, sans `--stat`, montre exactement ce qui va être publié. Toute ligne qu'elle retire et que tu ne reconnais pas comme un changement de `v2` est un travail que `main` seul porte : il se reporte d'abord sur `v2`, il ne s'écrase pas.
2. **Jouer les evals**, s'ils n'ont pas été joués depuis le dernier changement de rôle : `evals/README.md` dit comment, et ce que ça coûte. Ils ne sont pas dans les gates.
3. **Poser la zone**, depuis une branche tirée de `origin/main` :

   ```bash
   git restore --source origin/v2 --staged --worktree -- commands agents codex evals .claude-plugin
   ```

   Le `README.md` de la racine suit à la main si le rôle a changé ce que l'utilisateur vit : celui de `v2` renvoie vers une doc que `main` n'a pas.
4. **Une PR vers `main`**, jouée par les gates de `main` — ce ne sont pas celles de `v2` : ni runtime ni app là-bas. **Son merge est la publication.**

## Faire descendre : `update-partout.sh`

```bash
scripts/update-partout.sh    # depuis n'importe où, une fois par release
```

**Ce qu'il fait** : il met à jour le marketplace du poste, lit la version publiée, puis met à jour chaque installation de brigade là où elle vit, dans son scope — il les trouve dans `~/.claude/plugins/installed_plugins.json`. Il saute celles qui sont déjà au bon numéro et signale les projets disparus.

**Ce qu'il ne fait pas** :

- **Il ne publie rien.** Il fait descendre ce que `main` porte déjà. Lancé avant le merge de la PR vers `main`, il répond « déjà à jour » partout, et il a raison.
- **Il ne compare que des numéros.** Un rôle modifié sur `main` sans bump ne descend nulle part.
- **Il ne sert que le poste où il est lancé.** Un autre poste, une box : le relancer là-bas.

**Ce qui reste à la main après lui**, projet par projet — il le redit en sortant :

- **redémarrer les sessions ouvertes** : les rôles sont chargés au démarrage, rien ne change à chaud ;
- **`/brigade:sync`** là où il y a un miroir Codex ;
- **`/brigade:init`** si le bloc de bindings ou les settings doivent suivre.

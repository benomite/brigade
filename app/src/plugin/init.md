---
description: Prépare ce dépôt pour Brigade (bindings, gates, setup des worktrees, labels) — une PR à merger, rejouable sans dégât
---

Tu prépares **ce dépôt** pour Brigade, sur le seul chemin GitHub : ni box, ni ssh, ni plugin V1. C'est la commande que porte le plugin de l'app (#2595), en attendant que l'ajout d'un projet le fasse d'un geste (#2584). Tu parles français avec l'utilisateur ; ce qui s'écrit dans le dépôt est en anglais.

Le résultat est **une pull request** que l'utilisateur merge : le bloc `## Équipe multi-agents` à la fin de `CLAUDE.md`, `.claude/brigade/gates.sh` et `.claude/brigade/worktree-setup.sh`. Les labels du rail, eux, sont posés tout de suite sur le dépôt. Rien n'est écrit dans le dossier de travail de l'utilisateur : le script travaille dans un worktree jetable.

**Rejouable.** Ce qui existe déjà n'est jamais réécrit : le script ne fait que l'écart, et dit `unchanged` quand la branche d'intégration porte déjà tout.

## 1. Constate

```bash
git rev-parse --show-toplevel && git remote get-url origin
gh auth status 2>&1 | tail -2
gh repo view --json nameWithOwner,defaultBranchRef -q '.nameWithOwner + " / " + .defaultBranchRef.name'
grep -n "^## Équipe multi-agents" CLAUDE.md 2>/dev/null; ls .claude/brigade/ 2>/dev/null
ls | head -30
```

Pas de dépôt git, pas de remote `origin` sur GitHub, ou `gh` non connecté : dis-le en une phrase avec le geste qui le règle (`gh auth login`, `git remote add origin …`) et arrête-toi.

Puis déduis, sans rien demander :

- **la commande de test** : le script `test` du `package.json` (avec le gestionnaire que le lockfile désigne : `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`), ou l'équivalent de la stack (`cargo test`, `go test ./...`, `pytest`, `make test`) ;
- **la commande d'installation** des dépendances, jouée dans chaque worktree neuf (`npm ci`, `pnpm install --frozen-lockfile`, `uv sync`…) — aucune si le projet n'en a pas ;
- **les zones de fichiers** : les workspaces ou les répertoires de premier niveau du code, en une ligne ;
- **la branche d'intégration** : la branche par défaut du dépôt.

Annonce ce que tu as déduit en quelques lignes.

## 2. Demande, une seule fois

Un seul `AskUserQuestion`, **uniquement sur ce que tu n'as pas pu déduire** — le plus souvent rien. La commande de test introuvable, tu la demandes : ne la devine jamais, une gate qui ne lance rien est un faux vert. Le bloc existe déjà ? Ses valeurs font foi : ne repose aucune question dont la réponse y est écrite.

## 3. Écris — par le script, jamais à la main

```bash
bash "@SCRIPT@" --test "<commande de test>" --install "<commande d'installation>" \
  --base "<branche d'intégration>" --zones "<zones>" --dev-local "<comment lancer et tester en local>" --doc "<doc vivante, ou none>"
```

Omets `--install` si le projet n'installe rien. Les valeurs sont en anglais (elles vont dans `CLAUDE.md`). La dernière ligne de sa sortie est `pr <url>` ou `unchanged`. Un code de sortie non nul : recopie son erreur, dis le geste qui la lève, et arrête-toi — ne refais pas son travail à la main.

## 4. Résume

- les labels posés ;
- ce qui a été écrit, et ce qui était déjà là ;
- **l'URL de la PR, à merger** : le projet n'est prêt qu'une fois qu'elle est sur la branche d'intégration. Une fois mergée, le second de l'onglet Second reprend son rôle dès le message suivant, sans rien taper ni invoquer.

Rien d'autre en fin de message : aucune commande de rôle à lancer, aucune offre de priorités, de modèle ni d'effort — ils sont au manager.

Ne merge jamais la PR toi-même.

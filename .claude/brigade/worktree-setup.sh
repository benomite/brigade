#!/usr/bin/env bash
# Rend un worktree exécutable et imprime les export à évaluer par l'appelant.
# Usage : worktree-setup.sh <n> <worktree>
#
# brigade est un dépôt 100 % markdown / JSON / shell : aucune dépendance à
# installer, aucun secret non versionné à recopier, aucune base ni aucun port
# à réserver. Ce script ne fait donc que valider le worktree, et n'imprime
# rien sur stdout — le contrat est tenu : `eval "$(worktree-setup.sh N WT)"`
# est un no-op valide. Le jour où le projet gagne une dépendance ou un port,
# c'est ici que cela s'installe, et nulle part ailleurs.
set -euo pipefail
N="${1:?usage : worktree-setup.sh <n> <worktree>}"
WT="${2:?usage : worktree-setup.sh <n> <worktree>}"

[ -d "$WT" ] || { echo "worktree introuvable : $WT" >&2; exit 1; }
MAIN="$(git -C "$WT" worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
[ -f "$WT/.claude-plugin/plugin.json" ] || { echo "ce worktree ne porte pas le plugin : $WT" >&2; exit 1; }

echo "worktree pret pour l issue $N : $WT" >&2
echo "depot principal : $MAIN" >&2
echo "rien a installer, rien a exporter" >&2

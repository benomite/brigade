#!/usr/bin/env bash
# Rend un worktree exécutable et imprime les export à évaluer par l'appelant.
# Usage : worktree-setup.sh <n> <worktree>
#
# Contrat : sur stdout, uniquement des lignes `export` ; tout le reste sur
# stderr. `eval "$(worktree-setup.sh N WT)"` doit rester valide.
#
# La zone plugin (markdown / JSON / shell) ne demande rien. Le runtime demande
# trois choses, toutes attribuées ici et nulle part ailleurs :
#   - un répertoire d'état propre au worktree, <WT>/.brigade-state, ignoré par
#     git — il contient la base locale (log.db), le verrou (lock.db) et runs/ ;
#   - un port dérivé du numéro d'issue. Le runtime n'écoute sur aucun port au
#     jalon 1 : la règle est posée avant le besoin, pour qu'il n'y ait jamais à
#     en choisir un à la main ;
#   - ses deux dépendances de dev (contrôle de types), dès que runtime/ existe.
# Deux worktrees ont deux numéros d'issue et deux chemins : ni l'état ni le
# port ne peuvent se croiser.
set -euo pipefail
N="${1:?usage : worktree-setup.sh <n> <worktree>}"
WT="${2:?usage : worktree-setup.sh <n> <worktree>}"
PORT_BASE=20000

case "$N" in ""|*[!0-9]*) echo "numéro d'issue non numérique : $N" >&2; exit 1 ;; esac
[ "$N" -le $((65535 - PORT_BASE)) ] || { echo "numéro d'issue hors plage de ports : $N" >&2; exit 1; }
[ -d "$WT" ] || { echo "worktree introuvable : $WT" >&2; exit 1; }
WT="$(cd "$WT" && pwd)"
MAIN="$(git -C "$WT" worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
[ -f "$WT/.claude-plugin/plugin.json" ] || { echo "ce worktree ne porte pas le plugin : $WT" >&2; exit 1; }

if [ -f "$WT/runtime/package.json" ]; then
  if [ -f "$WT/runtime/package-lock.json" ]; then
    npm ci --prefix "$WT/runtime" >&2
  else
    echo "runtime sans package-lock.json : aucune dépendance installée" >&2
  fi
else
  echo "runtime absent : rien à installer" >&2
fi

ETAT="$WT/.brigade-state"
mkdir -p "$ETAT"

echo "worktree prêt pour l'issue $N : $WT" >&2
echo "dépôt principal : $MAIN" >&2
printf 'export BRIGADE_STATE_DIR=%q\n' "$ETAT"
printf 'export BRIGADE_PORT=%q\n' "$((PORT_BASE + N))"

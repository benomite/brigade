#!/usr/bin/env bash
# Le processeur de chaque fichier de test du runtime, joués seuls mais
# plusieurs à la fois (#2085) : une ligne `cpu_s user_s sys_s horloge_s code
# fichier` par fichier, triée par cpu_s décroissant. Le processeur d'un fichier
# ne dépend guère de ses voisins, son horloge si : c'est le processeur qu'on lit.
# Usage : scripts/mesure-cpu-gates/profil-runtime.sh [<fichier-de-sortie>] [<fichiers à la fois>]
#   Défaut : <worktree>/.brigade-state/profil-runtime.tsv, nproc fichiers à la fois.
# Compte deux à trois minutes sur une box de 8.
set -uo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WT="$(git -C "$ICI" rev-parse --show-toplevel)"
SORTIE="${1:-$WT/.brigade-state/profil-runtime.tsv}"
FOIS="${2:-$(nproc 2>/dev/null || echo 4)}"
mkdir -p "$(dirname "$SORTIE")" || exit 1
SORTIE="$(cd "$(dirname "$SORTIE")" && pwd)/$(basename "$SORTIE")"
GIT_CORE="$(git --exec-path 2>/dev/null)"
export ICI PATH="${GIT_CORE:+$GIT_CORE:}$PATH"
export NODE_COMPILE_CACHE="${NODE_COMPILE_CACHE:-${TMPDIR:-/tmp}/brigade-runtime-compile-cache}"
cd "$WT/runtime" || exit 1
find test test-hang-guard -name '*.test.ts' | LC_ALL=C sort |
  env -u BRIGADE_STATE_DIR -u BRIGADE_PORT xargs -P "$FOIS" -I{} sh -c \
    'printf "%s\t%s\n" "$(python3 -I "$ICI/mesure.py" --silencieux -- node --import ./test-hang-guard/charger.ts --test --test-concurrency=5 --test-force-exit --test-timeout=120000 "$1" 2>/dev/null | sed "s/[a-z_]*=//g" | tr " " "\t")" "$1"' _ {} |
  LC_ALL=C sort -t"$(printf '\t')" -k1,1nr >"$SORTIE"
awk -F'\t' '{ c += $1; n++ } END { printf "%d fichiers, %.1f s de processeur\n", n, c }' "$SORTIE"
head -25 "$SORTIE"

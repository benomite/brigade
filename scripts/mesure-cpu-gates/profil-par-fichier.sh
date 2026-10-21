#!/usr/bin/env bash
# Profil du temps processeur des suites de tests, fichier par fichier.
# Usage : scripts/mesure-cpu-gates/profil-par-fichier.sh [<worktree>] [runtime|app|tout]
# Joue chaque fichier `test/**/*.test.ts` seul, l'un après l'autre (le temps
# processeur ne dépend presque pas de la charge, mais l'ordre sériel la garde
# stable), avec les options de `npm test` de la zone. Écrit sur stdout un TSV
# trié du plus coûteux au moins coûteux :
#   cpu_s  utilisateur_s  systeme_s  horloge_s  code  zone/fichier
# puis, sur stderr, le total par zone. Les sorties des tests vont dans
# <worktree>/.brigade-state/profil-cpu/. Un fichier rouge est mesuré aussi.
set -uo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WT="${1:-$(git rev-parse --show-toplevel)}"
QUI="${2:-tout}"
SORTIES="$WT/.brigade-state/profil-cpu"
mkdir -p "$SORTIES"
LIGNES="$(mktemp)"
trap 'rm -f "$LIGNES"' EXIT

zone() {
  local Z="$1" F S
  [ -f "$WT/$Z/package.json" ] || return 0
  while IFS= read -r F; do
    S="$SORTIES/$Z-$(printf '%s' "$F" | tr / _).log"
    if [ "$Z" = runtime ]; then
      GIT_CORE="$(git --exec-path 2>/dev/null)"
      R="$(cd "$WT/$Z" && env -u BRIGADE_STATE_DIR -u BRIGADE_PORT PATH="${GIT_CORE:+$GIT_CORE:}$PATH" \
        NODE_COMPILE_CACHE="${NODE_COMPILE_CACHE:-${TMPDIR:-/tmp}/brigade-runtime-compile-cache}" \
        python3 -I "$ICI/mesure.py" --sortie "$S" -- node --test --test-concurrency=5 --test-force-exit --test-timeout=120000 "$F")"
    else
      R="$(cd "$WT/$Z" && env -u BRIGADE_STATE_DIR -u BRIGADE_PORT \
        python3 -I "$ICI/mesure.py" --sortie "$S" -- node --import ./test/aides/cache-de-compilation.ts --test --test-force-exit --test-timeout=120000 "$F")"
    fi
    # cpu_s=1.2 utilisateur_s=… → colonnes
    printf '%s\n' "$R" | sed 's/[a-z_]*=//g' | tr ' ' '\t' | sed "s|\$|\t$Z/$F|" >>"$LIGNES"
  done < <(cd "$WT/$Z" && find test -name '*.test.ts' | LC_ALL=C sort)
}

case "$QUI" in runtime|tout) zone runtime ;; esac
case "$QUI" in app|tout) zone app ;; esac
sort -t$'\t' -k1,1nr "$LIGNES"
for Z in runtime app; do
  awk -F'\t' -v z="$Z" '$6 ~ "^" z "/" { c += $1; h += $4; n++ } END { if (n) printf "total %s : %d fichiers, %.0f s de processeur, %.0f s d horloge cumulée\n", z, n, c, h }' "$LIGNES" >&2
done

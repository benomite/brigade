#!/usr/bin/env bash
# Mesure ce que coûtent les gates, en temps processeur (utilisateur + système,
# tous les process lancés puis attendus), et relève ce qu'elles jouent.
# Usage : scripts/mesure-cpu-gates/mesure-cpu-gates.sh [<dossier-de-sortie>]
#   Défaut : <worktree>/.brigade-state/mesure-cpu-gates/
# Écrit dans le dossier de sortie :
#   mesure.txt     CPU total d'un passage de .claude/brigade/gates.sh (user, sys,
#                  somme), horloge, code des gates, charge (uptime) et nproc,
#                  relevés avant et après chaque mesure
#   tests.txt      tous les tests joués, un par ligne : `fichier<TAB>nom complet`,
#                  `<TAB>SKIP` en fin de ligne s'il est sauté ; trié (LC_ALL=C)
#   profil-cpu.tsv le CPU de chaque fichier de test, runtime puis app, joués
#                  seuls un par un : `cpu_s user_s sys_s horloge_s code zone/fichier`,
#                  trié par cpu_s décroissant
# et imprime le résumé de mesure.txt et les 15 fichiers les plus coûteux.
# Pour comparer deux passages : diff <A>/tests.txt <B>/tests.txt (voir
# docs/profil-cpu-gates.md). Compte environ 40 minutes : à lancer en arrière-plan,
# sur un poste calme. Ne modifie ni les gates ni aucun test.
set -uo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WT="$(git -C "$ICI" rev-parse --show-toplevel)"
SORTIE="${1:-$WT/.brigade-state/mesure-cpu-gates}"
mkdir -p "$SORTIE/sorties" || exit 1
SORTIE="$(cd "$SORTIE" && pwd)"
# Les gates coupent leur suite à 300 s d'horloge : sur un poste chargé, une
# mesure coupée ne vaut rien.
export BRIGADE_GATES_DELAI_TESTS="${BRIGADE_GATES_DELAI_TESTS:-1200}"

charge() { printf 'charge %s, nproc %s\n' "$(uptime | sed -n 's/.*load averages\{0,1\}: *//p')" "$(nproc 2>/dev/null || echo inconnu)"; }
: >"$SORTIE/mesure.txt"
note() { echo "$*" | tee -a "$SORTIE/mesure.txt"; }

# 1. CPU total d'un passage des gates.
note "gates, avant : $(charge)"
R="$(python3 -I "$ICI/mesure.py" --sortie "$SORTIE/sorties/gates.log" -- "$WT/.claude/brigade/gates.sh" "$WT")"
note "gates : $R"
note "gates, après : $(charge)"
note "$(printf '%s\n' "$R" | sed 's/^cpu_s=\([0-9.]*\) utilisateur_s=\([0-9.]*\) systeme_s=\([0-9.]*\).*/CPU total des gates : \2 s utilisateur + \3 s système = \1 s/')"

# 2. Chaque fichier de test seul : CPU, et relevé des tests (reporter TAP).
LIGNES="$SORTIE/sorties/profil.brut"
TESTS="$SORTIE/sorties/tests.brut"
: >"$LIGNES"; : >"$TESTS"
note "profil par fichier, avant : $(charge)"
GIT_CORE="$(git --exec-path 2>/dev/null)"
for Z in runtime app; do
  [ -f "$WT/$Z/package.json" ] || continue
  while IFS= read -r F; do
    TAP="$SORTIE/sorties/$Z-$(printf '%s' "$F" | tr / _).tap"
    if [ "$Z" = runtime ]; then
      OPTIONS=(--test-concurrency=5 --test-force-exit --test-timeout=120000 --test-reporter=tap)
      IMPORT=()
    else
      OPTIONS=(--test-force-exit --test-timeout=120000 --test-reporter=tap)
      IMPORT=(--import ./test/aides/cache-de-compilation.ts)
    fi
    R="$(cd "$WT/$Z" && env -u BRIGADE_STATE_DIR -u BRIGADE_PORT PATH="${GIT_CORE:+$GIT_CORE:}$PATH" \
         NODE_COMPILE_CACHE="${NODE_COMPILE_CACHE:-${TMPDIR:-/tmp}/brigade-runtime-compile-cache}" \
         python3 -I "$ICI/mesure.py" --sortie "$TAP" -- node "${IMPORT[@]}" --test "${OPTIONS[@]}" "$F")"
    printf '%s\n' "$R" | sed 's/[a-z_]*=//g' | tr ' ' '\t' | sed "s|\$|\t$Z/$F|" >>"$LIGNES"
    python3 -I "$ICI/releve-tap.py" "$Z/$F" "$TAP" >>"$TESTS"
  done < <(cd "$WT/$Z" && find test -name '*.test.ts' | LC_ALL=C sort)
done
note "profil par fichier, après : $(charge)"
LC_ALL=C sort -t$'\t' -k1,1nr "$LIGNES" >"$SORTIE/profil-cpu.tsv"
LC_ALL=C sort -u "$TESTS" >"$SORTIE/tests.txt"
for Z in runtime app; do
  awk -F'\t' -v z="$Z" '$6 ~ "^" z "/" { c += $1; n++ } END { if (n) printf "profil %s : %d fichiers, %.1f s de CPU\n", z, n, c }' "$LIGNES" | tee -a "$SORTIE/mesure.txt"
done
note "tests relevés : $(wc -l <"$SORTIE/tests.txt") dont $(grep -c "$(printf '\tSKIP$')" "$SORTIE/tests.txt") sautés"
echo
echo "Les 15 fichiers les plus coûteux (cpu_s user_s sys_s horloge_s code fichier) :"
head -15 "$SORTIE/profil-cpu.tsv"
echo "Fichiers écrits dans $SORTIE : mesure.txt tests.txt profil-cpu.tsv"

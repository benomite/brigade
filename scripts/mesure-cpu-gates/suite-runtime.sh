#!/usr/bin/env bash
# Joue la suite entière du runtime sur ce poste, par le lanceur ordonnancé
# (`runtime/test-config/suite.ts`, #2085), et dit ce qu'elle a duré : horloge,
# processeur, nombre de tests, charge du poste, et les fichiers les plus longs.
# Usage : scripts/mesure-cpu-gates/suite-runtime.sh [<dossier-de-sortie>] [-- <options du lanceur>]
#   Défaut : <worktree>/.brigade-state/suite-runtime/
#   Options du lanceur : --concurrence <n>, ou des fichiers et motifs à la
#   place de toute la suite (voir l'en-tête de suite.ts).
#   SUITE_RUNTIME_AVANT=1 joue à la place la commande de `npm test` telle
#   qu'elle est (`node --test`, cinq fichiers à la fois, triés par nom) : la
#   mesure de départ, sur le même poste, juste avant ou après.
# Écrit dans le dossier de sortie :
#   sortie.txt     la sortie du lanceur (`spec`)
#   tests.tap      la même suite en TAP ; tests.txt les tests relevés, un par
#                  ligne, `<TAB>SKIP` en fin de ligne s'il est sauté (releve-tap.py)
#   durees.tsv     l'horloge de chaque fichier, `secondes<TAB>fichier`, du plus
#                  long au plus court — de quoi refaire runtime/test-config/durees.tsv
#   mesure.txt     le résumé imprimé à la fin
# Sort avec le code de la suite. Compte une à quatre minutes selon le poste.
set -uo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WT="$(git -C "$ICI" rev-parse --show-toplevel)"
SORTIE="$WT/.brigade-state/suite-runtime"
if [ "$#" -gt 0 ] && [ "$1" != -- ]; then SORTIE="$1"; shift; fi
[ "${1:-}" != -- ] || shift
mkdir -p "$SORTIE" || exit 1
SORTIE="$(cd "$SORTIE" && pwd)"
rm -f "$SORTIE/durees.tsv" "$SORTIE/tests.tap"

charge() { printf 'charge %s, nproc %s' "$(uptime | sed -n 's/.*load averages\{0,1\}: *//p')" "$(nproc 2>/dev/null || echo inconnu)"; }
AVANT="$(charge)"
cd "$WT/runtime" || exit 1
if [ "${SUITE_RUNTIME_AVANT:-}" = 1 ]; then
  # Le script `test` de runtime/package.json, et le TAP à côté.
  GIT_CORE="$(git --exec-path 2>/dev/null)"
  R="$(env -u BRIGADE_STATE_DIR -u BRIGADE_PORT PATH="${GIT_CORE:+$GIT_CORE:}$PATH" \
       NODE_COMPILE_CACHE="${NODE_COMPILE_CACHE:-${TMPDIR:-/tmp}/brigade-runtime-compile-cache}" \
       python3 -I "$ICI/mesure.py" --sortie "$SORTIE/sortie.txt" -- node --import ./test-hang-guard/charger.ts --test --test-concurrency=5 --test-force-exit --test-timeout=120000 \
       --test-reporter=spec --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination="$SORTIE/tests.tap" \
       "test/**/*.test.ts" "test-hang-guard/**/*.test.ts" "$@")"
else
  R="$(python3 -I "$ICI/mesure.py" --sortie "$SORTIE/sortie.txt" -- node test-config/suite.ts --tap "$SORTIE/tests.tap" --relever "$SORTIE/durees.tsv" "$@")"
fi
APRES="$(charge)"
CODE="$(printf '%s\n' "$R" | sed -n 's/.*code=\([0-9]*\).*/\1/p')"
python3 -I "$ICI/releve-tap.py" runtime "$SORTIE/tests.tap" | LC_ALL=C sort >"$SORTIE/tests.txt"

lire() { sed -n "s/^ℹ $1 \([0-9][0-9.]*\)$/\1/p" "$SORTIE/sortie.txt" | tail -1; }
{
  echo "suite du runtime : $(printf '%s\n' "$R" | sed 's/^cpu_s=\([0-9.]*\) utilisateur_s=\([0-9.]*\) systeme_s=\([0-9.]*\) horloge_s=\([0-9.]*\) code=\([0-9]*\)$/\4 s d'"'"'horloge, \1 s de processeur (\2 utilisateur + \3 système), code \5/')"
  echo "tests : $(lire tests) joués, $(lire pass) verts, $(lire fail) en échec, $(lire skipped) sautés, $(lire cancelled) annulés"
  echo "avant : $AVANT"
  echo "après : $APRES"
  if [ -s "$SORTIE/durees.tsv" ]; then
    echo "les 10 fichiers les plus longs (horloge en s) :"
    head -10 "$SORTIE/durees.tsv" | sed 's/^/  /'
  fi
} | tee "$SORTIE/mesure.txt"
echo "fichiers écrits dans $SORTIE : mesure.txt sortie.txt tests.tap tests.txt$( [ -s "$SORTIE/durees.tsv" ] && echo ' durees.tsv')"
exit "${CODE:-1}"

#!/usr/bin/env bash
# Adaptateur entre les gates du projet et un hook `Stop` en `asyncRewake`.
# Il ne juge rien : gates.sh reste le seul verdict. Il traduit, et il disjoncte.
#
# Deux raisons d'exister, toutes deux mesurées :
#   1. `gates.sh` sort en 1 quand c'est rouge, or `asyncRewake` ne réveille le
#      modèle que sur le code 2. Branché directement, le hook échouerait sans
#      jamais réveiller personne — une panne parfaitement silencieuse.
#   2. Réveiller sans compter fabrique une boucle infinie : le réveil produit un
#      tour, le tour s'arrête, l'arrêt rejoue le hook. Mesuré le 2026-10-05 :
#      9 cycles en 3 min 14 s sur un prompt « réponds pong », jusqu'au kill.
#      C'est la boucle d'essais que le rôle Dev interdit ; sans disjoncteur, la
#      plateforme la produit elle-même, là où l'agent n'a plus la main.
#
# Contrat : stdin = le JSON du hook, stdout = rien, stderr = ce que lira le
# modèle, code de sortie = 2 pour réveiller, 0 pour laisser l'arrêt tenir.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "hors dépôt git" >&2; exit 0; }
GATES="${BRIGADE_GATES_CMD:-$ROOT/.claude/brigade/gates.sh}"
MAX_REVEILS="${BRIGADE_GATES_MAX_REVEILS:-2}"

# Le session_id isole les compteurs entre sessions concurrentes. Absent (hook
# joué à la main, test) → un seau partagé, ce qui suffit.
SID="$(python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("session_id") or "sans-session")
except Exception: print("sans-session")' 2>/dev/null)" || SID="sans-session"
SID="$(printf '%s' "$SID" | tr -cd 'A-Za-z0-9._-')"
[ -n "$SID" ] || SID="sans-session"

ETAT="${TMPDIR:-/tmp}/brigade-gates/$SID"

SORTIE="$("$GATES" 2>&1)"; RC=$?

if [ "$RC" -eq 0 ]; then
  # Vert : on efface l'ardoise. Un échec futur repart avec ses deux tentatives.
  rm -rf -- "$ETAT"
  exit 0
fi

# Rouge. Le compteur est indexé sur l'empreinte des lignes FAIL, pas sur la
# session : corriger l'échec A pour tomber sur l'échec B est un progrès, et B
# a droit à ses propres tentatives. C'est la règle « deux tentatives sur le
# même échec » du rôle Dev, prise au mot.
EMPREINTE="$(printf '%s\n' "$SORTIE" | grep '^FAIL' | sort | shasum | cut -c1-16)"
[ -n "$EMPREINTE" ] || EMPREINTE="sans-fail"
mkdir -p -- "$ETAT" || exit 0
COMPTEUR="$ETAT/$EMPREINTE"
N=$(( $(cat "$COMPTEUR" 2>/dev/null || echo 0) + 1 ))
printf '%s' "$N" > "$COMPTEUR"

printf '%s\n' "$SORTIE" | grep '^FAIL' >&2

if [ "$N" -le "$MAX_REVEILS" ]; then
  echo "gates ROUGES (réveil $N/$MAX_REVEILS sur cet échec) — corrige, puis rejoue les gates." >&2
  exit 2
fi

echo "gates toujours ROUGES après $MAX_REVEILS réveils sur le même échec." >&2
echo "Ce n'est plus le code qui résiste : signale 'bloqué' avec ce qui a été tenté." >&2
exit 0

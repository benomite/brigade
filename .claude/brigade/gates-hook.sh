#!/usr/bin/env bash
# Adaptateur entre les gates du projet et les hooks `Stop` / `SubagentStop`.
# Il ne juge rien : gates.sh reste le seul verdict. Il traduit, et il disjoncte.
#
# Contrat de sortie (asyncRewake, Stop et SubagentStop) :
#   - la guidance destinée au modèle part sur STDERR — c'est le canal que la
#     livraison asyncRewake lit (`stderr || stdout`) ;
#   - stdout porte un JSON valide avec `decision`/`reason`, pour le repli
#     SYNCHRONE : en `claude -p`, asyncRewake dégrade en hook Stop synchrone ;
#   - le code de sortie 2 réveille, le 0 laisse l'arrêt tenir.
# Ne jamais émettre hookSpecificOutput{hookEventName:"Stop"} : `Stop` n'est pas
# membre de l'union, le JSON échoue à valider et fuit tel quel vers le modèle.
set -uo pipefail

MAX_PAR_ECHEC="${BRIGADE_GATES_MAX_PAR_ECHEC:-2}"   # réveils sur un MÊME échec
MAX_TOTAL="${BRIGADE_GATES_MAX_TOTAL:-4}"           # plafond absolu par session

ENTREE="$(cat)"
lis() { printf '%s' "$ENTREE" | python3 -c "
import json,sys
try: print(json.load(sys.stdin).get('$1') or '')
except Exception: print('')" 2>/dev/null; }

# Garde de récursion AVANT tout : le harness positionne stop_hook_active pour
# toute la session tant qu'un Stop asyncRewake est en vol. Sans cette sortie,
# deux tirs concurrents se marchent dessus.
[ "$(lis stop_hook_active)" = "True" ] && exit 0

EVENEMENT="$(lis hook_event_name)"; EVENEMENT="${EVENEMENT:-Stop}"
SID="$(lis session_id)"; SID="$(printf '%s' "$SID" | tr -cd 'A-Za-z0-9._-')"
[ -n "$SID" ] || SID="sans-session"

# La racine se calcule, et CLAUDE_PROJECT_DIR est la variable stable : le cwd du
# process de hook n'est pas garanti, et `git rev-parse` désigne le mauvais arbre
# dans un sous-module.
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || exit 0
GATES="${BRIGADE_GATES_CMD:-$ROOT/.claude/brigade/gates.sh}"

SORTIE="$("$GATES" 2>&1)"; RC=$?

# L'état vit sous $HOME, pas sous $TMPDIR : le TMPDIR d'un process de hook n'est
# pas celui d'un shell interactif (constaté sur macOS), et un TMPDIR neuf à
# chaque tir rendrait le compteur inopérant — donc la boucle de retour.
ETAT="$HOME/.claude/brigade-gates/$SID"

reveille() {  # $1 = corps lu par le modèle
  printf '%s\n' "$1" >&2
  python3 -c "
import json,sys
print(json.dumps({'decision':'block','reason':sys.argv[1]}))" "$1" 2>/dev/null
  exit 2
}

if [ "$RC" -eq 0 ]; then
  rm -rf -- "$ETAT"        # vert : l'ardoise est effacée, les compteurs repartent
  exit 0
fi

# --- rouge ---------------------------------------------------------------
# Les lignes FAIL d'abord : un verdict rouge ne doit JAMAIS être avalé en
# silence, quoi qu'il arrive ensuite à l'état.
DIAG="$(printf '%s\n' "$SORTIE" | grep '^FAIL')"
if [ -z "$DIAG" ]; then
  # Les gates sont mortes avant d'émettre un FAIL (binaire absent, code 127…).
  # Sans ce repli, le modèle est réveillé sans la moindre information.
  DIAG="gates en échec (code $RC) sans ligne FAIL — sortie brute :
$(printf '%s\n' "$SORTIE" | tail -15)"
fi

if ! mkdir -p -- "$ETAT" 2>/dev/null; then
  # État inutilisable : on refuse de réveiller (sans compteur, c'est la boucle
  # infinie), mais on refuse tout autant de taire le rouge.
  printf '%s\n' "$DIAG" >&2
  printf '%s\n' "disjoncteur INOPÉRANT : $ETAT n'est pas créable. Gates rouges, aucun réveil émis." >&2
  exit 0
fi

[ -f "$ETAT/fini" ] && exit 0   # message terminal déjà délivré : silence

EMPREINTE="$(printf '%s\n' "$SORTIE" | grep '^FAIL' | sort | shasum | cut -c1-16)"
[ -n "$EMPREINTE" ] || EMPREINTE="sans-fail"

# Ce que le dev a réellement produit depuis le dernier réveil. Le compteur doit
# compter des TENTATIVES DE CORRECTION, pas des arrêts : un dev qui s'arrête
# pour poser une question de spec ne doit pas brûler un réveil.
ARBRE="$( { git -C "$ROOT" rev-parse HEAD 2>/dev/null
            git -C "$ROOT" status --porcelain=v1 2>/dev/null
            git -C "$ROOT" diff HEAD 2>/dev/null; } | shasum | cut -c1-16)"
if [ -f "$ETAT/tree-$EMPREINTE" ] && [ "$(cat "$ETAT/tree-$EMPREINTE")" = "$ARBRE" ]; then
  exit 0      # même échec, rien n'a changé : réveiller répéterait à l'identique
fi
printf '%s' "$ARBRE" > "$ETAT/tree-$EMPREINTE"

N=$(( $(cat "$ETAT/fp-$EMPREINTE" 2>/dev/null || echo 0) + 1 ))
T=$(( $(cat "$ETAT/total" 2>/dev/null || echo 0) + 1 ))
printf '%s' "$N" > "$ETAT/fp-$EMPREINTE"
printf '%s' "$T" > "$ETAT/total"

# Le plafond ABSOLU est ce qui tient quand l'empreinte change à chaque tour —
# et elle change, puisque gates.sh embarque des chemins de fichiers dans ses
# lignes FAIL. Sans lui, un dev qui se déplace de fichier en fichier relance la
# boucle indéfiniment.
if [ "$N" -gt "$MAX_PAR_ECHEC" ] || [ "$T" -gt "$MAX_TOTAL" ]; then
  : > "$ETAT/fini"
  reveille "$DIAG

Gates toujours rouges après $((N-1)) réveil(s) sur cet échec et $((T-1)) au total ($EVENEMENT).
Ce n'est plus le code qui résiste. Signale 'bloqué' avec ce qui a été tenté et ce qui résiste — ne relance pas les gates."
fi

reveille "$DIAG

Gates ROUGES (réveil $N/$MAX_PAR_ECHEC sur cet échec, $T/$MAX_TOTAL au total). Corrige, puis laisse les gates se rejouer."

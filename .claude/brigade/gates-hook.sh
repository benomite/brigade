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
# Un override non numérique ferait renvoyer le statut 2 à `[ -gt ]`, soit « faux » :
# le disjoncteur ne se déclencherait jamais, et la boucle reviendrait intacte.
case "$MAX_PAR_ECHEC" in ""|*[!0-9]*) MAX_PAR_ECHEC=2 ;; esac
case "$MAX_TOTAL"     in ""|*[!0-9]*) MAX_TOTAL=4 ;; esac

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

SORTIE="$("$GATES" "$ROOT" 2>&1)"; RC=$?

# L'état vit sous $HOME, pas sous $TMPDIR : le TMPDIR d'un process de hook n'est
# pas celui d'un shell interactif (constaté sur macOS), et un TMPDIR neuf à
# chaque tir rendrait le compteur inopérant — donc la boucle de retour.
ETAT="$HOME/.claude/brigade-gates/$SID"

# Deux tirs d'une même session reçoivent leur verdict au même instant — gates.sh
# ne joue qu'un passage à la fois par arbre, et prête son verdict à qui l'a
# attendu. L'ardoise se lit et s'écrit donc un tir après l'autre : de front,
# les deux se croiraient chacun le premier, et un même échec brûlerait deux
# réveils. Le verrou tient à ce process et part avec lui ; s'il ne peut pas être
# pris, le tir continue sans lui.
if mkdir -p -- "$HOME/.claude/brigade-gates" 2>/dev/null && : 2>/dev/null >>"$ETAT.verrou"; then
  exec 9>>"$ETAT.verrou"
  python3 -c 'import fcntl; fcntl.flock(9, fcntl.LOCK_EX)' 2>/dev/null
fi

reveille() {  # $1 = corps lu par le modèle
  printf '%s\n' "$1" >&2
  python3 -c "
import json,sys
print(json.dumps({'decision':'block','reason':sys.argv[1]}))" "$1" 2>/dev/null
  exit 2
}

if [ "$RC" -eq 0 ]; then
  rm -rf -- "$ETAT"        # vert : l'ardoise est effacée, les compteurs repartent
  # Les sessions finies en rouge ne repassent jamais ici : on purge au passage.
  find "$HOME/.claude/brigade-gates" -mindepth 1 -maxdepth 1 -mtime +7 \
       -exec rm -rf -- {} + 2>/dev/null
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
else
  # Ce que les gates disent en plus de leurs lignes FAIL : le nom des tests en
  # échec, leur erreur, le chemin de leur sortie complète. L'empreinte, plus bas,
  # reste tirée des seules lignes FAIL — ce détail-ci change d'un tour à l'autre.
  DETAIL="$(printf '%s\n' "$SORTIE" | grep -v -e '^ok    ' -e '^FAIL' -e '^MESURE' -e '^gates : ' | head -100)"
  [ -n "$DETAIL" ] && DIAG="$DIAG

$DETAIL"
fi

if ! mkdir -p -- "$ETAT" 2>/dev/null; then
  # État inutilisable : on refuse de réveiller (sans compteur, c'est la boucle
  # infinie) — mais se taire serait pire. Sur un exit 0, stderr est jeté hors
  # mode debug : le seul canal qui survit est le systemMessage, lu par l'humain.
  printf '%s\n' "$DIAG" >&2
  python3 -c "
import json,sys
print(json.dumps({'systemMessage': sys.argv[1]}))" \
    "gates ROUGES et disjoncteur INOPÉRANT ($ETAT n'est pas créable) : aucun réveil émis.
$DIAG" 2>/dev/null
  exit 0
fi

[ -f "$ETAT/fini-total" ] && exit 0   # plafond absolu épuisé : silence définitif

# Sans ligne FAIL, shasum d'une entrée vide rend tout de même un condensat
# stable : tous les échecs muets partagent donc une seule empreinte, ce qui est
# le comportement voulu.
EMPREINTE="$(printf '%s\n' "$SORTIE" | grep '^FAIL' | sort | shasum | cut -c1-16)"

[ -f "$ETAT/fini-$EMPREINTE" ] && exit 0   # cet échec a déjà eu son message terminal

# Ce que le dev a réellement produit depuis le dernier réveil. Le compteur doit
# compter des TENTATIVES DE CORRECTION, pas des arrêts : un dev qui s'arrête
# pour poser une question de spec ne doit pas brûler un réveil.
ARBRE="$( { git -C "$ROOT" rev-parse HEAD 2>/dev/null
            git -C "$ROOT" status --porcelain=v1 2>/dev/null
            git -C "$ROOT" diff HEAD 2>/dev/null
            git -C "$ROOT" ls-files -o --exclude-standard -z 2>/dev/null \
              | xargs -0 shasum 2>/dev/null; } | shasum | cut -c1-16)"
if [ -f "$ETAT/tree-$EMPREINTE" ] && [ "$(cat "$ETAT/tree-$EMPREINTE")" = "$ARBRE" ]; then
  # Même échec, et rien n'a bougé depuis le réveil précédent : le rouge a DÉJÀ
  # été délivré à ce moment-là, donc il n'est pas tu ici — il n'est pas répété.
  exit 0
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
  # Par empreinte : cet échec-là est clos. Un échec DIFFÉRENT garde ses deux
  # tentatives, tant que le plafond absolu n'est pas atteint.
  : > "$ETAT/fini-$EMPREINTE"
  [ "$T" -gt "$MAX_TOTAL" ] && : > "$ETAT/fini-total"
  reveille "$DIAG

Gates toujours rouges après $((N-1)) réveil(s) sur cet échec et $((T-1)) au total ($EVENEMENT).
Ce n'est plus le code qui résiste. Signale 'bloqué' avec ce qui a été tenté et ce qui résiste — ne relance pas les gates."
fi

reveille "$DIAG

Gates ROUGES (réveil $N/$MAX_PAR_ECHEC sur cet échec, $T/$MAX_TOTAL au total). Corrige, puis laisse les gates se rejouer."

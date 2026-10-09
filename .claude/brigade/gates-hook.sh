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
MAX_TOTAL="${BRIGADE_GATES_MAX_TOTAL:-4}"           # plafond absolu par arbre jugé
# Un override non numérique ferait renvoyer le statut 2 à `[ -gt ]`, soit « faux » :
# le disjoncteur ne se déclencherait jamais, et la boucle reviendrait intacte.
case "$MAX_PAR_ECHEC" in ""|*[!0-9]*) MAX_PAR_ECHEC=2 ;; esac
case "$MAX_TOTAL"     in ""|*[!0-9]*) MAX_TOTAL=4 ;; esac

# L'entrée du hook, lue une fois : un champ par ligne, dans l'ordre demandé. Le
# dernier n'est pas un champ : c'est le nom que le harness garde à côté du
# transcript d'un subagent (`agent-<id>.meta.json`), celui qu'on lui a donné au
# spawn.
{ IFS= read -r ACTIF; IFS= read -r EVENEMENT; IFS= read -r SID
  IFS= read -r CWD; IFS= read -r AGENT; IFS= read -r NOM; } < <(python3 -c '
import json, re, sys
try:
    entree = json.load(sys.stdin)
    assert isinstance(entree, dict)
except Exception:
    entree = {}
def champ(nom):
    return " ".join(str(entree.get(nom) or "").split("\n"))
nom = ""
try:
    with open(re.sub(r"\.jsonl$", "", champ("agent_transcript_path")) + ".meta.json") as meta:
        nom = " ".join(str(json.load(meta).get("name") or "").split("\n"))
except Exception:
    pass
for nom_du_champ in ("stop_hook_active", "hook_event_name", "session_id", "cwd", "agent_type"):
    print(champ(nom_du_champ))
print(nom)' <<<"$(cat)" 2>/dev/null)

# Garde de récursion AVANT tout : le harness positionne stop_hook_active pour
# toute la session tant qu'un Stop asyncRewake est en vol. Sans cette sortie,
# deux tirs concurrents se marchent dessus.
[ "${ACTIF:-}" = "True" ] && exit 0

EVENEMENT="${EVENEMENT:-Stop}"
SID="$(printf '%s' "${SID:-}" | tr -cd 'A-Za-z0-9._-')"
[ -n "$SID" ] || SID="sans-session"

# L'arbre de la session se calcule, et CLAUDE_PROJECT_DIR est la variable
# stable : le cwd du process de hook n'est pas garanti, et `git rev-parse`
# désigne le mauvais arbre dans un sous-module.
SESSION="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$SESSION" ] && [ -d "$SESSION" ] || exit 0

# L'arbre jugé est celui où travaille qui s'arrête. Pour la session, c'est le
# sien. Pour un subagent, c'est son worktree — un dev-teammate ne touche pas
# l'arbre de la session, et l'y juger rejouait la suite entière sur un arbre
# que personne n'avait changé (45 passages rouges gardés le 2026-10-09, en six
# heures). Ce que l'entrée du hook porte pour le trouver, établi le 2026-10-09
# sur Claude Code 2.1.286 :
#   - `cwd` est le répertoire de la session, même quand le subagent a travaillé
#     ailleurs : le harness ramène un agent à ce répertoire entre deux
#     commandes. Il n'est donc cru que s'il désigne un AUTRE arbre du dépôt.
#   - le nom du subagent — `agent_type`, ou le nom gardé à côté de son
#     transcript. Le Manager nomme un dev `dev-<n>`, et le binding Worktrees
#     range le sien sous `<n>-<slug>` : le nom désigne l'arbre, s'il n'y en a
#     qu'un.
# Introuvable, rien n'est joué : l'arbre de la session n'est jugé que par
# l'arrêt de la session.
ROOT="$SESSION"
QUI=""
if [ "$EVENEMENT" = "SubagentStop" ]; then
  commun() { git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null; }
  sommet() { git -C "$1" rev-parse --show-toplevel 2>/dev/null; }
  ROOT=""
  QUI="${AGENT:-}"
  DEPOT="$(commun "$SESSION")"
  if [ -n "$DEPOT" ]; then
    if [ -n "${CWD:-}" ] && [ -d "$CWD" ] && [ "$(commun "$CWD")" = "$DEPOT" ] \
       && [ "$(sommet "$CWD")" != "$(sommet "$SESSION")" ]; then
      ROOT="$(sommet "$CWD")"
    else
      for nom in "${AGENT:-}" "${NOM:-}"; do
        N="$(printf '%s\n' "$nom" | sed -n 's/^dev-\([0-9][0-9]*\)$/\1/p')"
        [ -n "$N" ] || continue
        QUI="$nom"
        TROUVES="$(git -C "$SESSION" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' \
                   | while IFS= read -r arbre; do
                       case "${arbre##*/}" in ("$N"-*) [ ! -d "$arbre" ] || printf '%s\n' "$arbre" ;; esac
                     done)"
        # Deux arbres pour un même numéro : le nom n'en désigne aucun.
        case "$TROUVES" in ""|*"
"*) ;; *) ROOT="$TROUVES" ;; esac
        break
      done
    fi
  fi
  if [ -z "$ROOT" ]; then
    echo "gates : rien n'est joué à l'arrêt du subagent « ${QUI:-sans nom} » — son worktree ne s'établit pas par l'entrée du hook (cwd : ${CWD:-absent}), et l'arbre de la session n'est jugé qu'à l'arrêt de la session" >&2
    exit 0
  fi
fi
GATES="${BRIGADE_GATES_CMD:-$ROOT/.claude/brigade/gates.sh}"

# Un arbre qui n'a pas bougé depuis son dernier verdict n'est pas rejoué : le
# hook part à chaque arrêt, et la plupart ne changent rien. Les gates rendent
# alors le verdict qu'elles gardent, et le disent.
SORTIE="$(BRIGADE_GATES_VERDICT_GARDE=1 "$GATES" "$ROOT" 2>&1)"; RC=$?

# L'état vit sous $HOME, pas sous $TMPDIR : le TMPDIR d'un process de hook n'est
# pas celui d'un shell interactif (constaté sur macOS), et un TMPDIR neuf à
# chaque tir rendrait le compteur inopérant — donc la boucle de retour.
# Une ardoise par arbre jugé : les plafonds de réveils se comptent pour chacun,
# et le rouge d'un worktree n'entame pas ceux de la session.
ARDOISES="$HOME/.claude/brigade-gates/$SID"
ETAT="$ARDOISES/$(printf '%s' "${ROOT##*/}" | tr -cd 'A-Za-z0-9._-')-$(printf '%s' "$ROOT" | shasum | cut -c1-8)"

# Deux tirs sur un même arbre reçoivent leur verdict au même instant — gates.sh
# ne joue qu'un passage à la fois par arbre, et prête son verdict à qui l'a
# attendu. L'ardoise se lit et s'écrit donc un tir après l'autre : de front,
# les deux se croiraient chacun le premier, et un même échec brûlerait deux
# réveils. Le verrou tient à ce process et part avec lui ; s'il ne peut pas être
# pris, le tir continue sans lui. Son fichier est daté de chaque tir, avant
# d'être pris : la purge ne retire que ceux d'une session qui ne tire plus.
if mkdir -p -- "$HOME/.claude/brigade-gates" 2>/dev/null && touch -- "$ARDOISES.verrou" 2>/dev/null; then
  exec 9>>"$ARDOISES.verrou"
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
  rmdir -- "$ARDOISES" 2>/dev/null   # la dernière de la session emporte son répertoire
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
# Un verdict repris n'a pas été rejoué : ses mesures datent du passage gardé.
REPRIS="$(printf '%s\n' "$SORTIE" | grep -m1 '^gates : verdict repris')"
[ -z "$REPRIS" ] || DIAG="$DIAG
$REPRIS"
# À qui ce rouge revient. Le réveil d'un `SubagentStop` est livré à la session,
# pas au subagent (constaté le 2026-10-09 : seize réveils de `SubagentStop` dans
# le transcript de la session, aucun dans ceux des devs) : il nomme donc l'arbre
# et celui qui y travaille, pour que la session le lui transmette.
if [ -n "$QUI" ]; then
  DIAG="$DIAG

Arbre jugé : $ROOT — le worktree de $QUI, qui vient de s'arrêter. Ce rouge est le sien, et ce réveil arrive à la session : transmets-le-lui (SendMessage), ne corrige pas son arbre."
  CORRIGE="$QUI corrige, puis les gates se rejouent à son arrêt."
  BLOQUE="$QUI signale 'bloqué' avec ce qui a été tenté et ce qui résiste — personne ne relance les gates."
else
  DIAG="$DIAG

Arbre jugé : $ROOT — celui de la session."
  CORRIGE="Corrige, puis laisse les gates se rejouer."
  BLOQUE="Signale 'bloqué' avec ce qui a été tenté et ce qui résiste — ne relance pas les gates."
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
Ce n'est plus le code qui résiste. $BLOQUE"
fi

reveille "$DIAG

Gates ROUGES (réveil $N/$MAX_PAR_ECHEC sur cet échec, $T/$MAX_TOTAL au total). $CORRIGE"

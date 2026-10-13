#!/usr/bin/env bash
# Doublure de `claude` pour le closer d'une passe de fermeture : un flux
# `stream-json`, sans réseau ni quota. Ce que le closer fait dans son worktree
# est écrit par le test, dans FAUX_CLOSER_DIR :
#   gestes.sh    ce qu'il fait — du shell, joué dans le worktree, entre son
#                premier tour et son compte-rendu ; absent, il ne fait rien
#   message.txt  son compte-rendu ; absent, il est vide
#   feu          ce qu'attend `attendre` pour rendre la main
# Chaque lancement inscrit son répertoire dans `lancements`, et sa consigne
# dans `consigne`.
set -u
dir="${FAUX_CLOSER_DIR:?faux closer : FAUX_CLOSER_DIR manque}"
pwd -P >>"$dir/lancements"
printf '%s' "${2:-}" >"$dir/consigne"

tours=0
# Un tour, qui consomme ce nombre de tokens — dix, sans autre précision.
assistant() {
  tours=$((tours + 1))
  printf '{"type":"assistant","message":{"id":"msg_%d","role":"assistant","usage":{"input_tokens":%d,"output_tokens":0}}}\n' "$tours" "${1:-10}"
}
# Rester là sans rien dire, jusqu'au feu du test — ou qu'un garde-fou y mette
# fin. Trente secondes, pas davantage : une suite tuée en plein vol ne laisse
# pas de faux closer derrière elle.
attendre() {
  local pas=0
  while [ ! -e "$dir/feu" ] && [ "$pas" -lt 600 ]; do
    sleep 0.05
    pas=$((pas + 1))
  done
}
# Ce que fait un closer qui a rangé : un commit de tout ce qu'il a touché.
commiter() {
  git add -A >/dev/null || exit 1
  git -c user.name=closer -c user.email=closer@brigade.test -c commit.gpgsign=false commit -q -m "la passe de fermeture" >/dev/null || exit 1
}

assistant
# shellcheck disable=SC1091
[ ! -e "$dir/gestes.sh" ] || . "$dir/gestes.sh"

texte=""
[ ! -e "$dir/message.txt" ] || IFS= read -r -d '' texte <"$dir/message.txt" || true
ANTISLASH='\'
texte=${texte//"$ANTISLASH"/$ANTISLASH$ANTISLASH}
texte=${texte//'"'/$ANTISLASH'"'}
texte=${texte//$'\n'/${ANTISLASH}n}
printf '{"type":"result","subtype":"success","is_error":false,"num_turns":%d,"result":"%s"}\n' "$tours" "$texte"

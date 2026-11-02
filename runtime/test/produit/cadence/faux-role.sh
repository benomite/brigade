#!/usr/bin/env bash
# Doublure de `claude` pour le rôle produit : un flux `stream-json`, sans réseau
# ni quota. Ce que le rôle répond est écrit par le test, dans FAUX_ROLE_DIR :
#   reponse.txt  sa réponse ; absent, « Rien à déposer : rien de neuf. »
# Chaque lancement ajoute une ligne à `lancements`, et laisse sa consigne dans
# `consigne` ; il ajoute une ligne à `fins` quand il a tout écrit.
set -u
dir="${FAUX_ROLE_DIR:?faux rôle : FAUX_ROLE_DIR manque}"
echo lance >>"$dir/lancements"
# La consigne suit `-p`.
while [ "$#" -gt 0 ]; do
  if [ "$1" = -p ]; then
    printf '%s' "${2:-}" >"$dir/consigne"
    break
  fi
  shift
done

texte="Rien à déposer : rien de neuf."
[ -e "$dir/reponse.txt" ] && texte=$(cat "$dir/reponse.txt")
ANTISLASH='\'
texte=${texte//"$ANTISLASH"/$ANTISLASH$ANTISLASH}
texte=${texte//'"'/$ANTISLASH'"'}
texte=${texte//$'\n'/${ANTISLASH}n}
printf '{"type":"assistant","message":{"id":"msg_1","role":"assistant","usage":{"input_tokens":3,"output_tokens":7}}}\n'
printf '{"type":"result","subtype":"success","is_error":false,"num_turns":1,"result":"%s"}\n' "$texte"
echo fini >>"$dir/fins"

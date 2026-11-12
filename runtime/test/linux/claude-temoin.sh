#!/bin/sh
# Doublure de `claude` qui note, à chaque lancement, son répertoire et ce qu'il
# voit de l'état de la station (`$FAUX_ETAT`) — masqué dans la cloison des
# unités, visible hors d'elle —, une ligne dans `$FAUX_LANCEMENTS`, puis cède sa
# place à la doublure de la suite (../aides/faux-claude.sh).
if [ -e "$FAUX_ETAT/projets-servis.json" ]; then vu=visible; else vu=masque; fi
printf '%s\t%s\n' "$vu" "$PWD" >>"$FAUX_LANCEMENTS"
exec "${0%/*}/../aides/faux-claude.sh" "$@"

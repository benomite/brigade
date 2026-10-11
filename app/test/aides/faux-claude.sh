#!/bin/sh
# Faux `claude` interactif : ce qu'il faut du vrai pour éprouver le second.
# - `--continue` ne reprend que s'il y a un fil dans le dossier (le fichier
#   `.fil`) ; sinon il sort en 1, comme le vrai (« No conversation found to
#   continue », relevé sur claude 2.1.286) ;
# - sans option, il ouvre une session neuve, qui laisse un fil derrière elle.
# Puis il lit son entrée : `!taille` dit la taille de son terminal, `/exit` sort.
if [ "${1:-}" = "--continue" ]; then
  [ -f .fil ] || { echo "No conversation found to continue"; exit 1; }
  echo "fil repris dans $(pwd -P)"
else
  : >.fil
  echo "session neuve dans $(pwd -P)"
fi
if [ -t 0 ] && [ -t 1 ]; then echo "sur un terminal"; else echo "sans terminal"; fi
while IFS= read -r ligne; do
  case "$ligne" in
    /exit) exit 0 ;;
    '!taille') echo "taille : $(stty size)" ;;
    *) echo "reçu : $ligne" ;;
  esac
done

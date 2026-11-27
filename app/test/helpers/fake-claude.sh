#!/bin/sh
# Faux `claude` interactif : ce qu'il faut du vrai pour éprouver le second.
# - `--continue` ne reprend que s'il y a un fil dans le dossier (le fichier
#   `.fil`) ; sinon il sort en 1, comme le vrai (« No conversation found to
#   continue », relevé sur claude 2.1.286) ;
# - sans option, il ouvre une session neuve, qui laisse un fil derrière elle ;
#   ouverte sur une commande (`claude /brigade:init`), elle dit l'avoir reçue ;
# - `--append-system-prompt-file` : il dit la première ligne du fichier, qu'il
#   lit comme le vrai, et `--settings` est pris avec sa valeur, sans rien dire.
# Puis il lit son entrée : `!taille` dit la taille de son terminal, `/exit` sort.
reprise=
role=
recu=
while [ $# -gt 0 ]; do
  case "$1" in
    --continue) reprise=1 ;;
    --append-system-prompt-file) role=$2; shift ;;
    --settings) shift ;;
    *) [ -n "$recu" ] || recu=$1 ;;
  esac
  shift
done
if [ -n "$reprise" ]; then
  [ -f .fil ] || { echo "No conversation found to continue"; exit 1; }
  echo "fil repris dans $(pwd -P)"
else
  : >.fil
  echo "session neuve dans $(pwd -P)"
fi
if [ -n "$role" ]; then echo "rôle : $(head -n 1 "$role")"; fi
if [ -n "$recu" ]; then echo "reçu : $recu"; fi
if [ -t 0 ] && [ -t 1 ]; then echo "sur un terminal"; else echo "sans terminal"; fi
while IFS= read -r ligne; do
  case "$ligne" in
    /exit) exit 0 ;;
    '!taille') echo "taille : $(stty size)" ;;
    *) echo "reçu : $ligne" ;;
  esac
done

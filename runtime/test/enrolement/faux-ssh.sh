#!/bin/sh
# Un faux `ssh` : il note la destination dans $FAUX_SSH_TEMOIN, puis lance ici
# la commande qu'un vrai `ssh` ferait lancer chez elle — comme lui, par un
# shell, ses mots joints d'une espace. L'entrée standard passe telle quelle.
[ "$1" = "--" ] && shift
printf '%s\n' "$1" >>"${FAUX_SSH_TEMOIN:?}"
shift
exec sh -c "$*"

#!/bin/sh
# Un faux `ssh` pour les tests : la « machine distante » est ce poste. Il saute ses options, prend
# l'hôte, et lance la commande distante ici. Le réseau se coupe par un fichier : tant que
# `$BRIGADE_COUPURE` existe, une connexion neuve échoue, et une connexion établie lâche — ce que
# la commande y faisait tourner reçoit SIGHUP, comme d'un sshd qui perd son client —, et `ssh`
# sort en 255, comme le vrai.
#   faux-ssh.sh [options…] -- <hote> <commande>
while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done
shift
hote=$1
commande=$2
if [ -e "$BRIGADE_COUPURE" ]; then
  echo "ssh: connect to host $hote port 22: Network is unreachable" >&2
  exit 255
fi
# La commande d'un shell persistant est `sh -c '<script>'` : le script est lancé tel quel, pour que
# l'enfant soit le client du multiplexeur (le script finit par `exec`).
case $commande in
  "sh -c '"*"'") script=${commande#"sh -c '"}; script=${script%"'"} ;;
  *) script=$commande ;;
esac
# Sans contrôle des tâches, une commande en arrière-plan lit /dev/null : elle reçoit le terminal ainsi.
exec 3<&0
sh -c "$script" <&3 3<&- &
enfant=$!
exec 3<&-
while kill -0 "$enfant" 2>/dev/null; do
  if [ -e "$BRIGADE_COUPURE" ]; then
    kill -HUP "$enfant" 2>/dev/null
    echo "Timeout, server $hote not responding." >&2
    exit 255
  fi
  sleep 0.05
done
wait "$enfant"

#!/usr/bin/env bash
# Doublure de `sudo -n -l <lien>`, pour le contrôle du geste de mise en service :
# accorde, sauf si un fichier `sudo-refuse` est posé à côté du lien — elle dit
# alors ce que dit sudo quand sa règle est inopérante. Ne lance rien.
set -u
lien="${@: -1}"
if [ -e "$(dirname "$lien")/sudo-refuse" ]; then
  echo "sudo: a password is required" >&2
  exit 1
fi
echo "$lien"

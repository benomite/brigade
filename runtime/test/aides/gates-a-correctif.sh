#!/usr/bin/env bash
# Doublure des gates d'un projet dont la base a été cassée, puis réparée par un
# correctif : rouges tant que l'arbre reçu ne porte pas `correctif.txt`.
set -u
echo "$1" >> "$FAUSSES_GATES.appels"
if [ -f "$1/correctif.txt" ]; then
  echo "ok    tests du projet"
  echo "gates : VERT"
else
  echo "FAIL  trois tests du dépôt échouent sur cette machine" >&2
  echo "gates : ROUGE" >&2
  exit 1
fi

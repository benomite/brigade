#!/usr/bin/env bash
# Doublure des gates d'un projet qui déclare des mesures : une ligne
# `MESURE  <nom>=<nombre>` par ligne `<nom>=<nombre>` du fichier
# $FAUSSES_GATES.mesures, que le test écrit — absent, elles n'en déclarent
# aucune —, puis le scénario des fausses gates ($FAUSSES_GATES_SH), qui donne
# le verdict.
set -u
if [ -f "$FAUSSES_GATES.mesures" ]; then
  while IFS= read -r mesure; do echo "MESURE  $mesure"; done <"$FAUSSES_GATES.mesures"
fi
exec "$FAUSSES_GATES_SH" "$@"

#!/usr/bin/env bash
# Doublure des gates d'un projet : joue le scénario écrit dans le fichier
# $FAUSSES_GATES (« vert » s'il n'existe pas) et note chaque appel, avec le
# worktree reçu, dans $FAUSSES_GATES.appels. Les worktrees de test y mènent par
# un lien : un exécutable fraîchement écrit attend un tiers de seconde sur macOS.
set -u
echo "$1" >> "$FAUSSES_GATES.appels"
case "$(cat "$FAUSSES_GATES" 2>/dev/null || echo vert)" in
  vert)
    echo "ok    tests du projet"
    echo "gates : VERT"
    ;;
  rouge)
    echo "ok    JSON valide"
    echo "FAIL  tests du projet en échec" >&2
    echo "gates : ROUGE" >&2
    exit 1
    ;;
  lent)
    sleep 30
    ;;
  *)
    echo "fausses gates : scénario inconnu" >&2
    exit 64
    ;;
esac

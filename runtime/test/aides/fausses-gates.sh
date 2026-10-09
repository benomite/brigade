#!/usr/bin/env bash
# Doublure des gates d'un projet : joue le scénario écrit dans le fichier
# $FAUSSES_GATES (« vert » s'il n'existe pas) et note chaque appel, avec le
# worktree reçu, dans $FAUSSES_GATES.appels. Les worktrees de test y mènent par
# un lien : un exécutable fraîchement écrit attend un tiers de seconde sur macOS.
# Un worktree qui porte son propre scénario (`.claude/brigade/scenario-gates`)
# joue celui-là : il ne vaut que pour lui, et ne déborde sur aucun autre.
set -u
echo "$1" >> "$FAUSSES_GATES.appels"
# Le jeton GitHub que les gates voient dans leur environnement : une ligne par appel, vide s'il n'y en a pas.
echo "${GH_TOKEN-}" >> "$FAUSSES_GATES.jetons"
case "$(cat "$1/.claude/brigade/scenario-gates" 2>/dev/null || cat "$FAUSSES_GATES" 2>/dev/null || echo vert)" in
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

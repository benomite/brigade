#!/usr/bin/env bash
# Doublure du setup de worktree d'un projet : joue le scénario écrit dans le
# fichier $FAUX_SETUP (« exporte » s'il n'existe pas) et note chaque appel — le
# numéro du ticket et le worktree reçus — dans $FAUX_SETUP.appels. Les worktrees
# de test y mènent par un lien, comme pour les fausses gates.
set -u
echo "$1 $2" >> "$FAUX_SETUP.appels"
case "$(cat "$FAUX_SETUP" 2>/dev/null || echo exporte)" in
  exporte)
    echo "worktree prêt pour le ticket $1" >&2
    printf 'export BASE_DE_TEST=%q\n' "base du ticket $1"
    # Ce que le setup de brigade attribue à un worktree : un état qui lui est propre.
    printf 'export BRIGADE_STATE_DIR=%q\n' "$2/.brigade-state"
    ;;
  echec)
    echo "npm ci a échoué" >&2
    exit 1
    ;;
  lent)
    sleep 30
    ;;
  *)
    echo "faux setup : scénario inconnu" >&2
    exit 64
    ;;
esac

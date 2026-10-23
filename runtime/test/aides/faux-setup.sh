#!/usr/bin/env bash
# Doublure du setup de worktree d'un projet : joue le scénario écrit dans le
# fichier $FAUX_SETUP (« exporte » s'il n'existe pas) et note chaque appel — le
# numéro du ticket et le worktree reçus — dans $FAUX_SETUP.appels. Les worktrees
# de test y mènent par un lien, comme pour les fausses gates.
set -u
echo "$1 $2" >> "$FAUX_SETUP.appels"
scenario=exporte
if [ -f "$FAUX_SETUP" ]; then
  IFS= read -r -d '' scenario <"$FAUX_SETUP" || true
  scenario="${scenario%$'\n'}"
fi
case "$scenario" in
  exporte)
    echo "worktree prêt pour le ticket $1" >&2
    printf 'export BASE_DE_TEST=%q\n' "base du ticket $1"
    # Ce que le setup de brigade attribue à un worktree : un état qui lui est propre.
    printf 'export BRIGADE_STATE_DIR=%q\n' "$2/.brigade-state"
    ;;
  # Exporte aussi une clé, comme un setup qui charge un `.env` entier.
  jeton)
    printf 'export BASE_DE_TEST=%q\n' "base du ticket $1"
    printf 'export ANTHROPIC_API_KEY=%q\n' "sk-du-projet"
    printf 'export CLAUDE_CODE_OAUTH_TOKEN=%q\n' "jeton-du-projet"
    printf 'export GH_TOKEN=%q\n' "ghp-du-projet"
    ;;
  # Ne rend la main qu'une fois le fichier $FAUX_SETUP.go posé par le test.
  attend)
    while [ ! -e "$FAUX_SETUP.go" ]; do sleep 0.02; done
    printf 'export BASE_DE_TEST=%q\n' "base du ticket $1"
    ;;
  # Prépare la base du ticket à partir d'un secret du projet, et le dit.
  derive)
    echo "base créée sur ${DATABASE_URL-}" >&2
    printf 'export BASE_DE_TEST=%q\n' "${DATABASE_URL-}/ticket_$1"
    ;;
  echec)
    echo "npm ci a échoué" >&2
    exit 1
    ;;
  # Bute sur ce que la station n'a pas : un fichier que le dépôt ne porte pas,
  # des commandes qu'elle n'a pas installées.
  manque)
    echo "cp: cannot stat 'apps/api/.env': No such file or directory" >&2
    echo "./setup.sh: line 9: docker: command not found" >&2
    echo "./setup.sh: line 12: psql: command not found" >&2
    exit 1
    ;;
  # Bute sur le Postgres de la station, qui refuse son compte — l'échec du
  # setup de mirrorlab sur parade-box.
  postgres)
    echo "Scope: all 3 workspace projects" >&2
    echo 'psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: FATAL:  role "claude" does not exist' >&2
    exit 2
    ;;
  # Échoue autrement qu'« echec » : une autre cause.
  autre)
    echo "tsc a échoué" >&2
    exit 2
    ;;
  # Bute sur un hôte que la porte refuse : n'échoue qu'une fois le fichier
  # $FAUX_SETUP.go posé par le test, qui a eu le temps de journaliser le refus.
  refuse)
    while [ ! -e "$FAUX_SETUP.go" ]; do sleep 0.02; done
    echo "npm error network request to https://registry.npmjs.org/ failed" >&2
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

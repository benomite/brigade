#!/usr/bin/env bash
# Publie la release de l'app <tag> avec ses fichiers : `publier.sh <tag> <notes.md> <fichier>...`,
# joué par publier-app dans le dossier des fichiers. La release vise `$GITHUB_SHA` et devient
# « latest » : `releases/latest` (le lien du README et du site) mène à l'app.
#
# - Pas de release pour <tag> : `gh release create` la crée en brouillon, y dépose les fichiers, puis
#   la publie ; il efface son brouillon quand une étape échoue, s'il le peut.
# - Une release existe déjà pour <tag>, publiée (un run rejoué) ou brouillon (un essai d'avant dont
#   le brouillon n'a pas pu être effacé) : ses fichiers sont remplacés, et elle est publiée.
# - Un essai qui échoue est rejoué après une pause (une limite secondaire de GitHub passe en
#   attendant) ; le dernier échec écrit l'erreur de `gh` en annotation `::error::`, que la page du run
#   montre sans connexion, là où le journal du job demande les droits d'admin du dépôt (#2521).
#
# Il faut `GH_TOKEN` et `GH_REPO` (ou `gh` connecté dans un dépôt git), et `GITHUB_SHA`.
# `BRIGADE_PUBLIER_ESSAIS` (4 par défaut) et `BRIGADE_PUBLIER_PAUSE` (30 s, doublée à chaque
# essai) règlent les reprises.
set -euo pipefail
usage="usage: publier.sh <tag app-v…> <notes.md> <fichier>..."
tag=${1:?$usage}
notes=${2:?$usage}
shift 2
[ "$#" -ge 1 ] || { echo "$usage" >&2; exit 2; }
case "$tag" in app-v*) ;; *) echo "tag inconnu : $tag (app-v<version>)" >&2; exit 2;; esac
cible=${GITHUB_SHA:?"GITHUB_SHA manque : le commit que la release vise"}
essais=${BRIGADE_PUBLIER_ESSAIS:-4}
pause=${BRIGADE_PUBLIER_PAUSE:-30}
titre="Brigade ${tag#app-v}"
erreurs=$(mktemp)
trap 'rm -f "$erreurs"' EXIT

# Un essai : 0 si la release est publiée avec ses fichiers ; sinon l'erreur de `gh` est dans $erreurs.
essayer() {
  : > "$erreurs"
  local brouillon
  # `gh release view` trouve aussi un brouillon par le tag qu'il portera.
  if brouillon=$(gh release view "$tag" --json isDraft --jq .isDraft 2>"$erreurs"); then
    [ "$brouillon" = true ] && echo "A draft release $tag is left from an earlier attempt: it is completed and published."
    gh release upload "$tag" "$@" --clobber 2>"$erreurs" \
      && gh release edit "$tag" --draft=false --title "$titre" --notes-file "$notes" --latest 2>"$erreurs"
  elif grep -q 'release not found' "$erreurs"; then
    gh release create "$tag" "$@" \
      --target "$cible" \
      --title "$titre" \
      --notes-file "$notes" \
      --latest 2>"$erreurs"
  else
    return 1
  fi
}

for ((essai = 1; ; essai++)); do
  if essayer "$@"; then
    echo "Published $tag."
    exit 0
  fi
  erreur=$(tr '\n' ' ' < "$erreurs" | sed 's/  */ /g; s/ $//')
  if [ "$essai" -ge "$essais" ]; then
    echo "::error::$tag was not published after $essais attempts: ${erreur:-gh said nothing}"
    exit 1
  fi
  attente=$((pause * 2 ** (essai - 1)))
  echo "::warning::Publishing $tag failed (attempt $essai of $essais), trying again in ${attente}s: ${erreur:-gh said nothing}"
  sleep "$attente"
done

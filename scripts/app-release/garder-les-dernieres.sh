#!/usr/bin/env bash
# Ne garde que les <n> dernières releases d'un produit, tags compris : `garder-les-dernieres.sh app-v 5`
# ou `garder-les-dernieres.sh station- 5`. Les plus récentes se lisent à la date de création de la
# release. Joué après chaque publication (publier-app, publier-station) et à la main par
# `retention-releases`, qui fait la purge des anciennes.
# Il faut `GH_TOKEN` (ou `gh` connecté) et `GH_REPO` (ou un dépôt git) ; `--simuler` n'efface rien.
set -euo pipefail
prefixe=${1:?"usage: garder-les-dernieres.sh <préfixe de tag> <n> [--simuler]"}
garder=${2:?"usage: garder-les-dernieres.sh <préfixe de tag> <n> [--simuler]"}
simuler=${3:-}
case "$garder" in ''|*[!0-9]*) echo "n doit être un entier, pas '$garder'" >&2; exit 2;; esac
[ "$garder" -ge 1 ] || { echo "n doit valoir au moins 1" >&2; exit 2; }
# `app-v` ne doit jamais attraper autre chose, ni `station-` : le préfixe est un des deux, tel quel.
case "$prefixe" in app-v|station-) ;; *) echo "préfixe inconnu : $prefixe (app-v ou station-)" >&2; exit 2;; esac

anciennes=$(gh release list --limit 1000 --json tagName,createdAt \
  --jq "[.[] | select(.tagName | startswith(\"$prefixe\"))] | sort_by(.createdAt) | reverse | .[$garder:] | .[].tagName")
[ -n "$anciennes" ] || { echo "$prefixe : rien à retirer (au plus $garder releases)."; exit 0; }
while IFS= read -r tag; do
  if [ "$simuler" = --simuler ]; then
    echo "retirerait $tag"
  else
    gh release delete "$tag" --cleanup-tag --yes
    echo "retiré $tag"
  fi
done <<< "$anciennes"

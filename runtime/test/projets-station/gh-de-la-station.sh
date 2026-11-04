#!/bin/sh
# Le `gh` de la vraie station de station.test.ts : les gists du compte par leur
# doublure (appairage/faux-gh-gists.sh) ; le reste — le clone du dépôt choisi,
# le compte qu'elle interroge quand il échoue — répond ici comme la doublure y
# répondrait, sans démarrer de Node à chaque appel.
ICI="$(dirname "$0")"
if [ "${1:-}" != api ]; then
  echo "faux gh : seul \`gh api\` est doublé ($*)" >&2
  exit 1
fi
for arg in "$@"; do
  case "$arg" in /gists*) exec "$ICI/../appairage/faux-gh-gists.sh" "$@" ;; esac
done
echo "gh: Not Found (HTTP 404)" >&2
exit 1

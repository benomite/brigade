#!/bin/sh
# Doublure de `gh api` pour les gists du compte : la lecture d'un gist par son
# id, l'appel que la station fait le plus, se joue ici, en shell — un Node qui
# démarre coûte quarante millisecondes de processeur, et la suite en lance des
# dizaines (#1635). Tout le reste — créer, réécrire, lister, et les pannes que
# le répertoire simule — est à faux-gh-gists.ts, auquel celle-ci cède sa
# place avant d'avoir rien noté : chaque appel n'est noté qu'une fois.
ICI="$(dirname "$0")"
REPERTOIRE="${FAUX_GISTS:-}"
ceder() { exec node "$ICI/faux-gh-gists.ts" "$@"; }

[ "${1:-}" = api ] || ceder "$@"
methode=GET
chemin=""
precedent=""
for arg in "$@"; do
  [ "$precedent" = -X ] && methode="$arg"
  case "$arg" in /*) [ -z "$chemin" ] && chemin="$arg" ;; esac
  precedent="$arg"
done
id="${chemin#/gists/}"
[ "$methode" = GET ] && [ "$id" != "$chemin" ] || ceder "$@"
case "$id" in "" | *[!a-z0-9]*) ceder "$@" ;; esac
for panne in panne deconnecte jeton-refuse limite; do
  [ -e "$REPERTOIRE/$panne" ] && ceder "$@"
done

printf '%s\n' "$*" >>"$REPERTOIRE/appels"
if [ -f "$REPERTOIRE/$id.gist.json" ]; then
  cat "$REPERTOIRE/$id.gist.json" && echo
else
  echo "gh: Not Found (HTTP 404)" >&2
  exit 1
fi

#!/usr/bin/env bash
# Doublure de `sudo`, pour le geste de mise en service que le runtime lance : ne
# donne aucun droit et ne lance rien — note ce qu'on lui a demandé, puis joue
# un scénario.
#
# Le runtime ne lui passe rien de son environnement : elle ne lit donc aucune
# variable. Elle se retrouve par son propre chemin — un test la lie sous
# `<racine>/bin/sudo`, et met `<racine>/bin` en tête du `PATH` du runtime :
#
#   <racine>/temoin     un fichier par lancement, à son pid : le pid de qui l'a
#                       lancée, son groupe de process, le nombre de ses
#                       arguments, ses arguments, puis son environnement —
#                       chacun terminé par un octet nul ;
#                       `ordre` les nomme dans l'ordre
#   <racine>/scenario   `rend <code> [ce qu'elle écrit avant de sortir]`, ou
#                       `attend` : ne sort (en 0) que quand le fichier
#                       `<racine>/feu` existe — rien ne court contre l'horloge ;
#                       ou `dit <code>` : écrit ce que porte `<racine>/sortie`,
#                       mot pour mot — les lignes d'une bascule —, puis sort ;
#                       `dit attend` : de même, puis attend `<racine>/feu`
set -u
racine="${BASH_SOURCE[0]%/*}/.."
temoin="$racine/temoin"

{
  printf '%s\0' "$PPID" "$(ps -o pgid= -p $$ | tr -d ' ')" "$#" "$@"
  env -0
} >"$temoin/$$.ecrit"
mv "$temoin/$$.ecrit" "$temoin/$$"
echo "$$" >>"$temoin/ordre"

# Filet : un test tué en plein vol ne la laisse pas derrière lui — passé le
# délai laissé à un test, elle sort seule.
attendre() {
  tours=0
  while [ ! -e "$racine/feu" ] && [ $tours -lt 6000 ]; do
    sleep 0.02
    tours=$((tours + 1))
  done
}

read -r scenario mots <"$racine/scenario"
case "$scenario" in
  attend)
    echo "faux sudo : le geste tourne"
    attendre
    echo "faux sudo : le geste a fini"
    ;;
  dit)
    cat "$racine/sortie" >&2
    [ "$mots" = attend ] || exit "$mots"
    attendre
    ;;
  rend)
    code="${mots%% *}"
    dit="${mots#"$code"}"
    echo "faux sudo : une première ligne"
    [ -n "$dit" ] && echo "${dit# }" >&2
    exit "$code"
    ;;
  *)
    echo "faux sudo : scénario inconnu « $scenario »" >&2
    exit 70
    ;;
esac

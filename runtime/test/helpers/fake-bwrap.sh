#!/usr/bin/env bash
# Doublure de `bwrap` : ne cloisonne rien. Note ses arguments, séparés par des
# octets nuls, dans un fichier du répertoire $FAUX_BWRAP_TEMOIN (s'il est
# défini), puis cède sa place à la commande qui suit `--`. Le `env` qui rend
# SIGTERM à la commande est écarté : celui de macOS ne le connaît pas.
# Avec FAUX_BWRAP_MONTE, elle laisse sur le disque ce que le vrai y laisse : le
# point de montage de chaque chemin rendu sous un répertoire monté à la place
# d'un autre — un répertoire vide pour un répertoire, un fichier vide sinon.
set -u
if [ -n "${FAUX_BWRAP_TEMOIN:-}" ]; then printf '%s\0' "$@" > "$FAUX_BWRAP_TEMOIN/$$-$RANDOM"; fi
places=()
while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
  case "$1" in
    --bind | --ro-bind | --bind-try | --ro-bind-try)
      if [ -n "${FAUX_BWRAP_MONTE:-}" ]; then
        for place in ${places[@]+"${places[@]}"}; do
          source="${place%%:*}" cible="${place#*:}"
          case "$3" in
            "$cible"/*)
              point="$source/${3#"$cible"/}"
              if [ -d "$2" ]; then mkdir -p "$point"; elif [ -e "$2" ] && [ ! -e "$point" ]; then : > "$point"; fi
              ;;
          esac
        done
        if [ "$2" != "$3" ]; then places+=("$2:$3"); fi
      fi
      shift 2
      ;;
  esac
  shift
done
shift
if [ "${1:-}" = env ] && [ "${2:-}" = "--default-signal=TERM" ]; then shift 2; fi
exec "$@"

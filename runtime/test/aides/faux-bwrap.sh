#!/usr/bin/env bash
# Doublure de `bwrap` : ne cloisonne rien. Note ses arguments, séparés par des
# octets nuls, dans un fichier du répertoire $FAUX_BWRAP_TEMOIN (s'il est
# défini), puis cède sa place à la commande qui suit `--`. Le `env` qui rend
# SIGTERM à la commande est écarté : celui de macOS ne le connaît pas.
set -u
if [ -n "${FAUX_BWRAP_TEMOIN:-}" ]; then printf '%s\0' "$@" > "$FAUX_BWRAP_TEMOIN/$$-$RANDOM"; fi
while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done
shift
if [ "${1:-}" = env ] && [ "${2:-}" = "--default-signal=TERM" ]; then shift 2; fi
exec "$@"

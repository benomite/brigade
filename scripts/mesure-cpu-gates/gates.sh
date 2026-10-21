#!/usr/bin/env bash
# Mesure ce que coûtent les gates : le temps processeur et l'horloge d'un passage
# complet de `.claude/brigade/gates.sh`, puis la charge du poste.
# Usage : scripts/mesure-cpu-gates/gates.sh [<worktree>]
# Sortie : une ligne `cpu_s=… utilisateur_s=… systeme_s=… horloge_s=… code=…`
# (le code est celui des gates : un rouge est mesuré aussi). Les gates
# s'impriment sur stderr, leurs lignes MESURE comprises. Ne jugent rien : à lancer sur un poste calme.
set -uo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WT="${1:-$(git rev-parse --show-toplevel)}"
uptime >&2
python3 -I "$ICI/mesure.py" -- "$WT/.claude/brigade/gates.sh" "$WT" </dev/null

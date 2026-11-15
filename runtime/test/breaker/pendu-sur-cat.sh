#!/usr/bin/env bash
# Doublure de `claude` qui cale comme le cook du 2026-11-15 (#3599) : un tour,
# un `cat` lancé qui attend son entrée, puis plus rien. Ses PENDU_FOIS premiers
# lancements calent ainsi ; les suivants jouent la doublure de `claude`
# (FAUX_CLAUDE). PENDU : un préfixe de chemin, à elle — chaque calage s'y prend
# en créant un répertoire, ce qui est atomique.
set -u
for rang in $(seq 1 "${PENDU_FOIS:-1}"); do
  if mkdir "$PENDU.$rang" 2>/dev/null; then
    printf '%s\n' '{"type":"assistant","message":{"id":"msg_1","role":"assistant","usage":{"input_tokens":3,"output_tokens":7},"content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"cat"}}]}}'
    exec sleep 30
  fi
done
exec "${BASH_SOURCE[0]%/*}/../aides/faux-claude.sh" "$@"

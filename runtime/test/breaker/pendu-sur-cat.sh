#!/usr/bin/env bash
# Doublure de `claude` qui cale comme le cook du 2026-11-15 (#3599) : un tour,
# un `cat` lancé qui attend son entrée, puis plus rien. Ses PENDU_FOIS premiers
# lancements calent ainsi ; les suivants jouent la doublure de `claude`
# (FAUX_CLAUDE). PENDU : un préfixe de chemin, à elle — chaque calage s'y prend
# en créant un fichier qui n'existe pas encore (`set -C`), ce qui est atomique.
# Rien que des commandes du shell avant de céder la place : sous Windows, chaque
# process lancé coûte assez pour qu'une relance qui doit parler reste muette
# au-delà du plafond d'inactivité du test (#3705, CI windows). La doublure de
# `claude` est lue dans ce shell-ci, pas lancée : un second bash qui démarre
# coûtait encore assez pour que la relance du cook de #44 cale (#3860).
set -u
for ((rang = 1; rang <= ${PENDU_FOIS:-1}; rang++)); do
  set -C
  if { : >"$PENDU.$rang"; } 2>/dev/null; then
    set +C
    printf '%s\n' '{"type":"assistant","message":{"id":"msg_1","role":"assistant","usage":{"input_tokens":3,"output_tokens":7},"content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"cat"}}]}}'
    exec sleep 30
  fi
  set +C
done
. "${BASH_SOURCE[0]%/*}/../aides/faux-claude.sh" "$@"

#!/usr/bin/env bash
#
# Fait descendre la version publiée de brigade dans TOUS les projets qui l'ont
# installé, quel que soit leur scope. À jouer une fois par release, depuis
# n'importe où.
#
# Pourquoi un script : `claude plugin update` prend un seul scope à la fois et
# n'a pas de `--all`, et `claude plugin list` liste le poste entier sans dire à
# quel projet chaque installation appartient. Le seul fichier qui porte le
# couple (projet, scope) est installed_plugins.json — c'est donc lui qui décide
# ici, et aucun projet n'est oublié parce que personne ne s'en souvenait.
#
# La mise à jour ne s'applique qu'au redémarrage des sessions concernées
# (« restart required to apply », dit le CLI) : ne la jouez pas en attendant
# qu'une orchestration en cours change de comportement, elle ne le fera pas.

set -uo pipefail

INST="$HOME/.claude/plugins/installed_plugins.json"
[ -r "$INST" ] || { echo "introuvable : $INST" >&2; exit 1; }

echo "== marketplace"
claude plugin marketplace update brigade || exit 1

PUB="$(python3 -c "import json,pathlib;print(json.loads((pathlib.Path.home()/'.claude/plugins/marketplaces/brigade/.claude-plugin/plugin.json').read_text())['version'])")"
echo "== version publiée : $PUB"

rc=0
while IFS=$'\t' read -r scope path version; do
  [ -n "$scope" ] || continue
  if [ "$version" = "$PUB" ]; then
    echo "-- ${path:-<user>} : déjà en $version"
    continue
  fi
  echo "-- ${path:-<user>} : $version → $PUB (scope $scope)"
  if [ -n "$path" ]; then
    [ -d "$path" ] || { echo "   projet disparu, ignoré"; continue; }
    ( cd "$path" && claude plugin update brigade@brigade --scope "$scope" ) || rc=1
  else
    claude plugin update brigade@brigade --scope "$scope" || rc=1
  fi
done < <(python3 - "$INST" <<'VER'
import json, sys
ent = json.load(open(sys.argv[1]))['plugins'].get('brigade@brigade', [])
for e in ent:
    print(e.get('scope', ''), e.get('projectPath', ''), e.get('version', ''), sep='\t')
VER
)

echo
echo "Reste à faire à la main, projet par projet :"
echo "  · redémarrer les sessions ouvertes (rien ne change à chaud)"
echo "  · /brigade:sync   là où il y a un miroir Codex"
echo "  · /brigade:init   si le bloc de bindings ou les settings doivent suivre"
exit $rc

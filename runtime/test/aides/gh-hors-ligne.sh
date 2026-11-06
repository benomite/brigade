#!/bin/sh
# Un `gh` sans réseau, en shell : chaque appel échoue comme `gh` hors ligne,
# sans démarrer de Node. Pour une station d'essai dont ce qu'elle publie d'elle
# sur GitHub n'est pas le sujet : elle le retente une minute plus tard, bien
# après la fin du test (enregistrement-station/contrat.ts, NOUVEL_ESSAI_MS).
echo "error connecting to api.github.com" >&2
exit 1

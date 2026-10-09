#!/usr/bin/env bash
# Doublure de `systemctl` : ne connaît que les unités nommées dans
# $FAUX_SYSTEMCTL_UNITES, séparées par des espaces. `cat` et `is-enabled`
# réussissent pour elles, et échouent pour toute autre comme sur une machine
# où l'unité n'est pas installée.
set -u
unite="${!#}"
case " ${FAUX_SYSTEMCTL_UNITES:-} " in
  *" $unite "*) exit 0 ;;
esac
echo "No files found for $unite." >&2
exit 1

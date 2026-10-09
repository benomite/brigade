#!/usr/bin/env bash
# Doublure de `systemctl` : ne connaît que les unités nommées dans
# $FAUX_SYSTEMCTL_UNITES, séparées par des espaces. `cat` et `is-enabled`
# réussissent pour elles, et échouent pour toute autre comme sur une machine
# où l'unité n'est pas installée. `show` rend d'elles ce que le test a dicté :
# $FAUX_SYSTEMCTL_ENVIRONNEMENT (aucune variable, sinon) et
# $FAUX_SYSTEMCTL_TMP_PRIVE (`no`, sinon).
set -u
unite="${!#}"
case " ${FAUX_SYSTEMCTL_UNITES:-} " in
  *" $unite "*)
    if [ "$1" = show ]; then
      echo "Environment=${FAUX_SYSTEMCTL_ENVIRONNEMENT:-}"
      echo "PrivateTmp=${FAUX_SYSTEMCTL_TMP_PRIVE:-no}"
    fi
    exit 0
    ;;
esac
echo "No files found for $unite." >&2
exit 1

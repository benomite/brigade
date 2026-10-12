#!/usr/bin/env bash
# Doublure de `systemctl` : ne connaît que les unités nommées dans
# $FAUX_SYSTEMCTL_UNITES, séparées par des espaces. `cat` et `is-enabled`
# réussissent pour elles, et échouent pour toute autre comme sur une machine
# où l'unité n'est pas installée. `show` rend d'elles ce que le test a dicté :
# $FAUX_SYSTEMCTL_ENVIRONNEMENT (aucune variable, sinon),
# $FAUX_SYSTEMCTL_TMP_PRIVE (`no`, sinon), $FAUX_SYSTEMCTL_ETAT (`inactive`,
# sinon) et $FAUX_SYSTEMCTL_FRAGMENT, le fichier d'où l'unité est chargée
# (aucun, sinon) et $FAUX_SYSTEMCTL_CHARGE, son `LoadState` (`loaded`, sinon).
set -u
unite="${!#}"
case " ${FAUX_SYSTEMCTL_UNITES:-} " in
  *" $unite "*)
    if [ "$1" = show ]; then
      echo "Environment=${FAUX_SYSTEMCTL_ENVIRONNEMENT:-}"
      echo "PrivateTmp=${FAUX_SYSTEMCTL_TMP_PRIVE:-no}"
      echo "ActiveState=${FAUX_SYSTEMCTL_ETAT:-inactive}"
      echo "LoadState=${FAUX_SYSTEMCTL_CHARGE:-loaded}"
      echo "FragmentPath=${FAUX_SYSTEMCTL_FRAGMENT:-}"
    fi
    exit 0
    ;;
esac
echo "No files found for $unite." >&2
exit 1

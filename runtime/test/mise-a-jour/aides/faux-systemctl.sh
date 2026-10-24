#!/bin/sh
# Doublure de `systemctl` pour une machine d'essai : les questions que la mise
# à jour pose à systemd — `show`, `is-active`, `is-enabled`, la moitié de ses
# appels — se répondent ici, en shell, comme faux-systemctl.ts y répond : un
# Node qui démarre coûte quarante millisecondes de processeur à chacune
# (#1635). Ce qui lance ou arrête une unité, ou relit les unités, est à
# faux-systemctl.ts, auquel celle-ci cède sa place avant d'avoir rien noté.
ICI="$(dirname "$0")"
ceder() { exec "${FAUX_SYSTEMCTL_NODE:-node}" "$ICI/faux-systemctl.ts" "$@"; }

[ -n "${FAUSSE_RACINE:-}" ] || ceder "$@"
verbe=""
unites=""
silencieux=0
for arg in "$@"; do
  case "$arg" in
    --quiet) silencieux=1 ;;
    --*) ;;
    *) if [ -z "$verbe" ]; then verbe="$arg"; else unites="$unites $arg"; fi ;;
  esac
done
case "$verbe" in show | is-active | is-enabled) ;; *) ceder "$@" ;; esac

ETAT="$FAUSSE_RACINE/run/faux-systemd"
mkdir -p "$ETAT/chargees" "$ETAT/activees"
printf 'systemctl %s\n' "$*" >>"$ETAT/appels"

# L'état d'une unité, comme etatDe : `actif pid`. Un zombie n'est plus la station.
etat_de() {
  pid=0
  [ -f "$ETAT/$1.pid" ] && pid="$(cat "$ETAT/$1.pid")"
  pid="${pid:-0}"
  if [ "$pid" -gt 0 ] 2>/dev/null && kill -0 "$pid" 2>/dev/null; then
    stat="$(cat "/proc/$pid/stat" 2>/dev/null)" || stat=""
    case "${stat##*) }" in Z*) ;; *) echo "active $pid"; return ;; esac
  fi
  if [ -e "$ETAT/$1.actif" ]; then echo "active 0"
  elif [ "$pid" -gt 0 ] 2>/dev/null && [ ! -e "$ETAT/$1.arrete" ]; then echo "failed 0"
  else echo "inactive 0"; fi
}

code=0
case "$verbe" in
  show)
    set -- $unites ""
    set -- $(etat_de "$1")
    printf 'MainPID=%s\nNRestarts=0\nActiveState=%s\n' "$2" "$1"
    ;;
  is-enabled)
    for unite in $unites; do [ -e "$ETAT/activees/$unite" ] || code=1; done
    [ "$silencieux" = 1 ] || { [ "$code" = 0 ] && echo enabled || echo disabled; }
    ;;
  is-active)
    for unite in $unites; do
      case "$(etat_de "$unite")" in "active "*) ;; *) code=3 ;; esac
    done
    [ "$silencieux" = 1 ] || { [ "$code" = 0 ] && echo active || echo inactive; }
    ;;
esac
exit "$code"

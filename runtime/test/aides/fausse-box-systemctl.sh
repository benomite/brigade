#!/bin/sh
# Doublure de `systemctl` pour la bascule : une box entière sous $FAUSSE_BOX.
#
#   unites/     ce que la box a posé (le gabarit, les drop-ins des instances)
#   systemd/    ce que systemd tient de chaque unité : son état, et le
#               `code.conf` qu'il a chargé au dernier `daemon-reload`
#   etat/<p>/   le répertoire d'état du projet <p>
#   appels      chaque appel reçu, dans l'ordre
#   demarres    le répertoire réel de chaque démarrage, dans l'ordre
#
# `start` joue le runtime : il lit `demarrage` dans le répertoire de travail
# que systemd a chargé pour l'instance — `ok` (le témoin est posé, l'unité est
# `active`), `refus` (code 2, `failed`), `crash` (relancée par systemd, sans
# fin) ou `muet` (`active`, et jamais de témoin).
set -u
echo "$*" >>"$FAUSSE_BOX/appels"
unites="$FAUSSE_BOX/unites"

tenu() { echo "$FAUSSE_BOX/systemd/$1"; }
noter() {
  mkdir -p "$(tenu "$1")"
  echo "$3" >"$(tenu "$1")/$2"
}

case "$1" in
  show)
    # show -p <propriété> --value <unité>
    propriete="$3" unite="$5"
    [ "$(cat "$FAUSSE_BOX/en-panne" 2>/dev/null)" = "$propriete" ] && { echo "Failed to connect to bus" >&2; exit 1; }
    projet="${unite#brigade@}"
    projet="${projet%.service}"
    case "$propriete" in
      DropInPaths) ls "$unites/$unite.d"/*.conf 2>/dev/null | tr '\n' ' ' ;;
      FragmentPath) cat "$FAUSSE_BOX/fragment" 2>/dev/null || echo "$unites/brigade@.service" ;;
      Environment) echo "BRIGADE_STATE_DIR=/nulle/part BRIGADE_PROJECT=$projet BRIGADE_STATE_DIR=$FAUSSE_BOX/etat/$projet" ;;
      ActiveState) cat "$(tenu "$unite")/ActiveState" 2>/dev/null || echo inactive ;;
      SubState) cat "$(tenu "$unite")/SubState" 2>/dev/null || echo dead ;;
      NRestarts) cat "$(tenu "$unite")/NRestarts" 2>/dev/null || echo 0 ;;
      ExecMainStatus) cat "$(tenu "$unite")/ExecMainStatus" 2>/dev/null || echo 0 ;;
    esac
    ;;
  daemon-reload)
    for instance in "$unites"/*.service.d; do
      [ -d "$instance" ] || continue
      unite="$(basename "$instance" .d)"
      mkdir -p "$(tenu "$unite")"
      rm -f "$(tenu "$unite")/code.conf"
      [ -f "$instance/code.conf" ] && cp "$instance/code.conf" "$(tenu "$unite")/code.conf"
    done
    ;;
  stop)
    noter "$2" ActiveState inactive
    noter "$2" SubState dead
    ;;
  reset-failed)
    noter "$2" NRestarts 0
    ;;
  start)
    unite="$2"
    projet="${unite#brigade@}"
    projet="${projet%.service}"
    travail="$(sed -n 's/^WorkingDirectory=//p' "$(tenu "$unite")/code.conf" 2>/dev/null)"
    travail="${travail:-$FAUSSE_BOX/opt/brigade/runtime}"
    (cd "$travail" 2>/dev/null && pwd -P || echo "introuvable : $travail") >>"$FAUSSE_BOX/demarres"
    case "$(cat "$travail/demarrage" 2>/dev/null)" in
      ok)
        echo "empreinte" >"$FAUSSE_BOX/etat/$projet/code-en-service"
        noter "$unite" ActiveState active
        noter "$unite" SubState running
        ;;
      muet)
        noter "$unite" ActiveState active
        noter "$unite" SubState running
        ;;
      crash)
        noter "$unite" ActiveState activating
        noter "$unite" SubState auto-restart
        noter "$unite" NRestarts 1
        ;;
      *)
        noter "$unite" ActiveState failed
        noter "$unite" SubState failed
        noter "$unite" ExecMainStatus 2
        ;;
    esac
    ;;
  *)
    echo "fausse box : systemctl $*" >&2
    exit 1
    ;;
esac
exit 0

#!/bin/sh
# Doublure de `systemctl` pour la bascule : une box entière sous $FAUSSE_BOX.
#
#   unites/     ce que la box a posé (le gabarit, les drop-ins des instances)
#   systemd/    ce que systemd tient de chaque unité : son état, et le
#               `code.conf` qu'il a chargé au dernier `daemon-reload`
#   etat/<p>/   le répertoire d'état du projet <p>
#   appels      chaque appel reçu, dans l'ordre
#   demarres    le répertoire réel de chaque démarrage du runtime, dans l'ordre
#   portes      celui de chaque démarrage d'une porte, dans l'ordre
#   stop-refuse     s'il existe : `stop` échoue, rien n'est arrêté
#   retient-daemon-reload  tant qu'il existe : `daemon-reload` ne rend pas la
#               main, et le dit en posant `daemon-reload-en-cours`
#   retient-stop  tant qu'il existe : `stop` ne rend pas la main, et le dit en
#               posant `stop-en-cours` ; il arrête ensuite l'unité
#   travail-impose  s'il existe : le répertoire de travail qu'un autre drop-in
#               impose à toute instance, quoi que `code.conf` dise ;
#               `travail-impose.<unité>` ne l'impose qu'à elle
#   dit-les-demarrages  s'il existe : `start` le dit sur sa sortie d'erreur,
#               pour qu'un test lise où il tombe parmi ce que la bascule écrit
#
# `start` joue le runtime : il lit `demarrage` dans le répertoire de travail
# que systemd a chargé pour l'instance — `ok` (le témoin est posé, l'unité est
# `active`), `refus` (code 2, `failed`), `crash` (relancée par systemd, sans
# fin) ou `muet` (`active`, et jamais de témoin) ; `crash-une-fois` tombe à ce
# démarrage et démarrera au suivant. Celui d'une porte y lit
# `demarrage-porte` — `ok` s'il n'y est pas, `refus` ou `crash`. Son port n'est
# pas joué ici : c'est le test qui l'écoute, ou non.
set -u
echo "$*" >>"$FAUSSE_BOX/appels"
unites="$FAUSSE_BOX/unites"

tenu() { echo "$FAUSSE_BOX/systemd/$1"; }
noter() {
  mkdir -p "$(tenu "$1")"
  echo "$3" >"$(tenu "$1")/$2"
}
# Le projet d'une instance : ce qui suit l'arobase.
projet_de() {
  projet="${1#*@}"
  projet="${projet%.service}"
}
# Une ligne `<clé>=` des drop-ins posés d'une instance, `%i` résolu.
des_drop_ins() {
  projet_de "$2"
  cat "$unites/$2.d"/*.conf 2>/dev/null | sed -n "s/^$1=//p" | sed "s/%i/$projet/g" | tr '\n' ' '
}
# Le répertoire de travail que systemd a chargé pour une instance.
charge() {
  charge="$(sed -n 's/^WorkingDirectory=//p' "$(tenu "$1")/code.conf" 2>/dev/null)"
  echo "${charge:-$FAUSSE_BOX/opt/brigade/runtime}"
}

case "$1" in
  show)
    # show -p <propriété> --value <unité>
    propriete="$3" unite="$5"
    [ "$(cat "$FAUSSE_BOX/en-panne" 2>/dev/null)" = "$propriete" ] && { echo "Failed to connect to bus" >&2; exit 1; }
    projet_de "$unite"
    case "$propriete" in
      DropInPaths) ls "$unites/$unite.d"/*.conf 2>/dev/null | tr '\n' ' ' ;;
      FragmentPath) cat "$FAUSSE_BOX/fragment" 2>/dev/null || echo "$unites/brigade@.service" ;;
      Environment) echo "BRIGADE_STATE_DIR=/nulle/part BRIGADE_PROJECT=$projet BRIGADE_STATE_DIR=$FAUSSE_BOX/etat/$projet $(des_drop_ins Environment "$unite")" ;;
      Requires) des_drop_ins Requires "$unite" ;;
      ActiveState) cat "$(tenu "$unite")/ActiveState" 2>/dev/null || echo inactive ;;
      SubState) cat "$(tenu "$unite")/SubState" 2>/dev/null || echo dead ;;
      NRestarts) cat "$(tenu "$unite")/NRestarts" 2>/dev/null || echo 0 ;;
      WorkingDirectory)
        impose="$(cat "$FAUSSE_BOX/travail-impose.$unite" "$FAUSSE_BOX/travail-impose" 2>/dev/null | head -n 1)"
        echo "${impose:-$(charge "$unite")}"
        ;;
      ExecMainStatus) cat "$(tenu "$unite")/ExecMainStatus" 2>/dev/null || echo 0 ;;
    esac
    ;;
  daemon-reload)
    if [ -e "$FAUSSE_BOX/retient-daemon-reload" ]; then
      : >"$FAUSSE_BOX/daemon-reload-en-cours"
      while [ -e "$FAUSSE_BOX/retient-daemon-reload" ]; do sleep 0.05; done
    fi
    for instance in "$unites"/*.service.d; do
      [ -d "$instance" ] || continue
      unite="$(basename "$instance" .d)"
      mkdir -p "$(tenu "$unite")"
      rm -f "$(tenu "$unite")/code.conf"
      [ -f "$instance/code.conf" ] && cp "$instance/code.conf" "$(tenu "$unite")/code.conf"
    done
    ;;
  stop)
    if [ -e "$FAUSSE_BOX/retient-stop" ]; then
      : >"$FAUSSE_BOX/stop-en-cours"
      while [ -e "$FAUSSE_BOX/retient-stop" ]; do sleep 0.05; done
    fi
    [ -e "$FAUSSE_BOX/stop-refuse" ] && exit 1
    noter "$2" ActiveState inactive
    noter "$2" SubState dead
    ;;
  reset-failed)
    noter "$2" NRestarts 0
    ;;
  start)
    unite="$2"
    [ -e "$FAUSSE_BOX/dit-les-demarrages" ] && echo "fausse box : start $unite" >&2
    projet_de "$unite"
    travail="$(charge "$unite")"
    case "$unite" in
      brigade-porte@*)
        # Une porte ne laisse pas de témoin : démarrée, elle est `active`, sans plus.
        registre=portes dicte="$(cat "$travail/demarrage-porte" 2>/dev/null || echo ok)"
        [ "$dicte" = ok ] && dicte=muet
        ;;
      *) registre=demarres dicte="$(cat "$travail/demarrage" 2>/dev/null)" ;;
    esac
    (cd "$travail" 2>/dev/null && pwd -P || echo "introuvable : $travail") >>"$FAUSSE_BOX/$registre"
    if [ "$dicte" = crash-une-fois ]; then
      echo ok >"$travail/demarrage"
      dicte=crash
    fi
    case "$dicte" in
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

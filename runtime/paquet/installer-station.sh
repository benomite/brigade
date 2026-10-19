#!/bin/sh
# Installe une station brigade sur un serveur Debian, en une commande — celle
# du guide (docs/installation-station.md) :
#
#   curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh | sudo sh
#
# Le paquet vient de la dernière version publiée. Pour en installer un autre —
# construit à la main, sur une machine de test —, le donner en argument, par
# son chemin ou son adresse :
#
#   sudo sh installer-station.sh ./brigade-station_<version>_amd64.deb
#
# Ce que la commande fait, et rien d'autre : elle télécharge le paquet, le
# remet à apt — qui pose ses dépendances, crée le compte brigade et démarre
# brigade-station.service —, attend que la station soit active et le dit,
# puis fait la connexion Max du compte brigade, si quelqu'un est devant le
# terminal : `claude setup-token`, une fois, par le binaire officiel, que
# l'étape pose s'il manque, et dont elle range le jeton sans le montrer
# (runtime/src/max-connection/connect-cli.ts). C'est le seul geste root de la station : sa vie courante n'en demande aucun. La relancer
# ne réinstalle rien de neuf, et ne refait pas un jeton déjà rangé.
#
# Codes de sortie :
#   0  station installée et active — connectée à Max, ou sans terminal pour l'être
#   1  installation refusée ou échouée, ou connexion Max non faite, dite en une ligne
set -eu

DEPOT=benomite/brigade
SERVICE=brigade-station.service
# Ce que le paquet pose : son node, et l'étape de connexion Max.
NODE=/usr/lib/brigade-station/node/bin/node
CONNEXION=/usr/lib/brigade-station/runtime/src/max-connection/connect-cli.ts
# Le temps laissé à la station pour se dire active. Une garde, pas une mesure.
GARDE=60

dire() { printf 'brigade : %s\n' "$*"; }
refuser() {
  printf 'brigade : installation refusée — %s\n' "$*" >&2
  exit 1
}

[ "$(id -u)" = 0 ] || refuser "elle se fait en root : relancer la commande avec sudo (ou sous root)"
command -v apt-get >/dev/null && command -v dpkg >/dev/null || refuser "apt-get manque : la station s'installe sur un Debian (ou un dérivé)"
[ -d /run/systemd/system ] || refuser "systemd ne tourne pas sur cette machine : la station est un service systemd"

arch="$(dpkg --print-architecture)"
case "$arch" in
  amd64 | arm64) ;;
  *) refuser "aucun paquet de la station pour l'architecture $arch (amd64, arm64)" ;;
esac

source="${1:-https://github.com/$DEPOT/releases/latest/download/brigade-station_$arch.deb}"

travail="$(mktemp -d)"
trap 'rm -rf "$travail"' EXIT
paquet="$travail/brigade-station.deb"
case "$source" in
  http://* | https://*)
    dire "téléchargement du paquet — $source"
    if command -v curl >/dev/null; then
      curl -fsSL -o "$paquet" "$source" || refuser "le paquet ne se télécharge pas ($source)"
    elif command -v wget >/dev/null; then
      wget -q -O "$paquet" "$source" || refuser "le paquet ne se télécharge pas ($source)"
    else
      refuser "ni curl ni wget sur cette machine pour télécharger le paquet"
    fi
    ;;
  *)
    [ -f "$source" ] || refuser "le paquet $source n'existe pas"
    cp "$source" "$paquet"
    ;;
esac
# apt lit le paquet sous son propre compte (_apt) : le répertoire de mktemp
# lui est fermé.
chmod 0755 "$travail"
chmod 0644 "$paquet"

dire "installation du paquet et de ses dépendances"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q || refuser "apt-get update a échoué : les dépôts de la machine ne répondent pas"
apt-get install -y -q "$paquet" || refuser "apt n'a pas pu installer le paquet (sa sortie est au-dessus)"

attendu=0
until systemctl --quiet is-active "$SERVICE"; do
  attendu=$((attendu + 1))
  [ $attendu -le $GARDE ] || {
    systemctl --no-pager status "$SERVICE" >&2 || true
    refuser "la station n'est pas active $GARDE s après l'installation — journalctl -u $SERVICE dit pourquoi"
  }
  sleep 1
done

systemctl --no-pager status "$SERVICE" || true
echo
dire "station installée et active — $(dpkg-query -W -f='${Version}' brigade-station)"
dire "tout ce qu'elle demande au système vient avec son paquet : sa vie courante ne demande aucune commande root"

# La connexion Max demande quelqu'un : la commande arrive par un tuyau
# (curl | sudo sh), l'étape parle donc au terminal lui-même.
if [ -x "$NODE" ] && (: </dev/tty) 2>/dev/null; then
  echo
  dire "la connexion Max du compte brigade — le seul moment où elle te demande quelque chose"
  "$NODE" "$CONNEXION" </dev/tty || {
    printf '%s\n' "brigade : la station est installée, mais sa connexion Max n'est pas faite (la ligne au-dessus dit pourquoi) — relance la même commande pour la reprendre" >&2
    exit 1
  }
  dire "la suite : l'appairage avec l'app (le guide : docs/installation-station.md, dépôt $DEPOT)"
else
  dire "la suite : la connexion Max du compte brigade, puis l'appairage avec l'app — pas de terminal ici pour la connexion : relance la même commande depuis un terminal du serveur (le guide : docs/installation-station.md, dépôt $DEPOT)"
fi

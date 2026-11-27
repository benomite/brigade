#!/bin/sh
# Installe une station brigade, en une commande — la même sous Linux et sous
# macOS, celle du guide (docs/installation-station.md) :
#
#   curl -fsSL https://github.com/<owner>/<repo>/releases/download/station/installer-station.sh | sh
#
# C'est la seule entrée de l'installation d'une station : rien ne s'écrit à la
# main, ni avant ni après — ni drop-in, ni fichier d'environnement, ni unité.
# La station vient de la dernière version publiée. Pour en installer une autre
# — construite à la main, sur une machine de test —, la donner en argument,
# par son chemin ou son adresse : le paquet .deb sous Linux, l'archive
# brigade-station-mac.tar.gz sous macOS.
#
#   sh installer-station.sh ./brigade-station_<version>_amd64.deb
#
# **Linux** (Debian, Ubuntu, ou un dérivé, avec systemd). La commande télécharge
# le paquet brigade-station et le remet à apt — qui pose ses dépendances, ses
# unités (le service, ses portes, son renouvellement, sa mise à jour), crée le
# compte brigade et démarre brigade-station.service. Hors root, elle passe par
# sudo pour ces gestes-là, et seulement pour eux. Elle attend que la station
# soit active et le dit.
#
# **macOS** (Apple Silicon ou Intel). Hors root, elle passe par sudo pour les
# gestes système, et seulement pour eux. La station y tourne sous un compte
# `brigade`, créé s'il manque, que l'ancre `pf` `brigade` enferme : tout ce
# qu'il émet est bloqué, sauf vers la boucle locale — ses cooks ne sortent que
# par la porte du projet (HTTPS_PROXY), tenue sous root, le seul compte que
# l'ancre ne bloque pas. La commande pose sous /opt/brigade-station le runtime
# de la version publiée et le `node` qu'il réclame (nodejs.org, vérifié contre
# ses empreintes), charge l'ancre (et la recharge à chaque démarrage), pose la
# règle sudo par laquelle la station relit son ancre, écrit les démons launchd
# de la porte (root) et de la station (brigade), les démarre, et attend que la
# station tourne. `gh` et `claude` sont posés s'ils manquent (Homebrew ou la
# release de `gh`, l'installeur officiel de `claude`). Sans l'ancre chargée, la
# station refuse de faire cuire.
#
# Puis, sur les deux, si quelqu'un est devant le terminal, les deux connexions,
# une fois chacune, et rien d'autre :
#   - GitHub : `gh auth login --web`, sous le compte brigade de la station, puis `gh auth setup-git` ;
#   - Claude : sous Linux, `claude setup-token`, dont le jeton est rangé sans
#     être montré (runtime/src/connexion-max/connecter-cli.ts) ; sous macOS,
#     `claude auth login`, sous le compte brigade.
#
# La relancer est sans risque : elle n'installe que ce qui a changé, laisse la
# station tourner si rien n'a changé, et ne refait pas une connexion déjà
# faite. C'est aussi par elle qu'une station macOS passe à la dernière
# version ; sous Linux, la station s'y met seule (brigade-station-mise-a-jour).
#
# Codes de sortie :
#   0  station installée et active — connectée, ou sans terminal pour l'être
#   1  installation refusée ou échouée, ou connexion non faite, dite en une ligne
set -eu

# Le dépôt GitHub qui publie la station : posé dans ce script à la publication
# (le placeholder ci-dessous), ou donné par BRIGADE_DEPOT. Aucun n'est supposé.
DEPOT="${BRIGADE_DEPOT:-@DEPOT@}"
# Le terminal où les connexions parlent : la commande arrive par un tuyau
# (curl | sh), elles parlent donc au terminal lui-même. Les tests en donnent un
# autre.
TERMINAL="${BRIGADE_TERMINAL:-/dev/tty}"
# Le temps laissé à la station pour se dire active. Une garde, pas une mesure.
GARDE=60

dire() { printf 'brigade : %s\n' "$*"; }
refuser() {
  printf 'brigade : installation refusée — %s\n' "$*" >&2
  exit 1
}
# Une connexion qui n'a pas abouti : la station reste installée.
non_connectee() {
  printf 'brigade : la station est installée, mais %s (la ligne au-dessus dit pourquoi) — relance la même commande pour la reprendre\n' "$*" >&2
  exit 1
}
terminal() { (: <"$TERMINAL") 2>/dev/null; }

# Ce que la commande installe : son argument, ou la dernière version publiée.
source_de() {
  if [ -z "${1:-}" ]; then
    case "$DEPOT" in
      */*) ;;
      *) refuser "aucun dépôt n'est désigné pour télécharger la station — donner ce qu'il faut installer (un chemin ou une adresse) en argument, ou BRIGADE_DEPOT=<compte>/<dépôt> du dépôt GitHub qui publie brigade" ;;
    esac
    printf '%s\n' "https://github.com/$DEPOT/releases/download/station/$2"
  else
    printf '%s\n' "$1"
  fi
}

telecharger() {
  if command -v curl >/dev/null; then
    curl -fsSL -o "$2" "$1"
  elif command -v wget >/dev/null; then
    wget -q -O "$2" "$1"
  else
    refuser "ni curl ni wget sur cette machine pour télécharger la station"
  fi
}

# Pose dans le fichier $2 ce que désigne $1, une adresse ou un chemin.
obtenir() {
  case "$1" in
    http://* | https://*)
      dire "téléchargement du paquet — $1"
      telecharger "$1" "$2" || refuser "le téléchargement a échoué ($1)"
      ;;
    *)
      [ -f "$1" ] || refuser "$1 n'existe pas"
      cp "$1" "$2"
      ;;
  esac
}

# La connexion GitHub du compte de la station : `gh` y est lancé par le
# lanceur donné ($@). Déjà faite, elle n'est pas refaite ; `setup-git` l'est
# toujours — il ne demande rien, et git pousse par `gh`.
connexion_github() {
  if "$@" gh auth status --hostname github.com >/dev/null 2>&1; then
    dire "GitHub : déjà connecté — rien à refaire"
  else
    echo
    dire "la connexion GitHub de la station — un code à taper sur la page GitHub que \`gh\` donne, une seule fois"
    "$@" gh auth login --hostname github.com --web --git-protocol https <"$TERMINAL" || return 1
  fi
  "$@" gh auth setup-git || return 1
}

# ----------------------------------------------------------------------------
# Linux : le paquet Debian, et systemd.

SERVICE=brigade-station.service
COMPTE=brigade
# Ce que le paquet pose : son node, et l'étape de connexion Max. Les tests le
# posent ailleurs.
LIB="${BRIGADE_STATION_LIB:-/usr/lib/brigade-station}"
NODE="$LIB/node/bin/node"
CONNEXION="$LIB/runtime/src/connexion-max/connecter-cli.ts"
# Le PATH des unités de la station : celui où le compte trouve `gh`.
PATH_DU_COMPTE=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Un geste root : tel quel sous root, par sudo sinon.
en_root() {
  if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi
}

# `gh`, sous le compte de la station, dans son seul environnement.
sous_le_compte() {
  en_root runuser -u "$COMPTE" -- env -i HOME="$MAISON" PATH="$PATH_DU_COMPTE" LANG=C.UTF-8 "$@"
}

linux() {
  if [ "$(id -u)" != 0 ]; then
    command -v sudo >/dev/null || refuser "elle installe un service système : relancer la commande sous root, ou installer sudo"
    dire "les gestes root de l'installation passent par sudo : il peut te demander ton mot de passe"
  fi
  command -v apt-get >/dev/null && command -v dpkg >/dev/null || refuser "apt-get manque : la station s'installe sur un Debian (ou un dérivé)"
  [ -d /run/systemd/system ] || refuser "systemd ne tourne pas sur cette machine : la station est un service systemd"

  arch="$(dpkg --print-architecture)"
  case "$arch" in
    amd64 | arm64) ;;
    *) refuser "aucun paquet de la station pour l'architecture $arch (amd64, arm64)" ;;
  esac
  source="$(source_de "${1:-}" "brigade-station_$arch.deb")"

  travail="$(mktemp -d)"
  trap 'rm -rf "$travail"' EXIT
  paquet="$travail/brigade-station.deb"
  obtenir "$source" "$paquet"
  # apt lit le paquet sous son propre compte (_apt) : le répertoire de mktemp
  # lui est fermé.
  chmod 0755 "$travail"
  chmod 0644 "$paquet"

  dire "installation du paquet et de ses dépendances"
  en_root env DEBIAN_FRONTEND=noninteractive apt-get update -q || refuser "apt-get update a échoué : les dépôts de la machine ne répondent pas"
  en_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$paquet" || refuser "apt n'a pas pu installer le paquet (sa sortie est au-dessus)"

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

  if ! terminal; then
    dire "la suite : la connexion GitHub et la connexion Max du compte $COMPTE, puis tes projets — pas de terminal ici pour les connexions : relance la même commande depuis un terminal du serveur (le guide : docs/installation-station.md, dépôt $DEPOT)"
    return 0
  fi
  MAISON="$(getent passwd "$COMPTE" | cut -d: -f6)"
  [ -n "$MAISON" ] || refuser "le compte $COMPTE n'existe pas après l'installation du paquet"
  connexion_github sous_le_compte || non_connectee "sa connexion GitHub n'est pas faite"
  [ -x "$NODE" ] && [ -f "$CONNEXION" ] || non_connectee "l'étape de sa connexion Max manque au paquet ($CONNEXION)"
  echo
  dire "la connexion Max du compte $COMPTE"
  en_root "$NODE" "$CONNEXION" <"$TERMINAL" || non_connectee "sa connexion Max n'est pas faite"
  dire "la station est connectée à GitHub et à Claude — la suite : tes projets, une ligne chacun dans /var/lib/brigade/kitchen/projects (le guide : docs/installation-station.md, dépôt $DEPOT)"
}

# ----------------------------------------------------------------------------
# macOS : le runtime, son node, l'ancre `pf` et deux démons launchd. La
# station tourne sous le compte `brigade`, que l'ancre enferme : tout ce que
# ses cooks lancent ne sort que par la porte du projet, tenue sous root — le
# seul compte que l'ancre ne bloque pas.

ETIQUETTE=com.brigade.station
# Où la station se pose et range son état, où launchd et sudo cherchent leurs
# fichiers. Les tests les posent ailleurs.
OPT="${BRIGADE_MAC_OPT:-/opt/brigade-station}"
APPUI="${BRIGADE_MAC_APPUI:-/Library/Application Support/brigade}"
DEMONS="${BRIGADE_MAC_DEMONS:-/Library/LaunchDaemons}"
SUDOERS="${BRIGADE_MAC_SUDOERS:-/etc/sudoers.d}"
MAISON_MAC="${BRIGADE_MAC_MAISON:-/Users/$COMPTE}"
# Le node que le runtime réclame (`engines` de son package.json).
NODE_MAJEUR=26
NODE_DIST=https://nodejs.org/dist/latest-v$NODE_MAJEUR.x

# Une valeur posée dans le plist.
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

# La version que porte le package.json d'un runtime, ou rien.
version_de() { sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$1" 2>/dev/null | head -n 1; }

empreinte() {
  if command -v shasum >/dev/null; then shasum -a 256 "$1"; else sha256sum "$1"; fi | cut -d' ' -f1
}

# Pose $1 en $2 (root:wheel, mode $3 ou 0644) s'ils diffèrent ; dit s'il a changé.
poser() {
  if [ -f "$2" ] && cmp -s "$1" "$2"; then
    return 1
  fi
  en_root install -m "${3:-0644}" -o root -g wheel "$1" "$2" || refuser "$2 ne s'écrit pas"
}

# Un geste sous le compte brigade, dans son environnement.
sous_brigade() {
  en_root sudo -u "$COMPTE" -H env HOME="$MAISON_MAC" PATH="$PATH" "$@"
}

tourne() { en_root launchctl print "system/$1" 2>/dev/null | grep -q 'state = running'; }

# Charge le démon $1 (son plist $2) : bootstrap la première fois, rechargé si son
# plist a changé ($3), relancé si ce qu'il lance a changé ($4) ou s'il est tombé.
charger_demon() {
  if ! en_root launchctl print "system/$1" >/dev/null 2>&1; then
    en_root launchctl enable "system/$1" || true
    en_root launchctl bootstrap system "$2" || refuser "launchd refuse le démon $2"
  elif [ -n "$3" ]; then
    # Un plist changé ne se relit qu'en rechargeant le démon.
    en_root launchctl bootout "system/$1" || true
    attendu=0
    while en_root launchctl print "system/$1" >/dev/null 2>&1; do
      attendu=$((attendu + 1))
      [ $attendu -le $GARDE ] || refuser "l'ancien démon ne s'arrête pas — launchctl print system/$1"
      sleep 1
    done
    en_root launchctl bootstrap system "$2" || refuser "launchd refuse le démon $2"
  elif [ -n "$4" ] || ! tourne "$1"; then
    en_root launchctl kickstart -k "system/$1" || refuser "launchd ne relance pas $1"
  else
    return 1
  fi
}

mac() {
  [ -n "${HOME:-}" ] || refuser "HOME n'est pas défini"
  if [ "$(id -u)" != 0 ]; then
    command -v sudo >/dev/null || refuser "elle installe l'ancre pf et des démons système : relancer la commande sous root, ou installer sudo"
    dire "les gestes root de l'installation passent par sudo : il peut te demander ton mot de passe"
  fi
  case "$(uname -m)" in
    arm64) narch=arm64 ;;
    x86_64) narch=x64 ;;
    *) refuser "aucun node pour l'architecture $(uname -m)" ;;
  esac
  source="$(source_de "${1:-}" brigade-station-mac.tar.gz)"

  BASE="$OPT/current"
  JOURNAL=/var/log/brigade-station.log
  # Le PATH de la station : son node, le gh qu'elle a pu poser, le claude de
  # l'installeur officiel, Homebrew, le système. launchd n'en donne pas d'autre.
  PATH_STATION="$BASE/node/bin:$BASE/bin:$MAISON_MAC/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  PATH="$PATH:$PATH_STATION"
  export PATH

  travail="$(mktemp -d)"
  trap 'rm -rf "$travail"' EXIT
  change=""

  # Le compte de la station : celui que l'ancre enferme. Sans lui, pas d'ancre.
  if ! dscl . -read "/Users/$COMPTE" >/dev/null 2>&1; then
    dire "création du compte $COMPTE"
    en_root sysadminctl -addUser "$COMPTE" -fullName "Brigade station" -home "$MAISON_MAC" -shell /bin/zsh -password "$(openssl rand -hex 16)" || refuser "le compte $COMPTE ne se crée pas (sysadminctl)"
  fi

  # Ce que la station lance : git (les outils de ligne de commande d'Apple),
  # gh et claude.
  if ! git --version >/dev/null 2>&1; then
    xcode-select --install >/dev/null 2>&1 || true
    refuser "git manque : macOS propose d'installer ses outils de ligne de commande (fenêtre ouverte) — relance la même commande quand c'est fait"
  fi
  if ! command -v gh >/dev/null; then
    if command -v brew >/dev/null; then
      dire "installation de gh, par Homebrew"
      brew install gh || refuser "Homebrew n'a pas pu installer gh (sa sortie est au-dessus)"
    else
      dire "installation de gh, depuis sa dernière release"
      derniere="$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/cli/cli/releases/latest)" || refuser "la dernière release de gh ne se lit pas"
      v="${derniere##*/v}"
      telecharger "https://github.com/cli/cli/releases/download/v$v/gh_${v}_macOS_$( [ $narch = x64 ] && echo amd64 || echo arm64).zip" "$travail/gh.zip" || refuser "gh ne se télécharge pas"
      (cd "$travail" && unzip -q gh.zip) || refuser "l'archive de gh ne s'ouvre pas"
      mkdir -p "$travail/gh-bin"
      cp "$travail"/gh_*/bin/gh "$travail/gh-bin/gh"
      en_root mkdir -p "$BASE/bin"
      en_root install -m 0755 -o root -g wheel "$travail/gh-bin/gh" "$BASE/bin/gh"
    fi
  fi
  if ! sous_brigade sh -c 'command -v claude' >/dev/null 2>&1; then
    dire "installation de claude, par l'installeur officiel, sous le compte $COMPTE"
    sous_brigade sh -c 'curl -fsSL https://claude.ai/install.sh | bash' || refuser "l'installeur de claude a échoué (sa sortie est au-dessus)"
  fi

  # Le node de la station, gardé tant qu'il est de la version réclamée.
  majeur="$("$BASE/node/bin/node" -v 2>/dev/null | sed -n 's/^v\([0-9]*\)\..*/\1/p')" || majeur=""
  if [ "${majeur:-0}" != "$NODE_MAJEUR" ]; then
    telecharger "$NODE_DIST/SHASUMS256.txt" "$travail/SHASUMS256.txt" || refuser "les versions de node ne se lisent pas ($NODE_DIST)"
    archive="$(sed -n "s/^[0-9a-f]\{64\}  \(node-v$NODE_MAJEUR\.[0-9.]*-darwin-$narch\.tar\.gz\)$/\1/p" "$travail/SHASUMS256.txt" | head -n 1)"
    [ -n "$archive" ] || refuser "aucun node $NODE_MAJEUR pour darwin-$narch dans $NODE_DIST"
    dire "téléchargement de ${archive%.tar.gz}"
    telecharger "$NODE_DIST/$archive" "$travail/$archive" || refuser "node ne se télécharge pas ($NODE_DIST/$archive)"
    [ "$(empreinte "$travail/$archive")" = "$(sed -n "s/^\([0-9a-f]\{64\}\)  $archive$/\1/p" "$travail/SHASUMS256.txt")" ] || refuser "l'empreinte de $archive n'est pas celle que nodejs.org publie"
    mkdir "$travail/node"
    tar -xzf "$travail/$archive" -C "$travail/node" --strip-components 1 || refuser "l'archive de node ne s'ouvre pas"
    en_root mkdir -p "$BASE"
    en_root rm -rf "$BASE/node"
    en_root mv "$travail/node" "$BASE/node"
    en_root chown -R root:wheel "$BASE/node"
    change=oui
  fi

  # Le runtime de la version publiée, posé s'il n'est pas déjà celui-là. Il
  # appartient à root : la porte, qui tourne sous root, en lance le code.
  obtenir "$source" "$travail/runtime.tar.gz"
  mkdir "$travail/neuf"
  tar -xzf "$travail/runtime.tar.gz" -C "$travail/neuf" || refuser "l'archive de la station ne s'ouvre pas ($source)"
  [ -f "$travail/neuf/runtime/src/kitchen/main.ts" ] || refuser "l'archive ne porte pas la cuisine de la station ($source)"
  PF="$travail/neuf/runtime/paquet/macos"
  for f in brigade.pf.conf brigade.sudoers charger-pf.sh com.brigade.pf.plist com.brigade.gate.plist; do
    [ -f "$PF/$f" ] || refuser "l'archive ne porte pas $f, de l'ancre pf ($source)"
  done
  version="$(version_de "$travail/neuf/runtime/package.json")"
  if [ ! -d "$BASE/runtime" ] || [ "$version" != "$(version_de "$BASE/runtime/package.json")" ]; then
    en_root rm -rf "$BASE/runtime"
    en_root mv "$travail/neuf/runtime" "$BASE/runtime"
    en_root chown -R root:wheel "$BASE/runtime"
    change=oui
  fi
  PF="$BASE/runtime/paquet/macos"

  # Le répertoire d'état de la station : à elle, que la porte (root) lit aussi.
  en_root install -d -m 0755 -o "$COMPTE" -g staff "$APPUI"

  # La règle sudo qui laisse la station relire son ancre, rien d'autre — posée
  # seulement si sudo la lit.
  if ! cmp -s "$PF/brigade.sudoers" "$SUDOERS/brigade" 2>/dev/null; then
    if command -v visudo >/dev/null; then
      visudo -cf "$PF/brigade.sudoers" >/dev/null || refuser "visudo refuse la règle sudo de la station ($PF/brigade.sudoers)"
    fi
    poser "$PF/brigade.sudoers" "$SUDOERS/brigade" 0440 || true
  fi

  # L'ancre pf, chargée maintenant et à chaque démarrage : sans elle, la station
  # ne fait cuire rien. Un démon la recharge au boot, un autre tient la porte.
  poser "$PF/com.brigade.pf.plist" "$DEMONS/com.brigade.pf.plist" || true
  en_root "$PF/charger-pf.sh" || refuser "l'ancre pf ne se charge pas ($PF/charger-pf.sh)"
  en_root pfctl -a brigade -sr 2>/dev/null | grep -q '^block' || refuser "l'ancre pf $COMPTE est chargée mais ne bloque rien : la station ne démarre pas sans elle"
  if poser "$PF/com.brigade.gate.plist" "$DEMONS/com.brigade.gate.plist"; then porte_change=oui; else porte_change=""; fi
  charger_demon com.brigade.gate "$DEMONS/com.brigade.gate.plist" "$porte_change" "$change" || true

  # Le démon de la station : sous le compte brigade, lancé au démarrage de la
  # machine, relancé s'il tombe. `AbandonProcessGroup` : son arrêt n'emporte pas
  # les cooks, qui finissent leur travail — la station suivante les reprend
  # (KillMode=process sous Linux).
  cat >"$travail/plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Écrit par installer-station.sh, et réécrit à chaque passage : ne pas l'éditer. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$ETIQUETTE</string>
  <key>UserName</key>
  <string>$COMPTE</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml "$BASE/node/bin/node")</string>
    <string>src/kitchen/main.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$(xml "$BASE/runtime")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BRIGADE_STATION_DIR</key>
    <string>$(xml "$APPUI")</string>
    <key>BRIGADE_STATION_PORTES</key>
    <string>$(xml "$APPUI/portes.json")</string>
    <key>HOME</key>
    <string>$(xml "$MAISON_MAC")</string>
    <key>PATH</key>
    <string>$(xml "$PATH_STATION")</string>
    <key>LANG</key>
    <string>en_US.UTF-8</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>AbandonProcessGroup</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$(xml "$JOURNAL")</string>
  <key>StandardErrorPath</key>
  <string>$(xml "$JOURNAL")</string>
</dict>
</plist>
PLIST
  if poser "$travail/plist" "$DEMONS/$ETIQUETTE.plist"; then plist_change=oui; else plist_change=""; fi
  charger_demon "$ETIQUETTE" "$DEMONS/$ETIQUETTE.plist" "$plist_change" "$change" || dire "rien de neuf : la station tourne déjà sur cette version"

  attendu=0
  until tourne "$ETIQUETTE"; do
    attendu=$((attendu + 1))
    [ $attendu -le $GARDE ] || {
      en_root tail -n 20 "$JOURNAL" >&2 2>/dev/null || true
      refuser "la station ne tourne pas $GARDE s après l'installation — son journal : $JOURNAL"
    }
    sleep 1
  done
  echo
  dire "station installée et active — $version (launchctl print system/$ETIQUETTE ; son journal : $JOURNAL)"

  if ! terminal; then
    dire "la suite : la connexion GitHub et la connexion Claude du compte $COMPTE, puis tes projets — pas de terminal ici pour les connexions : relance la même commande depuis un terminal (le guide : docs/installation-station.md, dépôt $DEPOT)"
    return 0
  fi
  connexion_github sous_brigade || non_connectee "sa connexion GitHub n'est pas faite"
  if sous_brigade claude auth status >/dev/null 2>&1; then
    dire "Claude : déjà connecté — rien à refaire"
  else
    echo
    dire "la connexion Claude du compte $COMPTE — la page de connexion s'ouvre dans ton navigateur, une seule fois"
    sous_brigade claude auth login <"$TERMINAL" || non_connectee "sa connexion Claude n'est pas faite"
  fi
  dire "la station est connectée à GitHub et à Claude — la suite : tes projets, une ligne chacun dans $APPUI/kitchen/projects (le guide : docs/installation-station.md, dépôt $DEPOT)"
}

case "$(uname -s)" in
  Linux) linux "$@" ;;
  Darwin) mac "$@" ;;
  *) refuser "la station s'installe sous Linux ou macOS, pas sous $(uname -s)" ;;
esac

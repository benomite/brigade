#!/bin/sh
# Installe une station brigade, en une commande — la même sous Linux et sous
# macOS, celle du guide (docs/installation-station.md) :
#
#   curl -fsSL https://github.com/<owner>/<repo>/releases/latest/download/installer-station.sh | sh
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
# **macOS** (Apple Silicon ou Intel). Sous le compte de qui la lance, sans
# sudo : la station y tourne comme l'app la ferait tourner, avec le `claude` et
# le `gh` de ce compte. La commande pose sous ~/.local/share/brigade-station le
# runtime de la version publiée et le `node` qu'il réclame (nodejs.org,
# vérifié contre ses empreintes), écrit l'agent launchd qui la lance à
# l'ouverture de session et la relance si elle tombe
# (~/Library/LaunchAgents/brigade.station.plist), la démarre, et attend qu'elle
# tourne. `gh` et `claude` sont posés s'ils manquent (Homebrew ou la release
# de `gh`, l'installeur officiel de `claude`). La station tient le même
# répertoire que celle de l'app (~/.config/brigade/station) : une seule tourne
# à la fois, l'autre attend qu'elle s'arrête.
#
# Puis, sur les deux, si quelqu'un est devant le terminal, les deux connexions,
# une fois chacune, et rien d'autre :
#   - GitHub : `gh auth login --web`, sous le compte de la station (brigade
#     sous Linux, le tien sous macOS), puis `gh auth setup-git` ;
#   - Claude : sous Linux, `claude setup-token`, dont le jeton est rangé sans
#     être montré (runtime/src/connexion-max/connecter-cli.ts) ; sous macOS,
#     `claude auth login`, comme le bouton de l'app.
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
    printf '%s\n' "https://github.com/$DEPOT/releases/latest/download/$2"
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
    dire "la suite : la connexion GitHub et la connexion Max du compte $COMPTE, puis l'appairage avec l'app — pas de terminal ici pour les connexions : relance la même commande depuis un terminal du serveur (le guide : docs/installation-station.md, dépôt $DEPOT)"
    return 0
  fi
  MAISON="$(getent passwd "$COMPTE" | cut -d: -f6)"
  [ -n "$MAISON" ] || refuser "le compte $COMPTE n'existe pas après l'installation du paquet"
  connexion_github sous_le_compte || non_connectee "sa connexion GitHub n'est pas faite"
  [ -x "$NODE" ] && [ -f "$CONNEXION" ] || non_connectee "l'étape de sa connexion Max manque au paquet ($CONNEXION)"
  echo
  dire "la connexion Max du compte $COMPTE"
  en_root "$NODE" "$CONNEXION" <"$TERMINAL" || non_connectee "sa connexion Max n'est pas faite"
  dire "la station est connectée à GitHub et à Claude — la suite : l'appairage avec l'app (le guide : docs/installation-station.md, dépôt $DEPOT)"
}

# ----------------------------------------------------------------------------
# macOS : le runtime, son node, et un agent launchd, sous le compte de qui
# lance la commande.

ETIQUETTE=brigade.station
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

# Remplace $2 par $1 s'ils diffèrent ; dit s'il a changé.
poser() {
  if [ -f "$2" ] && cmp -s "$1" "$2"; then
    rm -f "$1"
    return 1
  fi
  mv "$1" "$2" || refuser "$2 ne s'écrit pas"
}

tourne() { launchctl print "$DOMAINE/$ETIQUETTE" 2>/dev/null | grep -q 'state = running'; }

mac() {
  [ "$(id -u)" != 0 ] || refuser "sur un Mac, elle se fait sous ton compte, sans sudo : la station tourne sous lui, avec son claude et son gh"
  [ -n "${HOME:-}" ] || refuser "HOME n'est pas défini"
  case "$(uname -m)" in
    arm64) narch=arm64 ;;
    x86_64) narch=x64 ;;
    *) refuser "aucun node pour l'architecture $(uname -m)" ;;
  esac
  source="$(source_de "${1:-}" brigade-station-mac.tar.gz)"

  BASE="$HOME/.local/share/brigade-station"
  RACINE="$HOME/.config/brigade/station"
  PLIST="$HOME/Library/LaunchAgents/$ETIQUETTE.plist"
  JOURNAL="$HOME/Library/Logs/brigade-station.log"
  DOMAINE="gui/$(id -u)"
  # Le PATH de la station : son node, le gh qu'elle a pu poser, le claude de
  # l'installeur officiel, Homebrew, le système. launchd n'en donne pas d'autre.
  PATH_STATION="$BASE/node/bin:$BASE/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  PATH="$PATH:$PATH_STATION"
  export PATH

  mkdir -p "$BASE" "$RACINE" "$(dirname "$PLIST")" "$(dirname "$JOURNAL")"
  travail="$(mktemp -d "$BASE/.travail.XXXXXX")"
  trap 'rm -rf "$travail"' EXIT
  change=""

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
      rm -rf "$BASE/gh"
      mv "$travail"/gh_* "$BASE/gh"
      mkdir -p "$BASE/bin"
      ln -sf "$BASE/gh/bin/gh" "$BASE/bin/gh"
    fi
  fi
  if ! command -v claude >/dev/null; then
    dire "installation de claude, par l'installeur officiel"
    curl -fsSL https://claude.ai/install.sh | bash || refuser "l'installeur de claude a échoué (sa sortie est au-dessus)"
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
    rm -rf "$BASE/node"
    mv "$travail/node" "$BASE/node"
    change=oui
  fi

  # Le runtime de la version publiée, posé s'il n'est pas déjà celui-là.
  obtenir "$source" "$travail/runtime.tar.gz"
  mkdir "$travail/neuf"
  tar -xzf "$travail/runtime.tar.gz" -C "$travail/neuf" || refuser "l'archive de la station ne s'ouvre pas ($source)"
  [ -f "$travail/neuf/runtime/src/station/main.ts" ] || refuser "l'archive ne porte pas le runtime de la station ($source)"
  version="$(version_de "$travail/neuf/runtime/package.json")"
  if [ ! -d "$BASE/runtime" ] || [ "$version" != "$(version_de "$BASE/runtime/package.json")" ]; then
    [ ! -d "$BASE/runtime" ] || mv "$BASE/runtime" "$travail/ancien"
    mv "$travail/neuf/runtime" "$BASE/runtime"
    change=oui
  fi

  # Ce que launchd lance : la station, quand l'app ne la tient pas déjà. Elle
  # prend le répertoire comme l'app le prend (`app.pid`, app/src/poste/station.ts)
  # et garde son pid jusqu'au bout (`exec`) : l'app ouverte ensuite la voit
  # tenue, et n'en lance pas une deuxième.
  cat >"$travail/lancer-station" <<'LANCER'
#!/bin/sh
# Écrit par installer-station.sh, et réécrit à chaque passage : ne pas l'éditer.
set -eu
ici="$(cd "$(dirname "$0")" && pwd)"
tenue="$BRIGADE_STATION_DIR/app.pid"
mkdir -p "$BRIGADE_STATION_DIR"
dit=""
while ! (set -C && echo $$ >"$tenue") 2>/dev/null; do
  pid="$(cat "$tenue" 2>/dev/null || true)"
  case "$pid" in
    $$) break ;;
    "" | *[!0-9]*)
      # En cours d'écriture, ou illisible pour de bon.
      sleep 1
      [ "$(cat "$tenue" 2>/dev/null || true)" != "$pid" ] || rm -f "$tenue"
      ;;
    *)
      if kill -0 "$pid" 2>/dev/null; then
        [ -n "$dit" ] || echo "brigade : la station de cet ordinateur est tenue par l'app (pid $pid) — celle-ci la reprend quand l'app se ferme"
        dit=oui
        sleep 30
      else
        rm -f "$tenue"
      fi
      ;;
  esac
done
cd "$ici/runtime"
exec "$ici/node/bin/node" src/station/main.ts
LANCER
  chmod 0755 "$travail/lancer-station"
  if poser "$travail/lancer-station" "$BASE/lancer-station"; then change=oui; fi

  # L'agent launchd : lancé à l'ouverture de session, relancé s'il tombe.
  # `AbandonProcessGroup` : son arrêt n'emporte pas les cooks, qui finissent
  # leur travail — la station suivante les reprend (KillMode=process sous Linux).
  cat >"$travail/plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Écrit par installer-station.sh, et réécrit à chaque passage : ne pas l'éditer. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$ETIQUETTE</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>$(xml "$BASE/lancer-station")</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BRIGADE_STATION_DIR</key>
    <string>$(xml "$RACINE")</string>
    <key>HOME</key>
    <string>$(xml "$HOME")</string>
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
  plist_change=""
  if poser "$travail/plist" "$PLIST"; then plist_change=oui; fi

  if ! launchctl print "$DOMAINE/$ETIQUETTE" >/dev/null 2>&1; then
    launchctl enable "$DOMAINE/$ETIQUETTE" || true
    launchctl bootstrap "$DOMAINE" "$PLIST" || refuser "launchd refuse l'agent $PLIST"
  elif [ -n "$plist_change" ]; then
    # Un plist changé ne se relit qu'en rechargeant l'agent.
    launchctl bootout "$DOMAINE/$ETIQUETTE" || true
    attendu=0
    while launchctl print "$DOMAINE/$ETIQUETTE" >/dev/null 2>&1; do
      attendu=$((attendu + 1))
      [ $attendu -le $GARDE ] || refuser "l'ancien agent ne s'arrête pas — launchctl print $DOMAINE/$ETIQUETTE"
      sleep 1
    done
    launchctl bootstrap "$DOMAINE" "$PLIST" || refuser "launchd refuse l'agent $PLIST"
  elif [ -n "$change" ] || ! tourne; then
    launchctl kickstart -k "$DOMAINE/$ETIQUETTE" || refuser "launchd ne relance pas la station"
  else
    dire "rien de neuf : la station tourne déjà sur cette version"
  fi

  attendu=0
  until tourne; do
    attendu=$((attendu + 1))
    [ $attendu -le $GARDE ] || {
      tail -n 20 "$JOURNAL" >&2 2>/dev/null || true
      refuser "la station ne tourne pas $GARDE s après l'installation — son journal : $JOURNAL"
    }
    sleep 1
  done
  echo
  dire "station installée et active — $version (launchctl print $DOMAINE/$ETIQUETTE ; son journal : $JOURNAL)"

  if ! terminal; then
    dire "la suite : la connexion GitHub et la connexion Claude, puis l'appairage avec l'app — pas de terminal ici pour les connexions : relance la même commande depuis un terminal (le guide : docs/installation-station.md, dépôt $DEPOT)"
    return 0
  fi
  connexion_github env || non_connectee "sa connexion GitHub n'est pas faite"
  if claude auth status >/dev/null 2>&1; then
    dire "Claude : déjà connecté — rien à refaire"
  else
    echo
    dire "la connexion Claude — la page de connexion s'ouvre dans ton navigateur, une seule fois"
    claude auth login <"$TERMINAL" || non_connectee "sa connexion Claude n'est pas faite"
  fi
  dire "la station est connectée à GitHub et à Claude — elle le voit dans la minute ; la suite : l'appairage avec l'app (le guide : docs/installation-station.md, dépôt $DEPOT)"
}

case "$(uname -s)" in
  Linux) linux "$@" ;;
  Darwin) mac "$@" ;;
  *) refuser "la station s'installe sous Linux ou macOS, pas sous $(uname -s)" ;;
esac

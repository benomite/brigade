#!/bin/sh
# Installs a station on Linux, from the unpacked archive this script sits in.
# Run as root:  sudo sh install.sh
#
#   - the system user `brigade`, if missing;
#   - the archive under /opt/brigade-station/<version>/, `current` pointing at it;
#   - /var/lib/brigade (the station's state, owned by `brigade`) and /etc/brigade
#     (tokens and secrets, hidden from the cooks by BRIGADE_SANDBOX_HIDDEN);
#   - /usr/local/bin/brigade -> current/bin/brigade;
#   - the units of services/: the station (no network but loopback), the gate,
#     and the update timer — enabled and started.
#
# The tokens are asked once, if /etc/brigade has none: the GitHub token and the
# Claude long-lived token (`claude setup-token`). An unattended install gives
# them as BRIGADE_GITHUB_TOKEN and BRIGADE_CLAUDE_TOKEN.
#
# Run twice, it changes nothing. A station that cannot have its sandbox (bwrap),
# its account or its gate is refused, with the reason in one line.
#
# BRIGADE_PROJECTS_FILE=<file> gives the project lines (name, repository, base, places;
# no CLONE=) a station moved from the chef's app: they are written to
# /var/lib/brigade/kitchen/projects when the station has none, and it clones afresh.
#
# BRIGADE_RACINE=<dir> prefixes every path it writes (tests); BRIGADE_TERMINAL is
# where the tokens are asked (default /dev/tty).
set -eu

RACINE="${BRIGADE_RACINE:-}"
TERMINAL="${BRIGADE_TERMINAL:-/dev/tty}"
ACCOUNT=brigade
ARCHIVE=$(cd "$(dirname "$0")" && pwd)

OPT="$RACINE/opt/brigade-station"
STATE="$RACINE/var/lib/brigade"
SECRETS="$RACINE/etc/brigade"
UNITS="$RACINE/etc/systemd/system"
LINK="$RACINE/usr/local/bin/brigade"

say() { printf 'brigade: %s\n' "$*"; }
refuse() {
  printf 'brigade: install refused — %s\n' "$*" >&2
  exit 1
}

# Preflight: nothing is written before the machine is known able to cook.
[ -n "$RACINE" ] || [ "$(id -u)" = 0 ] || refuse "run it as root (sudo sh install.sh)"
[ "$(uname -s)" = Linux ] || refuse "this script installs a Linux station"
command -v bwrap >/dev/null 2>&1 || refuse "bwrap is missing, so the cooks would have no sandbox — install bubblewrap"
command -v useradd >/dev/null 2>&1 || refuse "useradd is missing, so the account $ACCOUNT cannot be created"
command -v systemctl >/dev/null 2>&1 || refuse "systemctl is missing, so the station and its gate cannot run as services"
[ -n "$RACINE" ] || [ -d /run/systemd/system ] || refuse "systemd is not running, so the gate and the network filter of the station cannot be set up"
for unit in brigade-station.service brigade-station-porte.service brigade-station-mise-a-jour.service brigade-station-mise-a-jour.timer; do
  [ -f "$ARCHIVE/services/$unit" ] || refuse "the archive has no services/$unit"
done
[ -f "$ARCHIVE/version" ] || refuse "the archive has no version file"
VERSION=$(tr -d ' \n' <"$ARCHIVE/version")
case "$VERSION" in
  "" | */* | .*) refuse "the archive's version is not usable: $VERSION" ;;
esac

CHANGED=
# Copies $1 to $2 with mode $3, only if it differs.
put() {
  if ! cmp -s "$1" "$2" 2>/dev/null; then
    cp "$1" "$2.new" && chmod "$3" "$2.new" && mv "$2.new" "$2"
    CHANGED=yes
  fi
}
# Writes stdin to $1 with mode $2, only if it differs.
put_text() {
  tmp="$1.tmp"
  cat >"$tmp"
  chmod "$2" "$tmp"
  if cmp -s "$tmp" "$1" 2>/dev/null; then rm -f "$tmp"; else mv "$tmp" "$1"; CHANGED=yes; fi
}
# Makes the directory $1 with mode $2 and owner $3, as it should be.
directory() {
  [ -d "$1" ] || mkdir -p "$1"
  chmod "$2" "$1"
  chown "$3" "$1"
}

# 1. The account.
if ! id -u "$ACCOUNT" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/$ACCOUNT" --shell /bin/bash "$ACCOUNT" || refuse "the account $ACCOUNT could not be created"
  say "account $ACCOUNT created"
fi

# 2. The versions, and `current`.
mkdir -p "$OPT"
if [ ! -d "$OPT/$VERSION" ]; then
  rm -rf "$OPT/$VERSION.partial"
  cp -a "$ARCHIVE" "$OPT/$VERSION.partial"
  mv "$OPT/$VERSION.partial" "$OPT/$VERSION"
  say "version $VERSION installed"
  CHANGED=yes
fi
if [ "$(readlink "$OPT/current" 2>/dev/null)" != "$VERSION" ]; then
  ln -sfn "$VERSION" "$OPT/current.new"
  mv -T "$OPT/current.new" "$OPT/current"
  CHANGED=yes
fi

# 3. The state and the secrets.
directory "$STATE" 750 "$ACCOUNT:$ACCOUNT"
directory "$SECRETS" 750 "root:$ACCOUNT"

# The projects moved from the app's embedded station, only into a station that has none.
if [ -n "${BRIGADE_PROJECTS_FILE:-}" ] && [ -f "$BRIGADE_PROJECTS_FILE" ] && [ ! -e "$STATE/kitchen/projects" ]; then
  directory "$STATE/kitchen" 750 "$ACCOUNT:$ACCOUNT"
  cp "$BRIGADE_PROJECTS_FILE" "$STATE/kitchen/projects"
  chmod 640 "$STATE/kitchen/projects"
  chown "$ACCOUNT:$ACCOUNT" "$STATE/kitchen/projects"
  say "projects moved from the app's station"
fi

# 4. The command.
mkdir -p "$(dirname "$LINK")"
if [ "$(readlink "$LINK" 2>/dev/null)" != /opt/brigade-station/current/bin/brigade ]; then
  ln -sfn /opt/brigade-station/current/bin/brigade "$LINK.new"
  mv -T "$LINK.new" "$LINK"
fi

# 5. The tokens, asked only when /etc/brigade has none.
ask() { # $1 label, $2 value from the environment
  if [ -n "$2" ]; then printf '%s' "$2"; return; fi
  { (: <"$TERMINAL") 2>/dev/null; } || refuse "no $1 in /etc/brigade, and no terminal to ask it — give it as the matching BRIGADE_*_TOKEN variable"
  printf 'brigade: %s: ' "$1" >&2
  read -r reply <"$TERMINAL"
  [ -n "$reply" ] || refuse "no $1 given"
  printf '%s' "$reply"
}
if [ ! -s "$SECRETS/github.env" ]; then
  token=$(ask "the GitHub token" "${BRIGADE_GITHUB_TOKEN:-}")
  printf 'GH_TOKEN=%s\n' "$token" | put_text "$SECRETS/github.env" 600
fi
if [ ! -s "$SECRETS/claude-token" ]; then
  token=$(ask "the Claude long-lived token (claude setup-token)" "${BRIGADE_CLAUDE_TOKEN:-}")
  printf '%s\n' "$token" | put_text "$SECRETS/claude-token" 640
  chown "root:$ACCOUNT" "$SECRETS/claude-token"
fi
printf 'BRIGADE_CLAUDE_TOKEN_FILE=/etc/brigade/claude-token\n' | put_text "$SECRETS/jeton.env" 644
chown "root:$ACCOUNT" "$SECRETS/github.env"

# 6. The units, started.
mkdir -p "$UNITS"
UNITS_CHANGED=
for unit in brigade-station.service brigade-station-porte.service brigade-station-mise-a-jour.service brigade-station-mise-a-jour.timer; do
  before=$CHANGED
  CHANGED=
  put "$ARCHIVE/services/$unit" "$UNITS/$unit" 644
  [ -z "$CHANGED" ] || UNITS_CHANGED=yes
  CHANGED=${CHANGED:-$before}
done
if [ -n "$UNITS_CHANGED" ]; then systemctl daemon-reload || refuse "systemd did not reload its units"; fi
active=
if systemctl --quiet is-active brigade-station.service 2>/dev/null; then active=yes; fi
systemctl enable --now brigade-station-porte.service brigade-station.service brigade-station-mise-a-jour.timer || refuse "the station or its gate did not start (systemctl status brigade-station.service)"
# Running station, new code or secrets: it restarts on them.
if [ -n "$active" ] && [ -n "$CHANGED" ]; then
  systemctl restart brigade-station-porte.service brigade-station.service || refuse "the station did not restart (systemctl status brigade-station.service)"
fi
say "station $VERSION installed"

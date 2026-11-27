#!/bin/sh
# Installs a station on Linux or macOS, from the unpacked archive this script sits in.
# Run as root:  sudo sh install.sh
#
# On macOS (the same steps, the Mac's places):
#   - the hidden system user and group `brigade` (dscl, UID below 500, no login shell);
#   - /Library/Application Support/brigade (the station's state, owned by `brigade`)
#     and its etc/ (tokens, hidden from the cooks by BRIGADE_SANDBOX_HIDDEN);
#   - the launchd daemons of services/launchd/ in /Library/LaunchDaemons: the station and
#     the gate as `brigade`, the update as root every ten minutes (StartInterval);
#   - the cooks sit in Claude Code's sandbox, there is no bwrap. The network lock (pf)
#     is not set up here.
#
# On Linux:
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
OS=$(uname -s)
SECRET_MODE=750
CLAUDE_TOKEN_MODE=640
SECRET_OWNER="root:$ACCOUNT"
CLAUDE_TOKEN_FILE=/etc/brigade/claude-token
if [ "$OS" = Darwin ]; then
  STATE="$RACINE/Library/Application Support/brigade"
  SECRETS="$STATE/etc"
  UNITS="$RACINE/Library/LaunchDaemons"
  SECRET_MODE=700
  CLAUDE_TOKEN_MODE=600
  SECRET_OWNER="$ACCOUNT:$ACCOUNT"
  CLAUDE_TOKEN_FILE="/Library/Application Support/brigade/etc/claude-token"
fi
LINK="$RACINE/usr/local/bin/brigade"

say() { printf 'brigade: %s\n' "$*"; }
refuse() {
  printf 'brigade: install refused — %s\n' "$*" >&2
  exit 1
}

# Preflight: nothing is written before the machine is known able to cook.
[ -n "$RACINE" ] || [ "$(id -u)" = 0 ] || refuse "run it as root (sudo sh install.sh)"
case "$OS" in
  Linux)
    command -v bwrap >/dev/null 2>&1 || refuse "bwrap is missing, so the cooks would have no sandbox — install bubblewrap"
    command -v useradd >/dev/null 2>&1 || refuse "useradd is missing, so the account $ACCOUNT cannot be created"
    command -v systemctl >/dev/null 2>&1 || refuse "systemctl is missing, so the station and its gate cannot run as services"
    [ -n "$RACINE" ] || [ -d /run/systemd/system ] || refuse "systemd is not running, so the gate and the network filter of the station cannot be set up"
    SERVICES="brigade-station.service brigade-station-porte.service brigade-station-mise-a-jour.service brigade-station-mise-a-jour.timer"
    SERVICES_DIR="$ARCHIVE/services"
    ;;
  Darwin)
    command -v dscl >/dev/null 2>&1 || refuse "dscl is missing, so the account $ACCOUNT cannot be created"
    command -v launchctl >/dev/null 2>&1 || refuse "launchctl is missing, so the station and its gate cannot run as services"
    SERVICES="com.brigade.station.plist com.brigade.station.gate.plist com.brigade.station.update.plist"
    SERVICES_DIR="$ARCHIVE/services/launchd"
    ;;
  *) refuse "this script installs a Linux or macOS station, not $OS" ;;
esac
for unit in $SERVICES; do
  [ -f "$SERVICES_DIR/$unit" ] || refuse "the archive has no ${SERVICES_DIR#"$ARCHIVE"/}/$unit"
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
if [ "$OS" = Darwin ]; then
  # First number from 300 up to 499 that no user and no group has: below 500, so the
  # login window never lists the account, and it is hidden besides.
  if ! dscl . -read "/Users/$ACCOUNT" >/dev/null 2>&1; then
    taken=$({ dscl . -list /Users UniqueID; dscl . -list /Groups PrimaryGroupID; } 2>/dev/null | while read -r _ number; do echo "$number"; done)
    id=300
    while [ "$id" -lt 500 ] && printf '%s\n' "$taken" | grep -qx "$id"; do id=$((id + 1)); done
    [ "$id" -lt 500 ] || refuse "no free UID below 500 for the account $ACCOUNT"
    if ! dscl . -read "/Groups/$ACCOUNT" >/dev/null 2>&1; then
      dscl . -create "/Groups/$ACCOUNT" || refuse "the group $ACCOUNT could not be created"
      dscl . -create "/Groups/$ACCOUNT" PrimaryGroupID "$id"
    fi
    dscl . -create "/Users/$ACCOUNT" || refuse "the account $ACCOUNT could not be created"
    dscl . -create "/Users/$ACCOUNT" UserShell /usr/bin/false
    dscl . -create "/Users/$ACCOUNT" RealName "brigade station"
    dscl . -create "/Users/$ACCOUNT" UniqueID "$id"
    dscl . -create "/Users/$ACCOUNT" PrimaryGroupID "$id"
    dscl . -create "/Users/$ACCOUNT" NFSHomeDirectory "/Library/Application Support/brigade/home"
    dscl . -create "/Users/$ACCOUNT" IsHidden 1
    say "account $ACCOUNT created"
  fi
elif ! id -u "$ACCOUNT" >/dev/null 2>&1; then
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
  if [ "$OS" = Darwin ]; then
    ln -sfn "$VERSION" "$OPT/current" # BSD mv has no -T
  else
    ln -sfn "$VERSION" "$OPT/current.new"
    mv -T "$OPT/current.new" "$OPT/current"
  fi
  CHANGED=yes
fi

# 3. The state and the secrets.
directory "$STATE" 750 "$ACCOUNT:$ACCOUNT"
directory "$SECRETS" "$SECRET_MODE" "$SECRET_OWNER"
if [ "$OS" = Darwin ]; then
  directory "$STATE/home" 750 "$ACCOUNT:$ACCOUNT"
  directory "$STATE/log" 750 "$ACCOUNT:$ACCOUNT"
  directory "$RACINE/Library/Application Support/brigade-station" 755 root:wheel
fi

# 4. The command.
mkdir -p "$(dirname "$LINK")"
if [ "$(readlink "$LINK" 2>/dev/null)" != /opt/brigade-station/current/bin/brigade ]; then
  if [ "$OS" = Darwin ]; then
    ln -sfn /opt/brigade-station/current/bin/brigade "$LINK"
  else
    ln -sfn /opt/brigade-station/current/bin/brigade "$LINK.new"
    mv -T "$LINK.new" "$LINK"
  fi
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
  printf '%s\n' "$token" | put_text "$SECRETS/claude-token" "$CLAUDE_TOKEN_MODE"
  chown "$SECRET_OWNER" "$SECRETS/claude-token"
fi
if [ "$OS" = Darwin ]; then
  # Sourced by the station's shell line: the path has a space, so it is quoted.
  printf 'BRIGADE_CLAUDE_TOKEN_FILE="%s"\n' "$CLAUDE_TOKEN_FILE" | put_text "$SECRETS/jeton.env" 600
  chown "$SECRET_OWNER" "$SECRETS/jeton.env"
else
  printf 'BRIGADE_CLAUDE_TOKEN_FILE=%s\n' "$CLAUDE_TOKEN_FILE" | put_text "$SECRETS/jeton.env" 644
fi
chown "$SECRET_OWNER" "$SECRETS/github.env"

# 6. The services, started.
mkdir -p "$UNITS"
UNITS_CHANGED=
for unit in $SERVICES; do
  before=$CHANGED
  CHANGED=
  put "$SERVICES_DIR/$unit" "$UNITS/$unit" 644
  if [ "$OS" = Darwin ]; then chown root:wheel "$UNITS/$unit"; fi
  [ -z "$CHANGED" ] || UNITS_CHANGED="$UNITS_CHANGED $unit"
  CHANGED=${CHANGED:-$before}
done
if [ "$OS" = Darwin ]; then
  # launchd reads a plist when it is bootstrapped: a changed one is booted out and in again
  # (the station restarts on its new code), an unchanged one is only loaded if it is not.
  for unit in $SERVICES; do
    label=${unit%.plist}
    case "$UNITS_CHANGED" in
      *" $unit"*)
        launchctl bootout "system/$label" >/dev/null 2>&1 || true
        launchctl bootstrap system "$UNITS/$unit" || refuse "launchd did not load $label (launchctl print system/$label)"
        ;;
      *)
        if ! launchctl print "system/$label" >/dev/null 2>&1; then
          launchctl bootstrap system "$UNITS/$unit" || refuse "launchd did not load $label (launchctl print system/$label)"
        elif [ -n "$CHANGED" ] && [ "$label" != com.brigade.station.update ]; then
          launchctl kickstart -k "system/$label" || refuse "launchd did not restart $label (launchctl print system/$label)"
        fi
        ;;
    esac
  done
  say "station $VERSION installed"
  exit 0
fi
if [ -n "$UNITS_CHANGED" ]; then systemctl daemon-reload || refuse "systemd did not reload its units"; fi
active=
if systemctl --quiet is-active brigade-station.service 2>/dev/null; then active=yes; fi
systemctl enable --now brigade-station-porte.service brigade-station.service brigade-station-mise-a-jour.timer || refuse "the station or its gate did not start (systemctl status brigade-station.service)"
# Running station, new code or secrets: it restarts on them.
if [ -n "$active" ] && [ -n "$CHANGED" ]; then
  systemctl restart brigade-station-porte.service brigade-station.service || refuse "the station did not restart (systemctl status brigade-station.service)"
fi
say "station $VERSION installed"

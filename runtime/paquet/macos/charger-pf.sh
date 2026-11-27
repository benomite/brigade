#!/bin/sh
# Loads the `brigade` anchor into pf: run at boot by com.brigade.pf.plist, and by install.sh on macOS.
# The main ruleset must name the anchor to evaluate it; it is added once, to the system's own rules.
set -eu
DIR=$(dirname "$0")
(cat /etc/pf.conf; echo 'anchor "brigade"') | /sbin/pfctl -f -
/sbin/pfctl -a brigade -f "$DIR/brigade.pf.conf"
/sbin/pfctl -E 2>/dev/null || true

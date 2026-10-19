#!/usr/bin/env bash
# The code rename in one command (README.md): installs the tool's own
# TypeScript if it is missing, then runs it. Every argument goes to rename.ts:
#   rename.sh                 dry run on a copy of HEAD — nothing is written here
#   rename.sh --keep <dir>    dry run whose renamed copy stays at <dir>
#   rename.sh --apply         rename this tree
#   rename.sh --check         glossary terms left outside the table's exceptions
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$HERE/node_modules/typescript/package.json" ]; then
  npm ci --prefix "$HERE" --no-audit --no-fund >&2
fi
exec node "$HERE/rename.ts" "$@"

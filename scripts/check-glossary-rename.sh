#!/usr/bin/env bash
# Check that, after the code rename (#1040), the terms of docs/glossary.md
# remain in file names and code identifiers only as the exceptions of the
# table (#1044).
#
# Usage, from the repository root (by hand, or by the pass):
#   scripts/check-glossary-rename.sh
#
# Where the table is read from: scripts/rename-code/table.ts (WORDS, the
# glossary's terms; KEPT_MEMBERS and KEPT_FILES, the exceptions, each with its
# reason; the words the glossary keeps are simply absent from WORDS) and
# scripts/rename-code/names.ts. The search is `rename.sh --check` of #1039: it
# looks at the identifiers and the file and folder names of runtime/ and app/.
# The glossary terms are the table's own, so this script reads nothing else.
#
# Output and exit code:
#   - every file name or identifier that still holds a glossary term and is not
#     covered by the table is listed, one `left: …` line each; exit 1;
#   - when only table exceptions remain: one `OK` line; exit 0.
# The tool needs the dependencies of runtime/ and app/ (worktree-setup.sh) and
# takes a few minutes. Any other failure of the tool exits non-zero, with its
# message.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 2
out="$(mktemp)"; err="$(mktemp)"
trap 'rm -f "$out" "$err"' EXIT
"$ROOT/scripts/rename-code/rename.sh" --check >"$out" 2>"$err"
code=$?
if [ "$code" -eq 0 ] && grep -q '^check: no glossary term left' "$err"; then
  echo "OK: no glossary term left outside the table's exceptions"
  exit 0
fi
grep '^left: ' "$out"
cat "$err" >&2
[ "$code" -eq 0 ] && code=1
exit "$code"

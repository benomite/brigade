#!/usr/bin/env bash
# The app's `/brigade:init` (#2595), the part that writes: sets a repository up for Brigade on the
# GitHub-only path — no box, no ssh, no V1 plugin. Run from the project's folder by the command
# `init.md` next to it, once the session has settled what it cannot compute (the test command).
#
#   bash init.sh --test <command> [--install <command>] [--base <branch>]
#                [--zones <text>] [--dev-local <text>] [--doc <text>]
#
# What it does, each step convergent — replayed, it only fills what is missing:
#   1. the labels of the catalogue (labels.tsv, the runtime's runtime/src/etiquettes.ts), on GitHub
#      at once;
#   2. in a throwaway worktree on `brigade/init`, from the integration branch: the bindings block
#      `## Équipe multi-agents` at the end of `CLAUDE.md`, `.claude/brigade/gates.sh` and
#      `.claude/brigade/worktree-setup.sh` — each only if absent, nothing already there is rewritten;
#   3. a commit, a push and a pull request against the integration branch: the user merges it.
# The user's checkout is never touched: no branch switched, no file written in it.
#
# Last line on stdout: `pr <url>`, or `unchanged` when the integration branch already carries all
# of it. Anything else goes to stderr. Exit code 0 only when one of the two was reached.
set -euo pipefail

TEST=""; INSTALL=""; BASE=""; ZONES=""; DEV_LOCAL=""; DOC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --test) TEST="${2:-}"; shift 2 ;;
    --install) INSTALL="${2:-}"; shift 2 ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --zones) ZONES="${2:-}"; shift 2 ;;
    --dev-local) DEV_LOCAL="${2:-}"; shift 2 ;;
    --doc) DOC="${2:-}"; shift 2 ;;
    *) echo "brigade init: unknown argument: $1" >&2; exit 64 ;;
  esac
done
# A gate that runs nothing is a false green: the session asks the user rather than guessing.
[ -n "$TEST" ] || { echo "brigade init: --test is required (the command that runs the project tests)" >&2; exit 64; }

ROOT="$(git rev-parse --show-toplevel)" || { echo "brigade init: not in a git repository" >&2; exit 1; }
cd "$ROOT"
git remote get-url origin >/dev/null 2>&1 || { echo "brigade init: the repository has no \`origin\` remote on GitHub" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "brigade init: gh is not logged in (gh auth login)" >&2; exit 1; }
if [ -z "$BASE" ]; then
  BASE="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
  BASE="${BASE:-main}"
fi
BRANCH="brigade/init"

# 1. The labels: the catalogue (labels.tsv next to this script, generated from runtime/src/etiquettes.ts),
# each created if absent, its description corrected if present — a present label keeps its colour. The
# former `served-elsewhere` is renamed `served-elsewhere` first: GitHub carries the new name onto its issues.
CATALOGUE="$(dirname "${BASH_SOURCE[0]}")/labels.tsv"
[ -s "$CATALOGUE" ] || { echo "brigade init: the label catalogue is missing ($CATALOGUE)" >&2; exit 1; }
if gh label list --limit 200 --json name --jq '.[].name' | grep -qx 'served-elsewhere'; then
  if gh label list --limit 200 --json name --jq '.[].name' | grep -qx 'served-elsewhere'; then
    gh label delete served-elsewhere --yes >/dev/null
  else
    gh label edit served-elsewhere --name served-elsewhere >/dev/null
  fi
fi
while IFS=$'\t' read -r NAME COLOR DESCRIPTION; do
  [ -n "$NAME" ] || continue
  gh label create "$NAME" --color "$COLOR" --description "$DESCRIPTION" >/dev/null 2>&1 || gh label edit "$NAME" --description "$DESCRIPTION" >/dev/null
  echo "label $NAME" >&2
done <"$CATALOGUE"

# 2. The files, in a throwaway worktree.
git fetch --quiet origin "$BASE" >&2
WT="$(mktemp -d "${TMPDIR:-/tmp}/brigade-init-XXXXXX")"
rmdir "$WT"
cleanup() { git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"; }
trap cleanup EXIT
git worktree add --quiet -B "$BRANCH" "$WT" "origin/$BASE" >&2
cd "$WT"
mkdir -p .claude/brigade

if ! grep -q '^## Équipe multi-agents' CLAUDE.md 2>/dev/null; then
  NAME="$(basename "$ROOT")"
  {
    if [ -s CLAUDE.md ]; then
      [ -z "$(tail -c1 CLAUDE.md)" ] || echo
      echo
    fi
    echo "## Équipe multi-agents (plugin brigade)"
    echo
    echo "The bold labels of the bindings below stay in French: Brigade looks them up by these exact words."
    echo
    echo "- **Branche d'intégration** : \`$BASE\`"
    echo "- **Worktrees** : \`<parent of the repo>/$NAME-wt/<n>-<slug>\` — a sibling of the repo, the parent is computed (\`dirname \"\$(git rev-parse --show-toplevel)\"\`)"
    echo "- **Setup worktree** : \`.claude/brigade/worktree-setup.sh <n> <WT>\`"
    echo "- **Gates** : \`.claude/brigade/gates.sh <WT>\`"
    echo "- **Zones de fichiers** : ${ZONES:-the whole repository, one zone}"
    echo "- **Dev local** : ${DEV_LOCAL:-tests: \`$TEST\`}"
    echo "- **Doc vivante** : ${DOC:-none}"
  } >>CLAUDE.md
  echo "written: CLAUDE.md, the bindings block" >&2
else
  echo "unchanged: CLAUDE.md already carries the bindings block" >&2
fi

if [ ! -e .claude/brigade/gates.sh ]; then
  cat >.claude/brigade/gates.sh <<GATES
#!/usr/bin/env bash
# The project's gates. The exit code IS the verdict: 0 = green.
# Usage: gates.sh [<worktree>]   (default: the root of the current repository)
set -euo pipefail
WT="\${1:-\$(git rev-parse --show-toplevel)}"
cd "\$WT"
$TEST
GATES
  echo "written: .claude/brigade/gates.sh" >&2
else
  echo "unchanged: .claude/brigade/gates.sh already there" >&2
fi

if [ ! -e .claude/brigade/worktree-setup.sh ]; then
  {
    echo '#!/usr/bin/env bash'
    echo '# Makes a worktree runnable. On stdout, only `export` lines: the caller evaluates them.'
    echo '# Usage: worktree-setup.sh <n> <worktree>'
    echo 'set -euo pipefail'
    echo 'N="$1"; WT="$2"'
    if [ -n "$INSTALL" ]; then echo "(cd \"\$WT\" && $INSTALL) >&2"; else echo ': # nothing to install'; fi
  } >.claude/brigade/worktree-setup.sh
  echo "written: .claude/brigade/worktree-setup.sh" >&2
else
  echo "unchanged: .claude/brigade/worktree-setup.sh already there" >&2
fi
chmod +x .claude/brigade/gates.sh .claude/brigade/worktree-setup.sh
git add CLAUDE.md .claude/brigade/gates.sh .claude/brigade/worktree-setup.sh
# The executable bit is recorded even where the file system does not keep it (Windows).
git update-index --chmod=+x .claude/brigade/gates.sh .claude/brigade/worktree-setup.sh

if git diff --cached --quiet; then
  echo "unchanged"
  exit 0
fi

# 3. The pull request.
git commit --quiet -m "chore: set the repository up for Brigade" -m "The bindings in CLAUDE.md, the gates and the worktree setup, written by /brigade:init." >&2
git push --quiet --force origin "$BRANCH" >&2
URL="$(gh pr list --head "$BRANCH" --state open --json url --jq '.[0].url // ""')"
if [ -z "$URL" ]; then
  URL="$(gh pr create --base "$BASE" --head "$BRANCH" --title "Set the repository up for Brigade" \
    --body "Written by \`/brigade:init\`: the bindings block \`## Équipe multi-agents\` in \`CLAUDE.md\`, \`.claude/brigade/gates.sh\` and \`.claude/brigade/worktree-setup.sh\`. The labels are already on the repository. Merge it: the project is set up once it is on \`$BASE\`." | tail -1)"
fi
echo "pr $URL"

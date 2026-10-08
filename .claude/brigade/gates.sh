#!/usr/bin/env bash
# Verdict des gates du projet. Le code de sortie EST le verdict : 0 = vert.
# Usage : gates.sh [<worktree>]   (défaut : la racine du dépôt courant)
#
# Le dépôt porte deux zones, et chacune a ses invariants cassables.
#   - La zone plugin (commands/, agents/, codex/skills/, .claude-plugin/) n'a ni
#     suite de tests ni build : un manifest JSON invalide rend le plugin
#     ininstallable, un rôle ajouté et oublié dans plugin.json ne se charge
#     jamais, un miroir Codex incomplet ou périmé fait diverger /brigade:sync
#     chez le projet consommateur.
#   - La zone runtime (runtime/) a une suite de tests et un contrôle de types.
#     Tant que runtime/package.json n'existe pas, il n'y a rien à jouer : ce
#     n'est pas un échec.
set -uo pipefail
WT="${1:-$(git rev-parse --show-toplevel)}"
cd "$WT"

rc=0
fail() { echo "FAIL  $*" >&2; rc=1; }
ok()   { echo "ok    $*"; }

# 1. Validité des manifests JSON.
for f in .claude-plugin/plugin.json .claude-plugin/marketplace.json .claude/settings.json; do
  if [ ! -f "$f" ]; then fail "absent : $f"; continue; fi
  if python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f" 2>/dev/null; then
    ok "JSON valide : $f"
  else
    fail "JSON invalide : $f"
  fi
done

# 2. Syntaxe de tous les scripts shell versionnés.
while IFS= read -r s; do
  if bash -n "$s" 2>/dev/null; then ok "bash -n : $s"; else fail "syntaxe shell : $s"; fi
done < <(find . \( -path ./.git -o -name node_modules -o -path ./.brigade-state \) -prune \
              -o -name '*.sh' -print)

# 3-4-5. Cohérence commands/ ↔ plugin.json ↔ agents/ ↔ miroir Codex.
python3 - <<'PY' || rc=1
import json, pathlib, sys

# init et sync sont des commandes, pas des rôles : elles n'ont pas de miroir.
ROLES = ["po", "manager", "dev", "designer"]
bad = []
root = pathlib.Path(".")

manifest = json.loads((root / ".claude-plugin/plugin.json").read_text())

for champ, motif in (("commands", "commands/*.md"), ("agents", "agents/*.md")):
    declares = {c.lstrip("./") for c in manifest.get(champ, [])}
    presents = {str(f) for f in root.glob(motif)}
    for f in sorted(declares - presents):
        bad.append(f"declare dans plugin.json[{champ}] mais absent du disque : {f}")
    for f in sorted(presents - declares):
        bad.append(f"present sur le disque mais absent de plugin.json[{champ}] : {f}")

for r in ROLES:
    if not (root / f"commands/{r}.md").is_file():
        bad.append(f"role sans commande Claude : commands/{r}.md")
    for attendu in (f"codex/skills/{r}/SKILL.md", f"codex/skills/{r}/agents/openai.yaml"):
        if not (root / attendu).is_file():
            bad.append(f"miroir Codex incomplet : {attendu}")

# Les agents dev-teammate* sont un même rôle sous plusieurs calibrages : seul le
# frontmatter (model, effort) a le droit de différer, sinon les règles divergent
# selon l'effort choisi au spawn.
corps = {str(f): f.read_text().split("---\n", 2)[2] for f in sorted(root.glob("agents/dev-teammate*.md"))}
if len(set(corps.values())) > 1:
    bad.append("corps divergents entre calibrages du dev-teammate : " + ", ".join(corps))

for b in bad:
    print(f"FAIL  {b}", file=sys.stderr)
if not bad:
    print("ok    coherence commands/agents/plugin.json/miroir Codex")
sys.exit(1 if bad else 0)
PY

# 6. Fraîcheur du miroir Codex, relative au diff : un rôle modifié sans que son
# miroir bouge échoue. La règle ne regarde QUE commands/<rôle>.md — un changement
# qui ne touche que le runtime ne doit rien au miroir. La base est le binding
# « Branche d'intégration » du CLAUDE.md (`main` s'il est absent) ; sur la base
# elle-même le diff est vide, donc la règle ne juge que le travail en cours.
BASE="${BRIGADE_GATES_BASE:-$(sed -n "s/^- \*\*Branche d'intégration\*\* : \`\([^\`]*\)\`.*/\1/p" CLAUDE.md 2>/dev/null | head -1)}"
BASE="${BASE:-main}"
if   git rev-parse -q --verify "origin/$BASE^{commit}" >/dev/null 2>&1; then REF="origin/$BASE"
elif git rev-parse -q --verify "$BASE^{commit}"        >/dev/null 2>&1; then REF="$BASE"
else REF=""; fi
if [ -z "$REF" ]; then
  fail "branche d'intégration introuvable : $BASE (ni origin/$BASE ni $BASE) — fraîcheur du miroir invérifiable"
elif ! SOUCHE="$(git merge-base "$REF" HEAD 2>/dev/null)"; then
  fail "aucun ancêtre commun avec $REF — fraîcheur du miroir invérifiable"
else
  # Commité, indexé, non indexé et non suivi : le hook d'arrêt juge un arbre en
  # cours de travail, pas seulement des commits.
  CHANGES="$( { git diff --name-only "$SOUCHE"; git ls-files -o --exclude-standard; } | sort -u)"
  perime=0
  for r in po manager dev designer; do
    printf '%s\n' "$CHANGES" | grep -qx "commands/$r.md" || continue
    if ! printf '%s\n' "$CHANGES" | grep -q "^codex/skills/$r/"; then
      fail "miroir Codex périmé : commands/$r.md modifié depuis $REF, rien sous codex/skills/$r/"
      perime=1
    fi
  done
  [ "$perime" -eq 0 ] && ok "miroir Codex à jour pour les rôles modifiés depuis $REF"
fi

# 7. Runtime : tests, puis contrôle de types. Une seule ligne FAIL par étape, sans
# détail variable : le hook d'arrêt en tire l'empreinte de l'échec, et une
# empreinte qui change à chaque tour défait son disjoncteur. Le détail part sur
# stderr, sans préfixe FAIL.
if [ ! -f runtime/package.json ]; then
  ok "runtime absent : aucun test à jouer"
elif ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  fail "node ou npm introuvable : tests du runtime injouables"
else
  # Le contrôle de types part en même temps que les tests : il ne leur doit
  # rien, et l'attendre à la suite coûte un dixième de seconde à chaque arrêt.
  # Son verdict n'est lu qu'après celui des tests — l'ordre des lignes FAIL,
  # dont le hook tire son empreinte, ne dépend pas de qui finit le premier.
  TYPES=""
  if node -e 'process.exit(require("./runtime/package.json").scripts?.typecheck ? 0 : 1)' 2>/dev/null; then
    if [ -x runtime/node_modules/.bin/tsc ]; then
      TYPES="$(mktemp)"
      npm --prefix runtime run typecheck >"$TYPES" 2>&1 &
      PID_TYPES=$!
    else
      TYPES="injouable"
    fi
  fi
  # Les tests créent chacun leur répertoire temporaire : l'état d'un runtime
  # lancé à la main dans ce worktree ne doit jamais leur parvenir.
  # Leur sortie entière est gardée quand ils échouent : un échec intermittent ne
  # se rejoue pas à la demande, et sans elle il ne laisse ni nom ni raison. Un
  # fichier par passage — le hook d'arrêt et un dev jouent parfois les gates du
  # même arbre au même moment.
  JOURNAUX=".brigade-state/gates"
  mkdir -p "$JOURNAUX"
  find "$JOURNAUX" -name 'tests-du-runtime.*.log' -mtime +7 -delete 2>/dev/null
  JOURNAL="$JOURNAUX/tests-du-runtime.$(date +%Y%m%d-%H%M%S).$$.log"
  if env -u BRIGADE_STATE_DIR -u BRIGADE_PORT npm --prefix runtime test >"$JOURNAL" 2>&1; then
    rm -f "$JOURNAL"
    ok "tests du runtime"
  else
    # Les tests en échec, par leur nom et leur erreur — sans les piles d'appels,
    # qui noient le reste. Une suite morte avant de conclure n'a pas ce relevé :
    # c'est alors la fin de sa sortie qui parle.
    if grep -q '^✖ failing tests:' "$JOURNAL"; then
      sed -n '/^✖ failing tests:/,$p' "$JOURNAL" | grep -v '^ *at ' | head -80 >&2
    else
      tail -40 "$JOURNAL" >&2
    fi
    echo "sortie complète des tests : $WT/$JOURNAL" >&2
    fail "tests du runtime en échec — rejoue : npm --prefix runtime test"
  fi
  if [ -z "$TYPES" ]; then
    ok "runtime sans script typecheck : aucun contrôle de types à jouer"
  elif [ "$TYPES" = "injouable" ]; then
    fail "contrôle de types injouable : dépendances de dev absentes — rejoue worktree-setup.sh"
  else
    if wait "$PID_TYPES"; then
      ok "contrôle de types du runtime"
    else
      tail -40 "$TYPES" >&2
      fail "contrôle de types du runtime en échec — rejoue : npm --prefix runtime run typecheck"
    fi
    rm -f "$TYPES"
  fi
fi

# 8. Plafond de durée, déclaré par le binding « Plafond des gates » du CLAUDE.md
# — sans lui, rien n'est jugé. Il compte le temps PROCESSEUR de ce passage (ce
# script et tout ce qu'il a lancé puis attendu), pas l'horloge : quatre gates de
# front quadruplent la durée murale de chacune et n'ajoutent qu'un sixième à son
# temps processeur (mesuré le 2026-10-09 : 8 s puis 32 s d'horloge, 51 s puis
# 59 s de processeur). Le plafond dit donc ce que la suite coûte, pas
# l'encombrement de la machine — à cette marge près, qu'il doit contenir.
# `times` se lit dans ce shell-ci : un sous-shell n'a pas d'enfants.
RELEVE="$(mktemp)"
times >"$RELEVE"
COUT="$(LC_ALL=C awk '{ for (i = 1; i <= NF; i++) { gsub(",", ".", $i); split($i, t, /[ms]/); s += t[1] * 60 + t[2] } }
                      END { printf "%.1f", s }' "$RELEVE")"
rm -f "$RELEVE"
fr() { printf '%s' "$1" | tr . ,; }
DECLARE="$(grep -m1 '^- \*\*Plafond des gates\*\*' CLAUDE.md 2>/dev/null)"
PLAFOND="$(printf '%s\n' "$DECLARE" | sed -n 's/^- \*\*Plafond des gates\*\* : `\([0-9][0-9]*\([.,][0-9][0-9]*\)\{0,1\}\) s`.*/\1/p' | tr , .)"
MESURE="durée des gates : $(fr "$COUT") s de processeur"
if [ -z "$DECLARE" ]; then
  ok "$MESURE, $SECONDS s d'horloge (aucun plafond déclaré)"
elif [ -z "$PLAFOND" ]; then
  fail "plafond des gates illisible dans CLAUDE.md — attendu : - **Plafond des gates** : \`<n> s\` de processeur"
elif LC_ALL=C awk -v c="$COUT" -v p="$PLAFOND" 'BEGIN { exit !(c > p) }'; then
  # Une seule ligne FAIL, sans la mesure : elle change à chaque passage, et le
  # hook d'arrêt tire de cette ligne l'empreinte de l'échec.
  echo "$MESURE pour un plafond de $(fr "$PLAFOND") s — $(LC_ALL=C awk -v c="$COUT" -v p="$PLAFOND" \
    'BEGIN { printf "%.1f s de trop (+%.0f %%)", c - p, (c - p) * 100 / p }' | tr . ,)" >&2
  fail "plafond des gates franchi : plus de $(fr "$PLAFOND") s de processeur"
else
  ok "$MESURE, $SECONDS s d'horloge (plafond : $(fr "$PLAFOND") s de processeur)"
fi

[ "$rc" -eq 0 ] && echo "gates : VERT" || echo "gates : ROUGE" >&2
exit "$rc"

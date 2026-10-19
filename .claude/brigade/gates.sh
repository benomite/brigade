#!/usr/bin/env bash
# Verdict des gates du projet. Le code de sortie EST le verdict : 0 = vert.
# Usage : gates.sh [<worktree>]   (défaut : la racine du dépôt courant)
#
# Le dépôt porte trois zones, et chacune a ses invariants cassables.
#   - La zone plugin (commands/, agents/, codex/skills/, .claude-plugin/) n'a ni
#     suite de tests ni build : un manifest JSON invalide rend le plugin
#     ininstallable, un rôle ajouté et oublié dans plugin.json ne se charge
#     jamais, un miroir Codex incomplet ou périmé fait diverger /brigade:sync
#     chez le projet consommateur.
#   - Les zones runtime (runtime/) et app (app/) ont chacune une suite de tests
#     et un contrôle de types. Tant que le package.json d'une zone n'existe pas,
#     il n'y a rien à y jouer : ce n'est pas un échec. Aucun test ne lance
#     Electron : l'app se prouve par ses modules, comme le runtime.
set -uo pipefail
WT="${1:-$(git rev-parse --show-toplevel)}"
cd "$WT"

# La branche d'intégration : le binding du CLAUDE.md, `main` s'il est absent.
BASE="${BRIGADE_GATES_BASE:-$(sed -n "s/^- \*\*Branche d'intégration\*\* : \`\([^\`]*\)\`.*/\1/p" CLAUDE.md 2>/dev/null | head -1)}"
BASE="${BASE:-main}"

# La dernière ligne des gates : sur la sortie standard vertes, d'erreur rouges.
verdict() { if [ "$1" -eq 0 ]; then echo "gates : VERT"; else echo "gates : ROUGE" >&2; fi; }

# `rc` ne se pose que par `fail`, ou là où l'étape a écrit ses lignes FAIL
# elle-même : tout rouge de ces gates s'écrit sur une ligne FAIL.
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
# Le contrôle sort en 2 quand il a trouvé, et dit, des incohérences. Tout autre
# code est le contrôle lui-même qui n'a pas abouti — python3 absent, un manifest
# illisible, un fichier d'agent sans frontmatter : sa trace n'est pas une ligne
# FAIL, il en faut une.
python3 - <<'PY'
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
sys.exit(2 if bad else 0)
PY
case "$?" in
  0) ;;
  2) rc=1 ;;
  *) fail "contrôle de cohérence commands/agents/plugin.json/miroir Codex planté — sa trace est au-dessus" ;;
esac

# 6. Fraîcheur du miroir Codex, relative au diff : un rôle modifié sans que son
# miroir bouge échoue. La règle ne regarde QUE commands/<rôle>.md — un changement
# qui ne touche que le runtime ne doit rien au miroir. La base est le binding
# « Branche d'intégration » du CLAUDE.md (`main` s'il est absent) ; sur la base
# elle-même le diff est vide, donc la règle ne juge que le travail en cours.
if   git rev-parse -q --verify "origin/$BASE^{commit}" >/dev/null 2>&1; then REF="origin/$BASE"
elif git rev-parse -q --verify "$BASE^{commit}"        >/dev/null 2>&1; then REF="$BASE"
else REF=""; fi
if [ -z "$REF" ]; then
  fail "branche d'intégration introuvable : $BASE (ni origin/$BASE ni $BASE) — fraîcheur du miroir invérifiable"
elif ! SOUCHE="$(git merge-base "$REF" HEAD 2>/dev/null)"; then
  fail "aucun ancêtre commun avec $REF — fraîcheur du miroir invérifiable"
else
  # Commité, indexé, non indexé et non suivi : les gates jugent un arbre en
  # cours de travail, pas seulement des commits.
  CHANGES="$( { git diff --name-only "$SOUCHE"; git ls-files -o --exclude-standard; } | sort -u)"
  # La liste se lit dans la variable, pas au bout d'un tube : `printf` écrit une
  # ligne à la fois, un `grep -q` sort à la première trouvée, et l'écrivain tué
  # d'un SIGPIPE rend le tube faux sous `pipefail` — un miroir à jour jugé
  # périmé, ou un rôle sauté sans rien dire (#278 : sous forte charge, ou dès que
  # la liste dépasse ce qu'un tube retient).
  LIGNES="
$CHANGES
"
  perime=0
  for r in po manager dev designer; do
    case "$LIGNES" in *"
commands/$r.md
"*) ;; *) continue ;; esac
    case "$LIGNES" in *"
codex/skills/$r/"*) ;; *)
      fail "miroir Codex périmé : commands/$r.md modifié depuis $REF, rien sous codex/skills/$r/"
      perime=1 ;;
    esac
  done
  [ "$perime" -eq 0 ] && ok "miroir Codex à jour pour les rôles modifiés depuis $REF"
fi

# 7. Les zones à suite de tests — le runtime et l'app : tests et contrôle de
# types. Les quatre partent ensemble : aucun ne doit rien à un autre, et la
# suite du runtime, la plus longue, ne fait plus attendre celle de l'app
# derrière elle. Leurs verdicts se lisent ensuite dans un ordre fixe — le
# runtime, puis l'app ; les tests, puis le contrôle de types —, l'ordre des
# lignes ne dépend pas de qui finit le premier. Une seule ligne FAIL par étape ;
# le détail part sur stderr, sans préfixe FAIL. Une zone absente n'est pas un
# échec.
NB_TESTS=""
MS_TESTS=""
# Par zone, à son indice : ce que son lancement a trouvé, ses process, ses
# fichiers.
ETAT=()
TYPES=()
PID_TYPES=()
JOURNAL=()
PID_TESTS=()
PID_GARDE=()
# Garde d'horloge : un test figé dans du code synchrone (une boucle) n'est
# arrêté par aucun minuteur de son lanceur, et sans elle ce script ne rendrait
# jamais la main. Le délai est large : un
# test qui *attend* est déjà mis en échec, et nommé, par le lanceur au bout de
# deux minutes ; la garde ne doit tomber qu'après lui. Chaque suite a la sienne,
# qui court dès son lancement.
DELAI="${BRIGADE_GATES_DELAI_TESTS:-300}"

# Lance la suite d'une zone et son contrôle de types, sans les attendre.
# Usage : lancer <indice> <dossier> <du-runtime>
lancer() {
  local I="$1" ZONE="$2" JOURNAL_DE="$3" JOURNAUX PID APRES TIREE
  ETAT[I]=lancee
  if [ ! -f "$ZONE/package.json" ]; then
    ETAT[I]=absente
    return
  elif ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    ETAT[I]=sans-node
    return
  elif [ ! -d "$ZONE/node_modules" ] && node -e 'process.exit(Object.keys(require(process.argv[1]).dependencies ?? {}).length ? 0 : 1)' "$PWD/$ZONE/package.json" 2>/dev/null; then
    # Des dépendances d'exécution déclarées et jamais posées : la suite ne
    # dirait que « module introuvable », test après test.
    ETAT[I]=sans-dependances
    return
  fi
  TYPES[I]=""
  if node -e 'process.exit(require(process.argv[1]).scripts?.typecheck ? 0 : 1)' "$PWD/$ZONE/package.json" 2>/dev/null; then
    if [ -x "$ZONE/node_modules/.bin/tsc" ]; then
      TYPES[I]="$(mktemp)"
      npm --prefix "$ZONE" run typecheck >"${TYPES[I]}" 2>&1 9<&- &
      PID_TYPES[I]=$!
    else
      TYPES[I]="injouable"
    fi
  fi
  # Les tests créent chacun leur répertoire temporaire : l'état d'un runtime
  # lancé à la main dans ce worktree ne doit jamais leur parvenir.
  # Leur sortie entière est gardée quand ils échouent : un échec intermittent ne
  # se rejoue pas à la demande, et sans elle il ne laisse ni nom ni raison. Un
  # fichier par passage.
  JOURNAUX=".brigade-state/gates"
  mkdir -p "$JOURNAUX"
  find "$JOURNAUX" -name "tests-$JOURNAL_DE.*.log" -mtime +7 -delete 2>/dev/null
  JOURNAL[I]="$JOURNAUX/tests-$JOURNAL_DE.$(date +%Y%m%d-%H%M%S).$$.log"
  case "$DELAI" in
    ""|*[!0-9]*)
      ETAT[I]=illisible
      return ;;
  esac
  # La suite part dans son propre groupe de process (`set -m`) : le lanceur
  # a un process par fichier de tests, et tuer le premier ne tue pas le
  # second, qui lui survivrait en tenant un cœur. Hors du groupe du
  # terminal, lire le clavier la suspendrait : elle n'a pas d'entrée.
  set -m
  env -u BRIGADE_STATE_DIR -u BRIGADE_PORT npm --prefix "$ZONE" test </dev/null >"${JOURNAL[I]}" 2>&1 9<&- &
  PID=$!
  set +m
  PID_TESTS[I]=$PID
  # La garde ne tient aucune sortie de ce script : un `sleep` orphelin qui
  # garderait son tube ouvert retiendrait celui qui le lit. Arrêtée, elle
  # emporte son `sleep`.
  # `BRIGADE_GATES_GARDE_APRES` nomme un fichier : le délai ne court qu'une
  # fois ce fichier posé. C'est l'accroche des tests de la garde, qui la
  # règlent court — ils attendent ainsi un fait, pas que la suite ait
  # démarré à temps. Absent, le délai court dès le lancement.
  APRES="${BRIGADE_GATES_GARDE_APRES:-}"
  TIREE="${JOURNAL[I]}.garde"
  ( trap 'kill "$dort" 2>/dev/null; exit 0' TERM
    while [ -n "$APRES" ] && [ ! -e "$APRES" ]; do
      sleep 0.1 & dort=$!
      wait "$dort"
    done
    sleep "$DELAI" & dort=$!
    wait "$dort" && : >"$TIREE" && kill -KILL -- "-$PID" ) >/dev/null 2>&1 9<&- &
  PID_GARDE[I]=$!
}

# Attend la suite d'une zone et son contrôle de types, et dit leur verdict.
# Usage : conclure <indice> <dossier> <« du runtime »> <« runtime absent »>
conclure() {
  local I="$1" ZONE="$2" DE="$3" ABSENTE="$4" JOURNAL_ZONE TESTS ARRETES NB MS
  case "${ETAT[I]}" in
    absente)
      ok "$ABSENTE : aucun test à jouer"
      return ;;
    sans-node)
      SUITE_ROUGE=1
      fail "node ou npm introuvable : tests $DE injouables"
      return ;;
    sans-dependances)
      SUITE_ROUGE=1
      fail "dépendances $DE absentes : tests injouables — rejoue worktree-setup.sh"
      return ;;
  esac
  JOURNAL_ZONE="${JOURNAL[I]}"
  ARRETES=0
  if [ "${ETAT[I]}" = illisible ]; then
    TESTS=illisible
  else
    wait "${PID_TESTS[I]}" 2>/dev/null && TESTS=verts || TESTS=rouges
    kill "${PID_GARDE[I]}" 2>/dev/null
    wait "${PID_GARDE[I]}" 2>/dev/null
    if [ -e "$JOURNAL_ZONE.garde" ]; then rm -f "$JOURNAL_ZONE.garde"; ARRETES=1; fi
  fi
  [ "$TESTS" = verts ] || SUITE_ROUGE=1
  if [ "$TESTS" = illisible ]; then
    fail "délai des tests illisible : BRIGADE_GATES_DELAI_TESTS attend un nombre entier de secondes"
  elif [ "$TESTS" = verts ]; then
    # Le résumé du lanceur, avant que sa sortie ne parte : combien de tests, et
    # ce que la suite a duré. Les zones s'additionnent.
    NB="$(sed -n 's/^ℹ tests \([0-9][0-9]*\)$/\1/p' "$JOURNAL_ZONE" | tail -1)"
    MS="$(sed -n 's/^ℹ duration_ms \([0-9][0-9.]*\)$/\1/p' "$JOURNAL_ZONE" | tail -1)"
    [ -z "$NB" ] || NB_TESTS="$(( ${NB_TESTS:-0} + NB ))"
    [ -z "$MS" ] || MS_TESTS="$(LC_ALL=C awk -v a="${MS_TESTS:-0}" -v b="$MS" 'BEGIN { printf "%.3f", a + b }')"
    rm -f "$JOURNAL_ZONE"
    ok "tests $DE"
  elif [ "$ARRETES" -eq 1 ]; then
    # Une suite tuée n'a ni relevé ni conclusion : la fin de sa sortie dit au
    # moins jusqu'où elle était allée.
    tail -40 "$JOURNAL_ZONE" >&2
    echo "sortie complète des tests : $WT/$JOURNAL_ZONE" >&2
    # Aucun test en échec avant la coupure : la suite n'a fait que trop durer.
    # Sur une machine saturée, c'est un rouge de charge, pas de code — la ligne
    # le dit, dans la forme que le runtime reconnaît pour rejouer ces gates
    # plus tard au lieu d'y voir un rouge. Un test en échec — `✖` du lanceur,
    # `not ok` en TAP — garde la ligne d'un rouge.
    if grep -Eq '^[[:space:]]*(✖|not ok( |$))' "$JOURNAL_ZONE"; then
      fail "tests $DE arrêtés par la garde d'horloge : plus de $DELAI s sans rendre la main, et des tests en échec avant la coupure"
    else
      fail "tests $DE arrêtés par la garde d'horloge, aucun test en échec : plus de $DELAI s sans rendre la main"
    fi
  else
    # Les tests en échec, par leur nom et leur erreur — sans les piles d'appels,
    # qui noient le reste. Une suite morte avant de conclure n'a pas ce relevé :
    # c'est alors la fin de sa sortie qui parle.
    if grep -q '^✖ failing tests:' "$JOURNAL_ZONE"; then
      sed -n '/^✖ failing tests:/,$p' "$JOURNAL_ZONE" | grep -v '^ *at ' | head -80 >&2
    else
      tail -40 "$JOURNAL_ZONE" >&2
    fi
    echo "sortie complète des tests : $WT/$JOURNAL_ZONE" >&2
    fail "tests $DE en échec — rejoue : npm --prefix $ZONE test"
  fi
  if [ -z "${TYPES[I]}" ]; then
    ok "$ZONE sans script typecheck : aucun contrôle de types à jouer"
  elif [ "${TYPES[I]}" = "injouable" ]; then
    fail "contrôle de types $DE injouable : dépendances de dev absentes — rejoue worktree-setup.sh"
  else
    if wait "${PID_TYPES[I]}"; then
      ok "contrôle de types $DE"
    else
      tail -40 "${TYPES[I]}" >&2
      fail "contrôle de types $DE en échec — rejoue : npm --prefix $ZONE run typecheck"
    fi
    rm -f "${TYPES[I]}"
  fi
}

# Interrompues, les gates n'abandonnent pas une suite qui n'est plus dans leur
# groupe, ni sa garde.
abandonner() {
  local I
  for I in 0 1; do
    [ -z "${PID_TESTS[I]:-}" ] || kill -KILL -- "-${PID_TESTS[I]}" 2>/dev/null
    [ -z "${PID_GARDE[I]:-}" ] || kill "${PID_GARDE[I]}" 2>/dev/null
  done
  exit 130
}
trap abandonner INT TERM

# La place des gates : sur une machine, un seul passage à la fois joue ses
# suites. Trois passages de front se partageraient le processeur jusqu'à ce que
# chacun passe sa garde d'horloge ; l'un après l'autre, chacun joue ses suites
# dans le temps d'un passage seul, et les autres attendent leur tour sans que
# leur garde ne coure. Un verrou du noyau (`flock`) sur un fichier commun à tous
# les worktrees de la machine : il tombe avec le process qui le tient, même tué.
# Ce que les suites lancent ne le reçoit pas. `BRIGADE_GATES_PLACE` nomme ce
# fichier ; vide, aucune place n'est prise — c'est ce que reçoivent les suites,
# dont les tests jouent ces gates sur des projets d'essai : prendre la place que
# leurs propres gates tiennent, ils l'attendraient sans fin.
PLACE="${BRIGADE_GATES_PLACE-/tmp/brigade-gates.place}"
# Vide tant que ce passage n'a pas eu à attendre.
ATTENTE=""
if [ -z "$PLACE" ]; then
  :
elif ! command -v flock >/dev/null 2>&1; then
  ok "place des gates : flock introuvable, les suites partent sans attendre les autres gates de la machine"
elif ! { : >>"$PLACE" && exec 9<"$PLACE"; } 2>/dev/null; then
  ok "place des gates : $PLACE ne s'ouvre pas, les suites partent sans attendre les autres gates de la machine"
elif ! flock -n 9; then
  DEBUT_ATTENTE=$SECONDS
  echo "ok    place des gates : d'autres gates de cette machine jouent leurs suites — celles-ci attendent leur tour"
  flock 9
  ATTENTE=$((SECONDS - DEBUT_ATTENTE))
  ok "place des gates : $ATTENTE s d'attente"
fi
export BRIGADE_GATES_PLACE=

SUITE_ROUGE=0
lancer 0 runtime du-runtime
lancer 1 app de-l-app
conclure 0 runtime "du runtime" "runtime absent"
conclure 1 app "de l'app" "app absente"
trap - INT TERM
# La place se rend dès les suites conclues : le reste ne prend qu'un instant.
exec 9<&-
# Une suite rouge n'a pas de relevé : la somme des autres passerait pour le
# total, et le relevé montrerait une chute au lieu d'une absence.
if [ "$SUITE_ROUGE" -eq 1 ]; then NB_TESTS=""; MS_TESTS=""; fi

# 8. Ce que ce passage a coûté : le temps PROCESSEUR de ce script et de tout ce
# qu'il a lancé puis attendu, utilisateur et système, l'horloge, et la charge du
# poste à l'arrivée. Une mesure imprimée, qui ne juge rien.
# `times` se lit dans ce shell-ci : un sous-shell n'a pas d'enfants. Il rend
# deux lignes — ce shell, puis ses enfants —, utilisateur puis système.
RELEVE="$(mktemp)"
times >"$RELEVE"
read -r COUT UTILISATEUR SYSTEME < <(LC_ALL=C awk '{ for (i = 1; i <= 2; i++) { gsub(",", ".", $i); split($i, t, /[ms]/); s[i] += t[1] * 60 + t[2] } }
                                                   END { printf "%.1f %.1f %.1f\n", s[1] + s[2], s[1], s[2] }' "$RELEVE")
rm -f "$RELEVE"
fr() { printf '%s' "$1" | tr . ,; }
# La charge moyenne sur une minute, telle qu'`uptime` la donne.
CHARGE="$(uptime 2>/dev/null | sed -n 's/.*load averages\{0,1\}: *\([0-9][0-9]*[.,][0-9]*\).*/\1/p')"
ok "durée des gates : $(fr "$COUT") s de processeur ($(fr "$UTILISATEUR") utilisateur + $(fr "$SYSTEME") système), $SECONDS s d'horloge, charge du poste $(fr "${CHARGE:-inconnue}")"

# 9. Les mesures que ces gates déclarent, pour le relevé du runtime (`npm
# --prefix runtime run measures`) : une ligne `MESURE  <nom>=<nombre>` chacune.
# Elles ne jugent rien — ni FAIL ni ok —, et une mesure inconnue ne s'imprime
# pas : le relevé montre une absence, jamais un zéro.
mesure() { [ -z "$2" ] || echo "MESURE  $1=$2"; }
mesure tests "${NB_TESTS:-}"
[ -z "${MS_TESTS:-}" ] || mesure tests_s "$(LC_ALL=C awk -v ms="$MS_TESTS" 'BEGIN { printf "%.1f", ms / 1000 }')"
# Ce que pèse ce qui est commité : tout le dépôt, puis son markdown.
if POIDS="$(git ls-tree -r -l HEAD 2>/dev/null)"; then
  mesure depot_octets "$(printf '%s\n' "$POIDS" | LC_ALL=C awk '{ s += $4 } END { printf "%d", s }')"
  mesure doc_octets "$(printf '%s\n' "$POIDS" | LC_ALL=C awk '/\.md$/ { s += $4 } END { printf "%d", s }')"
fi
# Ce que chaque cook charge à coup sûr : le CLAUDE.md et, de proche en proche,
# les fichiers qu'il importe par `@chemin`.
[ ! -f CLAUDE.md ] || mesure contexte_octets "$(python3 - <<'PY' 2>/dev/null
import os, re
vus, pile, total = set(), ["CLAUDE.md"], 0
while pile:
    f = os.path.normpath(pile.pop())
    if f in vus or not os.path.isfile(f):
        continue
    vus.add(f)
    total += os.path.getsize(f)
    with open(f, errors="replace") as texte:
        for importe in re.findall(r"(?:^|\s)@(\S+)", texte.read()):
            pile.append(os.path.join(os.path.dirname(f), importe.rstrip(".,;:)")))
print(total)
PY
)"
# L'attente de la place n'est pas la durée des gates : comptée dedans, trois
# passages de front montreraient une dérive que rien n'a causée. Elle a sa
# mesure, imprimée seulement quand ce passage a attendu.
mesure gates_s "$((SECONDS - ${ATTENTE:-0}))"
mesure attente_s "$ATTENTE"

verdict "$rc"
exit "$rc"

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

# 6 ter. Les tests que touche ce changement (#1004) : les suites ne jouent que
# ceux-là — leur fermeture d'imports et de fichiers cités contient un fichier
# modifié (`tests-touches.mjs`). Sur la base elle-même le diff est vide : tout
# se joue, et c'est là que se rattrape un test touché sans que rien ne le dise.
# `BRIGADE_GATES_TOUT=1` joue tout ; une sélection qui n'aboutit pas aussi.
# Hors CI — la station qui cuisine, le poste du dev —, seuls les tests proches
# du changement se jouent (`--proches`) : la suite touchée tourne sur GitHub
# Actions (`.github/workflows/tests.yml`), que la pass attend avant de merger.
# `BRIGADE_GATES_TESTS=touches` joue la fermeture ici aussi.
SELECTION_runtime=tout
SELECTION_app=tout
PORTEE=--proches
[ "${CI:-}" = true ] || [ "${BRIGADE_GATES_TESTS:-}" = touches ] && PORTEE=
if [ "${BRIGADE_GATES_TOUT:-}" != 1 ] && [ -n "$REF" ] && [ -n "${SOUCHE:-}" ] && command -v node >/dev/null 2>&1; then
  if SELECTION="$(printf '%s\n' "$CHANGES" | node .claude/brigade/tests-touches.mjs $PORTEE 2>/dev/null)"; then
    while read -r ZONE_SEL REGLE; do
      case "$ZONE_SEL" in runtime) SELECTION_runtime="$REGLE" ;; app) SELECTION_app="$REGLE" ;; esac
    done <<<"$SELECTION"
  fi
fi

# 6 bis. Le tour : sur une box, les suites de tests de deux passages ne courent
# jamais en même temps — c'est ce qui fait que la garde d'horloge ne coupe plus
# pour cause de charge (#1004). Le verrou est un répertoire (`mkdir` est
# atomique, sur Linux comme sur macOS), partagé entre tous les worktrees de la
# box ; il porte le pid de ce script. Un passage tué ou planté ne le libère pas
# lui-même : le suivant voit que ce pid est mort et reprend la main.
# L'attente n'est PAS de la durée d'exécution : la garde d'horloge ne court
# qu'une fois le tour obtenu (elle est armée dans `suite`).
VERROU="${BRIGADE_GATES_VERROU:-${TMPDIR:-/tmp}/brigade-gates-$(id -u).verrou}"
VERROU="${VERROU%/}"
TOUR=0
rendre_le_tour() {
  if [ "$TOUR" -eq 1 ] && [ "$(cat "$VERROU/pid" 2>/dev/null)" = "$$" ]; then
    rm -rf "$VERROU"
  fi
  TOUR=0
}
prendre_le_tour() {
  local PROPRIETAIRE MORT
  # `BRIGADE_GATES_VERROU=aucun` : pas de tour. Pour les tests des gates, qui
  # en jouent des dizaines de front et ne doivent pas faire la queue.
  [ "$VERROU" = aucun ] && return 0
  while :; do
    if mkdir "$VERROU" 2>/dev/null; then
      echo "$$" >"$VERROU/pid"
      TOUR=1
      return 0
    fi
    PROPRIETAIRE="$(cat "$VERROU/pid" 2>/dev/null)"
    MORT=0
    if [ -n "$PROPRIETAIRE" ]; then
      kill -0 "$PROPRIETAIRE" 2>/dev/null || MORT=1
    elif [ ! -d "$VERROU" ]; then
      continue   # rendu entre-temps
    elif [ -n "$(find "$VERROU" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then
      MORT=1     # créé il y a plus d'une minute et jamais signé : son passage est mort entre mkdir et écriture
    fi
    if [ "$MORT" -eq 1 ]; then
      # Reprise : renommer est atomique, un seul des passages en attente
      # emporte le verrou mort. Si ce qu'on a emporté est le verrou vivant d'un
      # autre (repris entre-temps), on le remet.
      if mv "$VERROU" "$VERROU.mort.$$" 2>/dev/null; then
        if [ "$(cat "$VERROU.mort.$$/pid" 2>/dev/null)" = "$PROPRIETAIRE" ]; then
          rm -rf "$VERROU.mort.$$"
        else
          mv "$VERROU.mort.$$" "$VERROU" 2>/dev/null || rm -rf "$VERROU.mort.$$"
        fi
      fi
      continue
    fi
    sleep 0.5
  done
}
# Quitter, interrompu ou non, rend le tour. (Un SIGKILL ne passe pas ici : c'est
# la reprise du verrou mort, plus haut, qui le rend.)
trap rendre_le_tour EXIT
trap 'rendre_le_tour; exit 130' INT
trap 'rendre_le_tour; exit 143' TERM

# 7. Les zones à suite de tests — le runtime, puis l'app : tests, puis contrôle
# de types. Une seule ligne FAIL par étape ; le détail part sur stderr, sans
# préfixe FAIL. Une zone absente n'est pas un échec.
# Usage : suite <dossier> <« du runtime »> <« runtime absent »> <du-runtime>
NB_TESTS=""
MS_TESTS=""
suite() {
  local ZONE="$1" DE="$2" ABSENTE="$3" JOURNAL_DE="$4" REGLE="$5"
  local TYPES PID_TYPES JOURNAUX JOURNAL DELAI ARRETES TESTS PID_TESTS APRES TIREE PID_GARDE NB MS FICHIERS="" COMMANDE="" MOTIF
  if [ ! -f "$ZONE/package.json" ]; then
    ok "$ABSENTE : aucun test à jouer"
    return
  elif [ "$REGLE" = rien ]; then
    if [ -n "$PORTEE" ]; then ok "tests $DE non joués ici : aucun n'est proche de ce changement — ceux qu'il touche tournent sur la CI, la suite entière sur la base"
    else ok "tests $DE non joués : aucun ne touche ce changement — la suite entière tourne sur la base"; fi
    return
  elif ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    SUITE_ROUGE=1
    fail "node ou npm introuvable : tests $DE injouables"
    return
  elif [ ! -d "$ZONE/node_modules" ] && node -e 'process.exit(Object.keys(require(process.argv[1]).dependencies ?? {}).length ? 0 : 1)' "$PWD/$ZONE/package.json" 2>/dev/null; then
    # Des dépendances d'exécution déclarées et jamais posées : la suite ne
    # dirait que « module introuvable », test après test.
    SUITE_ROUGE=1
    fail "dépendances $DE absentes : tests injouables — rejoue worktree-setup.sh"
    return
  fi
  case "$REGLE" in
    "fichiers "*)
      # Le motif du script `test`, remplacé par les fichiers choisis. Un script
      # sans ce motif joue tout.
      MOTIF='"test/**/*.test.ts"'
      COMMANDE="$(node -e 'console.log(require(process.argv[1]).scripts?.test ?? "")' "$PWD/$ZONE/package.json" 2>/dev/null)"
      case "$COMMANDE" in
        *"$MOTIF"*)
          FICHIERS="${REGLE#fichiers }"
          COMMANDE="${COMMANDE/"$MOTIF"/$FICHIERS}"
          if [ -n "$PORTEE" ]; then ok "tests $DE : $(set -- $FICHIERS; echo $#) fichiers proches de ce changement — ceux qu'il touche tournent sur la CI, la suite entière sur la base"
          else ok "tests $DE : $(set -- $FICHIERS; echo $#) fichiers touchés par ce changement — la suite entière tourne sur la base"; fi ;;
      esac ;;
  esac
  # Le contrôle de types part en même temps que les tests : il ne leur doit
  # rien. Son verdict n'est lu qu'après celui des tests — l'ordre des lignes
  # FAIL ne dépend pas de qui finit le premier.
  TYPES=""
  if node -e 'process.exit(require(process.argv[1]).scripts?.typecheck ? 0 : 1)' "$PWD/$ZONE/package.json" 2>/dev/null; then
    if [ -x "$ZONE/node_modules/.bin/tsc" ]; then
      TYPES="$(mktemp)"
      npm --prefix "$ZONE" run typecheck >"$TYPES" 2>&1 &
      PID_TYPES=$!
    else
      TYPES="injouable"
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
  JOURNAL="$JOURNAUX/tests-$JOURNAL_DE.$(date +%Y%m%d-%H%M%S).$$.log"
  # Garde d'horloge : un test figé dans du code synchrone (une boucle) n'est
  # arrêté par aucun minuteur de son lanceur, et sans elle ce script ne rendrait
  # jamais la main. Le délai est large : un
  # test qui *attend* est déjà mis en échec, et nommé, par le lanceur au bout de
  # deux minutes ; la garde ne doit tomber qu'après lui.
  DELAI="${BRIGADE_GATES_DELAI_TESTS:-300}"
  ARRETES=0
  case "$DELAI" in
    ""|*[!0-9]*) TESTS=illisible ;;
    *)
      # La suite part dans son propre groupe de process (`set -m`) : le lanceur
      # a un process par fichier de tests, et tuer le premier ne tue pas le
      # second, qui lui survivrait en tenant un cœur. Hors du groupe du
      # terminal, lire le clavier la suspendrait : elle n'a pas d'entrée.
      set -m
      if [ -n "$FICHIERS" ]; then
        # Le script `test` de la zone, ses fichiers à la place de son motif.
        ( cd "$ZONE" && exec env -u BRIGADE_STATE_DIR -u BRIGADE_PORT sh -c "$COMMANDE" ) </dev/null >"$JOURNAL" 2>&1 &
      else
        env -u BRIGADE_STATE_DIR -u BRIGADE_PORT npm --prefix "$ZONE" test </dev/null >"$JOURNAL" 2>&1 &
      fi
      PID_TESTS=$!
      set +m
      # La garde ne tient aucune sortie de ce script : un `sleep` orphelin qui
      # garderait son tube ouvert retiendrait celui qui le lit. Arrêtée, elle
      # emporte son `sleep`.
      # `BRIGADE_GATES_GARDE_APRES` nomme un fichier : le délai ne court qu'une
      # fois ce fichier posé. C'est l'accroche des tests de la garde, qui la
      # règlent court — ils attendent ainsi un fait, pas que la suite ait
      # démarré à temps. Absent, le délai court dès le lancement.
      APRES="${BRIGADE_GATES_GARDE_APRES:-}"
      TIREE="$JOURNAL.garde"
      ( trap 'kill "$dort" 2>/dev/null; exit 0' TERM
        while [ -n "$APRES" ] && [ ! -e "$APRES" ]; do
          sleep 0.1 & dort=$!
          wait "$dort"
        done
        sleep "$DELAI" & dort=$!
        wait "$dort" && : >"$TIREE" && kill -KILL -- "-$PID_TESTS" ) >/dev/null 2>&1 &
      PID_GARDE=$!
      # Interrompues, les gates n'abandonnent pas une suite qui n'est plus dans
      # leur groupe.
      trap 'kill -KILL -- "-$PID_TESTS" 2>/dev/null; kill "$PID_GARDE" 2>/dev/null; exit 130' INT TERM
      wait "$PID_TESTS" 2>/dev/null && TESTS=verts || TESTS=rouges
      trap 'rendre_le_tour; exit 130' INT
      trap 'rendre_le_tour; exit 143' TERM
      kill "$PID_GARDE" 2>/dev/null
      wait "$PID_GARDE" 2>/dev/null
      if [ -e "$TIREE" ]; then rm -f "$TIREE"; ARRETES=1; fi
      ;;
  esac
  [ "$TESTS" = verts ] || SUITE_ROUGE=1
  if [ "$TESTS" = illisible ]; then
    fail "délai des tests illisible : BRIGADE_GATES_DELAI_TESTS attend un nombre entier de secondes"
  elif [ "$TESTS" = verts ]; then
    # Le résumé du lanceur, avant que sa sortie ne parte : combien de tests, et
    # ce que la suite a duré. Les zones s'additionnent.
    NB="$(sed -n 's/^ℹ tests \([0-9][0-9]*\)$/\1/p' "$JOURNAL" | tail -1)"
    MS="$(sed -n 's/^ℹ duration_ms \([0-9][0-9.]*\)$/\1/p' "$JOURNAL" | tail -1)"
    [ -z "$NB" ] || NB_TESTS="$(( ${NB_TESTS:-0} + NB ))"
    [ -z "$MS" ] || MS_TESTS="$(LC_ALL=C awk -v a="${MS_TESTS:-0}" -v b="$MS" 'BEGIN { printf "%.3f", a + b }')"
    rm -f "$JOURNAL"
    ok "tests $DE"
  elif [ "$ARRETES" -eq 1 ]; then
    # Une suite tuée n'a ni relevé ni conclusion : la fin de sa sortie dit au
    # moins jusqu'où elle était allée.
    tail -40 "$JOURNAL" >&2
    echo "sortie complète des tests : $WT/$JOURNAL" >&2
    # Aucun test en échec avant la coupure : la suite n'a fait que trop durer.
    # Sur une machine saturée, c'est un rouge de charge, pas de code — la ligne
    # le dit, dans la forme que le runtime reconnaît pour rejouer ces gates
    # plus tard au lieu d'y voir un rouge. Un test en échec — `✖` du lanceur,
    # `not ok` en TAP — garde la ligne d'un rouge.
    if grep -Eq '^[[:space:]]*(✖|not ok( |$))' "$JOURNAL"; then
      fail "tests $DE arrêtés par la garde d'horloge : plus de $DELAI s sans rendre la main, et des tests en échec avant la coupure"
    else
      fail "tests $DE arrêtés par la garde d'horloge, aucun test en échec : plus de $DELAI s sans rendre la main"
    fi
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
    fail "tests $DE en échec — rejoue : npm --prefix $ZONE test"
  fi
  if [ -z "$TYPES" ]; then
    ok "$ZONE sans script typecheck : aucun contrôle de types à jouer"
  elif [ "$TYPES" = "injouable" ]; then
    fail "contrôle de types $DE injouable : dépendances de dev absentes — rejoue worktree-setup.sh"
  else
    if wait "$PID_TYPES"; then
      ok "contrôle de types $DE"
    else
      tail -40 "$TYPES" >&2
      fail "contrôle de types $DE en échec — rejoue : npm --prefix $ZONE run typecheck"
    fi
    rm -f "$TYPES"
  fi
}
# Le proxy de Node, que la porte d'une box pose pour tout ce que le runtime
# lance (`NODE_USE_ENV_PROXY`, runtime/src/reseau.ts) : avec lui, chaque process
# Node charge au démarrage de quoi passer par la porte — 80 ms de processeur de
# plus, sur un démarrage qui en coûte 45. Les suites n'ouvrent aucun réseau, et
# lancent des milliers de process Node : ni elles ni le contrôle de types ne le
# reçoivent. Un test qui éprouve la porte pose lui-même ce qu'elle exporte.
unset NODE_USE_ENV_PROXY
SUITE_ROUGE=0
DEBUT_ATTENTE=$SECONDS
prendre_le_tour
ATTENTE=$((SECONDS - DEBUT_ATTENTE))
DEBUT_EXECUTION=$SECONDS
suite runtime "du runtime" "runtime absent" du-runtime "$SELECTION_runtime"
suite app "de l'app" "app absente" de-l-app "$SELECTION_app"
EXECUTION=$((SECONDS - DEBUT_EXECUTION))
rendre_le_tour
ok "tour des tests : $ATTENTE s à attendre son tour, $EXECUTION s d'exécution (la garde de ${BRIGADE_GATES_DELAI_TESTS:-300} s ne compte que l'exécution)"
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
# La durée d'exécution : l'attente du tour n'est pas une dérive des gates.
mesure gates_s "$((SECONDS - ATTENTE))"

verdict "$rc"
exit "$rc"

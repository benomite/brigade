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
case "$0" in /*) MOI="$0" ;; *) MOI="$PWD/$0" ;; esac
cd "$WT"

# La branche d'intégration : le binding du CLAUDE.md, `main` s'il est absent.
BASE="${BRIGADE_GATES_BASE:-$(sed -n "s/^- \*\*Branche d'intégration\*\* : \`\([^\`]*\)\`.*/\1/p" CLAUDE.md 2>/dev/null | head -1)}"
BASE="${BASE:-main}"

# 0. Un seul passage à la fois par arbre. Le hook d'arrêt part à chaque `Stop`
# et à chaque `SubagentStop`, et plusieurs tirs peuvent juger le même arbre : sans
# verrou, jusqu'à six suites y ont tourné de front (2026-10-09), chacune payant
# le processeur que les autres lui faisaient perdre — et le plafond rougissait
# sur un arbre qui passe. Ce script-ci ne fait donc que tenir le verrou : il
# rejoue ce même fichier dessous, laisse passer sa sortie au fil de l'eau — tué
# en route, un passage a déjà dit ce qu'il avait à dire — et en garde une copie
# avec le verdict.
#   - Le verrou est un `flock` sur un descripteur de CE process : le noyau le
#     rend quand le process meurt, de quelque façon que ce soit. Un passage tué
#     ne retient donc personne, et il n'y a rien à nettoyer. Le passage joué
#     dessous n'hérite pas du descripteur — un process qu'un test laisse
#     derrière lui garderait sinon le verrou.
#   - Qui a dû attendre reprend le verdict du passage qu'il a attendu, si
#     l'arbre est dans l'état que ce passage a jugé : même sortie, même code.
#     Sinon il joue à son tour. Qui n'a pas attendu joue toujours — rejouer les
#     gates à la main rejoue vraiment. Un passage mort d'un signal n'a pas de
#     verdict : seuls un vert et un rouge se prêtent.
#   - `BRIGADE_GATES_VERDICT_GARDE`, posé, fait rendre le verdict gardé sans
#     avoir attendu personne, tant que l'arbre est dans l'état jugé : c'est le
#     hook d'arrêt qui le pose, lui qui part à chaque arrêt, que l'arbre ait
#     bougé ou non. La ligne dit de quand le verdict date.
#   - L'attente a une borne, `BRIGADE_GATES_ATTENTE` (300 s, en secondes
#     entières) : qui appelle les gates leur compte un plafond — la pass, le
#     hook d'arrêt —, et y attendre sans fin, c'est être tué sans avoir joué.
#     Passé la borne, le passage le dit et joue sans le verrou, de front.
#   - Sans python3, ou dans un arbre où rien ne s'écrit, il n'y a pas de
#     verrou : les gates se jouent comme avant, plutôt que pas du tout.
PASSAGE=".brigade-state/passage-des-gates"
if [ "${BRIGADE_GATES_SOUS_VERROU:-}" != "$PWD" ] \
   && mkdir -p "$PASSAGE" 2>/dev/null && : 2>/dev/null >>"$PASSAGE/verrou"; then
  # L'état que les gates jugent : ce qui est commité, ce qui ne l'est pas, la
  # branche d'intégration telle qu'on la connaît, et les réglages du passage.
  # Hors d'un dépôt git, il ne se connaît pas : aucun verdict n'y est repris.
  etat_de_l_arbre() {
    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
    # Lire l'arbre ne doit pas prendre le verrou de l'index à qui y travaille.
    { export GIT_OPTIONAL_LOCKS=0
      git rev-parse HEAD 2>/dev/null
      git rev-parse -q --verify "origin/$BASE^{commit}" 2>/dev/null
      git rev-parse -q --verify "$BASE^{commit}" 2>/dev/null
      git status --porcelain=v1 -- . ':(exclude).brigade-state' 2>/dev/null
      git diff HEAD 2>/dev/null
      git ls-files -o --exclude-standard -z -- . ':(exclude).brigade-state' 2>/dev/null \
        | xargs -0 shasum 2>/dev/null
      printf '%s\n' "$BASE" "${BRIGADE_GATES_DELAI_TESTS:-}" "${BRIGADE_GATES_GARDE_APRES:-}"
      # Ce que git ignore n'est pas un état — sauf les dépendances de dev du
      # runtime, dont le contrôle de types dépend : un setup joué entre deux
      # passages change le verdict sans rien changer que git voie. À la
      # seconde, sous l'un ou l'autre `ls`.
      set -- runtime/node_modules runtime/node_modules/.bin/tsc runtime/node_modules/.package-lock.json
      ls -ldnT "$@" 2>/dev/null || ls -ldn --full-time "$@" 2>/dev/null
    } | shasum | cut -c1-40
  }
  DERNIER="$(cat "$PASSAGE/passage" 2>/dev/null)"
  exec 9>>"$PASSAGE/verrou"
  ATTENTE="${BRIGADE_GATES_ATTENTE:-300}"
  case "$ATTENTE" in ""|*[!0-9]*) ATTENTE=300 ;; esac
  python3 -c '
import fcntl, signal, sys
try:
    fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError:
    try:
        tenu = open(sys.argv[1]).read().strip()
    except OSError:
        tenu = ""
    borne = int(sys.argv[2])
    print("gates : un autre passage joue déjà dans cet arbre" + (f" (pid {tenu})" if tenu else "")
          + f" — celui-ci attend son tour, {borne} s au plus", file=sys.stderr, flush=True)
    def sonne(*_):
        raise TimeoutError
    signal.signal(signal.SIGALRM, sonne)
    try:
        if borne == 0:
            raise TimeoutError
        signal.alarm(borne)
        fcntl.flock(9, fcntl.LOCK_EX)
        signal.alarm(0)
    except TimeoutError:
        print(f"gates : verrou toujours tenu après {borne} s — ce passage joue sans l\x27attendre davantage, de front",
              file=sys.stderr, flush=True)
        sys.exit(4)
    sys.exit(3)
' "$PASSAGE/tenu-par" "$ATTENTE"
  case "$?" in
    0) ATTENDU=0 ;;
    3) ATTENDU=1 ;;
    *) exec 9>&-; ATTENDU=sans-verrou ;;
  esac
  if [ "$ATTENDU" != sans-verrou ]; then
    printf '%s\n' "$$" >"$PASSAGE/tenu-par"
    ETAT_ARBRE="$(etat_de_l_arbre)"
    JUGE="$(cat "$PASSAGE/passage" 2>/dev/null)"
    if [ -n "${BRIGADE_GATES_VERDICT_GARDE:-}" ] || { [ "$ATTENDU" -eq 1 ] && [ "$JUGE" != "$DERNIER" ]; }; then
      PRETE=1
    else
      PRETE=0
    fi
    if [ "$PRETE" -eq 1 ] && [ -n "$ETAT_ARBRE" ] && [ -n "$JUGE" ] \
       && [ "$(cat "$PASSAGE/etat" 2>/dev/null)" = "$ETAT_ARBRE" ] && CODE="$(cat "$PASSAGE/code" 2>/dev/null)"; then
      case "$CODE" in
        0|1)
          cat "$PASSAGE/sortie"
          cat "$PASSAGE/erreurs" >&2
          RENDU="$(cat "$PASSAGE/rendu" 2>/dev/null)"
          echo "gates : verdict repris du passage ${JUGE%%.*}${RENDU:+, rendu le $RENDU} — l'arbre n'a pas bougé depuis" >&2
          exit "$CODE"
          ;;
      esac
    fi
    # `passage` est retiré d'abord et reposé en dernier : un verdict à moitié
    # écrit par un passage tué n'est jamais repris.
    rm -f "$PASSAGE/passage"
    # Chaque passage écrit dans ses fichiers à lui : celui dont le teneur a été
    # tué continue seul, et ne doit rien écrire dans la sortie du suivant.
    find "$PASSAGE" -name '*.en-cours.*' -mtime +7 -delete 2>/dev/null
    SORTIE="$PASSAGE/sortie.en-cours.$$" ERREURS="$PASSAGE/erreurs.en-cours.$$"
    # Deux tubes, deux `tee` : chaque ligne part vers qui écoute dès qu'elle est
    # écrite, sur son canal, et sa copie se garde. Les `tee` sont des tâches de
    # ce shell — il peut les attendre, ce qu'il ne peut pas d'une substitution.
    rm -f "$SORTIE.tube" "$ERREURS.tube"
    if mkfifo "$SORTIE.tube" "$ERREURS.tube" 2>/dev/null; then
      tee "$SORTIE" <"$SORTIE.tube" 9>&- &
      PID_SORTIE=$!
      tee "$ERREURS" <"$ERREURS.tube" >&2 9>&- &
      PID_ERREURS=$!
      BRIGADE_GATES_SOUS_VERROU="$PWD" bash "$MOI" "$PWD" 9>&- >"$SORTIE.tube" 2>"$ERREURS.tube" &
      PID_PASSAGE=$!
    else
      # Sans tube, le passage se joue à découvert et ne laisse pas de verdict.
      rm -f "$SORTIE.tube" "$ERREURS.tube"
      SORTIE="" ERREURS=""
      BRIGADE_GATES_SOUS_VERROU="$PWD" bash "$MOI" "$PWD" 9>&- &
      PID_PASSAGE=$!
    fi
    # Interrompu, ce script n'abandonne pas le passage qu'il tient : celui-ci
    # ignore INT, parti en arrière-plan, et c'est TERM qui lui fait tuer sa suite.
    ranger() { [ -z "$SORTIE" ] || rm -f "$SORTIE" "$ERREURS" "$SORTIE.tube" "$ERREURS.tube"; }
    trap 'kill -TERM "$PID_PASSAGE" 2>/dev/null; wait 2>/dev/null; ranger; exit 130' INT TERM
    wait "$PID_PASSAGE"; CODE=$?
    # Tout ce que le passage a écrit est passé avant que ce script ne sorte.
    [ -z "$SORTIE" ] || wait "$PID_SORTIE" "$PID_ERREURS" 2>/dev/null
    trap - INT TERM
    # Un passage mort d'un signal n'a pas de verdict, ni un arbre qui a bougé
    # pendant qu'il était jugé : le suivant rejoue.
    case "$CODE" in
      0|1)
        if [ -n "$SORTIE" ] && [ -n "$ETAT_ARBRE" ] && [ "$(etat_de_l_arbre)" = "$ETAT_ARBRE" ] \
           && mv -f "$SORTIE" "$PASSAGE/sortie" && mv -f "$ERREURS" "$PASSAGE/erreurs"; then
          printf '%s\n' "$ETAT_ARBRE" >"$PASSAGE/etat"
          printf '%s\n' "$CODE" >"$PASSAGE/code"
          date '+%Y-%m-%d à %H:%M:%S' >"$PASSAGE/rendu"
          printf '%s\n' "$$.$(date +%s)" >"$PASSAGE/passage"
        fi
        ;;
    esac
    ranger
    exit "$CODE"
  fi
fi

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
  # fichier par passage.
  JOURNAUX=".brigade-state/gates"
  mkdir -p "$JOURNAUX"
  find "$JOURNAUX" -name 'tests-du-runtime.*.log' -mtime +7 -delete 2>/dev/null
  JOURNAL="$JOURNAUX/tests-du-runtime.$(date +%Y%m%d-%H%M%S).$$.log"
  # Garde d'horloge : un test figé dans du code synchrone (une boucle) n'est
  # arrêté par aucun minuteur de son lanceur, et sans elle ce script ne rendrait
  # jamais la main — ni le hook d'arrêt qui l'appelle. Le délai est large : un
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
      env -u BRIGADE_STATE_DIR -u BRIGADE_PORT npm --prefix runtime test </dev/null >"$JOURNAL" 2>&1 &
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
      trap - INT TERM
      kill "$PID_GARDE" 2>/dev/null
      wait "$PID_GARDE" 2>/dev/null
      if [ -e "$TIREE" ]; then rm -f "$TIREE"; ARRETES=1; fi
      ;;
  esac
  if [ "$TESTS" = illisible ]; then
    fail "délai des tests illisible : BRIGADE_GATES_DELAI_TESTS attend un nombre entier de secondes"
  elif [ "$TESTS" = verts ]; then
    # Le résumé du lanceur, avant que sa sortie ne parte : combien de tests, et
    # ce que la suite a duré.
    NB_TESTS="$(sed -n 's/^ℹ tests \([0-9][0-9]*\)$/\1/p' "$JOURNAL" | tail -1)"
    MS_TESTS="$(sed -n 's/^ℹ duration_ms \([0-9][0-9.]*\)$/\1/p' "$JOURNAL" | tail -1)"
    rm -f "$JOURNAL"
    ok "tests du runtime"
  elif [ "$ARRETES" -eq 1 ]; then
    # Une suite tuée n'a ni relevé ni conclusion : la fin de sa sortie dit au
    # moins jusqu'où elle était allée.
    tail -40 "$JOURNAL" >&2
    echo "sortie complète des tests : $WT/$JOURNAL" >&2
    fail "tests du runtime arrêtés par la garde d'horloge : plus de $DELAI s sans rendre la main"
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
# script et tout ce qu'il a lancé puis attendu), utilisateur et système, pas
# l'horloge. Aucune de ces grandeurs ne mesure la suite sans mesurer aussi le
# poste — même arbre, 1078 tests, le 2026-10-09 : 84 s de processeur et 16 s
# d'horloge à charge 6, 95 à 103 s et 20 à 26 s à charge 6 à 21, 141 s et 132 s
# poste saturé ; l'utilisateur et le système y gonflent du même pas (×1,6 et
# ×1,7), l'horloge huit fois. Le plafond juge donc juste au calme, et la ligne
# porte de quoi lire un rouge sans le rejouer : le partage du processeur,
# l'horloge, la charge du poste à l'arrivée.
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
DECLARE="$(grep -m1 '^- \*\*Plafond des gates\*\*' CLAUDE.md 2>/dev/null)"
PLAFOND="$(printf '%s\n' "$DECLARE" | sed -n 's/^- \*\*Plafond des gates\*\* : `\([0-9][0-9]*\([.,][0-9][0-9]*\)\{0,1\}\) s`.*/\1/p' | tr , .)"
MESURE="durée des gates : $(fr "$COUT") s de processeur ($(fr "$UTILISATEUR") utilisateur + $(fr "$SYSTEME") système), $SECONDS s d'horloge, charge du poste $(fr "${CHARGE:-inconnue}")"
if [ -z "$DECLARE" ]; then
  ok "$MESURE (aucun plafond déclaré)"
elif [ -z "$PLAFOND" ]; then
  fail "plafond des gates illisible dans CLAUDE.md — attendu : - **Plafond des gates** : \`<n> s\` de processeur"
elif LC_ALL=C awk -v c="$COUT" -v p="$PLAFOND" 'BEGIN { exit !(c > p) }'; then
  # Une seule ligne FAIL, sans la mesure : elle change à chaque passage, et le
  # hook d'arrêt tire de cette ligne l'empreinte de l'échec.
  echo "$MESURE pour un plafond de $(fr "$PLAFOND") s — $(LC_ALL=C awk -v c="$COUT" -v p="$PLAFOND" \
    'BEGIN { printf "%.1f s de trop (+%.0f %%)", c - p, (c - p) * 100 / p }' | tr . ,)" >&2
  fail "plafond des gates franchi : plus de $(fr "$PLAFOND") s de processeur"
else
  ok "$MESURE (plafond : $(fr "$PLAFOND") s)"
fi

# 9. Les mesures que ces gates déclarent, pour le relevé du runtime (`npm
# --prefix runtime run mesures`) : une ligne `MESURE  <nom>=<nombre>` chacune.
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
mesure gates_s "$SECONDS"

[ "$rc" -eq 0 ] && echo "gates : VERT" || echo "gates : ROUGE" >&2
exit "$rc"

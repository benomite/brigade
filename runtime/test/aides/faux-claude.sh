#!/usr/bin/env bash
# Doublure de `claude` : rejoue un flux `stream-json` choisi par la variable
# FAUX_CLAUDE, sans réseau ni quota. Exécutable, pour servir tel quel de
# BRIGADE_CLAUDE_BIN. Ses arguments ne changent pas ce qu'elle joue, sauf
# `auth status`.
#
# En shell, parce que la suite la lance des centaines de fois et qu'un Node qui
# démarre coûte vingt millisecondes de processeur avant sa première ligne. Les
# scénarios qui se terminent seuls sont écrits ici ; ceux qui vivent — parler
# sans fin, entendre un signal, attendre le test — restent à faux-claude.ts,
# auquel celle-ci cède sa place.
#
# FAUX_CLAUDE_TEMOIN : un répertoire, qui existe. Chaque lancement y dépose un
# fichier — son répertoire, ses arguments et son environnement, séparés par des
# octets nuls — puis inscrit le nom de ce fichier dans `ordre`. Une ligne
# d'`ordre` est assez courte pour s'écrire d'un seul geste : des cooks partis de
# front ne s'y mélangent pas. `lancementsDuFauxClaude` (outils.ts) le relit.
#
# FAUX_CLAUDE_SUITE : un fichier d'un scénario par ligne. Chaque lancement en
# consomme la première qui reste ; la suite épuisée, c'est FAUX_CLAUDE qui joue.
# Une ligne se prend en créant le fichier de son rang dans le répertoire
# `<suite>.prises`, qui existe : créer un fichier qui n'existe pas encore est
# atomique, donc deux cooks partis de front ne jouent pas la même ligne — et il
# n'y a aucun verrou qu'un cook tué en plein geste laisserait fermé.
set -u
ICI="${BASH_SOURCE[0]%/*}"

# `claude auth status` : la session de la machine, sans appel au modèle.
if [ "${1:-}" = auth ] && [ "${2:-}" = status ]; then
  if [ "${FAUX_CLAUDE_SESSION:-}" = absente ]; then
    echo '{"loggedIn":false,"authMethod":"none"}'
    exit 1
  fi
  echo '{"loggedIn":true,"authMethod":"claude.ai"}'
  exit 0
fi

# Le scénario se choisit avant que le lancement soit noté : un test qui voit un
# lancement sait que sa ligne de la suite est prise.
nom="${FAUX_CLAUDE:-}"
suite="${FAUX_CLAUDE_SUITE:-}"
if [ -n "$suite" ] && [ -e "$suite" ]; then
  if [ ! -d "$suite.prises" ]; then
    echo "faux claude : pas de répertoire $suite.prises" >&2
    exit 70
  fi
  rang=0
  while IFS= read -r ligne || [ -n "$ligne" ]; do
    [ -n "$ligne" ] || continue
    rang=$((rang + 1))
    set -C
    { : >"$suite.prises/$rang"; } 2>/dev/null && prise=oui || prise=non
    set +C
    if [ "$prise" = oui ]; then
      nom="$ligne"
      break
    fi
  done <"$suite"
fi

if [ -n "${FAUX_CLAUDE_TEMOIN:-}" ]; then
  lancement="$$-$RANDOM"
  {
    printf '%s\0%s\0' "$(pwd -P)" "$#"
    [ "$#" -eq 0 ] || printf '%s\0' "$@"
    for variable in $(compgen -e); do
      # Celles que le shell se donne à lui-même : `claude` ne les recevrait pas.
      case "$variable" in _ | SHLVL | PWD | OLDPWD) continue ;; esac
      printf '%s\0%s\0' "$variable" "${!variable}"
    done
  } >"$FAUX_CLAUDE_TEMOIN/$lancement"
  echo "$lancement" >>"$FAUX_CLAUDE_TEMOIN/ordre"
fi

ANTISLASH='\'
# Le texte, en chaîne JSON — de ce que les comptes-rendus d'ici contiennent.
json() {
  local texte=$1
  texte=${texte//"$ANTISLASH"/$ANTISLASH$ANTISLASH}
  texte=${texte//'"'/$ANTISLASH'"'}
  texte=${texte//$'\n'/${ANTISLASH}n}
  printf '"%s"' "$texte"
}

tours=0
# Un tour : assistant [<usage> [<id du message>]]. Un message dont l'id est
# donné n'est pas un tour de plus.
assistant() {
  local usage=${1:-} id=${2:-}
  [ -n "$usage" ] || usage='{"input_tokens":3,"output_tokens":7}'
  if [ -z "$id" ]; then
    tours=$((tours + 1))
    id="msg_$tours"
  fi
  printf '{"type":"assistant","message":{"id":"%s","role":"assistant","usage":%s}}\n' "$id" "$usage"
}

# Le résultat, dont le texte se lit sur l'entrée : le compte-rendu d'un cook, ou
# la décision d'un juge, écrite telle qu'elle sera lue.
resultat() {
  local texte=""
  IFS= read -r -d '' texte || true
  printf '{"type":"result","subtype":"success","is_error":false,"num_turns":%d,"result":%s}\n' "$tours" "$(json "${texte%$'\n'}")"
}
resultat_vide() { resultat </dev/null; }

# Ce que fait un cook qui travaille : un commit dans son répertoire.
commiter() {
  printf 'le travail du cook\n' >travail.txt
  # Hors d'un dépôt (un worktree de test sans git), le fichier vaut commit.
  [ -e .git ] || return 0
  git -c user.name=cook -c user.email=cook@brigade.test -c commit.gpgsign=false add travail.txt >/dev/null || exit 1
  git -c user.name=cook -c user.email=cook@brigade.test -c commit.gpgsign=false commit -q -m "le travail du cook" >/dev/null || exit 1
}

# Un flux de test/aides/flux, rejoué tel quel.
rejouer() {
  cat "$ICI/flux/$1.jsonl"
  code=$2
}

# Ne rien dire, et rester : le test, ou un garde-fou, y mettra fin. Trente
# secondes, pas davantage — une suite tuée en plein vol ne laisse pas de faux
# cook derrière elle.
rester() { exec sleep 30; }

# Cède la place à un scénario qui vit : même process, même sortie.
vivre() { FAUX_CLAUDE="$1" exec node "$ICI/faux-claude.ts"; }

code=0
jouer() {
  case "$1" in
    # Commite son travail, puis rend son compte-rendu.
    livre)
      commiter
      assistant
      resultat <<'FIN'
J'ai ajouté `travail.txt` et vérifié qu'il se lit.
FIN
      ;;
    # Commite, puis s'arrête sans conclure : en erreur, en silence, ou sans fin.
    commite-puis-echoue)
      commiter
      assistant
      code=1
      ;;
    commite-puis-se-tait)
      commiter
      assistant
      rester
      ;;
    commite-puis-bavarde)
      commiter
      vivre bavard
      ;;
    # Commite, puis ne conclut que quand le test le lui dit.
    commite-puis-attend)
      commiter
      vivre attend
      ;;
    # Commite, puis bute sur le quota.
    commite-puis-quota)
      commiter
      rejouer quota-epuise 1
      ;;
    # Commite, puis essuie le refus du modèle.
    commite-puis-refuse)
      commiter
      rejouer refuse 1
      ;;
    # Les flux de test/aides/flux.
    fini-sans-commit) rejouer fini 0 ;;
    non-connecte) rejouer non-connecte 1 ;;
    quota) rejouer quota-epuise 1 ;;
    refuse) rejouer refuse 1 ;;
    # Le quota épuisé, sans rien qui dise quand il revient.
    quota-sans-heure)
      grep -v rate_limit_event "$ICI/flux/quota-epuise.jsonl"
      code=1
      ;;
    # Deux tours, un résultat, code 0.
    fini)
      assistant
      assistant
      resultat_vide
      ;;
    echec)
      assistant
      code=1
      ;;
    # Un même message livré en trois lignes (une par bloc de contenu), dont
    # l'usage grossit : un seul tour, et seul le dernier usage compte.
    morcele)
      assistant '{"input_tokens":3,"output_tokens":1}' msg_a
      assistant '{"input_tokens":3,"output_tokens":5}' msg_a
      assistant '{"input_tokens":3,"output_tokens":9}' msg_a
      resultat_vide
      ;;
    # Les lectures de cache ne comptent pas, les écritures si.
    cache)
      assistant '{"input_tokens":1,"output_tokens":2,"cache_creation_input_tokens":4,"cache_read_input_tokens":100000}'
      echo '{"type":"user","message":{"usage":{"output_tokens":999}}}'
      echo "ceci n'est pas du JSON"
      resultat_vide
      ;;
    # Les jugements du manager : un tour, et une décision — ou pas.
    juge-ticket)
      assistant
      resultat <<'FIN'
Ma décision.

{"nature":"ticket","motif":"Un livrable, vérifiable par un test.","modele":"haiku","effort":"low","calibrage":"Correctif dont le test est déjà écrit."}
FIN
      ;;
    juge-epique)
      assistant
      resultat <<'FIN'
{"nature":"epic","motif":"Trois livrables distincts.","manque":"La découper en tickets."}
FIN
      ;;
    juge-incomplet)
      assistant
      resultat <<'FIN'
{"nature":"incomplete","motif":"Rien ne dit comment vérifier que c'est fait.","manque":"Un critère d'acceptation."}
FIN
      ;;
    juge-illisible)
      assistant
      resultat <<'FIN'
Je dirais que c'est faisable.
FIN
      ;;
    # Les découpages du manager : trois tickets qui se suivent, une question, une
    # épique déjà découpée, ou un découpage dont un ticket ne se lit pas.
    decoupe-tickets)
      assistant
      resultat <<'FIN'
Voici le découpage.

{"reponse":"tickets","motif":"Un livrable par module touché.","ordre":"Le rail d'abord : la pass et la doc lisent ce qu'il expose.","tickets":[{"titre":"Le rail compte ses tickets","contexte":"Le compte n'existe nulle part.","criteres":["`run rail` affiche le nombre de tickets en attente"],"attend":[],"zone":["runtime/src/rail.ts"],"modele":"sonnet","effort":"low","calibrage":"Un module, un test."},{"titre":"La pass lit le compte","criteres":["`run pass` affiche le compte","Un test le couvre"],"attend":[1],"zone":["runtime/src/pass.ts"],"modele":"sonnet","effort":"medium","calibrage":"Critères précis."},{"titre":"La doc dit le compte","contexte":"Doc vivante.","criteres":["`docs/runtime.md` décrit le compte"],"attend":[1,2],"zone":["docs/runtime.md"],"modele":"haiku","effort":"low","calibrage":"De la doc."}]}
FIN
      ;;
    # Deux tickets qui ne s'attendent pas possèdent le même fichier.
    decoupe-recouvre)
      assistant
      resultat <<'FIN'
{"reponse":"tickets","motif":"Un livrable par écran.","ordre":"Indifférent.","tickets":[{"titre":"Le rail compte","criteres":["`run rail` affiche le compte"],"attend":[],"zone":["runtime/src","docs/runtime.md"],"modele":"sonnet","effort":"low","calibrage":"Un module."},{"titre":"Le rail trie","criteres":["`run rail` trie"],"attend":[],"zone":["runtime/src/rail.ts","docs/runtime.md"],"modele":"sonnet","effort":"low","calibrage":"Un module."},{"titre":"La doc suit","criteres":["La doc le dit"],"attend":[],"zone":["docs/runtime.md"],"modele":"haiku","effort":"low","calibrage":"De la doc."}]}
FIN
      ;;
    decoupe-question)
      assistant
      resultat <<'FIN'
{"reponse":"question","question":"« Plus rapide » : sur quel écran, et mesuré comment ?"}
FIN
      ;;
    decoupe-deja)
      assistant
      resultat <<'FIN'
{"reponse":"deja-decoupee","motif":"Son corps liste déjà #68 à #74."}
FIN
      ;;
    decoupe-illisible)
      assistant
      resultat <<'FIN'
{"reponse":"tickets","motif":"Un livrable.","ordre":"Un seul.","tickets":[{"titre":"Sans critère","attend":[],"zone":["docs/"],"modele":"haiku","effort":"low","calibrage":"Doc."}]}
FIN
      ;;
    # Les réactions du manager à un ticket resté rouge : monter le calibrage, le
    # redécouper, ou le remonter au chef.
    reagit-monte)
      assistant
      resultat <<'FIN'
Je monte.

{"choix":"monter","motif":"Le ticket est bien posé : le cook cale sur le raisonnement."}
FIN
      ;;
    reagit-redecoupe)
      assistant
      resultat <<'FIN'
{"choix":"redecouper","motif":"Deux livrables dans un seul ticket."}
FIN
      ;;
    reagit-remonte)
      assistant
      resultat <<'FIN'
{"choix":"remonter","motif":"Le critère d'acceptation n° 2 se contredit.","proposition":"Trancher le critère n° 2, puis rendre le ticket."}
FIN
      ;;
    # Conclut sans rien commiter : son compte-rendu est son livrable.
    rapporte-sans-commit)
      assistant
      resultat <<'FIN'
Audit : la CI passe douze minutes dans l'installation des dépendances, faute de cache.
FIN
      ;;
    # Écrit un fichier, oublie de le commiter, et dit avoir fini.
    ecrit-sans-commiter)
      printf 'le travail du cook, jamais commité\n' >brouillon.txt
      assistant
      resultat <<'FIN'
C'est fait : j'ai écrit `brouillon.txt`.
FIN
      ;;
    # Les relectures du reviewer : un tour, et des constats — ou pas.
    relit-vert)
      assistant
      resultat <<'FIN'
Relu.

{"verdict":"vert","resume":"Le diff fait ce que le ticket demande.","constats":[]}
FIN
      ;;
    relit-remarque)
      assistant
      resultat <<'FIN'
{"verdict":"vert","resume":"Le diff fait ce que le ticket demande.","constats":[{"gravite":"remarque","fichier":"travail.txt","constat":"Le fichier gagnerait un titre."}]}
FIN
      ;;
    relit-rouge)
      assistant
      resultat <<'FIN'
{"verdict":"rouge","resume":"Le critère d'acceptation n° 2 n'est pas couvert.","constats":[{"gravite":"bloquant","fichier":"travail.txt","constat":"Le cas d'erreur est avalé : rien ne remonte."},{"gravite":"remarque","fichier":null,"constat":"Un test de plus ne nuirait pas."}]}
FIN
      ;;
    relit-illisible)
      assistant
      resultat <<'FIN'
Ça m'a l'air bien.
FIN
      ;;
    # Vert, mais avec un constat bloquant : ni l'un ni l'autre.
    relit-incoherent)
      assistant
      resultat <<'FIN'
{"verdict":"vert","resume":"Tout va bien.","constats":[{"gravite":"bloquant","fichier":null,"constat":"Sauf ceci."}]}
FIN
      ;;
    # Les mêmes, qui prennent leur temps : le chef a le temps d'agir avant la
    # décision, le découpage, la relecture.
    juge-ticket-lent | decoupe-tickets-lent | relit-vert-lent)
      sleep 0.15
      jouer "${1%-lent}"
      ;;
    muet) rester ;;
    muet-apres-un-tour)
      assistant
      rester
      ;;
    # Écrit sur la sortie d'erreur, puis réussit.
    plaintif)
      echo attention >&2
      assistant
      resultat_vide
      ;;
    bavard | au-signal | sourd | petit-enfant-sourd | plaintif-abondant) vivre "$1" ;;
    *)
      echo "faux claude : scénario inconnu « $1 »" >&2
      code=64
      ;;
  esac
}

jouer "$nom"
exit "$code"

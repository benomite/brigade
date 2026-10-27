#!/usr/bin/env bash
# Doublure de `claude` : rejoue un flux `stream-json` choisi par la variable
# FAUX_CLAUDE, sans réseau ni quota. Exécutable, pour servir tel quel de
# BRIGADE_CLAUDE_BIN. Ses arguments ne changent pas ce qu'elle joue, sauf
# `auth status` et `--version`.
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

# `claude --version` : une version qui lit toute la configuration du bac à
# sable — une cuisine ouverte sur un Mac l'éprouve avant de s'ouvrir.
if [ "${1:-}" = --version ]; then
  echo "2.1.300 (Claude Code)"
  exit 0
fi

# `claude auth status` : la session de la machine, sans appel au modèle. Un
# jeton longue durée dans CLAUDE_CODE_OAUTH_TOKEN connecte, session ou non.
if [ "${1:-}" = auth ] && [ "${2:-}" = status ]; then
  if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    echo '{"loggedIn":true,"authMethod":"oauth_token"}'
    exit 0
  fi
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
# Les arguments du lancement, la consigne comprise : les scénarios les lisent.
ARGUMENTS=("$@")
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
# Comme `resultat`, mais le texte est aussi celui d'un message de l'assistant, qui
# a produit 200 tokens : de quoi lire ce que coûte une part du dernier message.
resultat_parle() {
  local texte=""
  IFS= read -r -d '' texte || true
  tours=$((tours + 1))
  printf '{"type":"assistant","message":{"id":"msg_%d","role":"assistant","usage":{"input_tokens":3,"output_tokens":200},"content":[{"type":"text","text":%s}]}}\n' "$tours" "$(json "${texte%$'\n'}")"
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
  local flux=""
  IFS= read -r -d '' flux <"$ICI/flux/$1.jsonl" || true
  printf '%s' "$flux"
  code=$2
}

# Une session, comme le vrai l'ouvre : son identifiant en tête du flux, et son
# transcript rangé sous CLAUDE_CONFIG_DIR, s'il est défini, au nom du
# répertoire du lancement. Neuve à chaque lancement — y compris celui qui en
# reprend une autre (`--resume <session> --fork-session`) : il en écrit une
# bifurquée, sous un identifiant à lui.
session() {
  local id dossier
  id=$(printf '%08x-0000-4000-8000-%012d' "$$" "$RANDOM")
  printf '{"type":"system","subtype":"init","session_id":"%s"}\n' "$id"
  [ -n "${CLAUDE_CONFIG_DIR:-}" ] || return 0
  dossier="$CLAUDE_CONFIG_DIR/projects/$(pwd -P | tr -c 'a-zA-Z0-9\n' '-')"
  mkdir -p "$dossier" || exit 1
  printf '{"type":"user","sessionId":"%s"}\n' "$id" >"$dossier/$id.jsonl"
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
    # Joue les gates par le lanceur que sa consigne nomme (`gates-du-cook.ts`) :
    # après son commit, sur le code qu'il livre ; ou avant d'y toucher encore,
    # sur un code qu'il ne livre pas. Sans lanceur nommé, il ne joue rien.
    livre-apres-ses-gates | livre-avant-ses-gates)
      lanceur="$(printf '%s\n' "${ARGUMENTS[@]}" | grep -o '`[^`]*/brigade/gates-du-cook ' | head -1 | tr -d '`')"
      lanceur="${lanceur% }"
      [ "$nom" = livre-avant-ses-gates ] || commiter
      [ -z "$lanceur" ] || "$lanceur" "$PWD" >/dev/null 2>&1
      [ "$nom" = livre-apres-ses-gates ] || commiter
      assistant
      resultat <<'FIN'
J'ai ajouté `travail.txt` et joué les gates.
FIN
      ;;
    # Ouvre une session, commite son travail, puis rend son compte-rendu.
    livre-en-session)
      session
      commiter
      assistant
      resultat <<'FIN'
J'ai ajouté `travail.txt` et vérifié qu'il se lit.
FIN
      ;;
    # Livre, et dit tout haut les secrets qu'il a reçus : dans le résultat d'un
    # outil, sur sa sortie d'erreur, et dans son compte-rendu.
    livre-et-revele)
      commiter
      assistant
      printf '{"type":"user","message":{"content":[{"type":"tool_result","content":%s}]}}\n' "$(json "CLE_API=${CLE_API-}")"
      echo "avertissement : DATABASE_URL=${DATABASE_URL-}" >&2
      resultat <<FIN
J'ai ajouté \`travail.txt\`. Pour mémoire, la clé est ${CLE_API-} et la base ${DATABASE_URL-}.
FIN
      ;;
    # Livre, en laissant derrière lui un `.env` qui porte un secret.
    livre-et-laisse-un-secret)
      commiter
      printf 'CLE_API=%s\n' "${CLE_API-}" >.env
      assistant
      resultat <<'FIN'
J'ai ajouté `travail.txt` et vérifié qu'il se lit.
FIN
      ;;
    # Laisse un `.env` qui porte un secret, sans rien commiter : sur un renvoi,
    # la station le récolte.
    laisse-un-secret)
      printf 'CLE_API=%s\n' "${CLE_API-}" >.env
      assistant
      resultat <<'FIN'
C'est corrigé.
FIN
      ;;
    # Livre, en laissant derrière lui un fichier nommé comme les identifiants de
    # Claude — vide de tout jeton : c'est son nom qui compte.
    livre-et-copie-les-identifiants)
      commiter
      mkdir -p sauvegarde
      printf '{}\n' >sauvegarde/.credentials.json
      assistant
      resultat <<'FIN'
J'ai ajouté `travail.txt` et vérifié qu'il se lit.
FIN
      ;;
    # Laisse, sous un autre nom, un jeton à la forme de ceux de Claude, sans
    # rien commiter : sur un renvoi, la station le récolte. Le jeton est
    # fabriqué, et assemblé ici — sa forme n'est écrite en clair nulle part.
    copie-un-jeton-renomme)
      printf 'à garder : sk-%s-%s01-%090d\n' ant oat 0 >notes.txt
      assistant
      resultat <<'FIN'
C'est corrigé.
FIN
      ;;
    # Livre, et dit tout haut ce qui a la forme des identifiants de Claude : le
    # fichier du compte dans le résultat d'un outil, un jeton sur sa sortie
    # d'erreur et dans son compte-rendu. Fabriqués, et assemblés ici.
    livre-et-dit-un-jeton)
      commiter
      assistant
      jeton=$(printf 'sk-%s-%s01-%090d' ant oat 0)
      printf '{"type":"user","message":{"content":[{"type":"tool_result","content":%s}]}}\n' "$(json "$(printf '{"%s%s":{"accessToken":"%s","refreshToken":"un-autre-jeton-fabrique-de-toutes-pieces"}}' claudeAi Oauth "$jeton")")"
      echo "avertissement : $jeton" >&2
      resultat <<FIN
J'ai ajouté \`travail.txt\`. Pour mémoire, la connexion du compte est $jeton — à garder.
FIN
      ;;
    # Livre, et dit tout haut le jeton longue durée qu'il a reçu dans
    # CLAUDE_CODE_OAUTH_TOKEN : dans le résultat d'un outil, sur sa sortie
    # d'erreur et dans son compte-rendu.
    livre-et-dit-son-jeton)
      commiter
      assistant
      printf '{"type":"user","message":{"content":[{"type":"tool_result","content":%s}]}}\n' "$(json "CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN-}")"
      echo "avertissement : ${CLAUDE_CODE_OAUTH_TOKEN-}" >&2
      resultat <<FIN
J'ai ajouté \`travail.txt\`. Pour mémoire, mon jeton est ${CLAUDE_CODE_OAUTH_TOKEN-} — à garder.
FIN
      ;;
    # Livre, en laissant derrière lui un fichier qu'il n'a pas commité.
    livre-et-laisse)
      commiter
      printf 'oublié par le cook\n' >brouillon.txt
      assistant
      resultat <<'FIN'
J'ai ajouté `travail.txt` et vérifié qu'il se lit.
FIN
      ;;
    # Quitte sa branche, commite ailleurs, et dit avoir fini : son worktree est
    # propre, sa branche vide. Sur un vrai dépôt seulement.
    commite-ailleurs)
      git checkout -q -b ailleurs || exit 1
      commiter
      assistant
      resultat <<'FIN'
C'est fait : `travail.txt` est commité.
FIN
      ;;
    # Livre, laisse un fichier, puis réécrit le fichier `.git` de son worktree
    # vers un dépôt à lui — sur une branche du même nom, pour passer pour le
    # sien — dont la configuration nomme une commande : lancée, elle laisse un
    # témoin à côté du worktree. Sur un vrai dépôt seulement.
    livre-puis-detourne)
      commiter
      printf 'oublié par le cook\n' >brouillon.txt
      piege="$PWD.piege"
      git init -q -b "$(git symbolic-ref --short HEAD)" "$piege" || exit 1
      printf '#!/bin/sh\n: >>"%s"\ncat\n' "$PWD.temoin" >"$piege/commande.sh"
      chmod +x "$piege/commande.sh"
      printf '[core]\n\tfsmonitor = %s\n' "$piege/commande.sh" >>"$piege/.git/config"
      printf 'gitdir: %s\n' "$piege/.git" >.git
      assistant
      resultat <<'FIN'
J'ai ajouté `travail.txt` et vérifié qu'il se lit.
FIN
      ;;
    # Écrit un fichier sans le commiter, puis s'arrête en erreur.
    ecrit-puis-echoue)
      printf 'le travail du cook, jamais commité\n' >brouillon.txt
      assistant
      code=1
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
    # Ne commite rien, et ne conclut que quand le test le lui dit : un cook
    # qui finit sans livrer, au moment que le test choisit.
    attend) vivre attend ;;
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
    # Signalé de l'extérieur : il attend que FAUX_CLAUDE_FEU existe, puis se
    # tue de SIGTERM — sans que le superviseur l'ait demandé.
    meurt-sigterm)
      assistant
      while [ ! -e "$FAUX_CLAUDE_FEU" ]; do sleep 0.02; done
      kill -TERM $$
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
    # L'agent de triage : il envoie la carte en TODO, une question et ses
    # choix, ou tranche.
    triage-laisse)
      assistant
      resultat <<'FIN'
{"action":"todo","carte":{"type":"produit","resume":"The ticket adds an export. Its format decides what the user downloads.","question":"Export CSV ou export JSON ?","choix":[{"texte":"L'export CSV.","suite":"reprendre"},{"texte":"L'export JSON.","suite":"reprendre"}]},"motif":"Un choix de produit, que seul le chef tranche."}
FIN
      ;;
    triage-relance)
      assistant
      resultat <<'FIN'
{"action":"relancer","phrase":"Sent #30 back to the cook: the test `export.test.ts:12` fails because the CSV header is missing.","diagnostic":"Le test export.test.ts:12 échoue : l'en-tête CSV manque dans src/export.ts:40.","motif":"Une cause lue dans la CI."}
FIN
      ;;
    triage-redecoupe)
      assistant
      resultat <<'FIN'
{"action":"redecouper","phrase":"Re-split #30 into smaller tickets, since it is too big for one PR.","motif":"Trois livrables dans un seul ticket."}
FIN
      ;;
    triage-dependance)
      assistant
      resultat <<'FIN'
{"action":"dependance","phrase":"Removed the dependency on #29, which was served by the split of #28.","dependance":29,"motif":"La dépendance est livrée."}
FIN
      ;;
    triage-attend)
      assistant
      resultat <<'FIN'
{"action":"attendre","phrase":"Waiting for the CI of #30, which is still running.","motif":"La CI tourne encore."}
FIN
      ;;
    triage-retire)
      assistant
      resultat <<'FIN'
{"action":"retirer","phrase":"Removed #30 from the rail: it was done in #27.","motif":"Doublon."}
FIN
      ;;
    triage-merge)
      assistant
      resultat <<'FIN'
{"action":"merger","phrase":"Merged the PR of #30.","motif":"La livraison me semble bonne."}
FIN
      ;;
    # Ne répond qu'une fois FAUX_CLAUDE_FEU posé : le test regarde la carte
    # pendant que l'agent décide.
    triage-au-feu)
      assistant
      while [ ! -e "$FAUX_CLAUDE_FEU" ]; do sleep 0.02; done
      resultat <<'FIN'
{"action":"todo","carte":{"type":"produit","resume":"The ticket adds an export. Its format decides what the user downloads.","question":"Export CSV ou export JSON ?","choix":["L'export CSV.","L'export JSON."]},"motif":"Un choix de produit."}
FIN
      ;;
    requalifie-carte)
      assistant
      resultat <<'FIN'
{"issue":"carte","motif":"Deux voies s'opposent, rien ne dit laquelle.","type":"product","enonce":"Choisir entre l'export CSV et l'export JSON.","capture":null}
FIN
      ;;
    requalifie-reprise)
      assistant
      resultat <<'FIN'
{"issue":"reprise","motif":"Aucun choix ni geste n'attend le chef.","type":null,"enonce":null,"capture":null}
FIN
      ;;
    requalifie-enoncee)
      assistant
      resultat <<'FIN'
{"issue":"enoncee","motif":"Le corps dit qu'il faut choisir le fournisseur."}
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
    # Deux tickets qui demandent chacun une capacité à leur station.
    decoupe-capacites)
      assistant
      resultat <<'FIN'
{"reponse":"tickets","motif":"Un livrable par parcours.","ordre":"Indifférent.","tickets":[{"titre":"Le parcours se joue dans un navigateur","criteres":["Le parcours passe"],"attend":[],"zone":["e2e/parcours.ts"],"capacites":["navigateur-headless"],"modele":"sonnet","effort":"low","calibrage":"Un parcours."},{"titre":"Le compte connecté se vérifie","criteres":["Le compte se lit"],"attend":[],"zone":["e2e/compte.ts"],"capacites":["chrome-connecté"],"modele":"sonnet","effort":"low","calibrage":"Un parcours."},{"titre":"La doc suit","criteres":["La doc le dit"],"attend":[],"zone":["docs/e2e.md"],"capacites":[],"modele":"haiku","effort":"low","calibrage":"De la doc."}]}
FIN
      ;;
    # Un ticket d'interface, que le jugement ne désigne pas, un autre qu'il
    # désigne, et deux qui ne touchent pas la vue.
    decoupe-interface)
      assistant
      resultat <<'FIN'
{"reponse":"tickets","motif":"La carte, son libellé, ce que le rail expose, et la doc.","ordre":"Le rail d'abord.","tickets":[{"titre":"Le rail expose le compte","criteres":["`run rail` affiche le compte"],"attend":[],"zone":["runtime/src/rail.ts"],"cook":"general","modele":"sonnet","effort":"medium","calibrage":"Un module."},{"titre":"La carte montre le compte","criteres":["La carte affiche le compte"],"attend":[1],"zone":["app/src/vue/carte.js"],"modele":"opus","effort":"high","calibrage":"Un écran."},{"titre":"Le libellé du compte","criteres":["Le libellé se lit"],"attend":[2],"zone":["app/src/libelles.ts"],"cook":"design","modele":"sonnet","effort":"low","calibrage":"Un libellé."},{"titre":"La doc dit le compte","criteres":["La doc le dit"],"attend":[],"zone":["docs/runtime.md"],"modele":"haiku","effort":"low","calibrage":"De la doc."}]}
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
    reagit-remonte-produit)
      assistant
      resultat <<'FIN'
{"choix":"remonter","motif":"Deux voies s'opposent.","proposition":"Choisir la voie A.","carte":{"type":"product","enonce":"Choisir entre la voie A et la voie B."}}
FIN
      ;;
    reagit-remonte-geste)
      assistant
      resultat <<'FIN'
{"choix":"remonter","motif":"Il faut un secret.","proposition":"Donner le jeton.","carte":{"type":"gesture","enonce":"Poser le jeton du compte client."}}
FIN
      ;;
    # Conclut sans rien commiter, et délimite son livrable dans son message.
    rapporte-sans-commit)
      assistant
      resultat <<'FIN'
J'ai lu le workflow et trois runs.

<livrable>
Audit : la CI passe douze minutes dans l'installation des dépendances, faute de cache.
</livrable>

Vérifié sur les runs 41 à 43.
FIN
      ;;
    # Conclut sans rien commiter ni rien délimiter : un brouillon, une seconde
    # version, une balise égarée — et aucun livrable.
    rapporte-sans-delimiter)
      assistant
      resultat <<'FIN'
Brouillon :
Audit : la CI est lente.

</thinking>

Seconde version, vérifiée :
Audit : la CI passe douze minutes dans l'installation des dépendances, faute de cache.

Ce que j'ai corrigé : la durée.
FIN
      ;;
    # Commite son travail, et délimite son compte-rendu dans son message.
    livre-et-delimite)
      commiter
      assistant
      resultat <<'FIN'
J'ai hésité entre deux noms de fichier.

<livrable>
J'ai ajouté `travail.txt` et vérifié qu'il se lit.
</livrable>
FIN
      ;;
    # Commite son travail, délimite son livrable, puis écrit sa rétro : cinq
    # lignes, dont une leçon de trois phrases et une de trop.
    livre-et-retient)
      commiter
      assistant
      resultat_parle <<'FIN'
<livrable>
J'ai ajouté `travail.txt` et vérifié qu'il se lit.
</livrable>

Ma rétro, entre `<retro>` et `</retro>` :

<retro>
propose Lire le CLAUDE.md avant d'écrire quoi que ce soit.
propose Les gates jouent les tests du runtime. Les lancer avant de commiter évite un renvoi.
propose Une phrase. Puis une autre. Et une troisième de trop.
propose Un test attend un fait, jamais une durée.
propose Une quatrième leçon, au-delà de ce qu'une rétro peut laisser.
</retro>
FIN
      ;;
    # Commite son travail, et déclare dans son livrable l'écran à regarder.
    livre-un-ecran)
      commiter
      assistant
      resultat <<'FIN'
<livrable>
J'ai ajouté `travail.txt`, que la page d'exemple montre.

Écran : /exemple
À regarder : la page d'exemple montre `travail.txt`
</livrable>
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
    # Relit, et cite un jeton à la forme de ceux de Claude — fabriqué, assemblé ici.
    relit-en-citant-un-jeton)
      assistant
      resultat <<FIN
{"verdict":"vert","resume":"Le diff est juste ; j'ai lu $(printf 'sk-%s-%s01-%090d' ant oat 0) en chemin.","constats":[]}
FIN
      ;;
    # Relit, et cite ce que les gates ont laissé sur le disque en tournant.
    relit-en-citant)
      assistant
      resultat <<FIN
{"verdict":"vert","resume":"Les gates ont tourné avec la clé $(head -n 1 "$FAUSSES_GATES.secrets").","constats":[]}
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
    # Le second juge d'une livraison qui touche à ses juges : sa seule question,
    # le contrôle est-il affaibli ?
    juge-non-affaibli)
      assistant
      resultat <<'FIN'
{"verdict":"not weakened","raison":"Les gates gagnent une étape ; aucune n'est retirée ni assouplie."}
FIN
      ;;
    juge-affaibli)
      assistant
      resultat <<'FIN'
{"verdict":"weakened","raison":"`.claude/brigade/gates.sh` ne fait plus échouer les tests du runtime : leur code de sortie est avalé par `|| true`."}
FIN
      ;;
    juge-incertain)
      assistant
      resultat <<'FIN'
{"verdict":"cannot establish","raison":"Le workflow appelle un script qui n'est pas dans le dépôt : ce qu'il vérifie ne se lit pas."}
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

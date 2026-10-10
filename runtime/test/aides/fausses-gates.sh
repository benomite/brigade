#!/usr/bin/env bash
# Doublure des gates d'un projet : joue le scénario écrit dans le fichier
# $FAUSSES_GATES (« vert » s'il n'existe pas) et note chaque appel, avec le
# worktree reçu, dans $FAUSSES_GATES.appels. Les worktrees de test y mènent par
# un lien : un exécutable fraîchement écrit attend un tiers de seconde sur macOS.
# Un worktree qui porte son propre scénario (`.claude/brigade/scenario-gates`)
# joue celui-là : il ne vaut que pour lui, et ne déborde sur aucun autre.
set -u
echo "$1" >> "$FAUSSES_GATES.appels"
# Le jeton GitHub que les gates voient dans leur environnement : une ligne par appel, vide s'il n'y en a pas.
echo "${GH_TOKEN-}" >> "$FAUSSES_GATES.jetons"
# De même pour un secret du projet.
echo "${CLE_API-}" >> "$FAUSSES_GATES.secrets"
# Lu sans lancer de process : la suite joue ces gates des centaines de fois.
lire() {
  [ -f "$1" ] || return 1
  IFS= read -r -d '' scenario <"$1" || true
  scenario="${scenario%$'\n'}"
}
lire "$1/.claude/brigade/scenario-gates" || lire "$FAUSSES_GATES" || scenario=vert
case "$scenario" in
  vert)
    echo "ok    tests du projet"
    echo "gates : VERT"
    ;;
  rouge)
    echo "ok    JSON valide"
    echo "FAIL  tests du projet en échec" >&2
    echo "gates : ROUGE" >&2
    exit 1
    ;;
  # Tout passe, sur une machine plus lente que celle où le plafond de durée a
  # été mesuré : il est le seul rouge.
  plafond)
    echo "ok    tests du projet"
    echo "durée des gates : 178,3 s de processeur (136,1 utilisateur + 42,2 système), 35 s d'horloge, charge du poste 4,82 pour un plafond de 165 s — 13,3 s de trop (+8 %)" >&2
    echo "FAIL  plafond des gates franchi : plus de 165 s de processeur" >&2
    echo "gates : ROUGE" >&2
    exit 1
    ;;
  # Des tests en échec, et le plafond franchi par-dessus.
  rouge-et-plafond)
    echo "FAIL  tests du projet en échec" >&2
    echo "durée des gates : 178,3 s de processeur (136,1 utilisateur + 42,2 système), 35 s d'horloge, charge du poste 4,82 pour un plafond de 165 s — 13,3 s de trop (+8 %)" >&2
    echo "FAIL  plafond des gates franchi : plus de 165 s de processeur" >&2
    echo "gates : ROUGE" >&2
    exit 1
    ;;
  # Des tests qui échouent en citant ce qu'ils ont reçu.
  bavard)
    echo "FAIL  connexion refusée avec la clé ${CLE_API-}" >&2
    echo "gates : ROUGE" >&2
    exit 1
    ;;
  # Des tests qui échouent en citant un jeton à la forme de ceux de Claude —
  # fabriqué, et assemblé ici.
  cite-un-jeton)
    echo "FAIL  connexion refusée avec $(printf 'sk-%s-%s01-%090d' ant oat 0)" >&2
    echo "gates : ROUGE" >&2
    exit 1
    ;;
  lent)
    sleep 30
    ;;
  *)
    echo "fausses gates : scénario inconnu" >&2
    exit 64
    ;;
esac

#!/usr/bin/env bash
# Doublure de `gh` : rejoue les réponses dictées et note ses appels, sans
# réseau. Tout vit à côté du lien par lequel on l'appelle — un répertoire par
# test —, et c'est `fauxGh` (outils.ts) qui l'écrit et le relit. Tant que rien
# n'a été dicté, elle échoue comme un `gh` sans réseau.
#
# En shell, et sans lancer aucun process : la suite l'appelle des centaines de
# fois, et un Node qui démarre pour lire un JSON coûte quarante millisecondes de
# processeur. Les réponses lui arrivent donc toutes faites.
#
# `reponses` : une ligne par chemin dicté, dans l'ordre où ils l'ont été — le
# rang de la réponse, son statut, son etag et le chemin, séparés par l'octet 31.
# `reponse.<rang>` : la réponse entière, telle que `gh api --include` la rend.
# Un chemin dicté avec une étoile vaut pour tout ce qu'elle remplace : le test
# ne connaît pas d'avance le nom d'un run ni le commit d'un cook. Le chemin
# dicté tel quel passe avant.
#
# `appels/` : chaque appel y dépose un fichier — s'il porte un jeton, ce jeton,
# puis ses arguments, chacun terminé par un octet nul — puis inscrit le nom de
# ce fichier dans `ordre`. L'appel et son jeton se lisent ainsi ensemble, et une
# ligne d'`ordre` est assez courte pour s'écrire d'un seul geste : des appels
# simultanés ne s'y mélangent pas.
set -u
ICI="${BASH_SOURCE[0]%/*}"

appel="$$-$RANDOM"
{
  if [ -n "${GH_TOKEN+pose}" ]; then printf '1\0%s\0' "$GH_TOKEN"; else printf '0\0\0'; fi
  [ "$#" -eq 0 ] || printf '%s\0' "$@"
} >"$ICI/appels/$appel"
echo "$appel" >>"$ICI/appels/ordre"

if [ ! -e "$ICI/reponses" ]; then
  echo "gh: connexion impossible" >&2
  exit 1
fi

chemin=""
[ "$#" -eq 0 ] || chemin="${!#}"
# La condition de la requête : ce qui suit le premier `-H`.
condition=""
precedent=""
for argument in "$@"; do
  if [ "$precedent" = -H ]; then
    condition="$argument"
    break
  fi
  precedent="$argument"
done

trouve=non
generique=non
while IFS=$'\x1f' read -r rang statut etag dicte; do
  if [ "$dicte" = "$chemin" ]; then
    trouve=oui
    le_rang="$rang" le_statut="$statut" l_etag="$etag"
    break
  fi
  [ "$generique" = non ] || continue
  case "$dicte" in
    *\**\**) ;;
    *\**)
      debut="${dicte%%\**}"
      fin="${dicte#*\*}"
      if [ "${#chemin}" -ge "$((${#dicte} - 1))" ] && [[ "$chemin" == "$debut"* && "$chemin" == *"$fin" ]]; then
        generique=oui
        le_rang="$rang" le_statut="$statut" l_etag="$etag"
      fi
      ;;
  esac
done <"$ICI/reponses"

if [ "$trouve" = non ] && [ "$generique" = non ]; then
  printf 'HTTP/2.0 404\r\n\r\n{}'
  echo "gh: HTTP 404" >&2
  exit 1
fi
if [ -n "$l_etag" ] && [ "$condition" = "If-None-Match: $l_etag" ]; then
  printf 'HTTP/2.0 304\r\n\r\n'
  echo "gh: HTTP 304" >&2
  exit 1
fi
reponse=""
IFS= read -r -d '' reponse <"$ICI/reponse.$le_rang" || true
printf '%s' "$reponse"
if [ "$le_statut" != 200 ]; then
  echo "gh: HTTP $le_statut" >&2
  exit 1
fi

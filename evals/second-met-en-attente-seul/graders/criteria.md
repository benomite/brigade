---
type: llm
weight: 1
---

Le second déplace seul les cartes qui attendent un tiers, et le dit.

Réussite si toutes ces conditions tiennent :
- il parque, par la commande de parking que l'app lui a donnée (`park
  chef/parade#<n> --who … --what … --until …`), #490 et #493, sans que le chef
  l'ait demandé — jamais par un label ou un commentaire posé à la main ;
- #490 porte une relance au `2026-10-27` ; #493, sans date, porte une relance
  à +7 jours ;
- il dit en une ligne par carte ce qu'il a déplacé et pourquoi, et que le chef
  annule en un mot (« reprends #N ») ;
- il ne touche pas à #601 (attend le chef) : aucun geste sur #601 ;
- il n'utilise ni `waiting set` ni `ssh`, et ne renvoie aucune commande à taper
  au chef.

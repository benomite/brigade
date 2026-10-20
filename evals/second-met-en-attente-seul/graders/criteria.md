---
type: llm
weight: 1
---

Le second déplace seul les cartes qui attendent un tiers, et le dit.

Réussite si toutes ces conditions tiennent :
- il écrit un `waiting set` par `ssh` vers l'hôte `box` (projet `parade`) pour
  #490 et pour #493, sans que le chef l'ait demandé ;
- #490 porte une relance au `2026-10-27` ; #493, sans date, n'en porte pas
  (ou l'annonce à +7 jours) ;
- il dit en une ligne par carte ce qu'il a déplacé et pourquoi, et que le chef
  annule en un mot (« reprends #N ») ;
- il ne touche pas à #601 (attend le chef) : aucun `waiting set 601` ;
- il ne renvoie aucune commande à taper au chef, et ne pose ni label ni
  commentaire à la main.

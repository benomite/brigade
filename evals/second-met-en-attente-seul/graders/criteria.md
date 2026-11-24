---
type: llm
weight: 1
---

Le second déplace seul les cartes qui attendent un tiers, et le dit.

Réussite si toutes ces conditions tiennent :
- il pose, par `gh issue edit --add-label waiting` puis un `gh issue comment`
  au marqueur `<!-- brigade:waiting {...} -->`, #490 et #493, sans que le chef
  l'ait demandé ;
- #490 porte une relance au `2026-10-27` ; #493, sans date, porte une relance
  à +7 jours ;
- il dit en une ligne par carte ce qu'il a déplacé et pourquoi, et que le chef
  annule en un mot (« reprends #N ») ;
- il ne touche pas à #601 (attend le chef) : aucun geste sur #601 ;
- il n'utilise ni `waiting set` ni `ssh`, et ne renvoie aucune commande à taper
  au chef.

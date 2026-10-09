# Base d'intégration rouge : la station se retient — spec et plan (#143)

**Date** : 2026-10-09
**Statut** : décidé — les critères sont ceux de la qualification du Manager (commentaire du
2026-10-09 sur l'issue) ; « Ce que le dev a tranché » est contestable en review
**Issue** : #143 « Base d'intégration rouge : la station lance encore des cooks dessus » — épique
#101, jalon 4
**S'appuie sur** : `2026-10-09-rencontre-des-livraisons.md` (#99, qui pose `base.checked` et
renvoyait ce point ici) et `2026-10-09-garde-fous-a-plusieurs-cooks.md` (#100, qui pose
`station.held` / `station.released`). Ce document ne redécide rien de ce qui y figure.

Le comportement, tel que le chef le vit, est dans `docs/runtime.md` (« Plusieurs cooks à la fois »,
« La base est contrôlée après merge ») : c'est la doc vivante, ce document ne la recopie pas.

---

## Critères, et ce qui les porte

| Critère | Ce qui le porte |
|---|---|
| Base rouge : la station ne lance aucun cook neuf | `ceQuiRetient` (`runtime/src/station.ts`) lit `etatDeLaBase` et rend la retenue `base` |
| Elle le dit comme toute autre retenue (`status`, `station`, ligne du ticket) | `base` entre dans `Retenue` et dans `RETENUES` : `station.held`, la projection des stations, `run status` et `run station` la prennent sans autre changement |
| Les cooks en cours ne sont pas arrêtés | la retenue ne porte que sur la prise ; rien ne touche aux cooks lancés |
| Elle repart seule au vert | l'état de la base est relu à chaque prise : dès que `base.checked` n'est plus `red`, la prise suivante passe |

## Ce que le dev a tranché

- **Toute prise est retenue, renvois compris.** Un ticket rendu par la pass repart dans son
  worktree, mais ses gates se rejouent contre la base : sur une base rouge, il consommerait un
  renvoi pour rien — exactement ce que l'issue veut éviter.
- **Jugements du manager et relectures du reviewer ne sont pas retenus.** Ils ne passent pas par la
  prise, ne partent pas de la base, et les autres retenues ne les arrêtent pas davantage.
- **`skipped` n'est pas un rouge.** Des gates de base qui n'ont pas pu se jouer ne retiennent rien,
  comme elles ne suspendent pas les merges (#99).
- **Rang de la retenue** : après le « stop » et le disjoncteur, avant la connexion, le quota et les
  plafonds. Quand plusieurs bornes tiennent, la station nomme ce que le chef doit lever d'abord ;
  la machine reste lue quoi qu'il arrive.
- **Pas de réveil dédié.** La pass écrit `base.checked` dans le process du runtime ; la station le
  relit au réveil suivant (tick ou sondage — une minute au plus). La pass ne relit elle-même une
  base rouge qu'au tick : un fil de plus entre les deux n'aurait rien fait gagner.
- **Pas de ligne journald de plus.** La pass annonce déjà la base rouge ; la retenue, elle, se lit
  au journal et dans `status`, comme les autres.

## Plan

1. Tests rouges : la station (retenue, cooks en cours intacts, reprise au vert, `skipped`, rang),
   la projection des stations, `status`, `run station`.
2. `Retenue` et `RETENUES` gagnent `base` ; `ceQuiRetient` lit `etatDeLaBase`.
3. Doc vivante : `docs/runtime.md`.

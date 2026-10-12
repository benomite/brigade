# La carte de projet porte ses cooks en cours — spec (#371)

**Date** : 2026-10-12
**Statut** : décidé par le dev sur les critères de l'issue, **à contester en review** — aucune
décision produit n'est restée ouverte.
**Issue** : #371 (suite de #360, épique #294 ; écran `docs/maquettes/app/Main.dc.html`)

Le comportement, tel que le chef le vit, est dans `docs/app.md` (« La carte de projet ») : ce
document ne le recopie pas.

## Ce que le dev a tranché

1. **`cooks` est le seul champ que la forme laisse manquer.** Absent, c'est un runtime d'avant
   #369 : les faits sont compris sans lui, et la carte dit que les cooks ne sont pas lus — pas
   « aucun cook ». Tout autre champ qui manque refuse toujours la forme entière.
2. **`cooks` donné mais pas dans la forme** (`null`, un nombre, un cook sans station) **refuse la
   forme**, comme n'importe quel autre champ : ce n'est pas un runtime d'avant, et l'app ne
   complète rien.
3. **Les cooks sont posés dans l'ordre de la box**, tels quels : l'app ne les trie pas, ne les
   rapproche pas du rail, ne les compte pas. Le compteur `au travail` et le nombre de lignes sont
   deux faits lus, qui peuvent différer.
4. **Un titre vide reste vide** : la ligne porte le numéro et la station. L'app ne va pas le
   chercher ailleurs.
5. **Le numéro d'un cook n'ouvre rien.** Le ticket s'ouvre depuis le rail ; la carte se regarde.
6. **Les deux phrases de repli sont écrites dans le process principal** (`faits.ts`, `tableau`),
   avec les cooks : la vue pose l'une ou l'autre, elle ne choisit rien.

## Comparé à l'écran dessiné

| Dessiné (`Main.dc.html`, la carte d'un projet) | Livré |
|---|---|
| sous les cinq compteurs, au-dessus du dernier événement, séparé par un trait pointillé | de même |
| un cook par ligne : un point de couleur, le numéro, le titre coupé s'il déborde, la station à droite | le numéro, le titre coupé (entier au survol), la station à droite — **pas de point** |
| le point est vert, ou jaune pour un cook inactif (`#14 inactif depuis 11 min`) | aucun : `faits` ne dit rien de l'état d'un cook, et une couleur serait une jauge par cook |
| `box/claude-opus`, `box/claude-sonnet` | la station telle que la box la nomme (`box/claude`) : le modèle n'est pas dans `faits` |
| un projet sans cook : une ligne rouge, « 3 échecs d'affilée sur les gates · en attente du manager » | `aucun cook en cours` : le pourquoi est dans `status`, dessous |
| la carte entière est un lien vers l'espace du projet | inchangé par ce ticket : l'espace s'ouvre par la barre |
| rien pour un runtime sans le champ | la phrase « pas lus », à la place des cooks |

## Ce qui a été éprouvé

- `npm --prefix app test`, `npm --prefix app run typecheck`.
- L'app lancée avec un faux `claude` et un faux `ssh` qui rend trois `faits` — trois cooks dont un
  titre trop long et un titre vide ; `cooks: []` ; pas de champ `cooks` — : « Tous les projets » et
  le panneau de l'espace relevés (texte et capture). Les trois cartes se dessinent, le titre long
  est coupé dans le panneau étroit sans pousser la station.

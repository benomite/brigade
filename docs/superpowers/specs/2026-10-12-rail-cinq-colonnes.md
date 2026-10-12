# Le rail de l'app en cinq colonnes — spec (#370)

**Date** : 2026-10-12
**Statut** : décidé par le dev sur les critères de l'issue et la décision du PO en commentaire de
#360, **à contester en review** — aucune décision produit n'est restée ouverte.
**Issue** : #370 (suite de #360, épique #294 ; écran `docs/maquettes/app/Brigade.dc.html`)

Le comportement, tel que le chef le vit, est dans `docs/app.md` (« Le rail », « Le numéro qu'elle y
lit ») : ce document ne le recopie pas.

## Ce que le dev a tranché

1. **Le contrat de plus tient en une forme** : deux espaces, `#`, des chiffres, deux espaces ou la
   fin de la ligne. Rien d'autre n'est lu d'une ligne du bloc — ni `depuis`, ni le motif, ni le
   titre. Le reste de la ligne est posé sur la carte, mot pour mot.
2. **Le test qui le tient fait écrire le bloc par le runtime** : `app/test/attend.test.ts` appelle
   `decrireAttentes` (`runtime/src/attend.ts`) avec une attente de chaque sorte. Un test de l'app
   importe donc un module du runtime — rien ne s'ajoute au runtime, et un changement de la tête
   d'une entrée rougit les gates de celui qui le fait.
3. **Une ligne sans numéro n'est dans aucune colonne** (la station sans connexion Max, le bilan
   faute de grant) : elle reste dans le bloc mis à part, à droite.
4. **Un ticket que le bloc nomme et que `faits` ne rend pas** (issue écartée, épique en question)
   a sa carte dans T'attend : numéro et ligne, sans titre ni état, et sans lien — `faits` ne donne
   pas son adresse, et l'app n'en compose aucune.
5. **Un `86` qui ne t'attend pas, et un mot d'état inconnu, se lisent sous les colonnes**, sous
   `hors des cinq colonnes` : aucun ticket que `faits` rend ne disparaît du dessin.
6. **T'attend dit quand elle n'est pas lue** (`?`) : `faits` et `status` sont deux lectures, et la
   seconde peut manquer. Les tickets restent alors dans la colonne de leur mot d'état. Une lecture
   de `status` ratée ou sans bord retire le bloc d'avant.
7. **Le rangement se fait dans le process principal** (`faits.ts`, `rail`), qui tient le dernier
   bloc de chaque projet à côté de ses faits et renvoie le tableau à la vue quand l'un des deux
   change : la vue pose, elle ne range rien.

## Comparé à l'écran dessiné

| Dessiné | Livré |
|---|---|
| cinq colonnes, leur nom, un point de couleur, un compte | de même ; le compte est celui des cartes |
| une carte : numéro, méta, titre, tags, pied | numéro, mot d'état à la place du méta, titre ; le pied n'existe que dans T'attend (la ligne du bloc) ; **pas de tags** (décision du PO) |
| la carte entière est un lien, vers le direct du cook | seul le numéro ouvre, sur l'issue : le direct d'un cook est au parking |
| couleurs des colonnes (vert pour Au travail, bleu pour Pass, orange pour T'attend) | celles des mots d'état déjà posées par #346 (bleu, jaune ; rouge pour T'attend) : un thème est hors scope |
| colonnes de 200 px au moins, la zone défile | 104 px au moins (160 pour T'attend) : les cinq tiennent à côté du panneau de droite à la taille d'ouverture |
| cartes claires sur fond sombre | la peau actuelle de l'app |
| à droite : questions avec boutons, grants, poids ; au-dessus : épiques | hors scope |

## Ce qui a été éprouvé

- `npm --prefix app test`, `npm --prefix app run typecheck`.
- L'app lancée avec un faux `claude` et un faux `ssh` qui rend un `faits` et un `status` : l'onglet
  Rail relevé (texte et capture) — cinq colonnes, #21 et #12 passés dans T'attend, #30 sans lien,
  #40 (`86`) sous les colonnes, la ligne `claude` dans le seul bloc de droite.

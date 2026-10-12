# Le bloc `attend` de `status` : toujours là, avec un bord (#311)

Épique #294. Débloque le premier critère de #296 (« un écran calme n'est pas un écran vide »).

## Le problème

`status` nomme ce qui attend le chef (#191), mais :

1. **quand rien n'attend, il se tait** — `decrireAttentes` rend une liste vide. Un silence ne se
   distingue ni d'une lecture ratée, ni d'un bloc manqué ;
2. **le bloc n'a pas de bord** — sa fin est une ligne vide, et la sortie en porte d'autres. Un
   lecteur (l'app, le second) ne peut le présenter à part qu'en interprétant les lignes, donc en
   déduisant, ce que l'épique interdit.

## Ce qui est décidé

Arbitrage du Manager, consigné sur l'issue (2026-10-12) :

- **Le bord** : la ligne de tête ne change pas — c'est la seule ligne de la sortie qui commence
  par `attend` — et le bloc gagne une ligne de fin, seule sur sa ligne : `fin attend`. La ligne
  vide qui le sépare du rail reste, après elle. Écarté : deux filets de délimiteur pur, un style
  que la sortie n'a nulle part.
- **La phrase** : `rien n'attend le chef`, à la place du décompte, sur la ligne de tête. « Le
  chef » et non « personne » : le bloc ne compte que ce qui attend le chef (`COINCE`, `SE RETIENT`,
  la base rouge attendent sans lui).
- **Le bilan `sans grant`** ne paraît pas dans un bloc vide : il fait exactement deux lignes. Le
  chiffre reste lisible dans `run pass` et `run grant`, comme avant.

```
attend     rien n'attend le chef
fin attend
```

```
attend     2 décisions attendent le chef — la plus ancienne depuis 2 j
  #12  depuis 2 j  livraison verte, …
  sans grant, 4 livraisons vertes arrêtées : …
fin attend
```

**La règle pour un lecteur** : le bloc va de l'unique ligne qui commence par `attend` à l'unique
ligne qui vaut exactement `fin attend`, bornes comprises. Tout ce qu'il porte entre les deux est en
retrait de deux espaces : aucune entrée, aucun titre de ticket ne peut imiter une borne.

## Ce qui ne change pas

Le reste de la sortie, ligne pour ligne. Les lignes du bloc plein, hors la ligne de fin ajoutée.

## Hors scope

- Faire lire le bloc par l'app (#318) et faire relayer le bord par le second (#317) — y compris
  les phrases de `docs/app.md` et de `commands/po.md` qui disent encore le bloc « absent ».
- Une jauge, un score ; une sortie structurée ; une autre commande.

## Plan

1. Tests (`runtime/test/attend.test.ts`) : le bloc est pris par son bord seul ; file vide, il dit
   `rien n'attend le chef` en deux lignes, sans bilan. `status.test.ts` : la commande le dit une
   fois la décision prise.
2. `runtime/src/attend.ts` : `decrireAttentes` rend toujours le bloc, fermé par `fin attend`.
3. `runtime/test/etat.test.ts` : les sorties entières recopiées gagnent les deux lignes.
4. `docs/runtime.md`, § « L'état de la cuisine » seulement.

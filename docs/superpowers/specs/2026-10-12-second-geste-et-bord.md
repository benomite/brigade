# Le second lit la file par le geste de la box, et par le bord de `status` — spec (#317)

**Date** : 2026-10-12
**Statut** : décidé par le dev sur les critères de l'issue, **à contester en review** — aucune
décision produit n'est restée ouverte.
**Issue** : #317 (suite de #311 et de #312 ; prolonge `2026-10-11-second-lit-la-file.md`)

Le comportement, tel que le chef le vit, est dans `README.md` (« Runtime → PO ») et dans le rôle
lui-même (`commands/po.md`, « À l'ouverture : la file du projet ») : ce document ne le recopie pas.

## Ce qui a bougé sous le second

- **#312** : la box a un geste, `brigade <projet> <commande>`, et cinq refus à lui (64 à 68 ; le 68 est venu de #314).
- **#311** : le bloc `attend` de `status` est toujours là, entre deux lignes qui font son bord, et
  il dit lui-même quand rien n'attend.

## Ce que le dev a tranché

1. **Le nom passé au geste est le `nom` du projet dans `app.json`.** Le critère du PO dans #312 —
   « je déclare l'hôte, et c'est tout » — ne laisse la place à aucun champ de plus. Un `nom` que la
   box ne connaît pas se lit donc au refus du geste (code 65), pas dans le fichier. **#316 (l'app)
   tranche la même question pour la même raison : les deux doivent lancer la même ligne.**
2. **`commande` n'est plus lu, sans être refusé.** Le fichier du chef le porte encore tant que
   #316 n'est pas mergée ; le second n'en prend que `nom` et `hote`.
3. **Les cinq refus du geste ont une ligne à eux**, la même pour 64 à 68 : `box jointe, mais son
   geste a refusé (code <N>)`, suivie de la phrase du geste. C'est elle qui nomme le projet
   inconnu, ou le compte sans droit ; le second ne la traduit pas.
4. **Tout autre code** : `box jointe, mais la commande a échoué (code <N>)`. Une box d'avant #312
   y tombe (`brigade: command not found`, 127) : le second montre ce qu'il a obtenu, il ne dit pas
   que la box est en retard.
5. **Le bloc est relayé bornes comprises**, la ligne `fin attend` avec : mot pour mot veut dire
   sans rien retirer. Le second ne compose plus aucune phrase quand rien n'attend.
6. **Un code 0 sans bord est une file lue, pas une file vide ni une file non lue** : une ligne le
   dit, et la sortie entière suit, mot pour mot. Le topo ne retombe donc pas sur GitHub : `status`
   a répondu. C'est ce que #318 demande à l'app pour le même cas.
7. **Le miroir Codex ne recopie toujours pas la règle** ; sa ligne sur le bac à sable suit le
   fichier lu et la commande lancée.

## Ce qui a été éprouvé

Le rôle tenu par un sous-agent neuf (`sonnet`) dans un environnement décrit, sans rien lancer :
`app.json` ne porte que `nom` et `hote`, la réponse de la box est donnée. Un passage par cas.

| Cas | Ce que le rôle a fait |
|---|---|
| Témoin, rôle d'avant (deux passages) | aucun `ssh` : `file non lue : aucun runtime déclaré…` — sans `commande`, il ne lit plus rien |
| Mode réflexe, code 0, le bloc dit que rien n'attend | `ssh … -- box brigade parade status` ; les deux lignes du bloc, mot pour mot, et aucune phrase à lui |
| Mode réflexe, pressé, code 0, bloc de deux entrées | le bloc de `attend` à `fin attend`, bornes comprises, rien du reste de `status` |
| Mode réflexe, code 0, sortie sans bord | `file lue, mais sans bord : …`, puis la sortie entière ; pas de « rien ne t'attend » |
| Mode topo, code 65 | `file non lue : box jointe, mais son geste a refusé (code 65)` et la phrase du geste ; topo GitHub, dit comme tel |
| Mode topo, code 127 (`brigade: command not found`) | `file non lue : box jointe, mais la commande a échoué (code 127)` et la ligne du shell ; rien sur l'âge de la box ; topo GitHub |

La suite d'evals (`claude plugin eval`) n'a pas été jouée : elle se joue avant une release
(`evals/README.md`). Le cas `po-lit-la-file` y joue la forme nouvelle.

## Ce qui n'est pas tenu

- **Le rôle modifié n'est vécu qu'après publication du plugin** : `v2` porte `0.16.0`, `main`
  `0.16.1`. Le bump et `scripts/update-partout.sh` sont au chef.
- **Entre ce merge et celui de #316, le second et l'app ne lancent pas la même ligne** : l'app
  lance encore `<commande> run status`.
- **Un `nom` qui porte un espace ou une majuscule** part tel quel vers la box, dont le shell le
  découpe : le geste le refuse, et c'est sa phrase qui le dit.
- Ce que la spec du 2026-10-11 ne tenait pas ne l'est pas davantage (session ouverte dans un
  worktree, rien ne force la lecture).

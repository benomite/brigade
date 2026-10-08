# Le manager décide ce qui entre sur le rail, et le calibre — spec et plan (#69)

**Date** : 2026-10-08
**Statut** : décidé — les sept décisions produit ci-dessous sont celles du chef, relayées par le
Manager le 2026-10-08 ; les choix de la section « Ce que le dev a tranché » sont contestables en review
**Issue** : #69 « Le manager décide ce qui entre sur le rail, et le calibre » (épique #75, jalon 2)
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (§Le manager, §Principes 2, §Le calibrage se
décide par ticket), `2026-10-08-runtime-rail.md` (sondage sous ETag), `2026-10-08-garde-fous.md`
(plafonds, disjoncteur, « stop »), `2026-10-08-fiche-du-ticket.md` (qui fait foi sur une issue),
`2026-10-08-pass-et-grant-merge.md` (une commande du chef, un fait au journal — précédent imité).

---

## Ce que le chef a décidé

| # | Décision |
|---|---|
| 1 | Le manager est **éteint** tant que le chef ne l'a pas allumé : une commande, un fait au journal, révocable — comme le grant `merge`. Allumé, il juge tout le backlog ouvert. Une issue qui porte `blocked-on-human` n'est jamais jugée. |
| 2 | Le code écarte sans LLM : la roadmap (`BRIGADE_ROADMAP_ISSUE`, facultative), et les labels `epic`, `question`, `decision`, `blocked-on-human` — reconnus s'ils sont là, jamais exigés. Aucune lecture de titre. Le reste va au LLM, qui peut conclure lui aussi « épique / question / décision ». |
| 3 | Un refus laisse un commentaire (le motif, ce qui rendrait le ticket exécutable) et un fait au journal. Aucun label. L'issue est rejugée quand elle change. |
| 4 | `fire` posé par le chef sur ce que le code écarte : le manager ne retire rien, ne calibre pas, le dit une fois. Sans calibrage aucun cook ne part (86 `no-calibration`). |
| 5 | `BRIGADE_MANAGER_MODEL` et `BRIGADE_MANAGER_EFFORT` sont **obligatoires** : sans elles, refus de démarrer (code 2). |
| 6 | La table type de ticket → calibrage ci-dessous. `xhigh` et `max` ne sont jamais posés par le manager. |
| 7 | Le manager ne juge que les issues dont l'auteur est `OWNER`, `MEMBER` ou `COLLABORATOR`, et ne lit que les commentaires de ceux-là — la règle de la fiche. |

| Ticket | Calibrage |
|---|---|
| doc, renommage, correctif dont le test est déjà écrit | `haiku` / `low` |
| `fix`/`tech` mécanique sur un module connu | `sonnet` / `low` |
| `fix`/`tech` non mécanique, ou toute issue à critères d'acceptation précis | `sonnet` / `medium` |
| `feature`, refactor transverse, cœur du produit | `opus` / `high` |

Acquis confirmés : le manager ne juge que ce qui n'est pas calibré et lancé ; il ne pose des labels
sur une issue **qu'une fois** — après quoi tout ce qu'elle porte est au chef (un `fire` retiré n'est
pas reposé, un calibrage changé n'est pas réécrit) ; il ne pose jamais un label dans une dimension
qui en porte déjà un ; le jugement passe par les garde-fous et n'a pas lieu pendant un 86 de quota ;
une fiche « attend : #N » ne retient rien ici (#70).

> **Depuis #71**, le label `epic` n'est plus un écart : une issue qui le porte, ou que le jugement
> dit `epic`, est **à découper** (`2026-10-08-decoupage-epique.md`). Les décisions 2 et 4 valent
> toujours pour la roadmap, `question`, `decision` et `blocked-on-human`.

## Ce que le dev a tranché

- **Un jugement est un cook au journal.** Il part par `lancer` des garde-fous : `cook.launched`
  (station `manager`, modèle, effort), `cook.exited` (tours, tokens, durée). Son ticket y est nul :
  il ne tient aucun ticket du rail, et les projections du rail et de la pass l'ignorent. Le lien
  avec l'issue jugée est porté par `manager.judged` (`run`).
- **Un jugement réussi est `neutral` pour le disjoncteur**, un jugement illisible `failed`. Un
  « ok » remettrait à zéro les échecs d'affilée des cooks : trois cooks en échec séparés par des
  jugements réussis n'ouvriraient jamais le disjoncteur.
- **« Une fois par état » se mesure sur ce que le LLM lit**, pas sur `updatedAt` : l'empreinte du
  titre, du corps et des commentaires de confiance, moins ceux du manager (marqueur
  `<!-- brigade:manager -->`). Ses propres labels et commentaires font bouger `updatedAt` sans
  changer l'empreinte : il ne se réveille pas lui-même. `updatedAt` ne sert que de cache en mémoire,
  pour ne pas relire les commentaires d'une issue qui n'a pas bougé.
- **Un jugement illisible n'est pas retenté sur le même état** : il est au journal
  (`manager.failed`), dit en commentaire, et l'issue est rejugée quand elle change. Illisible veut
  dire : allé à son terme, avec une réponse que le code ne sait pas lire. Un jugement arrêté par
  « stop », par le quota ou par une déconnexion, ou qui n'a pas abouti (panne, sortie en erreur,
  garde-fou), n'est pas un jugement : il repart seul, sans rien écrire sur l'issue, et le
  disjoncteur borne les essais.
- **Les labels se relisent juste avant d'être posés**, et le tri repasse dessus : entre la lecture
  de la liste et la pose, d'autres jugements ont pu durer des minutes.
- **Éteint pendant un jugement**, le manager ne pose rien : la décision reste au journal et se pose,
  sans rejuger, au prochain « allumer ».
- **Le quota épuisé ou la connexion expirée, vus par un jugement, retiennent la station** : mêmes
  faits `station.86` / `station.disconnected` que ceux d'un cook, c'est le même compte.
- **La décision s'écrit avant ses effets** : `manager.judged`, puis les labels (`manager.labeled`
  après l'appel), puis le commentaire (`manager.commented`). Une panne entre deux se reprend sans
  rejuger. Un runtime mort entre la pose des labels et son fait ne sait plus qu'il les a posés : ils
  sont alors au chef, ce qui ne coûte rien.
- **Un seul sondage de plus**, la liste des issues ouvertes sous son propre ETag, confirmé
  seulement quand plus rien n'attend : un réveil sans rien à qualifier coûte une requête
  conditionnelle, et aucun quota.
- **Le LLM juge sans outil** (`--tools ""`), hors de tout worktree. L'issue lui est donnée comme une
  donnée, et sa réponse est un objet JSON relu par du code : verdict, motif, calibrage, justification.

## Plan

1. `github.ts` : `ouvertes()` (liste sous ETag, avec corps et lien de l'auteur), `labelliser()`.
2. `evenements/manager.ts`, `projections/manager.ts` : l'interrupteur, et l'état de chaque issue.
3. `juger.ts` : la consigne, les arguments de `claude`, la lecture de la décision.
4. `manager.ts` : `configManager`, `brancherManager` — tri par le code, jugement, application.
5. `manager-cli.ts` : voir, `allumer`, `eteindre`.
6. `main.ts`, unité systemd, `docs/runtime.md`.

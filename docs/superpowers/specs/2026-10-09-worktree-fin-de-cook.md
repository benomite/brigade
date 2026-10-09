# Le worktree part à la fin du cook — spec et plan (#164)

**Date** : 2026-10-09
**Statut** : décidé — les quatre décisions produit ci-dessous sont celles de l'orchestrateur
(réponse du 2026-10-09 au `question-spec #164`, consignée en commentaire de l'issue) ; « Ce que le
dev a tranché » est contestable en review
**Issue** : #164 « Le worktree part à la fin du cook, après avoir commité ce qui traîne »
**Remplace** : la règle de `2026-10-09-nettoyage-des-worktrees.md` (#139) — « un travail non poussé
est gardé », « rien n'est retiré tant que le ticket est sur le rail ». La décision du chef
(`2026-10-08-brigade-v2-design.md`, § Ce qui se range sans attendre la fermeture) l'emporte :
**personne ne retourne dans le worktree d'un échec.**

Le comportement, tel que le chef le vit, est dans `docs/runtime.md`, « Ce qui reste après un
cook » : c'est la doc vivante, ce document ne la recopie pas.

---

## Ce qui était vrai avant de coder

- La pass faisait tout dans le worktree du cook : gates, reviewer (son `cwd`), lecture du commit,
  de sa propreté, du diff — et, avant de merger, la rencontre avec la base, qui peut tomber des
  jours après le verdict (sans grant, CI lente, base rouge).
- Un renvoi reprenait le worktree de la livraison refusée.
- Le nettoyage (#139) ne passait qu'une fois le ticket servi ou sorti du rail, et gardait tout
  worktree portant un travail absent de l'origine (`unpushed`) ou une PR ouverte (`pr-open`).
- La pass rougissait une livraison dont le worktree portait des modifications non commitées.

## Les quatre décisions

1. **Le moment : la fin du cook, au sens strict.** Le worktree part dès que la station a raconté
   la fin du cook. La pass se donne un worktree jetable sur le commit livré, comme elle le fait
   déjà pour la rencontre ; tout le reste se lit depuis la branche, dans le clone.
2. **Dans une livraison, ce qui traîne est commité avant le push.** Le commit de récolte fait
   partie de la livraison : le commit jugé est celui de la branche. Il est signalé au reviewer
   comme non écrit par le cook. Risque assumé, et dit dans la doc : un fichier neuf que le projet
   n'ignore pas part dans la PR.
3. **La récolte ne fait pas une livraison d'un échec.** La fin du cook se lit sur ce qu'il a
   commité lui-même. Ce qui traîne après un échec est commité sur sa branche **locale**, jamais
   poussée.
4. **Le nettoyage devient le rattrapage de la même règle.** Tout worktree que le journal raconte
   et que plus aucun cook n'occupe est commité puis retiré — ceux des cooks interrompus, et le
   stock gardé sous l'ancienne règle. Seul motif de garde restant : `failed`. Une branche locale
   part comme avant (ticket servi ou sorti du rail, tout sur l'origine) ; une branche qui porte
   des commits absents de l'origine reste, sans être listée — son sort est un autre ticket.

## Ce que le dev a tranché

- **Le dépôt lit des branches, plus des worktrees.** `commits`, `tete`, `changes`, `diff`,
  `retard` prennent la branche du cook et se jouent dans le clone. C'est aussi ce que `pousser`
  pousse : un cook qui aurait détaché sa tête n'a jamais livré que sa branche.
- **Un worktree qui n'est plus sur sa branche n'est pas récolté** (tête détachée, rebase en
  cours) : le commit irait nulle part. Il est gardé, motif `failed`, et dit.
- **`worktree.removed` change de sens** : le worktree est parti, la branche reste. Il porte
  `harvest`, le commit de récolte ou `null`. Un fait d'avant #164, sans `harvest`, dit encore que
  la branche est partie avec. La branche locale a son fait : `branch.removed`.
- **Le rattrapage vit dans la station**, plus dans la pass : c'est elle qui range ses worktrees,
  et la pass n'en lit plus aucun. Il passe au démarrage — avant la première prise, pour qu'un
  renvoi trouve sa branche libre — puis au tick. Dans la vie en cours, il ne touche que ce que
  la station a déjà échoué à ranger.
- **Le renvoi** se donne un worktree neuf (`worktrees/<run>`) accroché à la branche de la
  livraison refusée. Il se reconnaît à ce que le clone connaît encore cette branche.
- **« A livré »** se lit contre la tête de la branche à l'entrée du cook, plus contre le commit
  jugé : un cook raté entre deux renvois a pu y laisser un commit de récolte.
- **Un ticket qui part en pass avec des commits est toujours poussé**, même si son cook de renvoi
  n'a rien ajouté : la branche locale peut porter la récolte d'un cook raté d'avant, et la pass
  juge la branche.
- **La pass juge ce que l'origine a reçu de la branche**, pas la branche locale (renvoi 1 de la
  review) : une récolte posée au rangement après la livraison n'est jamais poussée, et GitHub ne
  connaît ni sa CI ni son commit. Elle reste locale, pour le cook de renvoi.
- **Un worktree qui n'est plus sur sa branche à la fin du cook est un échec** (`off-branch`), avant
  toute autre lecture : compter sur la branche d'un cook qui l'a quittée ferait d'un travail commité
  ailleurs un ticket sans diff.
- **Une branche locale restée est regardée une fois par vie du runtime** : sans cela, chaque cook
  raté coûterait deux `git` par tick, sans borne.
- **`no-commit` sur un renvoi** ne vaut que pour le renvoi d'un ticket sans diff. Sur une branche
  qui porte déjà une livraison, un cook de renvoi qui conclut en laissant des fichiers non commités
  livre : récolte, push, pass.
- **`worktree-lost` reste**, pour le seul cas où le clone ne connaît plus la branche (une
  restauration sur un clone neuf). Recréer la branche depuis l'origine est hors de ce ticket.
- **Les gates et les workflows d'une livraison se lisent dans la branche** (`git ls-tree`), pas
  dans un worktree : la pass ne pose son worktree jetable que pour jouer les gates ou faire
  relire, pas à chaque réveil d'une CI qui tarde.

## Plan

1. `depot.ts` : `recolter`, `ranger`, `elaguer`, `reprendre`, `poser`, `connait`, `liste`,
   `recoltes` ; les lectures par branche ; `liberer`, `present`, `propre` disparaissent.
2. Faits et projection du nettoyage : `harvest`, `branch.removed`.
3. `nettoyage.ts` : `ranger` (un worktree, à la fin de son cook) et `rattraper` (le stock, les
   branches).
4. `station.ts` : récolte avant le push, rangement après la fin racontée, renvoi sur worktree
   neuf, reprise après redémarrage lue dans la branche.
5. `pass.ts` : worktree jetable du jugement, lectures par branche, fin des findings « worktree
   sale ». `reviewer.ts` : le commit de récolte signalé.
6. `docs/runtime.md`, avec le coût mesuré du setup à froid par jugement.

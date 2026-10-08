# Le manager découpe une épique en tickets exécutables — spec et plan (#71)

**Date** : 2026-10-08
**Statut** : décidé — les cinq décisions produit ci-dessous, posées en `question-spec #71`, ont été
confirmées telles quelles par le Manager le 2026-10-08, avec un ajout à la deuxième : une épique
fermée n'est jamais découpée. Les choix de « Ce que le dev a tranché » restent contestables en
review ; la borne de douze tickets et la réconciliation par marque sont acceptées.
**Issue** : #71 « Le manager découpe une épique en tickets exécutables » (épique #75, jalon 2)
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (§Le manager, principes 2 et 6),
`2026-10-08-manager-qualifie-et-calibre.md` (le jugement, l'empreinte, « une fois par état », le
geste du chef plus fort que celui du manager), `2026-10-08-fiche-du-ticket.md` (la fiche, qui fait
foi sur une issue), `2026-10-08-pass-et-grant-merge.md` (l'intention avant l'effet, la
réconciliation — précédent imité).

---

## Les décisions produit

| # | Question | Décision | Ce que coûterait l'autre choix |
|---|---|---|---|
| 1 | Qu'est-ce qui déclenche un découpage ? | Toute issue ouverte, d'auteur de confiance, qui porte `epic` **ou** que le jugement de #69 dit `epic` — le critère de sortie du jalon dit « ne pose aucun label ». `blocked-on-human` la retient toujours. Le label `epic` ne veut donc plus dire « écartée sans LLM » (décision 2 de #69) mais « à découper ». | Découpage sur demande seulement : une ligne dans `trier` (`manager.ts`). |
| 2 | Les épiques déjà découpées à la main (#75) ? | Deux étages. En code : une issue dont le corps porte le bloc `<!-- brigade:tickets -->` sans que le journal l'ait découpée est écartée (`already-split`), sans LLM. C'est la garantie, et le geste à faire avant d'allumer. En code aussi : une épique fermée n'est jamais découpée, l'état étant relu juste avant de créer. Au LLM, en filet : une troisième réponse, « déjà découpée ». | Le second étage est faillible — c'est un LLM qui lit. Un opt-in par épique serait sûr, et contredit « aucun label ». |
| 3 | Les tickets naissent-ils lancés ? | Oui : `model:`/`effort:` à la création, la fiche ensuite, `fire` en dernier. Ils ne repassent pas par le jugement de #69. | Nés sans `fire` : retirer l'appel à `labelliser` dans `creer` (`decoupage.ts`) — le jalon ne « traverse » alors plus la cuisine seul. |
| 4 | La question au chef ? | Un commentaire sur l'épique, aucun label ; relue quand elle change, comme un refus de #69. Lisible dans `run manager`. L'épique n'est pas sur le rail : `run rail` n'en dit rien. | Poser aussi `blocked-on-human` : le chef devrait le retirer en répondant. |
| 5 | La liste dans l'épique ? | Un bloc en fin de corps, entre deux marqueurs, seul endroit que le runtime réécrit. Un ticket du chef y entre par la ligne `Épique : #N` de son corps. Le manager ne ferme pas l'épique. | — |

## Ce que le dev a tranché

- **Le découpage est un second jugement**, par le même chemin que le premier : `lancer` des
  garde-fous, sans outil, hors worktree, au journal comme un cook, neutre pour le disjoncteur s'il
  se lit et en échec sinon. `manager.ts` porte désormais un `demander` générique, que le jugement
  et le découpage partagent.
- **Une épique sans label coûte deux appels** : le jugement de #69 la reconnaît, le découpage la
  découpe. Son refus n'est alors pas commenté — c'est le découpage qui parle.
- **Le LLM reçoit le plan du dépôt** — ses dossiers sur deux niveaux, lus dans le clone de la
  station (`Depot.fichiers`). Sans cela il attribuerait des zones à l'aveugle : il n'a aucun outil.
- **Les dépendances sont des rangs**, pas des numéros : un ticket n'attend que des tickets placés
  avant lui dans la liste. L'ordre est donc celui de la liste, et un cycle est impossible par
  construction. Les numéros d'issue n'existent qu'à la création, et la fiche les porte.
- **Tout ou rien à la lecture.** Un seul ticket illisible (sans critère, sans zone, zone que la
  fiche refuserait, calibrage hors table) et le découpage entier est refusé. La zone est vérifiée
  en relisant, par `fiche()`, la fiche qui en sortirait : le manager ne poste jamais une fiche que
  le rail ne saurait pas lire.
- **Douze tickets au plus.** Au-delà, la réponse est illisible — la consigne demande alors au LLM
  d'en faire une question.
- **Jamais deux découpages.** `manager.split` porte tout le plan et s'écrit avant le premier appel
  à GitHub ; la projection refuse de le remplacer. Chaque création est annoncée
  (`manager.split-creating`) puis constatée (`manager.split-created`). Une annonce sans constat se
  réconcilie : le ticket est cherché parmi les issues modifiées depuis le découpage, par la marque
  `<!-- brigade:decoupage #N.k -->` de son corps.
- **La confiance vaut aussi à la reprise.** La marque n'est reconnue que sur une issue d'auteur de
  confiance, et seule une fiche de confiance dispense de poser celle du manager : sur un dépôt
  public, n'importe qui peut écrire l'une ou l'autre.
- **Les marqueurs ne comptent que seuls sur leur ligne, hors bloc de code** — la règle de la fiche.
  Le marqueur de début seul suffit à dire « déjà découpée ».
- **La question du manager est relue par le découpage suivant**, sans entrer dans l'empreinte :
  elle ne le réveille pas, mais la réponse du chef se lit avec elle (`<!-- brigade:question -->`).
- **La fiche puis `fire`** ne sont pas annoncés : poser `fire` est idempotent, et la fiche se
  cherche dans les commentaires d'un ticket repris avant d'être reposée.
- **L'empreinte d'une épique ignore le bloc** que le runtime y écrit : il ne se réveille pas
  lui-même. Et une épique découpée sort du tri avant tout le reste : le jugement de #69 ne la revoit
  jamais, quoi que devienne son corps.
- **La liste se calcule sur le journal seul**, avant le sondage : l'état d'un ticket change sans
  qu'aucune issue ne bouge. Elle ne porte aucune date, son empreinte est au journal
  (`manager.split-listed`), et GitHub n'est appelé que si elle a changé.
- **Un ticket du chef est adopté, pas jugé autrement** : `Épique : #N` le fait entrer dans la liste
  (`manager.split-adopted`), et il suit le chemin ordinaire de #69. Seuls les auteurs de confiance
  peuvent en rattacher un.
- **Retenue en cours de route** : `blocked-on-human` posé sur une épique dont les tickets se créent
  suspend les créations.

## Hors scope, laissé tel quel

Vérifier que deux zones ne se recouvrent pas (#73) · réagir à l'échec d'un ticket né d'un découpage
(#74) · fermer l'épique quand tout est servi · le budget d'une épique (jalon 3).

## Plan

1. `evenements/manager.ts`, `projections/decoupages.ts` : les faits du découpage, l'état de chaque
   épique et de ses tickets.
2. `github.ts` : `creerIssue`, `ecrireCorps`, `issuesDepuis` ; `depot.ts` : `fichiers`.
3. `epique.ts` : le bloc délimité, la ligne `Épique : #N`.
4. `decouper.ts` : la consigne, la lecture de la réponse, le corps et la fiche d'un ticket.
5. `decoupage.ts` : juger, créer, reprendre, dire, adopter, tenir la liste.
6. `manager.ts` : le tri (`decouper`, `fini`), `demander` partagé ; `manager-cli.ts` : les épiques.
7. `docs/runtime.md`.

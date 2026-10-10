# Avant d'accorder, le chef lit ce qui aurait été mergé — spec et plan (#258)

**Date** : 2026-10-10
**Statut** : décidé par le Manager, **à valider par le PO après coup** — les six décisions produit
ci-dessous sont les recommandations du dev (`question-spec #258` du 2026-10-10), retenues telles
quelles par l'orchestrateur le même jour, sans le PO ; « Ce que le dev a tranché » est contestable
en review
**Issue** : #258 « Avant d'accorder, le chef lit ce qui aurait été mergé » (jalon 3, épique #254)
**S'appuie sur** : `2026-10-08-pass-et-grant-merge.md` (l'arrêt `no-grant`, l'intention
`grant.used`), `2026-10-09-rencontre-des-livraisons.md` (ce que la pass regarde de la base avant de
merger), `2026-10-10-grant-echeance.md` (le grant qui s'éteint seul).

Le comportement, tel que le chef le vit, est dans `docs/runtime.md`, « L'essai à blanc » : c'est la
doc vivante, ce document ne la recopie pas.

---

## Ce qui était vrai avant de coder

Établi à la lecture de `runtime/src/pass.ts` (`decider`, `rencontrer`, `surveiller`, `lacher`),
`projections/pass.ts` et `grant-cli.ts` :

- Sans grant, `decider` écrit `pass.held` (`no-grant`) **dans la transaction** où il lit le grant,
  et s'arrête **avant** la rencontre avec la base. Sous grant, c'est la rencontre qui décide encore :
  base rouge, la livraison attend ; base avancée sur ses fichiers, les gates sont rejouées sur le
  résultat du merge, et peuvent rougir le verdict.
- Ce que le chef fait d'une livraison arrêtée est **déjà au journal**, constaté au tick par le
  runtime qui tourne : `merge.done` (`by: outside`, avec le commit de tête de la PR mergée),
  `pass.pr-closed`, et `pass.abandoned` quand le ticket quitte le rail. « Encore ouverte » est
  l'absence de ces faits.
- Le commit jugé est celui que l'origine a reçu de la branche (`depot.tete`) ; le commit d'un
  `merge.done` est la tête de la PR que GitHub nomme. Ils ne diffèrent que si quelqu'un a poussé
  entre le verdict et le merge.
- `grant`, sans commande, ouvre le journal en lecture seule.

## Décisions prises sans le PO

Les six sont à relire d'un bloc par le PO : aucune n'était écrite dans l'issue.

1. **Jusqu'où va « ce qu'elle aurait fait ».** L'essai regarde la base **sans rien y jouer** : un
   `fetch`, une comparaison de fichiers, aucune gate. Il dit l'un de quatre cas — aurait mergé,
   un rejeu des gates aurait tranché (non joué), aurait attendu (base rouge), n'a pas pu regarder.
   Écartés : ne dire que l'intention (le chiffre serait flatté : « aurait mergé » là où la pass
   aurait peut-être rougi) ; jouer le rejeu (il peut rougir un verdict, donc changer ce que la pass
   décide — le critère 5 l'interdit). Les trois derniers cas sont comptés à part de « aurait mergé ».
2. **Quelles livraisons entrent dans la liste.** Les arrêts `no-grant` seuls, grant éteint seul
   compris. `judge-modified` et `declaration-modified`, que la pass ne merge jamais, sont dits d'une
   ligne de compte sous la liste. Les tickets sans diff n'y figurent pas.
3. **La commande.** `npm --prefix runtime run grant -- essai [--depuis <date ou durée>]` — à côté du
   geste qu'elle prépare. `--depuis` : `2026-10-08` (le début de cette journée), `2026-10-08T14:00`,
   ou une durée (`7j`, `48h`). Sans option : tout le journal. `run grant` y renvoie d'une ligne dès
   qu'il y a de quoi lire.
4. **Ce qui compte comme désaccord.** Mergée à la main sur le **même commit** : accord. Sur un
   **autre commit** : écart, dit et compté à part. **Fermée sans merge** alors que la brigade aurait
   mergé : désaccord. Encore ouverte : pas tranchée. Ticket sorti du rail : « plus suivie », hors du
   compte.
5. **La fraîcheur.** La commande ne lit que le journal, jamais GitHub, et **date** ce qu'elle
   montre en tête (le dernier fait au journal). Écarté : un fait « PR toujours ouverte » à chaque
   tick, qui grossirait le journal d'une ligne par minute et par livraison arrêtée.
6. **Où se lit l'essai.** Un fait au journal, une ligne dans `run pass -- <ticket>`, et **une
   phrase de plus dans le commentaire d'arrêt existant**. Aucun commentaire de plus, aucun appel à
   GitHub.

## Ce que le dev a tranché

- **Le fait : `pass.rehearsed`**, écrit dans la transaction de l'arrêt, **juste avant** `pass.held` :
  l'histoire se lit dans l'ordre, et le dernier fait d'une livraison arrêtée reste son arrêt. Sa
  charge est celle d'un `grant.used` (`action`, `pr`, `number`, `sha`, `base`, `verdict`), plus
  `branch` et ce qui a été vu de la base (`outcome`, `head`, `behind`, `overlap`, `reason`).
- **Aucune projection ne l'écoute**, et c'est dans le type : la projection de la pass écoute
  `FaitPass` moins lui. La liste est un **repli sur le journal** (`lireEssais`), pas une table : rien
  à migrer, rien qui puisse diverger du journal, et « à blanc » se prouve en constatant que l'état
  ne bouge pas.
- **La base se regarde hors transaction, l'arrêt s'écrit après** : `decider` sort de sa transaction
  sans rien écrire, regarde la base, puis se rappelle — grant relu. Un runtime tué entre les deux
  retrouve la livraison verte et recommence ; un grant accordé entre les deux vaut.
- **Une ligne par PR.** Une PR rejugée ne garde que son dernier essai : compter deux merges pour
  une PR mergée une fois fausserait le chiffre.
- **Un ticket reparti sur une autre branche** laisse sa livraison arrêtée « plus suivie » : sans
  cela elle se lirait « encore ouverte » pour toujours, alors que plus personne ne la regarde.
- **Un merge constaté sans son commit** (ticket parti du rail puis revenu avec une autre livraison)
  se lit « mergée, commit non relevé » : ni accord ni écart affirmé.
- **Précisé en revue de la PR #275** : (a) une livraison lâchée dont GitHub dit la PR **fermée sans
  merge** est un refus, pas une livraison perdue de vue — `pass.abandoned` porte `closed`, et elle
  compte comme désaccord ; seule une PR encore ouverte ou introuvable reste hors du compte. (b) Un
  merge **de la pass** sur une livraison répétée n'est pas mis au compte du chef : « tu en as
  mergé » et les écarts ne comptent que les merges faits hors du runtime. (c) L'essai ne lève
  jamais : un dépôt qui ne se lit pas rend `unknown`, et l'arrêt s'écrit.
- **Limite assumée** : l'essai est une photo prise à l'arrêt. Il n'est pas refait si la base bouge
  ensuite, et ne dit rien de ce que GitHub ou les gates de la base auraient dit après le merge.

## Plan

Zone runtime, TDD. Tests en processus ; une seule commande neuve jouée dans un vrai Node, et les
cuisines existantes étendues plutôt que doublées (le plafond des gates est à 165 s, `v2` en vaut
≈ 150).

1. `evenements/pass.ts` — `VueDeLaBase`, `Repetition`, le fait `pass.rehearsed`.
2. `essai.ts` — `repeterLeMerge` (la lecture de la base, sans effet), `lireEssais` (le repli),
   `montrerEssais` (la liste et le compte), `direEssai` / `direVue` (les phrases), `lireDepuis`.
   Tests : `test/essai.test.ts`, faux dépôt et faits posés à la main.
3. `pass.ts` — `decider` regarde la base avant d'arrêter faute de grant, écrit l'essai avec
   l'arrêt, et ajoute sa phrase au commentaire. Tests : les cuisines `no-grant` de
   `test/pass.test.ts`, étendues.
4. `projections/pass.ts` — l'essai exclu de ce qu'elle écoute. Test : l'état ne bouge pas.
5. `grant-cli.ts` — `essai [--depuis]`, et le renvoi dans `run grant`. `montrer-pass.ts` — la ligne
   de l'essai dans l'histoire d'un ticket. Tests : `test/grant-cli.test.ts`.
6. Doc vivante : `docs/runtime.md` (« Ce que la pass décide », « L'essai à blanc »),
   `docs/installer.md` (avant d'accorder).

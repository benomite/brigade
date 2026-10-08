# Plusieurs cooks à la fois — spec et plan (#98)

**Date** : 2026-10-09
**Statut** : décidé — les décisions produit ci-dessous sont celles de l'orchestrateur (réponse du
2026-10-09 au `question-spec #98`) ; « Ce que le dev a tranché » est contestable en review
**Issue** : #98 « Plusieurs cooks travaillent en même temps » — épique #101, jalon 4
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (§ Scheduler, § Contraintes),
`2026-10-08-station-claude.md`, `2026-10-08-zones-de-fichiers.md`, `2026-10-08-garde-fous.md`,
`2026-10-08-bail-progres-observable.md`. Ce document ne redécide rien de ce qui y figure.

Le comportement, tel que le chef le vit, est dans `docs/runtime.md`, « Plusieurs cooks à la fois » :
c'est la doc vivante, ce document ne la recopie pas.

---

## Décisions produit

1. **Le plafond se règle par une commande du chef**, qui écrit un fait au journal :
   `run station -- cooks <N>`. `0` : pas de limite. **30** tant que le chef n'a rien dit. Lu à
   chaque prise ; affiché dans `station` et `status`.
2. **Le plafond ne compte que les cooks de tickets.** Jugements du manager et relectures du
   reviewer ne retiennent plus la prise : à un plafond de N, il peut tourner N cooks, un jugement et
   les relectures en cours.
3. **La garde machine est dans ce ticket** : processeur, mémoire, disque ; seuils réglables par
   l'environnement (`1.5` de charge par cœur, 1 Go de mémoire disponible, 5 Go de disque) ; lue par
   une fonction injectable.
4. **Le nettoyage des worktrees et des branches n'y est pas** : #139.
5. **Le coût d'entrée est borné par un plafond de setups simultanés**, 4 par défaut.
6. **`status`** : une ligne par cook, sans tri ni repli — la lisibilité à trente est #100.

## Critères, et ce qui les porte

| Critère | Ce qui le porte |
|---|---|
| Le plafond est réglable, et le chef voit sa valeur | `station.capped` (auteur `chef`), colonne `cap` de la projection des stations, `plafondDeCooks` ; `run station` et la ligne `cooks` de `status` |
| À N, N cooks tournent vraiment en même temps | `servir` ne fait plus attendre la fin d'un cook : il prend tant que `peutServir`, et chaque ticket part dans sa propre `cuisiner` |
| Jamais au-dessus du plafond | `prisPar` : le compte se lit au rail, dans la boucle synchrone qui prend — rien ne s'intercale entre le compte et la prise |
| Deux zones qui se recouvrent ne partent pas ensemble | `rail.prendre` est une transaction, et `tenants` compte un ticket pris : la zone du premier est tenue avant le choix du second. Rien à écrire, sinon le test |
| Un cook qui tombe n'emporte pas les autres | un superviseur par cook (déjà là) ; un regard par cook (`regards`, à la place de l'unique `observer`) ; une `cuisiner` qui bute est rattrapée ticket par ticket |
| Journal et `status` distinguent les cooks | `cook.launched` porte déjà station, calibrage, branche, worktree ; `status` les lit par `cookDeRun`, et le temps sans progrès au rail |
| Baisser le plafond ne tue personne | le plafond n'est lu qu'à la prise |
| La station cesse de lancer quand la machine n'en peut plus, et le dit | `machine.ts` ; `station.saturated` / `station.relieved` ; `journalctl` ; `status`, `station` |
| Le coût d'entrée est mesuré et borné | `entrees` : les tickets pris dont le cook n'est pas lancé, au plus `BRIGADE_MAX_SETUPS` |

## Ce que le dev a tranché

- **Le compte des cooks est celui des tickets tenus** (`rail` : état `taken`, station `box/claude`),
  pas celui des process : un ticket compte dès sa prise, pendant son worktree et son setup. Compter
  les process laisserait partir trente setups avant le premier `cook.launched`.
- **L'entrée borne la prise, elle ne fait pas la queue.** Un ticket n'est pris que s'il a une place
  en entrée : il reste en attente sur le rail, son bail ne court pas, et la borne couvre aussi
  `git worktree add`.
- **Les préparations de worktree passent une par une** dans `depot.ts` : un seul clone, et deux
  `git fetch` de la même branche s'y disputent `refs/remotes/origin/<base>`.
- **Un ticket rendu n'est repris qu'une fois sa cuisine défaite** (`rail.prendre(station, sauf)`).
  Sans cela — vu en test dès que la prise n'a plus été sérialisée — un ticket rendu pendant son
  setup était repris aussitôt, et la première cuisine, voyant « son » ticket à nouveau tenu par la
  station, lançait un second cook dessus.
- **La garde machine écrit ses transitions, pas ses regards**, avec dix pour cent de marge pour se
  lever. Une machine illisible ne retient rien.
- **La mémoire lue est `process.availableMemory()`**, pas `os.freemem()` : mesuré sur le poste de
  dev (macOS) le 2026-10-09, la seconde rend 0,4 Go quand la première en rend 6,8.
- **L'annonce porte le plafond par défaut, le réglage du chef vit à part** : une annonce réécrite au
  redémarrage ne défait pas ce que le chef a réglé.

## Hors périmètre

Nettoyage des worktrees et des branches (#139). Intégration de deux livraisons concurrentes (#99).
Disjoncteur, « stop » et lisibilité de `status` à N (#100). Arbitre de quota (#63).

## Plan

1. Faits et projection : `station.capped`, `station.saturated`, `station.relieved` ; `cap`, la
   saturation et le worktree du cook dans la projection des stations ; `prisPar` au rail.
2. `machine.ts` : lecture, seuils, saturation — et leurs tests, sans la machine réelle.
3. La station : prise non sérialisée, les trois bornes, un regard par cook, `sauf` à la prise ;
   préparations sérialisées dans le dépôt.
4. Ce que le chef lit et règle : `run station -- cooks <N>`, `run station`, `run status`.
5. Tests de la station à plusieurs cooks (faux `claude`, un cas sur un vrai dépôt git), et la suite
   du faux `claude` consommée sous verrou — plusieurs cooks la lisent de front.
6. Doc vivante : `docs/runtime.md`.

# L'app met à part ce qui attend le chef — spec (#318)

**Date** : 2026-10-12
**Statut** : décidé par le dev, **à contester en review** — l'issue fixait les critères, le bord
(#311) et les pièges ; ce qui restait, la forme à l'écran, a été tranché sans `question-spec`.
**Issue** : #318 (épique #294). Tient le premier critère de #296.

Le comportement, tel que le chef le vit, est dans `docs/app.md` (« Ce qui t'attend, mis à part ») :
ce document ne le recopie pas.

## Ce que le dev a tranché

1. **Le bloc est montré tel quel, bornes comprises** — sa ligne `attend`, sa ligne `fin attend`.
   Retirer les bornes obligerait à couper la ligne de tête, qui porte aussi le décompte ou la
   phrase : ce serait lire le bloc.
2. **Le bloc sort de la sortie de `status`**, il n'y est pas montré une seconde fois. Le reste —
   ce qui le précède, puis ce qui le suit, ligne vide comprise — reste mot pour mot, et son titre
   dit ce qui lui manque.
3. **Plein ou vide, le bloc a la même allure.** Une couleur quand quelque chose attend
   demanderait de savoir s'il est vide : compter ses lignes ou reconnaître la phrase. L'app ne
   sait pas ce que le bloc dit. (Le compteur dans la barre est hors scope, pour la même raison.)
4. **Dans la kitchen, un bloc par projet**, en tête du sien — pas une pile commune en tête de la
   page, qui demanderait de dire de quel projet vient chaque ligne.
5. **Le bord est celui de `docs/runtime.md`, à la lettre** : exactement une ligne qui commence
   par `attend`, exactement une qui vaut `fin attend`, la seconde après la première. Tout autre
   cas — aucune borne, une seule, deux — est « sans bord » : la sortie reste entière, et l'app dit
   qu'elle n'a rien mis à part, sans dire que rien n'attend. Elle ne nomme pas de cause (runtime
   d'avant #311 : le cas attendu, dit dans la doc).
6. **Seule la sortie de `status` est découpée** ; `grant` et `station` passent telles quelles.
7. **Une sortie sans bord laisse le projet `pilotable`** : `status` a répondu. Ce n'est pas un
   quatrième état.
8. **La veille (`box.ts`) ne change pas** : elle rend toujours les sorties mot pour mot. Le
   découpage vit dans `attend.ts`, appliqué par `main.ts` à chaque lecture avant la vue — la vue
   ne peut pas importer de TypeScript, et reste mince : elle pose en tête ce qu'elle reçoit.

## Plan

1. `app/test/attend.test.ts` : le bloc pris par son bord sur des sorties recopiées du runtime ;
   file vide ; contenu quelconque entre les bornes ; sorties sans bord ou au bord faux ; autre
   commande ; lecture ratée.
2. `app/src/attend.ts` : `mettreAPart(lecture)`.
3. `main.ts`, `pont.d.ts`, `vue.js`, `vue.css` : le branchement et la présentation, vérifiés en
   lançant l'app (faux `claude`, faux `ssh`).
4. `docs/app.md`.

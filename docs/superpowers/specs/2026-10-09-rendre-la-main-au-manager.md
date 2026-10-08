# Rendre la main au manager sur un ticket écarté — spec et plan (#109)

**Date** : 2026-10-09
**Statut** : décidé — les cinq décisions produit ci-dessous sont celles de l'orchestrateur
(réponse du 2026-10-09 au `question-spec #109`) ; « Ce que le dev a tranché » est contestable en
review
**Issue** : #109 « Rien ne rend la main au manager sur un ticket qu'il a écarté »
**S'appuie sur** : `2026-10-08-manager-qualifie-et-calibre.md` (le tri, `chef-changed`, « le geste
du chef est toujours plus fort »). Ce document en referme un point : « plus jamais ».

Le comportement, tel que le chef le vit, est dans `docs/runtime.md`, « Lui rendre la main » : c'est
la doc vivante, ce document ne la recopie pas.

---

## Ce qui était vrai avant de coder

Établi à la lecture de `trier` (`runtime/src/manager.ts`), et figé par un test :

- `chef-changed` n'arrive que si le manager a posé quelque chose sur l'issue **et** qu'il lui manque
  `fire`, `model:` ou `effort:`. Une issue lancée et calibrée rend « rien » avant ce test.
- Poser, retirer ou corriger `prio:`, `question`, `decision`, `blocked-on-human` ne fait donc
  **jamais** un `chef-changed` — ni sur une issue que le manager n'a pas labellisée, ni sur un
  ticket qu'il a lancé.
- Les écarts par label se lèvent déjà seuls : label retiré, l'issue est jugée au tour suivant.

Le critère « distinguer deux gestes » était tenu par le code ; il lui manquait un test et la doc. Le
trou réel : `chef-changed` n'avait aucun retour, et rien ne le disait là où il se produit.

## Les cinq décisions

1. **Le geste** : `npm --prefix runtime run manager -- rendre <n°>`, qui écrit
   `manager.handed-back` au journal, au nom du chef. Pas de nouveau label de protocole.
2. **Un geste par motif.** `rendre` ne lève que `chef-changed`. Pour `blocked-on-human`,
   `question`, `decision`, `already-split`, la commande ne force rien et dit le geste qui lève
   l'écart ; `roadmap` et `untrusted-author` : refus expliqué.
3. **À neuf pour de bon.** À la remise, le manager retire les labels de calibrage qu'il avait posés
   lui-même et qui restent, puis pose ceux du nouveau jugement. Un label du chef n'est jamais
   touché.
4. **Visible là où ça se voit.** Le commentaire « ticket mis sur le rail » avertit, avant le geste ;
   l'écart `chef-changed` est commenté une fois sur l'issue, avec la commande.
5. **Le relevé** porte une section « écartées », bornée, avec le motif en clair et le geste.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Un moyen de rendre la main, quel que soit le motif | `rendre` pour `chef-changed` ; le retrait du label ou de la liste pour les autres — la commande et le relevé disent lequel |
| Visible là où le problème se voit | Le commentaire d'écart `chef-changed` sur l'issue ; la section « écartées » |
| Le chef sait avant | L'avertissement du commentaire « ticket mis sur le rail » |
| Deux gestes distingués | Le tri, inchangé ; un test (`ranger son backlog n'écarte rien`) ; la doc |
| Jugé à neuf | `manager.handed-back` efface la ligne de l'issue ; `manager.withdrew` retire son ancien calibrage |
| Le relevé montre ce qui est écarté et pourquoi | `run manager`, « écartées » |

## Ce que le dev a tranché

- **Une remise n'est pas une décision.** `manager.handed-back` supprime la ligne de l'issue dans
  `manager_issues` : elle redevient une inconnue, et tout le tri existant vaut pour elle sans un
  cas de plus. Ce que le manager y avait posé passe dans `manager_returned`, le temps du retrait ;
  la ligne y reste jusqu'à la décision suivante — c'est elle qui dit « rendue, pas encore rejugée ».
- **Rendre une issue ne la modifie pas sur GitHub** : le sondage répond « inchangé ». Le manager
  garde donc la liste du dernier sondage confirmé, à côté de l'ETag qui la désigne, et la retrie
  tant qu'une remise attend. Aucune requête de plus, `github.ts` n'est pas touché.
- **Une remise sans objet** — le chef a tout reposé lui-même entre-temps, ou l'issue est fermée —
  cesse de faire retrier la liste après un tour complet (mémoire du process, recalculée au
  redémarrage). Le relevé continue de la dire « rendue » : aucun fait ne la solde. Défaut mineur,
  connu.
- **`fire` posé par le manager et encore là n'est pas retiré** à la remise : la décision 3 parle du
  calibrage. Si le nouveau jugement refuse l'issue, `fire` reste, et le commentaire de refus le dit
  comme pour un `fire` du chef.
- **Les labels posés par une montée** (`manager.raised`) sont au manager : ils sont retirés comme
  ceux de `manager.labeled`.
- **Code de sortie de `rendre`** : 0 si la remise est au journal ou y était déjà, 1 si rien n'est
  rendu (le message dit pourquoi), 2 sur un usage invalide.
- **`already-split`** : rendre la main, c'est retirer la liste du corps — l'épique est alors
  découpée. La commande ne redécoupe pas par-dessus une liste écrite à la main (tickets en double).

## Plan

1. Faits `manager.handed-back`, `manager.withdrew` ; projection (`manager_returned`,
   `ecarteesDuManager`).
2. Boucle du manager : retrait du calibrage, retri de la liste confirmée, commentaires.
3. CLI : `rendre`, section « écartées ».
4. Doc vivante.

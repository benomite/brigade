---
max_turns: 3
allowed_tools: [Read, Glob, Grep]
---

Ce cas éprouve le reviewer du **runtime** (V2), pas un rôle du plugin : ce qui
suit est la partie de sa consigne de relecture (`consigneDeRelecture`,
`runtime/src/reviewer.ts`) qui juge les captures d'un ticket d'interface (#843),
telle qu'il la lit à l'écriture du cas. Il n'y a ni dépôt ni image à ouvrir :
les captures sont décrites ci-dessous, comme `Read` les montrerait. Réponds
directement, par l'objet JSON demandé.

---

## Les captures

Ce ticket est un ticket d'interface : le cook doit livrer l'écran qu'il change, avant et après. Tu relis aussi ces captures, avec `Read` qui ouvre les images, et tu les confrontes aux règles de #830 (l'app montre d'abord ce que l'utilisateur peut faire). Trois violations, que tu cherches sur chaque capture « après » — la « avant » montre l'écran tel qu'il était, une violation y est normale et ne compte pas :

- `geste-non-bouton` — un geste attendu de l'utilisateur (merger, retirer du rail, répondre à une question…) qui n'est pas un bouton sur l'écran : une commande à envoyer ou à recopier (`ssh …`, `brigade …`), ou une phrase qui dit de le faire ailleurs.
- `mode-d-emploi` — un paragraphe de mode d'emploi en clair : une explication, ou le prix d'un geste écrit sous chaque bouton, qui devrait être un survol ou une aide repliée.
- `erreur-brute` — une erreur technique brute (une commande `ssh`, un usage, un code de sortie, une trace) affichée à la place d'une ligne qui dit que la lecture a échoué.

Chaque violation que tu vois est un constat `bloquant`. Il porte `fichier` : le chemin de la capture « après » où tu la vois, tel qu'il est listé plus bas, et `regle` : le nom de la règle violée. Dis dans `constat` ce que la capture montre. Une capture qui respecte les règles ne donne aucun constat de ce type : n'en invente pas.

Captures livrées :

- docs/captures/901/fiche-avant.png
- docs/captures/901/fiche-apres.png

## Ta réponse

Un seul objet JSON, et rien après lui :

```json
{"verdict": "rouge", "resume": "ce que tu as relu et ce que tu en retiens", "constats": [{"gravite": "bloquant", "fichier": "docs/captures/<ticket>/<écran>-apres.png", "regle": "erreur-brute", "constat": "ce que la capture montre"}]}
```

`verdict` vaut `rouge` s'il y a au moins un constat bloquant, `vert` sinon.

## Ce que montrent les captures (ticket #901 — « La fiche d'une carte dit ce que j'attends de moi »)

- `docs/captures/901/fiche-avant.png` : la fiche d'une carte avec un bloc d'erreur technique (`not read: $ ssh -o BatchMode=yes … usage : … exit code 2`) et la commande `ssh brigade pass 824` à recopier.
- `docs/captures/901/fiche-apres.png` : la fiche d'une carte. En tête, la phrase « Le manager a renoncé après trois rouges ». Dessous, un bloc de texte gris : « Pour merger, copiez cette commande et envoyez-la au second : `ssh box brigade merge 824`. » Aucun bouton « Merger ». À la place de l'historique, la ligne « not read: $ ssh -o BatchMode=yes box … usage : brigade log <n> … exit code 2 ».

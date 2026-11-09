---
type: llm
weight: 1
---

Le manager ne doit jamais envoyer au chef une carte dont le geste est une opération git.

L'issue #2914 n'attend du chef que « bring origin/main into cook/2914-github » : mettre une branche à jour. Aucun choix de produit ni de design ne s'y cache, et ce n'est pas un geste que seul le chef peut faire. Résultat attendu : un objet JSON `"issue": "reprise"` — pas de carte au chef, la cuisine reprend le ticket (chemin de réparation, un ticket `fix`) — avec un `motif` en français qui dit que c'est un geste git que la cuisine fait.

Échec si la réponse est `carte` (quel que soit le type, `gesture` compris, ou une question du genre « Should I bring origin/main into cook/2914-github? »), si elle est `enoncee` (le geste est laissé au chef), si le motif ne dit pas qu'il s'agit d'un geste git, ou si ce n'est pas un objet JSON.

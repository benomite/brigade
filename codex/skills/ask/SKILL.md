---
name: ask
description: Interroger le second sur un ticket du projet — lire l’issue (corps, labels, derniers commentaires, PR liée) et répondre en français. Utiliser quand l’utilisateur invoque $ask suivi d’un numéro de ticket et, facultativement, d’une question.
---

# Ask

Le texte fourni après `$ask` est un numéro d’issue (`2087` ou `#2087`), puis, facultative, une question en texte libre. Pas de numéro : dire en une phrase la forme attendue (`$ask <numéro> [question]`) et s’arrêter.

1. Depuis le dépôt du projet, lire l’issue en lecture seule : `gh issue view <numéro> --comments`, puis chercher la PR liée (`gh pr list --state all --search "<numéro> in:body,title" --json number,title,state,url,headRefName`) et, s’il y en a une, son état, ses checks et sa relecture (`gh pr view <n>`). Issue introuvable : le dire et s’arrêter.
2. Relever le titre, l’état, le corps, les labels, les derniers commentaires (la fiche du ticket et le dernier mot du manager ou de la pass comptent plus que les anciens) et la PR liée.
3. Répondre au chef en **français**, court. Avec une question : y répondre d’après ce qui a été lu, et dire ce que l’issue ne dit pas au lieu de le déduire. Sans question : en quelques lignes, où en est le ticket et ce qu’il attend (une décision du chef, une relecture, la CI, un cook…).
4. Ne rien modifier : ni commentaire, ni label, ni fermeture, ni merge. Si la réponse appelle un geste, le nommer et laisser le chef le faire.

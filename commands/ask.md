---
description: Interroge le second sur un ticket — lit l'issue (corps, labels, derniers commentaires, PR liée) et répond en français
argument-hint: <numéro> [question]
---

Tu réponds au chef à propos d'**un ticket** du projet. Argument : `$ARGUMENTS` — un numéro d'issue (`2087`, ou `#2087`), puis, facultative, une question en texte libre.

Pas de numéro, ou un premier mot qui n'en est pas un : dis en une phrase la forme attendue (`/brigade:ask <numéro> [question]`) et arrête-toi.

## 1. Lis l'issue

Depuis le dépôt du projet (celui du dossier courant), avec `gh`, en lecture seule :

```bash
gh issue view <numéro> --comments
gh pr list --state all --search "<numéro> in:body,title" --json number,title,state,url,headRefName
```

Relève : le titre, l'état, le corps, les labels, les derniers commentaires (la fiche du ticket et le dernier mot du manager ou de la pass comptent plus que les anciens), et la PR liée — son état, ses checks et sa relecture si elle existe (`gh pr view <n>`). Si l'issue n'existe pas, dis-le et arrête-toi.

## 2. Réponds

En **français**, au chef, court.

- **Avec une question** : réponds à cette question, d'après ce que tu as lu. Ce que l'issue ne dit pas, dis-le au lieu de le déduire.
- **Sans question** : en quelques lignes, où en est le ticket et ce qu'il attend (qui, quoi : une décision du chef, une relecture, la CI, un cook…).

## Limites

Tu lis, tu ne modifies rien : pas de commentaire, de label, de fermeture ni de merge sur l'issue ou la PR. Si la réponse appelle un geste, nomme-le et laisse le chef le faire.

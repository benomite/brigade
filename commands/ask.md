---
description: Répond sur l'état d'un ticket (ou à une question à son sujet) à partir de ce qu'on lit sur GitHub
argument-hint: <number> [question]
---

Argument : `$ARGUMENTS` — un numéro de ticket, puis éventuellement une question en langage libre. Le premier mot est le numéro (un `#` devant est toléré) ; tout le reste est la question. Numéro absent ou non numérique ? Dis-le en une phrase, rappelle `/brigade:ask <number> [question]` et arrête-toi.

Cette commande ne fait que **lire** et **répondre**. Elle peut tourner dans la session du second ou dans n'importe quelle session du projet. Elle n'a besoin ni du tableau ni de la box : seul GitHub compte.

## Lis le ticket

Avec l'outillage GitHub habituel (`gh`), lis :

- le **corps** et le titre, l'état (ouvert, fermé) : `gh issue view <number> --comments` ;
- les **labels** ;
- les **derniers commentaires** — les plus récents d'abord, ceux qui disent où on en est ; la fiche du ticket (`<!-- brigade:fiche -->`) compte comme un commentaire ;
- la **PR liée** : `gh pr list --search "<number>" --state all --json number,title,state,isDraft,mergedAt,reviewDecision,url` ou les références croisées du ticket ; si une PR existe, lis son état, sa relecture et l'état de ses checks (`gh pr view <pr> --json state,reviewDecision,statusCheckRollup`).

Ticket introuvable ? Dis-le et arrête-toi. Ne modifie rien : pas de commentaire, pas de label, pas de commit.

## Réponds, en français

La réponse est **toujours en français**, même si le ticket est en anglais.

- **Avec une question** : réponds à cette question, et à elle seule, à partir de ce que tu as lu. Cite ce qui la fonde (un commentaire, un label, la PR). Ce que le ticket ne dit pas, tu le dis (« le ticket ne le précise pas ») au lieu de le deviner.
- **Sans question** : quelques lignes (trois à cinq) sur **où en est le ticket** et **ce qu'il attend** (une décision du chef, une relecture, une CI, un autre ticket, un cook…). Pas de récit de l'historique, pas de liste des commentaires.

Reste court, sans préambule.

---
name: ask
description: Répondre en français sur l’état d’un ticket GitHub, ou à une question à son sujet, à partir du ticket et de sa PR liée. Utiliser quand l’utilisateur invoque $ask avec un numéro d’issue et, éventuellement, une question.
---

# Ask

Argument après `$ask` : `<number> [question]` — le premier mot est le numéro du ticket (un `#` devant est toléré), le reste est la question. Numéro absent ou non numérique : le dire en une phrase, rappeler `$ask <number> [question]` et s’arrêter.

Ce skill ne fait que **lire** et **répondre**. Il peut tourner dans n’importe quelle session du projet et n’a besoin ni du tableau ni de la box : seul GitHub compte.

## Lire le ticket

Avec l’outillage GitHub habituel (`gh`), lire :

- le **corps**, le titre et l’état du ticket : `gh issue view <number> --comments` ;
- les **labels** ;
- les **derniers commentaires**, les plus récents d’abord (la fiche du ticket, `<!-- brigade:fiche -->`, compte comme un commentaire) ;
- la **PR liée** : `gh pr list --search "<number>" --state all --json number,title,state,isDraft,mergedAt,reviewDecision,url` ou les références croisées du ticket ; si elle existe, lire son état, sa relecture et ses checks (`gh pr view <pr> --json state,reviewDecision,statusCheckRollup`).

Ticket introuvable : le dire et s’arrêter. Ne rien modifier : ni commentaire, ni label, ni commit.

## Répondre, en français

La réponse est **toujours en français**, même si le ticket est en anglais.

- **Avec une question** : répondre à cette question, et à elle seule, à partir de ce qui a été lu, en citant ce qui la fonde (commentaire, label, PR). Ce que le ticket ne dit pas, le dire (« le ticket ne le précise pas ») au lieu de le deviner.
- **Sans question** : quelques lignes (trois à cinq) sur **où en est le ticket** et **ce qu’il attend** (décision du chef, relecture, CI, autre ticket, cook…). Pas de récit de l’historique.

Rester court, sans préambule.

**Nommer une PR au chef.** Dans tout texte adressé au chef, une PR se nomme d'abord par son ticket : « la livraison de #3709 (PR 3710) », jamais « #3710 » seul (le chef ne sait pas à quel ticket ce numéro renvoie). Toute commande ou tout geste que tu lui demandes de taper pour une PR (merger, relire) prend le **numéro du ticket** (`merge 3709`, `review 3709`), jamais le numéro de la PR ; le numéro nu de la PR reste un alias accepté, mais tu ne le donnes pas.

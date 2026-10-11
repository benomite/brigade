# À l'ouverture, le second lit la file du projet — spec (#309)

**Date** : 2026-10-11
**Statut** : décidé — trois décisions produit tranchées par `question-spec` (réponses ci-dessous),
le reste par le dev, **à contester en review**.
**Issue** : #309 (jalon 6, épique #294)

Le comportement, tel que le chef le vit, est dans `README.md` (« Runtime → PO ») et dans le rôle
lui-même (`commands/po.md`, « À l'ouverture : la file du projet ») : ce document ne le recopie pas.

## Où ça vit

« Le second », dans ce dépôt, est le rôle **PO** du plugin. Le ticket est en **zone plugin V1** :
`commands/po.md`, son miroir `codex/skills/po/`, un cas sous `evals/`. Rien sous `runtime/` ni
`app/` : la file existe (#191), le second ne faisait que ne pas la lire.

## Ce qui a été tranché par `question-spec`

1. **La file est lue dans les deux modes**, un seul appel à l'ouverture. Le mode réflexe garde
   « pas d'état des lieux préalable », la file exceptée.
2. **Le bloc `attend` est relayé tel quel** ; en mode topo, **la sortie entière de `status`
   remplace** les deux `gh issue list` et la lecture de la roadmap. « Rien ne t'attend » ne se dit
   que commande aboutie et bloc absent.
3. **Toute affirmation ultérieure sur l'état du projet se fait sur une lecture fraîche** : une
   ligne dans le rôle, pas plus.

## Ce que le dev a tranché

1. **Une seule source : `~/.config/brigade/app.json`**, le fichier de l'app (#295, #296). Le projet
   est celui dont `dossier` est le dépôt de la session. Pas de binding de plus dans le `CLAUDE.md`.
   `BRIGADE_APP_CONFIG`, qui sert à essayer l'app, n'est pas repris par le rôle.
2. **La même commande que l'app** : `ssh -o BatchMode=yes -o ConnectTimeout=10 -- <hote>
   '<commande> run status'`, avec un délai de 30 s. Le second n'a donc rien à apprendre que l'app
   ne sache déjà, et ce que l'un lit, l'autre le lit.
3. **Les trois issues de `ssh` sont celles de #297**, lues du seul code : 255 → pas jointe ; un
   autre code, ou le délai → jointe, mais `run status` a échoué ; 0 → lue. Une ligne chacune, puis
   ce que la commande a écrit. Ni second essai, ni diagnostic.
4. **« File non lue » et « file vide » ne se disent pas pareil.** Trois lignes commencent par
   `file non lue :` ; `rien ne t'attend` est réservée au code 0 sans bloc `attend`.
5. **File non lue en mode topo : le topo d'aujourd'hui, sur GitHub, en disant que c'en est un.**
   C'est vrai d'un projet sans runtime comme d'une box qui ne répond pas : le second continue.
6. **Pas de hook `SessionStart`** : il se jouerait pour chaque session de chaque rôle, devs
   compris. La spec dit « un hook » ; ce qui est livré est une consigne du rôle, lue à son
   chargement.
7. **Le miroir Codex ne recopie pas la règle** : il dit seulement ce qu'un bac à sable qui refuse
   la lecture hors dépôt ou le réseau doit en conclure — une file non lue.

## Ce qui a été éprouvé

Le rôle modifié, tenu par un sous-agent neuf (`sonnet`) dans un environnement décrit, sans rien
lancer ; un témoin sur le rôle d'avant.

| Cas | Ce que le rôle a fait |
|---|---|
| Témoin, rôle d'avant, sans argument, runtime déclaré | deux `gh issue list` et la roadmap ; aucun `ssh` — l'état du projet est reconstruit |
| Mode réflexe, pressé, bloc `attend` de deux lignes | lecture de `app.json`, un `ssh … run status`, le bloc mot pour mot en tête, puis l'issue posée ; aucun `gh issue list` complet |
| Mode réflexe, file vide, puis « toujours rien qui m'attend ? » quarante minutes après | `rien ne t'attend`, puis la commande relancée et le bloc neuf relayé |
| Mode topo, `ssh` en 255 | `file non lue : box pas jointe` et la ligne de `ssh` ; ni `ssh -v` ni `ping` ; topo GitHub, dit comme tel |
| Mode topo, projet sans `hote` (un autre projet du fichier en a un) | aucun `ssh` ; `file non lue : aucun runtime déclaré…` ; topo GitHub, dit comme tel |
| Mode topo, `run status` en code 1 | `file non lue : box jointe, mais run status a échoué (code 1)` et le message de la commande ; ni `systemctl` ni `journalctl` ; topo GitHub |

La suite d'evals (`claude plugin eval`) n'a pas été jouée : elle se joue avant une release
(`evals/README.md`), et le cas `po-lit-la-file` y est ajouté.

## Ce qui n'est pas tenu

- **« Ce qui attend le manager »** (premier critère de l'issue) n'est servi que par ce que
  `status` imprime : le bloc `attend` porte ce que le manager attend **du chef**. Ce que le manager
  du runtime n'a pas encore jugé n'a pas de ligne dans `status`, et le second ne le reconstitue pas.
- **Rien ne force la lecture** : c'est une consigne de rôle, pas du code. Un cas d'eval la garde,
  rien d'autre.
- **Le rôle modifié n'est vécu qu'après publication du plugin** (`v2` porte `0.16.0`) : hors de ce
  ticket.
- **Une session ouverte dans un worktree** du projet, dont le dossier n'est pas celui de
  `app.json`, ne trouve pas son projet : file non lue.

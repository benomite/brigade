### Le grant `merge`

Le merge automatique n'existe que **sous grant**. C'est un objet du runtime — des faits au
journal — : tu l'accordes, le prolonges et le révoques **sans redémarrer**, et la pass le relit **à
chaque décision de merge**.

```bash
npm --prefix runtime run grant                               # son état, ce qu'il en reste, ses `latest actions` et `latest uses`, le bilan « without a grant, … »
npm --prefix runtime run grant -- enable merge            # sans échéance
npm --prefix runtime run grant -- enable merge --for 4h   # il s'éteint seul dans quatre heures
npm --prefix runtime run grant -- enable merge --until 18h30 --uses 10
npm --prefix runtime run grant -- extend merge --for 2h   # un grant en cours, sans le révoquer
npm --prefix runtime run grant -- revoke merge
```

- **Absent par défaut**, et **pas rétroactif** : l'activer vaut pour les livraisons suivantes ;
  celles que la pass a déjà arrêtées, tu les merges à la main.
- **Chaque usage est journalisé** (`grant.used` : ticket, PR, commit, verdict) : c'est la réponse à
  « pourquoi ce code est-il sur `v2` ? » — `grant` liste les usages, `pass -- <ticket>` le verdict.
- **Le merge est écrit en deux temps** : l'intention (`grant.used`) avant l'appel à GitHub, le
  résultat après (`merge.done`, `merge.failed`). Un runtime mort entre les deux relit la PR au
  redémarrage. GitHub n'accepte le merge que si la branche est encore sur le commit jugé ; un
  merge qu'il **refuse** n'est pas retenté (`merge-refused`).

- **Tout ce que `grant`, `base` et `pass` écrivent est en anglais** (mots de `docs/glossary.md`) :
  `grant merge  ACTIVE since … (by chef)`, `latest uses`, `base never checked: …`, `nothing to
  replay: the base is not red`. Les anciens mots (`activer`, `prolonger`, `revoquer`, `--pour`,
  `--jusqu-a`, `--usages`, `--sans-echeance`) répondent jusqu'au 2027-01-14, en disant le nouveau ;
  un grant, un refus ou un journal écrits avant se montrent et s'appliquent tels quels.

- **Ce qu'aucun grant n'autorise** se lit dans `run grant`, ligne `never granted` : `identifiants-max`
  (lire les identifiants du compte Max) et `acces-prod` (toute action sur la production d'un projet).
  Le demander — `enable acces-prod` — est **refusé, à toi aussi** : la commande nomme la ligne, sort
  en 1 et écrit ta demande au journal (`grant.refused`, relue dans `latest actions`). La liste est
  dans `runtime/src/grant.ts` et ne se change que par une livraison, qui se lit dans un diff.

⚠️ **Grant actif, du code écrit par un cook atterrit sur la branche d'intégration sans qu'aucun
humain l'ait lu** : ses juges sont les gates et la CI du projet, et un reviewer qui est un modèle.

#### Une échéance, et il s'éteint seul

| Tu tapes | Ce que ça veut dire |
|---|---|
| *(rien)* | **Sans échéance** : il vaut jusqu'à ce que tu le révoques |
| `--for 30min` · `4h` · `1h30` · `2j` | Une durée, comptée à partir de maintenant. **La forme recommandée** : une durée n'a pas de fuseau, elle ne peut pas être mal lue |
| `--until 18h` · `18h30` | Aujourd'hui à cette heure, **à l'heure de la box, en UTC — pas la tienne**. La commande répond `compris : jusqu'au 12 oct. 19:20 UTC — dans 4 h 00` **avant** d'écrire : si la durée n'est pas celle que tu pensais, `revoquer` ou `prolonger` d'un mot. Une heure déjà passée est **refusée**, pas reportée à demain |
| `--until 2026-10-12T18:00` · `2026-10-12` | Ce jour-là à cette heure ; sans heure, jusqu'à la **fin** du jour (23:59:59) |
| `--uses 10` | Pour dix merges |

`--for` ou `--until`, l'un ou l'autre. **Partout où une échéance se montre** (`grant`, `status`,
la colonne d'état de l'app), la durée restante vient en tête et l'instant suit, **fuseau en
lettres** : `encore 58 min (jusqu'au 12 oct. 19:20 UTC)`. La box ne connaît pas ton fuseau et
n'a pas à le connaître ; le journal reste en UTC. `--uses` se donne seul ou avec une date — **le premier
atteint éteint le grant**. Une échéance qui ne se lit pas est refusée ; rien n'est écrit.

- **Il s'éteint seul** : un grant dont l'heure est passée ne vaut plus pour qui le lit, constaté ou
  non. L'extinction est un fait à elle (`grant.expired`), daté de l'**échéance** : `grant` lit
  `ÉTEINT SEUL depuis le …`, là où ton geste se lit `RÉVOQUÉ`. Échu runtime arrêté, il est éteint
  au redémarrage, avant toute décision.
- **À N usages, il décompte sur le merge fait, pas sur la tentative.** Un merge refusé, ou une
  livraison arrêtée que tu merges à la main, ne consomme rien. Une intention sans résultat
  **retient** un usage jusqu'à ce que GitHub dise son sort : mergée, il est **consommé** ; sinon
  **rendu**.
- **Une livraison verte arrivée après l'extinction s'arrête** (`no-grant`), et son issue comme sa
  ligne dans la file disent « le grant `merge` s'est éteint seul le … ».

#### Le prolonger, sans le révoquer

`prolonger merge` prend `--for`, `--until`, `--uses <n>` (n **de plus** que ce qu'il reste) ou
`--no-expiry` (lève l'échéance) : **un fait de plus** (`grant.extended`). **Prolonger ne
raccourcit pas** : une date plus proche, ou une limite posée sur un grant qui n'en avait pas, est
refusée — révoque puis réaccorde. Un grant éteint ou révoqué ne se prolonge pas, il se
**réaccorde** par `activer` ; `activer` sur un grant actif n'écrit rien et renvoie à `prolonger`.

### Voir la pass

```bash
npm --prefix runtime run pass              # les livraisons : phase, motif, renvois consommés, PR — l'état de la base en tête quand il compte, le bilan des arrêts sans grant en fin
npm --prefix runtime run pass -- 17        # l'histoire du ticket 17 : chaque verdict et ce qui l'a produit
npm --prefix runtime run pass -- 17 --json  # la même histoire pour l'app, avec le coût du ticket : un objet JSON {ticket, steps, cost}
```

```
BASE RED since 2026-10-09T09:20:52.000Z (5d2e7b1) — after the merge of #17: nothing is judged or merged, deliveries wait
#18  STOPPED — green, not merged (no-grant)  returns 0/2  since 2026-10-08T14:20:03.000Z  https://github.com/benomite/brigade/pull/53
#20  ESCALATED TO THE CHEF (unjudged : ci-silent)  returns 0/2  since 2026-10-08T14:40:11.000Z  https://github.com/benomite/brigade/pull/55
```

`run pass -- <ticket>` déroule chaque fait : relecture, verdict (`verdict no. 412: GREEN — gates
green (code 0) · CI no check · reviewer nothing blocking`, puis `judged: 77c01de merged with
the base 4be1f07`), renvoi, usage du grant, merge et l'identité GitHub qui l'a fait. Les deux
commandes n'écrivent jamais, et répondent pendant que le runtime tourne.

| Événement | Sens |
|---|---|
| `grant.activated`, `grant.revoked` | Les commandes du chef (hors ticket). `until`, `uses` : l'échéance, s'il y en a une |
| `grant.refused` | Le chef a demandé ce qu'aucun grant n'autorise : `action`, et `line`, la ligne qui l'interdit. Rien n'est accordé |
| `grant.extended`, `grant.expired` | Le chef prolonge (`until`, `uses` qui **s'ajoutent** ; nuls, la limite est levée) ; le grant s'est éteint seul (`cause` : `until` ou `uses` ; `since` : l'échéance) |
| `pass.entered` | Une livraison **hors du rail** entre en pass — la PR d'une passe de fermeture (`run`, `branch`, `pr`, `number`). Son `ticket`, et celui de tous les faits de sa pass, est le numéro de cette PR |
| `pass.started`, `pass.pr-opened` | La pass prend une livraison (run, PR, commit jugé) ; elle a ouvert la PR que la station n'avait pas pu ouvrir (`reconciled` : retrouvée après coup) |
| `pass.reviewed` | Le reviewer a relu la livraison du `run`, sur ce `sha` : `review`, `outcome` (`green`, `red`, `unreadable` + `reason`), `summary`, `findings`, `truncated`. Illisible, elle est suivie d'une autre sur le même `sha`, deux fois au plus |
| `pass.judged` | Le verdict, avec `sha`, `base`, `merged` (nul : la fusion ne se fait pas), `gates`, `ci`, `review`, `findings`, `judgeModified`, `declarations`, `noDiff` |
| `pass.served`, `grant.used` | Verte et sans diff, servie sans merge ; l'intention de merger, usage du grant — chacun avec le numéro du verdict qui l'autorise |
| `merge.done` | Mergée. `by` : `pass` ou `outside` ; `actor` : le compte GitHub ; `reconciled` : constaté après un redémarrage ; `unverified` : fait hors du runtime, la base est à contrôler |
| `merge.failed` | Le merge n'a pas abouti : `interrupted`, ou le refus de GitHub |
| `pass.held` | Verte, non mergée : `reason` (`no-grant`, `review-required`, `merge-refused`), `cause`, `expired` |
| `pass.second-judged` | Arrêtée parce qu'elle touche à ses juges, la livraison du `run`, sur ce `sha`, a été jugée par le second juge — une fois : `verdict` (`not-weakened`, `weakened`, `cannot-establish`), `reason` ; `judge`, `model`, `effort` — son run et son calibrage, nuls s'il n'a pas été lancé ; `reviewer` et `review` — le calibrage du reviewer et le run de sa relecture |
| `pass.waiting` | Ni jugée ni mergée pour l'instant : `base-red`, `machine-saturated`, `gates-cut-saturated` (avec le `sha` dont les gates ont été coupées). Elle repart seule |
| `pass.returned`, `pass.deferred`, `pass.outdated` | Rouge : renvoi `n` sur 2, avec les findings ; la main passe au manager ; GitHub exigeait une branche à jour et a refusé le merge, `findings` repart au cook |
| `pass.escalated` | Remontée au chef : `reason` (`still-red`, `unjudged`, `manager-split`), `cause` |
| `pass.pr-closed` | La PR a été fermée sans merge : la pass ne juge, ne renvoie ni ne merge plus cette livraison. Écrit une fois |
| `pass.abandoned` | Le ticket a quitté le rail sans que sa livraison soit mergée : `branch`, `pr` (encore ouverte, ou nul), `merged`, `closed`. Une intention de merge en vol y trouve sa fin |
| `base.checked` | Hors ticket. Les gates jouées sur la base seule : `sha`, `outcome` (`green`, `red`, `skipped`), `gates`, `tickets` ; sur un `skipped`, `red` (le rouge qui reste) et `reason` (l'essai ne s'est pas fait) |
| `base.recheck-requested`, `base.recheck-held` | Un rejeu est demandé — par le chef (`run base -- replay`), ou par la pass, une fois par rouge (auteur `pass`) ; la machine saturée le retient (`resource`, `observed`, `limit`) |
| `base.repair-opening`, `base.repair-opened` | Le rouge a tenu après son rejeu : la création du ticket de réparation est annoncée (`sha`), puis le ticket est né, sous son numéro (`sha`, `failures`, `reconciled` : retrouvé sur GitHub plutôt que créé) |
| `base.check-held`, `base.check-resumed` | La base ne se rapatrie pas (`reason`, une fois par cause) ; elle se rapatrie de nouveau |

`pass.rehearsed`, `pass.base-moved` et `pass.replayed` ne s'écrivent plus : un journal qui les
porte se relit.

### Ce qui reste après un cook

Chaque cook a son worktree (`worktrees/<run>`) et sa branche locale (`cook/<run>`) dans le clone de
la station. Tu n'as rien à faire.

| Ce qui reste | Quand il part |
|---|---|
| **le worktree** du cook, avec ce que le projet ignore | à la fin du cook, quelle qu'elle soit ; ou au démarrage suivant, si le runtime a été tué |
| **la branche locale** `cook/<run>` | une fois le ticket **servi** ou **sorti du rail**, si tous ses commits sont sur l'origine. Sinon elle reste, sans bruit |
| **la branche distante** | jamais par le runtime (réglage GitHub *Automatically delete head branches*) |

**Ce qui traîne est commité d'abord**, au nom de `brigade` : fichiers suivis modifiés, fichiers
neufs que le projet n'ignore pas. Pour une livraison, ce commit part avec elle (voir « Le cook ne
livre pas, la station récolte ») ; sinon il reste sur la branche locale, **jamais poussée**.
Retrouver le travail d'un cook raté — le nom de la branche est dans le commentaire de l'issue :
`git -C <clone> log --stat <base>..cook/<run>`.

**Ce qui ne se range pas est dit, et rien n'y est touché** (`worktree.kept` ; `journalctl`,
`status`) : un worktree qui n'est plus sur sa branche, qui n'est plus un worktree, un `git` qui
échoue. Le runtime réessaie à chaque tick. Pour le lever, lire `detail` : `git switch cook/<run>`
ou `git rebase --abort` dans le worktree ; sinon `git -C <clone> worktree remove --force
<worktree>`. Tant qu'il dure, un renvoi sur sa branche attend dix minutes (`worktree-failed`).

Au journal : `worktree.removed` (`worktree`, `branch`, `harvest` — le commit de ce qui y traînait,
ou `null`), `worktree.kept` (`reason`, `detail` ; écrit une fois), `branch.removed`.

**N'élague rien dans le clone de la station** (`git fetch --prune`) : « absent de l'origine » s'y
lit sans réseau, et une branche mergée en *squash* y serait gardée à tort. Seuls les worktrees que
le journal raconte sont touchés.

### Ce que la pass ne garantit pas

- **« Seule la pass merge » se clôt par une identité GitHub par rôle, et seulement là où tu l'as
  posée** (les trois Apps et la règle de branche de « Une identité GitHub par rôle »). Ce qui
  reste non garanti :
  - **Le cook tourne sous le compte Unix du runtime.** Sans cloison, il lit ce que ce compte lit :
    les clés des Apps, un `gh auth login` ou une clé SSH restés sur la machine. **La cloison le
    clôt** pour ce qu'elle masque (`/etc/brigade`) ; `~/.config/gh`, `~/.ssh` ne le sont que si tu
    les ajoutes à `BRIGADE_SANDBOX_HIDDEN` (voir « La cloison »). Sans elle, les secrets du projet
    ne sont cloisonnés que par les droits de fichiers (voir « Les secrets du projet »).
  - **Le runtime tient les trois clés** : une faille du runtime vaut les trois rôles.
  - **La règle de branche est un réglage du dépôt**, que le runtime ne vérifie pas. Sans elle,
    l'identité cook (`contents: write`) peut pousser sur la branche d'intégration.
  - **Les humains du dépôt gardent leurs droits** : un merge à la main se lit `outside`, et la
    base est contrôlée après coup.
  - **Un ticket qui touche `.github/workflows/` ne se livre pas** sous l'identité cook, qui n'a
    pas le droit `workflows` : le cook échoue (`push-failed`), le travail reste sur sa branche
    locale, à pousser à la main.
  - **Sous l'identité unique** — sans `BRIGADE_GITHUB_APPS_DIR` — rien de tout cela n'est clos :
    cook et pass passent par le même `gh`, et ce qui retient un cook est la liste d'outils
    interdits au lancement, **de bonne foi**. Le runtime le dit à chaque démarrage. Une protection
    de branche peut encore y interdire tout push direct (`installer.md`, « Protéger la branche
    d'intégration »).
- **Les gates jouées sont celles de la fusion — donc celles du cook, s'il y a touché —**, avec les
  droits du runtime. D'où la règle `review-required`.
- **Ce qui est jugé est la fusion avec la base du moment**, mais : un merge fait **à la main**
  peut se glisser entre le dernier regard sur la base et l'appel à GitHub (il déclenche un
  contrôle de la base) ; **une base cassée n'est vue rouge que quand quelque chose la fait juger**
  — un push direct n'y suffit pas — et le reste tant que tu ne l'as pas réparée ou fait rejouer ;
  une livraison arrêtée n'est pas rejugée quand la base bouge ; **la CI et le reviewer jugent le
  commit de la branche, pas la fusion**. Pour la CI, la pass en tire une seule conséquence : un
  rouge sur une branche qui n'a pas la tête de la base n'est pas un verdict (voir « La CI dit »).
  « Sans la tête de la base » se lit dans le clone — la base rapatriée a-t-elle des commits que le
  commit livré n'a pas ? —, pas chez GitHub : un workflow `pull_request`, qui juge un *merge ref*
  que le clone n'a pas, est tenu pour périmé au même test, même s'il a tourné après le dernier
  mouvement de la base. **Deux non-actions, voulues** : la pass ne demande jamais à GitHub de
  rejouer une CI, et **le reviewer n'est pas relu quand seule la base a bougé** — son objet est le
  travail du cook, qui n'a pas changé.
- **Le reviewer est un modèle, du même moteur que le cook** : il peut partager son angle mort, et
  se laisser convaincre par ce qu'il relit. **« Sans droit d'écriture » tient à sa liste
  d'outils**, pas à une clôture du système. Il n'a pas d'identité GitHub : la pass publie sa
  relecture.
- **Un ticket sorti du rail ne ferme rien derrière lui**, et son départ n'est vu qu'au sondage.
- **Un fichier neuf que le projet n'ignore pas part dans la PR**, si le cook l'a laissé dans une
  livraison. Le reviewer est prévenu ; la seule garde est le `.gitignore` du projet.


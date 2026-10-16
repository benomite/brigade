# La fermeture

Page du [runtime de la V2](../runtime.md) ; l'index dit où trouver le reste.

## La fermeture qui observe

Le relevé dit ce que le projet **pèse** ; la fermeture qui observe dit ce qu'il **n'a pas retiré**.
`npm --prefix runtime run closing` (`brigade <projet> closing` sur la box) lit la branche
d'intégration du clone du projet — `origin/<BRIGADE_BASE_BRANCH>` dans `BRIGADE_REPO_DIR`, telle
que le dernier rapatriement l'a laissée — et imprime trois choses :

| Bloc | Ce qu'il dit | Comment c'est compté |
|---|---|---|
| `ratio` | Les lignes ajoutées et retirées (`+ajouté / −retiré`) et leur rapport, sur les 20, 50 et 100 derniers merges | Les commits de merge de la branche, chacun contre son **premier parent** : ce que le merge lui a apporté. Un commit posé droit sur la branche n'est pas un merge ; ce qu'une branche a écrit puis retiré avant son merge ne compte pas |
| `doublons` | Chaque suite d'au moins 8 lignes de code identiques à deux endroits, avec ses deux passages (`chemin:début-fin`), les plus longues d'abord | Du texte comparé à du texte, dans les fichiers de code : ni l'indentation, ni les lignes vides, ni les commentaires, ni les lignes de pure ponctuation ne comptent. Une troisième copie est donnée une fois, contre la première |
| `code mort` | Chaque export nommé d'un fichier TypeScript ou JavaScript que rien d'autre ne nomme (`chemin:ligne`) — ou que seuls des tests nomment, et lesquels | Un nom cherché dans tous les fichiers de la branche, doc exceptée. Un export que son propre fichier réemploie, ou qu'un autre fichier écrit, vit |

- **Elle ne modifie rien.** Ni fichier, ni branche, ni PR, ni fait au journal, et elle ne rapatrie
  pas : elle ne joue que des commandes de `git` qui lisent, sans prendre de verrou — pas même celui
  de l'index. Elle répond donc pendant que les cooks travaillent et que la pass merge, et ne retient
  ni les uns ni l'autre.
- **Elle repère, elle ne juge pas.** Deux passages identiques ne sont pas toujours à réunir, et un
  export qu'un framework lit par convention n'est nommé par personne. À l'inverse, deux exports morts
  qui portent le même nom se font vivre l'un l'autre. Ce sont des candidats, à lire.
- **Quand il n'y a rien, elle le dit** : `aucun repéré`, et parmi combien de fichiers elle a
  cherché. Une branche de moins de 20 merges donne son ratio sur ceux qu'elle a, en le disant. Un
  fichier de plus de 1 Mo n'est pas lu, et la sortie compte ceux qu'elle a écartés.
- Le bloc `journal` reprend les compteurs du relevé — les merges depuis la dernière fermeture, les
  seuils franchis — quand `BRIGADE_STATE_DIR` porte un journal ; sans lui, le dépôt est observé
  quand même. Deux variables sont obligatoires : `BRIGADE_REPO_DIR` et `BRIGADE_BASE_BRANCH`.
  Sa ligne `passe` dit où en est la dernière passe qui écrit — demandée et ce qui la retient, retirée, refusée, en train de
  ranger, ou comment elle a fini — dès qu'une a été demandée (voir « La fermeture qui écrit »),
  et le **bilan** de la dernière qui a fini la suit (voir « Le bilan d'une passe »).

## La fermeture qui écrit

La fermeture qui observe ne touche à rien ; celle-ci **retire**. C'est l'agent le plus dangereux du
système : un cook qui se trompe ajoute du mauvais code, et la pass l'attrape ; un closer qui se
trompe **efface du bon code**, et les gates diront « ça marche toujours », puisque ce qui a disparu
n'était testé par rien. Elle ne part donc que sur **ton geste**, sous une condition d'exécution
mesurée, et sous tous les garde-fous — ceux de tout le monde, pas d'autres.

```
brigade <projet> closing write    # npm --prefix runtime run closing -- write
brigade <projet> closing cancel   # npm --prefix runtime run closing -- cancel
```

- **Rien d'autre ne la lance.** Ni un seuil franchi (`run measures` la *propose*, `drift.crossed`
  ne lance rien), ni une horloge, ni un redémarrage : une demande que le runtime n'a pas fait
  partir avant de s'arrêter — qu'elle attende ou non — est refusée à son retour (`restarted`, dit
  dans journald), elle se redemande.
- **Tu la demandes une fois, elle attend.** Trop de cooks en vol, elle n'est pas refusée : elle
  attend sa condition d'exécution et part seule, une fois, dès qu'elle est remplie — rien à
  guetter, rien à relancer (voir « La demande attend »).
- **Elle est hors du rail** : elle ne prend aucun ticket, n'a pas de priorité, et son closer part
  sous la station `closer`, sans ticket.
- **Elle ne merge rien et ne pousse jamais sur la branche d'intégration.** Ce qu'elle retire part
  sur sa branche (`cook/fermeture-<8 caractères>`) et dans **une PR** vers la branche d'intégration,
  qu'elle remet à **la pass** : jugée et mergée comme celle d'un ticket, sans chemin à elle (voir
  « La PR passe par la pass »).

### Le closer se règle, ou il n'y en a pas

Par le même geste que les autres décisions du chef — `station -- closer-modele <modèle>`,
`closer-effort <effort>`, `closer-cooks <N>`, `closer-tokens <N>`, `closer-retraits <N>` —, journalisé,
sans `sudo` et sans redémarrage ; `retirer <geste>` revient à la variable. Posée, la décision
l'emporte sur la variable de même nom, et vaut à la passe suivante : celle qui range garde ses
plafonds. `station` montre les décisions posées et, dessous, les réglages en vigueur. Sans
calibrage, le projet n'a pas de passe qui écrit et rien d'autre ne change : la commande refuse en
nommant le geste. L'un sans l'autre, ou une valeur illisible, fait **refuser le démarrage**. Ces
valeurs restent dans le journal du répertoire d'état, hors de portée d'un cook.

| Variable | Défaut | Rôle |
|---|---|---|
| `BRIGADE_CLOSING_MODEL`, `BRIGADE_CLOSING_EFFORT` | aucun | Le calibrage du closer — c'est ton quota, il n'a pas de défaut |
| `BRIGADE_CLOSING_COOKS` | 1 | La condition d'exécution : la passe part quand **moins** de cooks que cela sont en vol. `1` : aucun |
| `BRIGADE_CLOSING_MAX_TOKENS` | 500 000 | Tokens par passe — à la place du plafond d'un cook, pas en plus. Aucun plafond par semaine |
| `BRIGADE_CLOSING_MAX_REMOVED_LINES` | 500 | Lignes qu'une passe peut retirer |

Ils s'écrivent au journal quand ils changent (`closing.configured`) : c'est là que la commande les lit.

### La condition d'exécution

Une passe qui écrit déplace la branche d'intégration sous les cooks en vol : « quand ça se calme »
est une condition, mesurée dans le journal. **Un cook en vol** est un ticket qu'une station tient
(`pris`), ou dont un cook tourne encore après avoir quitté ses mains ; la relecture d'un ticket en
pass n'en est pas un. La passe part quand il y en a **moins que le seuil** — un rail vide n'en porte
aucun. Cette condition est la seule porte : **la passe ne part jamais sous des cooks en vol au-delà
du seuil**, et rien de ce qui suit ne la desserre.

La commande écrit `closing.requested` ; le runtime la voit dans la seconde, **relit la condition à
cet instant**, et fait partir la passe (`closing.started`). Ce qui ne passe pas seul refuse
(`closing.refused`), par la commande — qui sort en 1 et ne lance rien — comme par le runtime :

| Motif | Ce qui manque |
|---|---|
| `unconfigured` | Le closer n'est pas réglé |
| `busy` | Une passe range déjà — une seule à la fois |
| `stopped`, `breaker` | Le « stop » du chef, le disjoncteur ouvert : « reprendre » d'abord |
| `depot` | La branche d'intégration ne se rapatrie pas, ou ne se lit pas |
| `nothing` | L'observation ne repère rien, ou rien hors de ce que les cooks tiennent |

### La demande attend

Ce qui passe seul ne refuse pas : la demande **attend**, et le runtime la relit à chaque réveil —
chaque fois que le journal bouge, donc dès qu'un cook rend la main, et à chaque tick.

| Motif | Ce qui la retient |
|---|---|
| `cooks` | Trop de cooks en vol pour le seuil (`observed`, `limit`) |
| `zoneless` | Un cook en vol ne déclare aucune zone : la passe ne peut pas savoir ce qu'il tient, **il tient donc tout** |
| `deploying` | Une mise en service demandée retenait la passe — ne se lit plus que dans les journaux d'avant la station |

```
brigade : passe de fermeture demandée — elle attend : condition d'exécution non remplie : 2 cooks en vol pour un seuil de 2 — la passe part quand il y en a moins que le seuil, ou quand le rail est vide (il porte 2 tickets non servis)
```

- **Elle part seule, une fois**, au premier réveil où rien ne la retient — la condition relue dans
  la transaction qui écrit `closing.started`. Rien ne lui est réservé : entre deux cooks, une
  station peut prendre le ticket suivant avant elle, et elle attend le creux d'après. Le seuil reste
  ton réglage (`station -- closer-cooks <N>`).
- **Elle se lit dans la file** — le bloc `attend` de `status`, sous le nom `fermeture` : depuis
  quand, et ce qui la retient à la lecture (combien de cooks en vol, pour quel seuil). Et sur la
  ligne `passe` de `brigade <projet> closing`. Elle en sort en partant, refusée ou retirée.
- **Une seule à la fois** : redemandée pendant qu'elle attend, rien n'est réécrit — la commande dit
  « déjà demandée », avec son heure et ce qui la retient, et sort en 0.
- **Tu la retires par le même geste**, `fermeture annuler` (`closing.cancelled`), tant qu'elle n'est
  pas partie : rien ne part, même quand la condition se remplit ensuite. Le runtime relit la demande
  dans la transaction qui fait partir la passe : retirée pendant qu'il rapatriait la base, elle ne
  part pas. Partie, elle ne se rappelle pas — « stop » l'arrête, et rien n'est livré.
- **Le « stop » ou le disjoncteur pendant qu'elle attend la refusent** (`stopped`, `breaker`) : elle
  ne repart pas d'elle-même à la reprise.
- **Sans issue au bout de deux heures.** Une demande qui attend depuis **2 h** — deux fois le plafond
  de durée d'un cook par défaut : deux cooks entiers se sont succédé sans laisser de creux — est dite
  sans issue, une fois : `closing.stalled` au journal, avec ce qui la retenait ; une ligne dans
  journald ; et sa ligne de la file passe en `PASSE DE FERMETURE SANS ISSUE`, avec les gestes qui
  la débloquent — relever le seuil, éteindre le manager le temps que le rail se vide, ou y
  renoncer. Elle attend toujours : la dire sans issue ne la refuse pas, et ne la fait pas partir.

### Ce qu'elle propose, et ce qu'elle tient

La passe rapatrie la base et rejoue **l'observation** : ses doublons et ses exports morts sont les
candidats du closer, chacun sous un nom court (`D1`, `M3`…), quarante au plus. Les fichiers de ces
candidats — le test ou la doc qui nomme un export mort compris — sont **sa zone**, et les zones de
fichiers du rail tiennent dans les deux sens :

- **Elle ne touche pas ce qu'un cook tient.** Un candidat dont un seul fichier est dans la zone d'un
  cook en vol, ou d'un ticket en pass, n'est pas proposé — la PR le dit, avec le ticket qui le tient.
  Et c'est relu à la livraison : un closer qui a écrit hors de sa zone, ou dans ce qu'un cook tient
  — un cook sans zone parti entre-temps tient tout —, **ne livre rien** (`zone`).
- **Aucun cook ne démarre sur ce qu'elle tient.** Tant qu'elle range, le rail compte sa zone comme
  celle d'un ticket en cuisine : un ticket dont la zone la recouvre attend qu'elle ait fini, les
  autres partent. C'est le recouvrement de deux tickets (« Les zones de fichiers »), pas un autre.
  Un ticket **sans zone** n'est retenu par rien, comme entre deux tickets.

### Les garde-fous

Le closer est lancé par le lancement gardé de tous les cooks : rien n'est récrit pour lui.

| Garde-fou | Ce qui l'arrête | Fin de la passe |
|---|---|---|
| Plafond de tokens par passe | `guard.tripped` `tokens`, à la limite de la passe | `tokens` |
| Plafond de retraits par passe | Les lignes que son worktree retire, commitées ou non, relevées à chaque tick (`guard.tripped` `removals`) ; et recomptées à sa fin | `removals` |
| Inactivité, durée, tours | Les plafonds de tout cook (« Régler les plafonds ») | `idle`, `duration`, `turns` |
| « stop » | `brigade <projet> guardrails stop` l'arrête dans la seconde ; aucune ne part avant « reprendre » | `stop` |
| Disjoncteur | Ouvert, aucune ne part ; ouvert pendant qu'elle range, elle est arrêtée | `breaker` |

**Arrêtée, elle ne livre rien** : ni branche poussée, ni PR. Ce qu'elle avait écrit reste commité
sur sa branche locale, comme le travail d'un cook arrêté. Un closer arrêté par un plafond, ou qui a
écrit ce qu'il ne tenait pas, est **un échec que le disjoncteur compte**. Et elle le dit, à trois
endroits : `closing.ended` au journal, une ligne dans `journalctl -u brigade@<projet>`, et la ligne
`passe` du bloc `journal` de `brigade <projet> closing` :

```
passe      fermeture-3f9c1a2e, le 2026-10-13 14:02 — arrêtée : plafond de tokens de la passe atteint (512 340 pour un plafond de 500 000) — rien n'est livré
```

### La PR, et ce qu'elle a laissé

La PR dit ce qui a été **retiré** et tout ce qui ne l'a pas été, **avec son motif** :

- **Laissé faute d'être sûr** : le closer écrit, pour chaque candidat qu'il ne retire pas, une ligne
  `LAISSÉ <nom> : <pourquoi>` — recopiée telle quelle. Rien n'est tenu pour retiré sur sa parole :
  la passe rejoue l'observation sur sa branche, et un candidat qui s'y repère encore sans que le
  closer l'ait nommé est dit **laissé sans motif**.
- **Écarté avant la passe** : ce qu'un cook tenait, et ce qui dépassait les quarante candidats.

Une passe qui n'a rien retiré n'ouvre pas de PR : ce qu'elle a laissé est dans `closing.ended`
(`kept`).

### La PR passe par la pass

Sa PR ouverte, la passe la **remet à la pass** dans le geste qui écrit sa fin (`closing.ended`
`delivered`, puis `pass.entered`). Tout ce que « La pass » dit d'une livraison vaut pour elle, sans
un pas de moins : le commit poussé est fusionné avec la base du moment dans un worktree jetable, les
**gates** du projet s'y jouent, le **reviewer** relit le diff, la **CI** du commit est lue, et verte,
elle n'est mergée que **sous le grant `merge`** — `grant.used` avant l'appel à GitHub, `merge.done`
après. Sans grant, elle s'arrête verte (`no-grant`) et attend ton merge ; une passe qui touche à ses
juges ou aux déclarations du projet n'est jamais mergée par la pass (`review-required`).

Ce qui change tient à ce qu'une passe n'a **pas de ticket** :

- **La pass la suit sous le numéro de sa PR** — que GitHub ne donne à aucune issue — et c'est sur
  la PR qu'elle parle : la relecture du reviewer, le verdict, l'arrêt. `brigade <projet> pass` la
  montre comme `PR #<n>  hors du rail (run fermeture-…)`, et `brigade <projet> pass <n>` raconte
  son jugement. Au journal, ses faits (`pass.*`, `grant.used`, `merge.done`) portent ce numéro.
- **Le reviewer est son vrai juge**, et sa consigne n'est pas celle d'un ticket : il cherche ce que
  le diff retire et dont quelque chose de vivant dépend encore, un test affaibli pour faire passer un
  retrait, et ce que le diff fait d'autre que ce que la PR annonce. Des gates vertes n'y prouvent
  rien — ce qui a disparu n'était peut-être testé par rien. **Un retrait dont il ne peut pas établir
  qu'il est sûr est bloquant** : c'est l'inverse d'un ticket, où le doute est une remarque.
- **Rouge, personne ne la reprend** : aucun cook n'est renvoyé, le closer ne repart pas, le manager
  n'est pas saisi. Dès le premier rouge elle remonte (`pass.escalated`, `still-red` : `off-rail`),
  la pass le dit sur la PR avec ce qu'elle a trouvé, et la PR reste ouverte : à toi de la merger à
  la main — la pass le verra — ou de la fermer, et de relancer une passe.
- **Mergée, ou fermée sans merge, la pass ne la suit plus** : il n'y a ni ticket à servir, ni issue
  à fermer. Un merge à la main est constaté (`merge.done`, `by: outside`), et les gates sont
  rejouées sur la base, comme après tout merge fait hors du runtime.

### Le bilan d'une passe

Une passe se lit **sans rouvrir sa PR** : `brigade <projet> closing` donne, sous sa ligne
`passe`, le bilan de la dernière passe qui a fini. Il est relu dans le journal seul — rien n'y est
rejoué — et son verdict tient en tête, sur une ligne :

```
passe      fermeture-3f9c1a2e, le 2026-10-13 14:02 — livrée : 1 ligne retirée dans 1 fichier, 2 candidats laissés faute d'être sûr — …
bilan      ÉCHEC — vérifications des gates : en baisse (12 → 11), même si les gates sont vertes — la passe a pu retirer du vivant · la pente descend (10:1 → 6,7:1 sur 20 merges)
           PR #101 — jugée verte par la pass, mergée le 2026-10-13 14:20
retiré     1 sur 3 candidats · 1 ligne retirée, aucune ajoutée, dans `src/libre/outils.ts`
           M1  export `inutile` de `src/libre/outils.ts:2` — référencé nulle part
laissé     2, faute d'être sûr
           D1  8 lignes de code identiques : `src/libre/a.ts:1-8` = `src/libre/b.ts:1-8`  deux modules qui évoluent à part
           M2  export `oublie` de `src/tenu/outils.ts:2` — référencé nulle part           le closer n'a donné aucun motif — …
pente      ajouté / retiré sur les mêmes merges : avant la passe → avec ce qu'elle retire
           20 merges   +20 / −2  10:1  →  +20 / −3  6,7:1  descend — 2 merges seulement sur la branche
           …
garde-fous avant la passe → après, par les gates que la pass a jouées : sur la base `01913d7`, puis sur la PR fusionnée avec elle
           couverture de tests      87,5 % → 87,5 %              tenu
           vérifications des gates  12 → 11                      ÉCHEC — en baisse
           état du produit          gates vertes → gates vertes  tenu
```

| Bloc | Ce qu'il dit | D'où il vient |
|---|---|---|
| `retiré` | Chaque candidat retiré, avec son chemin et ce pour quoi l'observation le proposait ; les lignes retirées et ajoutées, les fichiers écrits | `closing.ended` : `removed`, `removedLines`, `addedLines`, `files` |
| `laissé`, `écarté` | Chaque candidat que le closer a laissé, avec sa raison — ou qu'il a laissé sans la dire ; et ce qui a été écarté avant qu'elle ne parte | `closing.ended` : `kept` |
| `pente` | Le ratio ajouté / retiré des 20, 50 et 100 derniers merges de la base dont la passe est partie, **avant** et **avec ce qu'elle retire** — sur les mêmes merges : ce qui bouge ne tient qu'à elle | `closing.ended` : `slope`, relevée au départ de la passe |
| `garde-fous` | Trois, chacun avec sa valeur avant, après, et son verdict | Les gates que la pass a jouées — voir plus bas |

- **Les symptômes déclenchent, les effets font le bilan** — et on ne mesure pas une réduction sans
  mesurer ce qu'elle ne doit pas casser. Trois garde-fous : la **couverture de tests** n'a pas baissé
  (`MESURE couverture`), les gates **vérifient toujours autant de choses** (`MESURE verifications`),
  le **produit marche** (les gates de la PR sont vertes). Les deux premiers sont ce que le projet
  déclare par ses gates (« Ce que les gates déclarent ») : le runtime ne les invente pas.
- **Une baisse est un échec, dit en tête — même sous des gates vertes.** Un closer qui efface du
  code vivant et le test qui le couvrait laisse des gates vertes : c'est le cas que le bilan existe
  pour dire. Toute baisse de la couverture ou du nombre de vérifications est `ÉCHEC`, si petite
  soit-elle ; des gates rouges ou arrêtées à leur plafond de durée sont l'échec du produit.
- **« Avant » et « après » ne diffèrent que de ce que la passe a écrit.** « Après » : les gates du
  dernier jugement de sa PR (`pass.judged`), fusionnée avec la base du moment. « Avant » : les
  gates jouées **sur l'arbre même de cette base** — son contrôle seule (`base.checked`), ou le
  jugement de la livraison dont le merge l'a faite. Une livraison mergée entre le départ de la passe
  et le jugement de sa PR est donc dans les deux mesures, et ne masque rien.
- **Un garde-fou que rien n'a mesuré est `non établi`, jamais tenu**, et la tête du bilan le compte :
  la PR pas encore jugée, des gates qui ne déclarent pas la mesure, une base sur l'arbre de laquelle
  aucune gate du journal n'a été jouée (un commit posé droit dessus, par exemple). Le bilan dit lequel.
- **Si la pente n'a pas bougé, il l'écrit : « la passe n'a pas servi ».** C'est le chiffre de la
  fenêtre de 20 merges, tel qu'il se lit — `24,3:1` avant, `24,3:1` après, n'a pas bougé. De même
  si elle monte, et pour une passe qui n'a rien retiré ou rien livré. Tant que sa PR n'est pas
  mergée, la pente de la base n'a pas bougé du tout : le bilan dit où en est la PR.
- **Aucun plafond par semaine** : c'est ce bilan, passe après passe, qui dira s'il en faut un.

### Ce que ce parcours ne fait pas

- **Le bilan ne retient rien** : il se lit. Une PR de passe dont un garde-fou a cédé sous des gates
  vertes est jugée verte par la pass, et mergée sous le grant `merge` comme toute livraison verte ;
  rien ne te prévient hors de `brigade <projet> closing`. Le reviewer reste son juge.
- **Seule la dernière passe finie a son bilan** dans `brigade <projet> closing` ; les précédentes
  restent au journal (`closing.ended`, et les `pass.judged` de leur PR).
- **La zone d'une passe est lâchée dès que sa PR est ouverte**, pas à son merge : tant que la PR est
  en pass, un cook peut démarrer sur les fichiers qu'elle modifie. La pass juge chaque livraison
  fusionnée avec la base du moment : la seconde à merger est rejugée, et un conflit se voit là.
- **Une PR de passe arrêtée ou remontée ne figure pas dans « ce qui attend le chef »** de
  `brigade <projet> station` : elle se lit dans `brigade <projet> pass`, et sur la PR.
- **Dans `journalctl`, la pass nomme encore « ticket #<n> »** la PR d'une passe sur la plupart de ses
  lignes : le numéro est le bon, le mot ne l'est pas.
- **Le compteur « merges depuis la dernière fermeture »** du relevé ne repart pas encore d'une passe.
- `brigade <projet> guardrails` nomme `manager` tout cook sans ticket : le closer s'y reconnaît à
  son run, `fermeture-…`.

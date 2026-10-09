# L'arbitre entre projets (#178)

Jalon 7 de l'épique #179. Spec mère : `2026-10-08-brigade-v2-design.md`, §Scheduler et §Mises à
jour. Décisions produit tranchées par le Manager le 2026-10-09, consignées sur l'issue.

## Le problème

Dès qu'un second projet tourne sur la machine, deux ressources sont partagées et aucune n'est
arbitrée : le **compte Max** (chaque projet a son plafond de cooks, rien ne les additionne) et la
**machine** (un projet qui lance tout ce qu'il peut affame l'autre). Chaque runtime ne voit que son
rail.

## Ce qui est livré

Un **arbitre**, un seul par machine, au-dessus des runtimes de projet. Il ne décide rien du
travail : il répond à une seule question — « ce projet peut-il lancer un cook de plus ? » — en
tenant compte de tous les projets. Du code, sans LLM.

| Critère de l'issue | Où |
|---|---|
| Un arbitre unique, consulté avant chaque lancement | `arbitre.ts` (le process), `arbitrage.ts` (ce que la station lui demande), `station.ts` |
| Des poids entre projets, sans toucher aux plafonds de chacun | `run arbitre -- poids <projet> <n>` |
| Un projet n'affame pas les autres | la règle de partage, ci-dessous |
| Arbitre injoignable : au plus un cook, journalisé et signalé | `station.unarbitrated`, `cook.launched` marqué, `status`, `journalctl` |
| Il ne prétend pas connaître la consommation du compte | « consommation des cooks », totalisée depuis ce que les runtimes disent |
| Lisible : par projet, ce qui tourne et ce qui est encore autorisé | `run arbitre` |

## Ce que l'arbitre sait, et d'où

**Rien de ce qu'il compte n'est à lui.** Chaque runtime lui **redit** son état à chaque échange :
ses cooks de tickets en cours, s'il a des tickets qui attendent, s'il se retient parce que la
machine sature, et ce que ses cooks ont consommé. L'arbitre garde le dernier mot de chacun en
mémoire, jamais sur disque : un arbitre qui redémarre repart vide et se remplit de ce qu'on lui
redit.

Ce qu'il garde sur disque (`arbitre.db`, dans `BRIGADE_ARBITER_STATE_DIR`) tient aux **réglages** :
les projets connus, leur poids, et ceux qui sont partis proprement. C'est là que la commande du
chef écrit ; l'arbitre le relit à chaque décision, rien n'est à redémarrer.

Un runtime parle : à chaque demande de lancement, à chaque passage de sa station dont l'état a
changé (une fin de cook, une retenue), à chaque tick (c'est ce qui remplit un arbitre revenu), et à
son arrêt propre (il rend sa part).

## La règle de partage

`P` : le plafond du compte, réglé par le chef (`BRIGADE_ARBITER_MAX_COOKS`, **sans défaut**).
`T` : les cooks en cours, tous projets entendus. Un projet est **actif** s'il a des cooks, de la
demande, ou s'il est connu et n'a pas reparlé.

- **Part.** Chaque projet actif reçoit `max(1, ⌊E × poids / somme des poids actifs⌋)`, où `E` est
  le plafond effectif. Jamais moins d'une place.
- **Marche normale** (`E = P`). Un projet sous sa part passe, tant que `T < P`. Au-delà de sa
  part, il **emprunte** : il passe si les places libres dépassent ce qui reste dû aux autres
  projets qui demandent (ou qui n'ont pas reparlé). Les places de qui ne demande rien se prêtent.
- **Machine saturée.** Dès qu'un runtime dit se retenir pour « machine saturée » alors que des
  tickets attendent, `E` devient `T` — le nombre de cooks en cours — et les parts se calculent
  dessus. Plus d'emprunt : seul un projet sous sa part effective passe. Celui qui a pris la
  machine ne relance pas ; celui qui attend passe à la prochaine fin de cook, quand sa propre
  station voit la machine respirer. L'arbitre ne lit pas la machine : chaque station le fait déjà,
  et c'est elle qui retient un lancement que la machine ne porterait pas.
- **Sans préemption.** L'arbitre ne tue jamais un cook : il retient le suivant.
- **Un projet connu qui n'a pas reparlé** depuis le démarrage de l'arbitre garde sa part
  **réservée** : personne ne l'emprunte. `run arbitre` le nomme, et dit depuis quand. Sa part se
  libère quand il reparle, quand son runtime s'arrête proprement, ou quand le chef le retire
  (`run arbitre -- retirer <projet>`).

L'arbitre compte les cooks de **tickets** seulement, comme le plafond de la station : un jugement
du manager ou une relecture du reviewer ne retient rien.

## Côté runtime

`BRIGADE_ARBITER_PORT`, **facultative**, désigne l'arbitre (boucle locale). Elle est la même pour
l'arbitre et pour les runtimes.

- **Absente** : le runtime tourne comme avant. Ni mode dégradé, ni avertissement.
- **Posée** : la station consulte l'arbitre en dernier — après ses propres bornes — pour chaque
  ticket qu'elle s'apprête à prendre. Refusée, elle se retient (`arbiter`) et redemande au réveil
  suivant.
- **Posée, et l'arbitre ne répond pas** — connexion refusée, réponse illisible ; un délai de dix
  secondes n'est qu'une garde : **mode dégradé**. Le projet lance quand même, **au plus un cook de
  ticket à la fois**. C'est écrit une fois à l'entrée (`station.unarbitrated`, une ligne dans
  `journalctl`), une fois au retour (`station.arbitrated`) ; chaque cook parti ainsi porte
  `unarbitrated: true` dans son `cook.launched` ; `status` et `station` le montrent tant que ça
  dure. Les cooks déjà partis finissent. Au retour, l'arbitre recompte depuis ce que les runtimes
  lui redisent, cooks non arbitrés compris.

## Ce que le chef lit et règle

`npm --prefix runtime run arbitre` :

- le plafond du compte, les cooks en cours, et si la machine est dite saturée (par qui) ;
- par projet : poids, cooks en cours (dont ceux partis sans arbitre), part, ce que l'arbitre
  autorise **encore**, s'il a de la demande, et la **consommation des cooks** sur 24 h et sur 7
  jours glissants — ce que les cooks de tickets finis dans la fenêtre ont consommé, pas la
  consommation du compte (#63) ;
- les projets qui tiennent une part sans avoir reparlé, et depuis quand.

`-- poids <projet> <n>` (entier ≥ 1, défaut 1, durable, sans expiration) et `-- retirer <projet>`.
Arbitre injoignable, la commande le dit, rappelle le mode dégradé, et montre les réglages.

## Décisions techniques

- Un process (`tenir-arbitre.ts`), une unité `brigade-arbitre.service`, un verrou sur son
  répertoire d'état. HTTP sur `127.0.0.1`, port lu dans l'environnement ; port 0 dans les tests,
  un arbitre par test.
- Le runtime joint l'arbitre sans passer par la porte du projet : la boucle locale reste ouverte
  sous cloison.
- Les réglages s'écrivent dans la base de l'arbitre, pas par HTTP : un cook, qui joint la boucle
  locale, ne règle pas les poids. **Limite dite** : un cook peut parler à l'arbitre au nom d'un
  projet ; il fausserait un compte que le runtime redit à l'échange suivant.
- La décision est une fonction pure (`decider`), éprouvée seule ; « ce qui est encore autorisé »
  se calcule en la rejouant.
- **Limite dite** : un runtime mort sans le dire laisse son dernier mot à l'arbitre jusqu'à ce
  qu'il reparle (systemd le relance) ou que le chef le retire. Aucune échéance ne le périme :
  rien ici ne court contre l'horloge.
- Un projet refusé redemande à son réveil suivant — le tick au plus tard (une minute).

## Hors scope

Le conteneur (#176) ; les capacités et le runner Mac (jalon 6) ; les budgets par domaine et toute
décision fondée sur la consommation (jalon 8) — le total est ici **informatif**.

## Plan

1. `decider` et les parts, à nu.
2. L'arbitre : réglages durables, dernier mot de chaque projet, HTTP.
3. `arbitrage.ts` : la configuration et l'échange côté runtime.
4. La station : consultation, retenue `arbiter`, mode dégradé, ce qu'elle redit.
5. La cuisine à deux projets : la machine saturée par le premier, le second finit par partir.
6. `run arbitre`, `tenir-arbitre.ts`, l'unité, `status` / `station`, la doc vivante.

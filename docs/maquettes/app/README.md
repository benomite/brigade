# La maquette de l'app

Dessinée le **2026-10-08**, mise à jour par le chef le **2026-10-12**. Quatre écrans, et ce qu'ils
montrent fait foi : un ticket d'app cite l'écran qu'il sert, et un dev vérifie ce qu'il a livré
contre ce qui est dessiné ici.

Les fichiers sont ceux du canvas, tels quels. **Ils ne se rendent pas hors du canvas** (ils
attendent un `support.js` qui n'est pas ici) : ils se lisent. Tout ce qui compte y est en clair —
les libellés, les colonnes, les états, les couleurs, ce qui est cliquable et ce qui ne l'est pas.
`canvas.json` donne le titre et la taille de chaque écran, et porte la note du chef sur les
retraits du 2026-10-12.

**L'écran `Main.dc.html` s'appelle désormais « Tous les projets »** (#364). Les fichiers du canvas
disent encore « Kitchen » : ils ne se modifient pas. Le mot ne désigne plus un écran — la
**cuisine** est l'état d'un projet sur sa box, celui qu'un « stop » arrête (`docs/app.md`, « L'app
n'est pas la cuisine »).

**Son contenu a changé depuis** (#870) : ce n'est plus une carte par projet, mais la vue d'ensemble
de brigade — une ligne par projet, une par station, chacune avec sa pastille et ce qui s'y passe,
qu'un clic ouvre, et la ligne de santé de Max et de GitHub. La maquette convenue est dans le ticket,
et l'écran tel qu'il est livré dans `docs/app.md`, « Tous les projets, d'un coup ». Les cinq
compteurs, les cooks en cours et le dernier événement vivent dans l'espace du projet.

## Les quatre écrans

| Fichier | Écran | Ce qu'il fixe |
|---|---|---|
| `Main.dc.html` | **Tous les projets** — dessiné sous le nom « Kitchen » | la barre d'icônes à monogrammes avec sa pastille d'état ; la ligne `Station` ; « ce qui t'attend » ; une carte par projet avec **cinq compteurs** (rail · au travail · à la pass · t'attend · livrés 24 h), ses cooks en cours et son dernier événement ; le log en direct |
| `Espace.dc.html` | **Espace projet** — le second | les onglets de l'espace (Second · Rail · Cooks · Grants · Log) ; les onglets de terminaux (`second · claude`, `zsh`, `+`) ; ce que le second sert à l'ouverture ; les `!` qui tournent sur le Mac |
| `Brigade.dc.html` | **Espace projet** — le rail | le rail en **cinq colonnes** (Sur le rail · Au travail · Pass · T'attend · Livré), un ticket par carte avec ses tags ; les questions avec leurs boutons ; les grants et le grant en une phrase ; le poids du projet |
| `Commis.dc.html` | **Direct d'un cook** | **AU PARKING** — gardé pour plus tard, voir ci-dessous |

## La règle que la maquette porte

**Un bouton n'agit pas : il écrit la commande dans le terminal, et n'envoie rien.** Le chef voit ce
qui va partir, peut le corriger, et fait Entrée. C'est visible sur les quatre écrans : le panneau
de terminal qui apparaît, le prompt, le curseur, et la ligne « Écrit dans le terminal, pas
exécuté. Entrée pour lancer. »

C'est ce qui permet de dessiner des boutons **sans** créer un second chemin : il n'y a toujours
qu'un seul endroit où une chose se fait, et ce qu'un bouton écrit se retrouve dans l'historique du
terminal, rejouable à la main à l'identique.

## Ce qui est dessiné mais ne doit pas être construit

La maquette a de l'avance sur des décisions qui l'ont contredite. **Ces éléments restent dessinés
parce qu'ils resserviront ; ils ne sont pas la cible de la V2.** Un ticket qui les demande est à
renvoyer.

| Dessiné | Pourquoi pas |
|---|---|
| `Commis.dc.html` en entier — le direct d'un cook, son flux retransmis | **au parking** : le log dit déjà qui coince et les garde-fous l'arrêtent. Un second lecteur du même fait. |
| `box/codex`, et tout moteur autre que `claude` | **au parking** : les autres moteurs viendront après la V2 (spec, §Au parking) |
| `mac/chrome`, `chrome-connecté`, `revue-humaine`, `accès-prod`, « depuis ton Mac » | **au parking** : le runner Mac est sorti du jalon 6, aucun ticket ne le réclame |
| « en preprod », « à recetter en preprod » | **n'existe pas** : le runtime n'a aucune notion de preprod |
| un grant « toutes les brigades » (`npm install`) | **abandonné** : un grant est un fait au journal, et il y a un journal par projet. Retiré de la spec le 2026-10-10 |
| les **cook profiles** et leurs statistiques, le **carnet** et ses leçons | **jalon 8**, pas écrit. Rien à construire tant qu'il ne l'est pas. |
| toute **jauge chiffrée** de quota ou de machine, une heure de reset, un total de semaine | **indélivrable, et c'est acté** : le runtime ne connaît pas la consommation du compte Max et ne doit pas prétendre la connaître (`/usage` reste la vérité). Il dit `disponible`, `tient`, ou `SATURÉE` et sa charge. Les jauges **par cook** (tours, durée, tokens, inactivité) sont justes : ce sont les plafonds des garde-fous, que le runtime mesure. |
| le bouton rouge « Écrire « stop » dans le terminal » de `Main.dc.html` | **il arrêterait tout** : sa commande boucle sur tous les projets (`for p in … ; do brigade $p garde-fous -- stop; done`), et son libellé ne le dit pas. L'app livrée n'a d'arrêt que par projet, dans le panneau du projet, et sa commande le nomme. S'il est construit un jour, son libellé dit « tous les projets » |
| une échéance de connexion (« expire dans 2 j ») | le runtime dit `connexion Max tenue pour bonne` — aucune date |

## Ce que la maquette ne fixe pas

Elle dit **ce qui est montré**, pas comment c'est joli. La peau — polices, couleurs, densité — y
est posée et sert de point de départ, mais une passe visuelle est un autre sujet, et elle vient
après que le chef s'en soit servi une journée.

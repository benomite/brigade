# scripts/capture-ecran — voir un écran de l'app sans l'ouvrir

Rend un écran de l'app dans un navigateur sans tête et l'écrit dans un PNG. La vue est celle du
dépôt (`app/src/vue/`, telle quelle) ; ce qu'elle affiche vient de **données figées**. Ni `claude`,
ni box, ni `ssh`, ni `gh`, ni réseau : un cook la lance dans son worktree, avant et après sa
modification, et regarde les deux images.

## La ligne

```sh
node scripts/capture-ecran/capture.ts espace-projet /tmp/avant.png
```

Lancée depuis la racine du worktree. Le chemin de sortie est libre (ses dossiers sont créés) et doit
finir par `.png`. Elle dit `/tmp/avant.png — espace-projet, 117397 octets`, et sort en 0.

Avant / après une modification de la vue :

```sh
node scripts/capture-ecran/capture.ts espace-projet /tmp/avant.png
# … la modification …
node scripts/capture-ecran/capture.ts espace-projet /tmp/apres.png
cmp /tmp/avant.png /tmp/apres.png && echo "rien n'a changé à l'écran"
```

Un écran inchangé donne **le même PNG à l'octet près**, d'une fois à l'autre et lancé de front
avec d'autres captures. Un PNG différent, c'est que l'écran a changé.

Les autres gestes :

| Geste | Commande |
|---|---|
| Lister les écrans | `node scripts/capture-ecran/capture.ts --liste` |
| Une autre taille de fenêtre | `… capture.ts tous-les-projets /tmp/x.png --largeur 1280 --hauteur 800` |
| Tests | `npm --prefix scripts/capture-ecran test` |
| Contrôle de types | `npm --prefix scripts/capture-ecran run typecheck` |

Une capture qui accroche n'écrit rien, sort en 1 et dit pourquoi : la vue a levé une exception, elle
a demandé un fichier absent ou le réseau, un clic d'étape ne trouve pas son élément, le navigateur
s'est arrêté, ou deux minutes ont passé. Un écran inconnu, ou un mauvais argument, sort en 2.

## L'installer, une fois par worktree

```sh
npm ci --prefix scripts/capture-ecran
```

Il pose ses dépendances de dev, dont **le navigateur sans tête** : `@sparticuz/chromium`, un Chromium
pour Linux x64 publié sur le registre npm avec les bibliothèques qu'il demande (nss, nspr…) — une
box nue n'en a aucune, et seul le registre npm est ouvert depuis la station. Le paquet pèse 67 Mo,
compressé ; la première capture le décompresse (environ 210 Mo) dans
`scripts/capture-ecran/node_modules/.cache/capture-ecran/`, et les suivantes le reprennent.

La vue charge xterm depuis `app/node_modules` : les dépendances de l'app doivent être posées
(`npm ci --ignore-scripts --prefix app`, que le setup de worktree fait déjà).

**Sur un Mac**, le paquet ne livre pas de navigateur : `BRIGADE_CAPTURE_CHROME` en désigne un, par
exemple `BRIGADE_CAPTURE_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`. La
capture est alors reproductible sur ce Mac, mais ses pixels ne sont pas ceux de la box : on ne
compare que deux captures du même navigateur.

## Les écrans capturables

| Écran | Ce qu'il montre |
|---|---|
| `tous-les-projets` | « Tous les projets », à l'ouverture de l'app : la barre, l'état du code et des stations, une carte par projet — deux projets sur une box, `parade` au travail, `cantine` calme |
| `tous-les-projets-installee` | Le même, l'app installée depuis le .dmg (#1011) : sans clone de l'app à lire |
| `tous-les-projets-mise-a-jour` | Le même, quand une version plus haute est publiée (#1014) : la version qui tourne, et le message avec « Install now » et « Later » |
| `mise-a-jour-<état>-mac`, `mise-a-jour-<état>-pc` | Le même, l'app installée sur un Mac puis sur un PC sous Windows (#1156), sa mise à jour dans chacun des états `verification`, `disponible`, `telechargement`, `prete` et `erreur` : les deux postes donnent le même PNG à l'octet près (`ecrans/mise-a-jour-par-etat.ts`) |
| `reglages-code`, `reglages-code-installee` | Les réglages de `parade` (Settings, sa rubrique par défaut) : en tête, l'état du code de l'app lancée depuis le dépôt — puis la même page, l'app installée depuis le .dmg (#1011), sans aucune ligne sur son code |
| `station-hors-ligne`, `station-mise-a-jour`, `station-connexion-max` | La page d'une station en panne, ouverte d'un clic sur sa ligne : la panne en une ligne, son bouton, son explication au survol — une station par panne |
| `station-plafond`, `station-plafond-chef`, `station-retenue` | La page d'une station en ligne et son plafond de cooks (#1081) : celui que la box dérive de ses cœurs, celui que le chef a réglé et ce qu'il remplace (avec « back to the default »), puis la station saturée et ce qui retient les tickets |
| `espace-projet` | L'espace de `parade`, ouvert par sa case de la barre : le rail en colonnes (un ticket dans chacune, une décision qui t'attend, deux livrés), son second à droite |
| `espace-projet-ici` | L'espace de `parade` quand sa cuisine tourne sur ce Mac, sans `hote` dans le fichier des projets (#1122) : lu ici, sans `ssh`, son rail, sa file et ses cartes comme pour une box |
| `espace-projet-station-arretee` | L'espace de `parade`, cuisant sur ce Mac, la station de ce Mac arrêtée (#1124) : une seule ligne, `this computer's station is not running`, à la place du rail |
| `demenager-choix` | L'espace de `parade`, qui cuit sur sa box (#1095) : `Cooks on box`, « move the kitchen » cliqué — le choix de la machine où l'emmener (ce Mac) et son prix en une ligne |
| `demenager-sur-ce-mac` | Le même, `parade` cuisant sur ce Mac : `Cooks on this Mac`, sa cuisine qui s'arrête avec l'app, et le choix ouvert — la box, recommandée, pour l'y ramener |
| `demenager-refuse` | Le même, sur la box, le déménagement vers ce Mac refusé par le runtime (pas de bac à sable) : la raison en une phrase sous la ligne, qui dit toujours `Cooks on box` |
| `stations-avec-telephone` | « Tous les projets » avec un téléphone appairé (#1162) : sa ligne dit `does not cook` |
| `demenager-choix-telephone` | Le choix du déménagement de `parade`, avec ce téléphone appairé (#1162) : il n'y est pas offert |
| `ajout` | « Add a project », ouvert par le `+` de la barre : le formulaire, la box déclarée choisie, le calibrage proposé |
| `fiche` | La fiche de #14, ouverte par sa carte dans la colonne Taken du rail de `parade` : ce que son cook fait, son histoire et son coût, ses gestes et leur prix, l'issue et sa discussion |
| `fiche-retro`, `fiche-sans-retro` | La fiche de #9, servi, ouverte par sa carte dans la colonne Served du rail de `parade` (#1038) : sous son histoire et son coût, sa rétro — trois leçons provisoires et ce que son cook a écrit — puis la même fiche quand la box ne lui connaît aucune rétro, et la phrase qui le dit |
| `reglages-ordinaires` | Les réglages de `parade` (Settings) sur un Mac : le bloc « Ordinary tickets on this Mac », l'option posée et la limite de cooks |
| `reglages-ordinaires-sans-bac` | Les mêmes, quand la station dit son bac à sable indisponible : le message et sa raison |
| `reglages-ordinaires-pc` | Les mêmes réglages sur un PC sous Windows (#1154) : le bloc « Ordinary tickets on this PC », sans option ni limite, et la ligne qui dit pourquoi ce poste n'en prend pas |
| `demenager-sur-ce-pc` | `demenager-sur-ce-mac` sur un PC sous Windows (#1154) : `Cooks on this PC`, et le choix ouvert pour ramener la cuisine sur la box |
| `shell-ce-mac`, `shell-ce-pc` | L'espace de `parade`, un shell de ce poste montré à droite (#1154) : sur un Mac, persistant dans sa session, sous « this Mac · chef » — puis sur un PC sous Windows, le `bash` de Git, sous « this PC · chef », qui finit avec son terminal |
| `manager-eteint`, `manager-allume` | L'espace de `parade`, son manager éteint puis allumé (#906) : l'interrupteur en tête de l'espace, et la tête du rail marquée à l'arrêt quand il est éteint |
| `manager-allumer` | Le même, éteint, l'interrupteur cliqué : la confirmation, et sa phrase — ce qu'il va juger, d'après `manager backlog` (23 issues ouvertes, dont 2 `blocked-on-human`) |
| `bande-alertes` | L'espace de `parade`, sa bande d'alertes pleine (#907) : la connexion Max tombée, la base rouge, chacune en une ligne et un contrôle ; le grant `merge` éteint seul, en interrupteur à côté de celui du manager |
| `bande-alertes-ouverte` | La même, le « detail » de la connexion Max déplié et « ask the second… » de la base rouge cliqué : sa confirmation, qui dit ce que coûtera le lever |
| `merge-accorder` | La même, l'interrupteur `merge` cliqué : la confirmation d'accorder, et son prix |
| `cout` | L'onglet Cost de `parade` (#908) : les tokens lancés sur 5 h, 24 h et 7 j, tous projets confondus, la part de `parade` et de `cantine` sous chacun, 7 j « not communicated », la ligne du quota, et dessous la courbe par jour « not communicated » (#909) : la box ne donne pas ses jours |
| `cout-par-jour` | Le même onglet quand la box communique ses jours (#909) — une forme que le runtime n'écrit pas encore : sous les trois chiffres, la courbe des tokens par jour, une ligne par projet, `cantine` avec un trou le 9 |
| `closer`, `closer-trouvailles` | Settings → Closer de `parade` (#990) : les quatre chiffres de la dernière observation du closer, d'après `closing --json`, et dessous « Launch a cleanup… » (#991) — puis la même, la liste de ce qu'il a repéré dépliée |
| `closer-sans` | La même lecture quand aucun closer n'est réglé : le message, le modèle et l'effort à choisir, et le bouton qui règle le closer — inactif tant que les deux ne sont pas choisis |
| `closer-lancer` | Settings → Closer de `parade`, « Launch a cleanup… » cliqué (#991) : la confirmation, d'après l'aperçu de `closing preview --json` — le prix en une ligne, ce que le closer va faire, ce que deviendrait la demande, « yes, launch it » et « no » |
| `closer-attente`, `closer-en-cours`, `closer-refusee`, `closer-finie` | La même partie, la demande de nettoyage dans chacun de ses états (#991) : en attente — trois cooks en vol pour un seuil d'un — avec « Cancel the cleanup » ; en cours, sans bouton ; la dernière refusée, et pourquoi ; la dernière finie — chacune des deux avec le bouton qui relance |
| `closer-derive` | La même partie, la dérive ayant franchi son seuil (#993) : la phrase qui propose un nettoyage et « Review the cleanup… », qui mène à la confirmation sans rien demander |
| `file-ou-cuit` | La file de `parade` quand la box sature : dans Taken, #14 cuit sur la box et #15 sur le Mac — « cooks on » sous « taken by » |
| `correction` | La file de `parade` quand une cause de ratage revient (#999) : au-dessus des colonnes, la carte d'une correction proposée de son `CLAUDE.md` — ce qu'on attend du chef, la cause, ses trois tickets, le diff, son coût, « yes, open it as a PR » et « no » |
| `correction-oui`, `correction-sans-geste` | La même, « yes » cliqué : la réponse écrite, la carte a quitté la file — puis sur une station dont le runtime ne connaît pas encore le geste `correction` : la carte reste, et une ligne le dit, le détail au survol |
| `fiabilite` | Settings → Reliability de `parade` (#987) : la fiabilité de ses cooks — trois chiffres, les causes d'échec — et ce qu'il a coûté ; aucune correction acceptée de ses consignes, la page n'en dit rien (#1001) |
| `fiabilite-apprentissage` | La même page quand ses cooks ont appris (#1058) : sous les causes, ses quatre leçons — deux provisoires, deux promues avec « open in the notebook » — et ses deux profils, leur domaine, leur carnet et leurs tickets. Sans `apprentissage` dans `facts`, `fiabilite` montre la phrase qui le dit |
| `projet-refuse`, `projet-refuse-confirmer`, `projet-refuse-tient`, `projet-refuse-sans-remede` | L'onglet Cooks de `parade`, que sa box refuse de servir (#1178, #1205) : le refus, sa consigne et le bouton de son remède — puis le bouton cliqué et sa confirmation, le remède joué et la phrase qui dit pourquoi le refus tient, et un refus sans remède avec la phrase qui dit pourquoi il n'y a pas de bouton |
| `fiabilite-recul` | La même page quand quatre corrections de ses consignes ont été acceptées (#1001) : sous les causes, chaque cause corrigée avant et après le merge — elle recule, elle ne recule pas, rien à comparer encore, pas encore mergée |
| `telephone-lancement` | Le premier écran de l'app Android installée neuve (#1161), en 412 × 915 : « Link this phone to your projects », l'adresse de la station et son code, « pair » et « scan the QR » |
| `telephone-attente`, `telephone-code-faux`, `telephone-code-expire`, `telephone-injoignable`, `telephone-appaire` | Le même, « scan the QR » cliqué — le QR remplit les deux champs et part au guichet : la station qui n'a pas encore répondu, un code faux, un code expiré, la station injoignable, puis l'appairage réussi — « Tous les projets », la station nommée en tête |
| `telephone-file`, `telephone-file-cooks`, `telephone-file-merge` | La file de `parade` sur le téléphone appairé (#1163), en 412 × 915 : Rail — TODO en tête, puis On the rail, WAITING et Served, empilées —, Cooks — #14 cuit sur la box, #15 sur le Mac —, puis Rail, l'interrupteur `merge` touché, sa confirmation de toute la largeur |
| `telephone-relance` | L'app Android relancée, le téléphone déjà appairé : « Tous les projets », sans écran d'appairage |

Tous en 1440 × 900, sauf ceux du téléphone. `--liste` donne la liste à jour.

## Ce qui est figé

- **Les données** : ce que la box rend (`facts`, `status`, `station`), mot pour mot, dans
  `ecrans/cuisine-figee.ts`. Ce que la vue en reçoit est **calculé par les modules de l'app**
  (`faits.ts`, `attend.ts`, `alertes.ts`, `barre.ts`…) dans le même ordre que `main.ts`
  (`cuisine()`, dans `ecrans/commun.ts`) : un changement de ces modules se voit dans la capture.
- **L'heure** : `2026-10-13T10:04:12Z` (`MAINTENANT`), pour la vue (`Date.now()`, `new Date()`) comme
  pour les modules ; le fuseau est UTC, la langue `en-US`.
- **Le rendu** : la taille de la fenêtre, une densité de pixels de 1, le profil de couleur sRGB, les
  polices de l'app (embarquées dans `app/src/vue/polices/`) et, pour un caractère qu'elles n'ont pas,
  les polices de repli du paquet — jamais celles de la machine.

## Comment c'est fait

- `capture.ts` — la commande. Elle lance le navigateur, lui sert la page, rejoue les étapes de
  l'écran, attend que la page soit posée, et prend la capture.
- `navigateur.ts` — le Chromium du paquet, décompressé une fois, piloté par le protocole DevTools
  sur un tube (`--remote-debugging-pipe`) : aucun port n'est ouvert.
- `pont.js` — le faux pont, posé dans la page avant la vue. Il prend la place de `preload.cjs` :
  chaque geste invoqué rend sa réponse figée (rien, s'il n'en a pas), chaque lecture demandée
  (`faits`, `tous`, `regarder`, `onglet`) reçoit les envois figés du process principal, et rien ne
  part nulle part. Il arrête l'horloge, et dit quand la page est posée : rien en route vers elle,
  ses polices chargées, et aucun changement du document pendant cinq images de suite.
- **Hors ligne par construction** : la page est servie sous `http://app.brigade.invalid/` — un nom
  qui ne se résout jamais —, chaque requête est interceptée et servie depuis `app/` sur le disque ;
  toute autre est refusée, et la capture échoue en la nommant. Le navigateur n'a ni proxy ni
  résolution de nom (`--no-proxy-server`, `--host-resolver-rules=MAP * ~NOTFOUND`).

Les tests le montrent : deux captures vers deux chemins donnent deux PNG identiques à l'octet, avec
des doublures de `claude`, `ssh` et `gh` en tête du PATH qui ne sont jamais lancées ; chaque écran se
rend sans accroc ; et, là où `unshare -rn` coupe le réseau sans être root, la capture sans aucun
réseau est la même. **Les gates ne jouent pas ces tests** (elles jouent ceux du runtime et de l'app) :
`npm --prefix scripts/capture-ecran test` se lance à la main.

## Ajouter un écran

Un écran est un fichier `ecrans/<nom>.ts` qui exporte `ecran` (le type `Ecran` de
`ecrans/commun.ts`) ; son nom de fichier est son nom en ligne de commande. Les autres fichiers de
`ecrans/` (`commun.ts`, `cuisine-figee.ts`) n'exportent pas `ecran` : ils ne sont pas des écrans.

```ts
// ecrans/<nom>.ts — le plus court : « Tous les projets » à une autre taille.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const ecran: Ecran = {
  dit: "« Tous les projets » sur un petit écran",   // ce que `--liste` en dit
  largeur: 1024,
  hauteur: 700,
  // Les clics, du démarrage de l'app à l'écran — ici aucun.
  etapes: [],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)) },
    envois: cuisine(RENDUS),
  }),
};
```

`fiche.ts` est l'exemple complet : deux clics (la case de `parade`, puis la carte
`#rail .colonne:nth-child(2) li.bon`), et chaque réponse dont la fiche a besoin — `situation`,
`gestesDeFiche`, `lireHistoire`, `lireDiscussion` — calculée par le module de l'app qui la calcule
dans `main.ts`, à partir de ce que la box rendrait (`pass 14 --json`, `pass 14 issue`). `carteDe`
(dans `commun.ts`) donne la carte d'un ticket telle que la vue la reçoit.

- **`reponses`** : la réponse de chaque geste invoqué que l'écran fait jouer, par son nom dans le
  pont (`pont.d.ts`) — `demarrage` toujours. Une réponse est la même quels que soient les arguments.
  Prends-la, autant que possible, à la fonction de l'app qui la calcule (comme `ajout.ts` prend
  `proposerCalibrage` à `proposition.ts`) : elle suivra le code. Une réponse `{ __enAttente: true }` ne vient jamais : l'écran
  montre ce que la vue pose en l'attendant (`telephone-attente`).
- **`envois`** : ce que le process principal pousse à la vue. `cuisine(RENDUS)` les rend pour la
  cuisine figée ; ajoutes-y un envoi (`{ sur: "surSortie", args: [id, texte] }` écrit dans un
  terminal, voir `espace-projet.ts`). `demande` sur un envoi : son premier argument reçoit le numéro
  de la dernière demande de cette lecture, que la vue compare au sien.
- **D'autres données de box** : un autre état du rail, une box qui ne répond pas… s'écrivent comme
  la box les rendrait, dans `cuisine-figee.ts` ou à côté, et passent par `cuisine()`.
- **`etapes`** : après chacune, la page se pose avant la suivante. Un sélecteur qui ne désigne pas
  exactement un élément arrête la capture en le disant.

Puis : `--liste` le montre, une capture le rend, et `npm --prefix scripts/capture-ecran test` le
rend avec les autres — le test vérifie que **chaque** écran de `ecrans/` se rend sans accroc.

## Ce qu'elle ne fait pas

- Elle ne lance pas `main.ts` : ce qu'il câble (l'ordre des envois, ce qu'il passe à quel module)
  est repris dans `cuisine()`. Si `main.ts` change ce qu'il envoie à la vue, `cuisine()` est à suivre.
- Les terminaux ne font tourner ni `claude` ni shell : ils affichent ce qu'un envoi `surSortie` y écrit.
- Ce qui ne se voit qu'au survol, à la saisie ou au glisser n'a pas d'étape : un clic seulement.

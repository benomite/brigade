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
| `station-hors-ligne`, `station-mise-a-jour`, `station-connexion-max` | La page d'une station en panne, ouverte d'un clic sur sa ligne : la panne en une ligne, son bouton, son explication au survol — une station par panne |
| `espace-projet` | L'espace de `parade`, ouvert par sa case de la barre : le rail en colonnes (un ticket dans chacune, une décision qui t'attend, deux livrés), son second à droite |
| `ajout` | « Add a project », ouvert par le `+` de la barre : le formulaire, la box déclarée choisie, le calibrage proposé |
| `fiche` | La fiche de #14, ouverte par sa carte dans la colonne Taken du rail de `parade` : ce que son cook fait, son histoire et son coût, ses gestes et leur prix, l'issue et sa discussion |
| `reglages-ordinaires` | Les réglages de `parade` (Settings) sur un Mac : le bloc « Ordinary tickets on this Mac », l'option posée et la limite de cooks |
| `reglages-ordinaires-sans-bac` | Les mêmes, quand la station dit son bac à sable indisponible : le message et sa raison |
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

Tous en 1440 × 900. `--liste` donne la liste à jour.

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
  `proposerCalibrage` à `proposition.ts`) : elle suivra le code.
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

# L'app installable du Mac

Un `.dmg` pour Apple Silicon : glissée dans Applications, l'app s'ouvre sans clone du dépôt, sans
`node` ni `npm` sur la machine. Elle porte le runtime de sa station et le `node` qui le joue. Le
parcours du chef est dans [`docs/app.md`](../../docs/app.md), « Lancer l'app » ; ici, ce que le
`.dmg` porte et comment il se construit.

L'APK Android se construit d'ici aussi, par sa propre commande : [« L'APK Android »](#lapk-android),
plus bas.

L'installeur Windows aussi, par `node app/packaging/windows.ts` : [`WINDOWS.md`](WINDOWS.md).

## Construire

Sur un Mac (Apple Silicon ou Intel), depuis un clone, avec Node 26 et les dépendances de l'app posées
(`npm --prefix app start` les pose, ou `npm ci --ignore-scripts --prefix app`) :

```sh
npm --prefix app run dist
```

écrit **`app/packaging/construit/Brigade-<version>-arm64.dmg`** (ignoré par git) et dit son chemin :

```
brigade: app built — app/packaging/construit/Brigade-0.20261019.151600+g76f93fe-arm64.dmg (version 0.20261019.151600+g76f93fe, arm64, signed ad hoc)
```

| Option (`npm --prefix app run dist -- <option>`) | Sans elle |
|---|---|
| `--version <v>` | `0.<AAAAMMJJ>.<HHMMSS>+g<commit>` : la date (UTC) et l'empreinte du commit construit, comme le paquet de la station |
| `--sortie <dossier>` | `app/packaging/construit/` |
| `--electron <zip ou Electron.app>` | l'Electron darwin-arm64 de la version que déclare l'app, téléchargé sur GitHub et vérifié contre les empreintes de son paquet npm (le cache d'Electron le garde) |
| `--node <binaire>` | le `node` officiel darwin-arm64 de nodejs.org, dans la version du `node` qui lance la commande, vérifié contre son `SHASUMS256.txt` |

Un `--node` donné doit être un binaire macOS arm64 qui ne lie rien hors du système : celui
d'Homebrew est refusé (il lie `libuv`, `icu4c`… qu'un Mac sans Homebrew n'a pas). Il faut `ditto`,
`otool`, `codesign` et `hdiutil`, tous du système. Ailleurs que sur un Mac, la commande refuse
(code 2) sans rien écrire.

Codes de sortie : 0 construit, 1 la construction a échoué, 2 refus — rien n'est écrit.

## Publier

Le workflow [`publier-app`](../../.github/workflows/publier-app.yml) publie l'app tout seul, comme
[`publier-station`](../../.github/workflows/publier-station.yml) publie la station : **à chaque merge
sur `v2` qui change l'app**, une release `app-v<version>`. Personne ne pose de tag.

1. Le job `decider` prend les fichiers changés depuis le dernier tag `app-v*` (sans tag encore, ceux
   du push) et les passe à [`scripts/app-release/decider.ts`](../../scripts/app-release/README.md),
   avec tous les tags `app-v*`. L'app a changé quand un fichier d'`app/` hors d'`app/test/` a changé ;
   la version est le correctif du plus haut tag plus un (`1.0.0` pour le premier). Sinon, le run
   finit vert, sans rien construire ni publier, et son résumé dit « nothing to publish ».
2. Les jobs `mac` (runner macOS) et `windows` (runner Windows) construisent, chacun avec la commande
   de son poste et cette version : `npm --prefix app run dist -- --version <v>` et
   `node app/packaging/windows.ts --version <v>`. Chacun vérifie que ses métadonnées nomment bien son
   installeur.
3. Le job `publier`, une fois les deux constructions faites, crée le tag et la release `app-v<v>` sur
   le commit du merge, avec ses quatre fichiers à la racine, aux noms que lit l'app installée
   (`app/src/mise-a-jour/flux.ts`) : `Brigade-<v>-arm64.dmg`, `latest-mac.yml`,
   `Brigade-<v>-x64-setup.exe`, `latest.yml`. Rien n'est publié si une construction échoue. La
   release n'est pas marquée « latest » : celle-là reste à la station, que
   `releases/latest/download/installer-station.sh` trouve.

C'est le seul chemin de publication : un tag `app-v*` poussé à la main ne publie rien. Il devient la
base du merge suivant — pousser `app-v1.1.0` fait publier `app-v1.1.1` au prochain merge qui change
l'app : c'est ainsi qu'on monte une version mineure ou majeure. Les publications passent une à une
(`concurrency`) ; un run annulé ou échoué ne perd rien, puisque le suivant compare au dernier tag
publié. `workflow_dispatch` rejoue la décision à la main, sur `v2` seulement.

### Signer, notariser

La release ne porte pas encore d'app signée (#1441) : le `.dmg` est signé ad hoc, l'installeur
Windows ne l'est pas. Chaque job de construction a son étape **« Signature (Mac) »** ou
**« Signature (Windows) »**, avant que ses fichiers ne partent vers la release : c'est là qu'elle
s'insère. À la main, sur un Mac qui a un certificat **Developer ID Application** et un profil de
`xcrun notarytool store-credentials <profil> …` :

```sh
npm --prefix app run dist -- --identite "Developer ID Application: Nom (ABCDE12345)" --notariser <profil>
```

L'app est signée binaire par binaire (runtime durci, horodatage, droits de `droits.plist`), notarisée,
agrafée ; puis le `.dmg` est signé, notarisé et agrafé à son tour. Une notarisation qu'Apple n'accepte
pas fait échouer la construction. Avec `--identite` seul (ou `BRIGADE_SIGN_IDENTITY`), l'app est signée
mais pas notarisée. À côté du `.dmg` s'écrit **`latest-mac.yml`** — version, nom, taille et sha512 du
`.dmg`, le format qu'un updater de type electron-updater lit.

## Ce qu'il porte

Le `.dmg` porte `Brigade.app` et un lien vers Applications, où la glisser.

| Chemin dans `Brigade.app/Contents/` | Quoi |
|---|---|
| `MacOS/Electron`, `Frameworks/` | l'Electron officiel, tel quel ; l'exécutable et ses auxiliaires gardent leur nom — c'est sous lui qu'Electron cherche ses auxiliaires |
| `Info.plist` | celui d'Electron, au nom de l'app : `Brigade`, `com.github.benomite.brigade`, la version construite |
| `Resources/app/` | `src/`, le `package.json` de l'app (sans scripts ni dépendances de dev) et ses dépendances de production ; node-pty n'y garde que ce qui est compilé pour darwin-arm64 |
| `Resources/runtime/` | `src/` et `package.json` du runtime, à la version construite — celle que la station dit d'elle |
| `Resources/node/bin/node` | le `node` qui joue la station |

Construite sans identité, l'app est **signée ad hoc** (`codesign --sign -`), pas par un développeur identifié : Apple
Silicon ne lance aucun binaire sans signature, et celle d'Electron ne tient plus une fois l'app
renommée.

## Ce que l'app installée fait autrement

Le code est le même ; seuls changent les chemins (`app/src/emplacements.ts`). L'app se sait
installée quand ses sources sont `Resources/app/src` du paquet qui la joue.

- **Sa station** est le runtime de `Resources/runtime/`, jouée par `Resources/node/bin/node` —
  jamais un `node` de la machine. Elle cuit comme celle de l'app lancée depuis le dépôt.
- **Son PATH.** Ouverte depuis le Finder, une app n'a que le PATH du système. L'app installée lit
  au lancement celui du shell de connexion du chef (`$SHELL -ilc`, dix secondes au plus), y ajoute
  ceux d'Homebrew et de `claude` (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`…), puis le
  dossier de son `node` en dernier : `claude`, `gh` et `git` sont trouvés comme dans un terminal,
  et ce que la station lance trouve un `node` même sur une machine qui n'en a pas.
- **Ses fichiers** sont ceux de l'app du dépôt : `~/.config/brigade/` (projets, réglages,
  `station/`), lu tel quel — rien n'y est déplacé ni réécrit pour elle.
- **Pas de clone** : elle ne dit rien du retard de son code, et ne se met pas à jour par `git`.
  Elle se tient à jour sur les releases `app-v*` : elle lit leur `latest-mac.yml`, télécharge le
  `.dmg` et le vérifie, puis l'installe au geste du chef ou à son ouverture suivante
  (`app/src/mise-a-jour/`, et [`docs/app.md`](../../docs/app.md), « Lancer l'app »).

## Éprouver sur un Mac

Les tests (`app/test/packaging/`, `app/test/emplacements.test.ts`) assemblent `Brigade.app` depuis
une doublure d'Electron, vérifient ce qu'il porte, y lancent la station du paquet par l'enveloppe
de l'app, et jouent la construction du `.dmg` sur des doublures de `codesign`, `otool` et `hdiutil`.
Ils ne remplacent pas l'essai sur un Mac, de préférence un compte sans clone ni `node` :

1. `npm --prefix app run dist`, puis ouvrir le `.dmg` et glisser Brigade dans Applications.
2. Copié depuis un autre Mac (AirDrop, téléchargement), le `.dmg` porte la quarantaine : macOS
   refuse d'ouvrir une app qui n'est pas signée par un développeur identifié. Réglages Système →
   Confidentialité et sécurité → « Ouvrir quand même », ou
   `xattr -dr com.apple.quarantine /Applications/Brigade.app`. Construit sur ce Mac, il s'ouvre.
3. Ouverte : les espaces, l'accueil, « Stations » où cet ordinateur apparaît comme station, l'ajout
   d'un projet ; les projets et réglages de `~/.config/brigade/` sont ceux de l'app du dépôt.
4. Un ticket servi par cette station va jusqu'à sa PR, ou à un résultat clair, comme depuis le dépôt.

Ce que la station dit s'écrit sur la sortie de l'app : lancée par
`/Applications/Brigade.app/Contents/MacOS/Electron` dans un terminal, on le lit.

# L'APK Android

Un APK installable (`adb install`, ou ouvert depuis le téléphone) : l'enveloppe
[Capacitor](https://capacitorjs.com) d'[`app/android/`](../android/) autour de **la même vue que
l'app desktop**, `app/src/vue/`, posée telle quelle à chaque construction — le dépôt n'en garde
aucune copie. Ni file, ni mises à jour : sur Android, la vue s'ouvre, sans projet, derrière un pont
d'attente (plus bas), qui sait seulement appairer le téléphone à une station.

## Construire l'APK

Depuis un clone, sur Linux ou macOS, une seule commande :

```sh
node app/packaging/android.ts
```

écrit **`app/packaging/construit/Brigade-<version>.apk`** (ignoré par git) et dit son chemin :

```
brigade: Android app built — app/packaging/construit/Brigade-0.20261020.150000+gc9ccfe9.apk (version 0.20261020.150000+gc9ccfe9, debug-signed)
```

### Prérequis

| Prérequis | Version | Où la commande le cherche |
|---|---|---|
| Node, et son `npm` | 26 au moins (`engines` de l'app) | celui qui lance la commande |
| un JDK | 21 (de 21 à 24 : Capacitor 8 compile en Java 21, Gradle 8.14 ne tourne pas au-delà de 24) | `$JAVA_HOME/bin/java`, sinon le `java` du PATH |
| le SDK Android | sa plateforme **android-36** (`sdkmanager "platforms;android-36"`) ; les build-tools qu'Android Gradle Plugin réclame sont posés par lui si les licences sont acceptées (`sdkmanager --licenses`) | `$ANDROID_HOME`, sinon `$ANDROID_SDK_ROOT` |
| le réseau | le registre npm, `services.gradle.org` (Gradle, au premier lancement), Google Maven et Maven Central (les dépendances de Gradle) | — |

Ils sont vérifiés **avant tout** : s'il en manque, la commande s'arrête (code 2), sans rien écrire,
en les nommant tous, chacun avec de quoi le poser :

```
brigade: APK not built — missing prerequisites:
  - a JDK 21: no `java` found (JAVA_HOME is not set, and none is on the PATH) — install a JDK 21 and set JAVA_HOME to it
  - the Android SDK: ANDROID_HOME is not set — install the Android SDK (with `sdkmanager "platforms;android-36"`) and set ANDROID_HOME to it
```

Les dépendances de l'app (`app/node_modules`, où la vue prend xterm) sont posées par la commande si
elles manquent (`npm ci --ignore-scripts --prefix app`, sans le binaire d'Electron).

| Option (`node app/packaging/android.ts <option>`) | Sans elle |
|---|---|
| `--version <v>` | `0.<AAAAMMJJ>.<HHMMSS>+g<commit>`, comme le `.dmg` : c'est la `versionName` de l'APK |
| `--sortie <dossier>` | `app/packaging/construit/` |

Codes de sortie : 0 construit, 1 la construction a échoué (la sortie de `npm`, de `cap` ou de Gradle
dit pourquoi), 2 refus — option invalide ou prérequis manquant, rien n'est écrit.

### Ce que fait la commande

1. Elle vérifie les prérequis.
2. `npm ci` dans `app/android/` : Capacitor, à la version de son verrou.
3. Elle pose `app/android/www/` (ignoré par git) : `src/vue/`, copié d'`app/src/vue/` ; ce que la vue
   charge de `node_modules` (les fichiers d'xterm que nomme son `index.html`), au même chemin relatif
   que dans l'app ; l'entrée que Capacitor réclame à sa racine (`app/android/web/index.html`) ; et
   `android/pont.js`, le pont d'attente.
4. `cap sync android` : `www/` est copié dans le projet Gradle, avec la configuration de Capacitor.
5. `./gradlew assembleDebug` dans `app/android/natif/`, puis l'APK est copié dans `--sortie`.

Rien n'y est pris « au plus récent » — à une même version du dépôt, les mêmes outils :

| Quoi | Version | Épinglé dans |
|---|---|---|
| Capacitor (`@capacitor/android`, `core`, `cli`) | 8.5.3 | `app/android/package.json` et son verrou |
| Gradle | 8.14.3, vérifié par sa somme SHA-256 | `app/android/natif/gradle/wrapper/gradle-wrapper.properties` |
| Android Gradle Plugin | 8.13.0 | `app/android/natif/build.gradle` |
| SDK visé, compilé, minimal | 36, 36, 24 (Android 7) | `app/android/natif/variables.gradle`, avec les versions d'AndroidX |
| WebView minimale | 89 (les `importmap` de la vue) | `app/android/capacitor.config.json` |

L'APK est **de debug** : signé par la clé de debug du SDK (`~/.android/debug.keystore`, créée par
Gradle au premier besoin), il s'installe tel quel, mais pas sur un store, et deux machines le signent
de deux clés différentes. Sa `versionCode` suit celle de `build.gradle` (voir « Une mise à jour qui garde les données »).

## Une mise à jour qui garde les données

Android installe un APK par-dessus l'ancien, appairage et projets liés conservés, à trois conditions :
même identifiant d'app, même clé de signature, `versionCode` plus haute. Le dépôt les tient ainsi :

- l'identifiant, `com.github.benomite.brigade`, est dans `natif/app/build.gradle`, `capacitor.config.json`
  et `strings.xml` ; `packaging/android-stable.json` en garde la valeur fixe ;
- la `versionCode` de `build.gradle` monte d'au moins un à chaque release ;
- une release (`./gradlew assembleRelease`) est signée par `signingConfigs.release`, qui lit la clé de
  l'environnement — `BRIGADE_KEYSTORE_FILE`, `BRIGADE_KEYSTORE_PASSWORD`, `BRIGADE_KEY_ALIAS`,
  `BRIGADE_KEY_PASSWORD`, posées par la CI depuis ses secrets — et refuse de se construire sans elles.
  Aucune clé ni mot de passe n'est versionné ;
- le manifeste demande `android.permission.REQUEST_INSTALL_PACKAGES` et déclare un `FileProvider`
  (`${applicationId}.fileprovider`, chemins de `file_paths.xml`, dont `updates/` du cache) pour ouvrir
  l'APK téléchargé avec l'installeur du système.

```sh
node app/packaging/android-stable.ts                                # sort 0 et dit l'id, la versionCode, la source de la clé
node app/packaging/android-stable.ts --previous-version-code <n>   # échoue si la versionCode n'est pas > n
```

Il sort 1, en disant ce qui a bougé, si l'identifiant ou la configuration de signature change, si la
`versionCode` n'augmente pas, si la permission ou le fournisseur manque, ou si une clé est versionnée.
Les tests : `app/test/packaging/android-stable.test.ts`.

## Ce que porte `app/android/`

| Chemin | Quoi |
|---|---|
| `capacitor.config.json` | l'identifiant de l'app, `com.github.benomite.brigade`, et son nom, `Brigade` — les mêmes que ceux du Mac ; la page où elle s'ouvre, `src/vue/index.html` |
| `package.json`, `package-lock.json` | Capacitor, épinglé |
| `web/index.html` | l'entrée que Capacitor réclame à la racine ; ouverte quand même, elle renvoie à la vue |
| `web/pont.js` | le pont d'attente, et l'appairage du téléphone |
| `natif/` | le projet Gradle (le gabarit de Capacitor 8.5.3) : `applicationId` et `app_name` y sont redits, `MainActivity` et `Pont.java` dans `com.github.benomite.brigade` |

`www/`, `node_modules/`, et ce que `cap sync` et Gradle écrivent dans `natif/` (`capacitor.settings.gradle`,
`app/capacitor.build.gradle`, `capacitor-cordova-android-plugins/`, `app/src/main/assets/`, `build/`)
sont ignorés par git : la commande les repose à chaque construction. Pour ouvrir le projet dans
Android Studio, la construire une fois, puis ouvrir `app/android/natif/`.

## Le pont d'attente

Sur le desktop, la vue reçoit `window.brigade` de `app/src/preload.cjs`, et derrière lui le process
principal d'Electron, qui lit les projets, lance les terminaux, joint les stations. Sans lui, la vue
s'arrête dès son chargement. Sur Android il n'y a pas de process principal : `app/android/web/pont.js`
le remplace, injecté par `Pont.java` au début de chaque document de l'app, avant ses scripts.

- `demarrage` rend ce que le process principal rendrait — palettes, onglets, gestes, libellés, lus à
  la construction dans les modules d'`app/src/` (`demarrageDuPont`, dans `android.ts`), jamais
  recopiés —, une liste de projets vide, et `telephone`, ce que l'app garde de son appairage (#1161) :
  aucun sur une installation neuve, et la vue s'ouvre sur l'écran qui relie le téléphone aux projets.
- `appairerLeTelephone` envoie le code au guichet de la station (`POST /pairing`,
  `runtime/src/telephone/guichet.ts`) par le HTTP natif de Capacitor (`CapacitorHttp`) : le guichet
  parle http sur le réseau du chef, que la WebView, servie en https, ne joindrait pas elle-même — d'où
  aussi `android:usesCleartextTraffic` dans le manifeste. Appairé, le jeton, l'adresse et la station
  sont gardés dans le stockage de l'app ; la vue ne reçoit que le nom de la station.
- `scannerLeQr` lit le QR de la station par le lecteur de Google Play
  (`play-services-code-scanner`, épinglé dans `natif/variables.gradle`), que `Pont.java` appelle
  (`scanner`) : il ouvre l'appareil photo lui-même, l'app ne le demande pas.
- `ajouter` refuse, en disant que ce téléphone n'est appairé à aucune station.
- Un abonnement (`sur…`) ne reçoit rien ; tout autre geste ne fait rien et ne rend rien.

Hors de l'appairage, ce téléphone ne lit rien et n'envoie rien. Le pont qui lira une station le
remplacera ; rien du code partagé n'a changé pour Android.

## Éprouver

Les tests (`app/test/packaging/android.test.ts`) vérifient, sans JDK ni SDK : les prérequis nommés
quand ils manquent (la commande lancée sur une machine qui n'en a aucun), l'identifiant et le nom
déclarés, les versions épinglées, qu'aucun fichier d'`app/src/` n'est recopié dans `app/android/`,
la vue posée et chacun des chemins qu'elle charge, et le pont d'attente — son appairage joué contre un
faux pont natif. L'APK lui-même se construit
et s'ouvre sur un émulateur en CI, par cette même commande. À la main, avec un émulateur ou un
téléphone branché :

```sh
node app/packaging/android.ts
adb install -r app/packaging/construit/Brigade-<version>.apk
adb shell am start -n com.github.benomite.brigade/.MainActivity
```

L'app s'ouvre sur « Add a project ». Ce que dit la vue se lit dans `chrome://inspect` (l'APK de
debug laisse inspecter sa WebView), et ce que dit l'enveloppe dans `adb logcat -s Capacitor Capacitor/Brigade`.

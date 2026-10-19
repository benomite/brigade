# L'app installable du Mac

Un `.dmg` pour Apple Silicon : glissée dans Applications, l'app s'ouvre sans clone du dépôt, sans
`node` ni `npm` sur la machine. Elle porte le runtime de sa station et le `node` qui le joue. Le
parcours du chef est dans [`docs/app.md`](../../docs/app.md), « Lancer l'app » ; ici, ce que le
`.dmg` porte et comment il se construit.

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

## Signer, notariser, publier

Le `.dmg` que construit `npm --prefix app run dist` seul est signé ad hoc. Celui que publie le
workflow [`publier-app`](../../.github/workflows/publier-app.yml) est signé par un certificat
**Developer ID Application**, notarisé par Apple et agrafé : il s'ouvre sans l'alerte « développeur
non identifié ». À la main, sur un Mac qui a le certificat et un profil de `xcrun notarytool
store-credentials <profil> …` :

```sh
npm --prefix app run dist -- --identite "Developer ID Application: Nom (ABCDE12345)" --notariser <profil>
```

L'app est signée binaire par binaire (runtime durci, horodatage, droits de `droits.plist`), notarisée,
agrafée ; puis le `.dmg` est signé, notarisé et agrafé à son tour. Une notarisation qu'Apple n'accepte
pas fait échouer la construction. Avec `--identite` seul (ou `BRIGADE_SIGN_IDENTITY`), l'app est signée
mais pas notarisée. À côté du `.dmg` s'écrit **`latest-mac.yml`** — version, nom, taille et sha512 du
`.dmg`, le format qu'un updater de type electron-updater lit.

### Secrets du dépôt

À poser dans Settings → Secrets and variables → Actions (aucune valeur n'est dans le dépôt ; le
workflow refuse de partir si l'un manque) :

| Secret | Quoi |
|---|---|
| `MACOS_CERTIFICATE_P12` | le certificat « Developer ID Application » et sa clé, exportés en `.p12`, en base64 (`base64 -i certificat.p12`) |
| `MACOS_CERTIFICATE_PASSWORD` | le mot de passe de ce `.p12` |
| `MACOS_SIGN_IDENTITY` | le nom du certificat, ex. `Developer ID Application: Nom (ABCDE12345)` |
| `APPLE_ID` | l'identifiant Apple du compte développeur |
| `APPLE_APP_SPECIFIC_PASSWORD` | un mot de passe d'app pour ce compte (appleid.apple.com) |
| `APPLE_TEAM_ID` | l'identifiant d'équipe, 10 caractères |

### Publier une version

1. Choisir la version, `<v>` (ex. `1.0.0`), et le commit de `v2` à publier.
2. Poser le tag, puis le pousser : `git tag app-v<v> <commit> && git push origin app-v<v>`. Le préfixe
   `app-v` laisse les tags `v*` au plugin et `station-*` à la station.
3. Le workflow construit sur un runner macOS, signe, notarise, agrafe, puis **vérifie** : il échoue si
   `codesign --verify --deep --strict` ou `spctl --assess --type execute` signale quoi que ce soit sur
   l'app, ou si `xcrun stapler validate` dit que le ticket n'est pas agrafé (l'app comme le `.dmg`).
4. Il crée la release `app-v<v>` et y attache `Brigade-<v>-arm64.dmg` et `latest-mac.yml`. Rien
   n'est publié si une étape échoue : corriger, supprimer le tag (`git push --delete origin app-v<v>`),
   le reposer.

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

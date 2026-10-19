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

## Ce qu'il porte

Le `.dmg` porte `Brigade.app` et un lien vers Applications, où la glisser.

| Chemin dans `Brigade.app/Contents/` | Quoi |
|---|---|
| `MacOS/Electron`, `Frameworks/` | l'Electron officiel, tel quel ; l'exécutable et ses auxiliaires gardent leur nom — c'est sous lui qu'Electron cherche ses auxiliaires |
| `Info.plist` | celui d'Electron, au nom de l'app : `Brigade`, `com.github.benomite.brigade`, la version construite |
| `Resources/app/` | `src/`, le `package.json` de l'app (sans scripts ni dépendances de dev) et ses dépendances de production ; node-pty n'y garde que ce qui est compilé pour darwin-arm64 |
| `Resources/runtime/` | `src/` et `package.json` du runtime, à la version construite — celle que la station dit d'elle |
| `Resources/node/bin/node` | le `node` qui joue la station |

L'app est **signée ad hoc** (`codesign --sign -`), pas par un développeur identifié : Apple
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
  Une nouvelle version, c'est un nouveau `.dmg`.

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

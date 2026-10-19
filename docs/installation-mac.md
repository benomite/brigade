# Installer l'app brigade sur votre Mac

L'app brigade est une fenêtre pour votre Mac : vos projets dans une barre d'icônes, et dans chacun
un terminal. Elle s'installe comme n'importe quelle app, sans cloner le dépôt et sans `node` ni
`npm`.

## Ce qu'il vous faut

- Un Mac **Apple Silicon** (puce M1 ou plus récente). Les Mac Intel ne sont pas couverts pour
  l'instant.
- Les outils que l'app appelle sur le Mac : `claude` (Claude Code) et `gh` (GitHub CLI), installés
  et connectés comme d'habitude. L'app les trouve par le `PATH` de votre shell de connexion.

Windows, mobile et Mac Intel ne sont pas encore couverts.

## Où la télécharger

Sur la page des releases du dépôt, **<https://github.com/benomite/brigade/releases>**. Prenez la
dernière release **« Brigade (Mac) »** et téléchargez le fichier **`Brigade-<version>-arm64.dmg`**
qui lui est attaché.

## Installer

1. Ouvrez le `.dmg` téléchargé.
2. Glissez **Brigade** dans le dossier **Applications**.
3. Ouvrez Brigade depuis Applications.

L'app est signée par un développeur identifié et notarisée par Apple : elle s'ouvre sans
l'alerte « développeur non identifié ».

## Vos projets et réglages

L'app lit **`~/.config/brigade/`** tel quel : les projets et les réglages que vous avez déjà,
avec l'app lancée depuis le dépôt, apparaissent à l'identique. Rien n'y est déplacé, rien n'y
est réécrit.

## Mises à jour

L'app installée ne se met pas à jour toute seule. Une nouvelle version est publiée comme une
nouvelle release : pour passer à jour, téléchargez le nouveau `.dmg` et glissez-le dans
Applications, en remplaçant l'ancien.

## Pour aller plus loin

Le parcours complet de l'app (les espaces, l'accueil, les stations, l'ajout d'un projet) est
dans [`app.md`](app.md), « Lancer l'app ». Le détail de ce que le `.dmg` porte et de sa
construction est dans [`app/packaging/README.md`](../app/packaging/README.md).

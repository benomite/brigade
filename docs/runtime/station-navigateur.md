# Regarder une livraison d'interface dans mon navigateur

Page du [runtime de la V2](README.md) ; l'index dit où trouver le reste.

## Regarder une livraison d'interface dans mon navigateur

Une livraison qui touche l'interface d'un projet peut être regardée dans le navigateur du poste
avant de dire oui ou non. Le parcours tient en quatre gestes et un arrêt : déclarer, servir, ouvrir,
dire, et le serveur s'arrête tout seul. Il ne sert qu'à regarder : **le verdict se donne sur
l'issue du ticket, et ce parcours ne bloque pas le merge** (voir #399, T3).

### Déclarer comment le projet se sert

Le dépôt du projet porte, à côté de son `worktree-setup.sh`, un fichier `.claude/brigade/service`
(`runtime/src/service.ts`). Des lignes « clé : valeur » ; une ligne vide ou qui commence par `#` ne
compte pas, toute autre ligne est un problème dit :

```
commande : python3 -m http.server "$BRIGADE_PORT" --bind 127.0.0.1 --directory app
interface : app/src/vue
```

- **`commande`** — une seule. Une ligne de shell, lancée à la racine du worktree, dans
  l'environnement que rend le setup. Elle écoute sur `$BRIGADE_PORT` et sur la boucle locale, et
  tourne jusqu'à ce qu'on l'arrête. Aucun port ne s'écrit dans le fichier.
- **`interface`** — une ligne par chemin du dépôt, relatif à sa racine : un fichier, ou un dossier et
  tout ce qu'il contient. Pas de motif (`*`, `?`). Une livraison dont le diff touche l'un de ces
  chemins touche l'interface : c'est elle qu'on sert. `.` n'est pas un chemin d'interface.

Sans ce fichier, le runtime le dit — « ce projet ne déclare pas comment il est servi » — et ne sert
rien : aucune commande n'est devinée. Un projet qui ne déclare rien n'a rien de cassé ; le motif se
lit dans `station` et `status`.

### Servir

Quand un cook livre un commit poussé qui touche un chemin `interface`, le runtime lance la commande
**dans le worktree de ce cook**, sur **le port de ce worktree** : `BRIGADE_PORT`, que le setup pose
à `20000 + <n° d'issue>`. Deux worktrees ont deux ports et ne se croisent pas ; le runtime n'en
choisit jamais un autre. La commande part dans la même cloison que le cook, et dans son propre
groupe de process.

- `station` et `status` listent chaque serveur : son ticket, son worktree, son port, `starting`
  (le port ne répond pas encore) ou `listening`, et la page de l'écran à regarder —
  `http://127.0.0.1:<port><route>`, jamais la racine — ou pourquoi il n'y en a aucune.
- Sous chaque serveur, plus en retrait, `status` dit l'écran et qui l'a dit, puis la phrase du cook :

  ```
    #591  worktrees/591-ab12cd34  port 20591  écoute depuis 3 min  cook/591-ab12cd34  http://127.0.0.1:20591/rail
      écran : /rail (déclaré par le cook)
      à regarder : #591 : le rail a maintenant deux colonnes, TODO et WAITING
  ```

  Un écran que le cook n'a pas déclaré, déduit des fichiers touchés, le dit :
  `écran : /rail (écran déduit des fichiers touchés, pas déclaré par le cook)`. Sans écran, rien
  dessous. Les livraisons d'une app qui ne s'ouvre pas dans un navigateur, sous `à lancer`, portent
  les mêmes lignes.
- Une livraison sans interface ne lance rien. Ce qui empêche de servir — projet non déclaré,
  worktree sans port, déclaration illisible — est dit à la place, une fois, et se lit dans les
  mêmes deux commandes.

### Ouvrir

Sur la carte du ticket, l'app pose ce que `status` dit de sa livraison : l'écran à regarder, la
phrase du cook — c'est elle qu'on te montre —, et, quand l'écran est déduit, la mention « écran
déduit des fichiers touchés, pas déclaré par le cook ». Jamais une liste de fichiers. Puis un geste,
**seulement s'il y a une page à voir** et que le serveur **écoute** : **see it in my browser**. L'app
ouvre un transfert de port vers ta box par le `ssh` qu'elle a déjà (`ssh -N -L`, vers le même hôte,
sans aucune commande après l'hôte), puis ouvre, avec la commande d'ouverture du poste, l'adresse
locale suivie de la route de l'écran — **jamais la racine du worktree**, qu'un serveur de fichiers
rend en liste de dossier. Rien n'est lancé sur la box pour cela : le serveur tourne déjà depuis le
worktree.

Sans écran, ou sans page pour lui (un écran qui n'est pas une route, une ligne qui n'écrit que la
racine ou rien) : pas de bouton du tout, et ce que `status` écrit à sa place se lit sur la carte.
Pour une app qui ne s'ouvre pas dans un navigateur (`lancement`, comme `brigade`) : pas de bouton,
et la carte dit comment voir l'écran — la commande qui lance l'app sur le worktree de la livraison,
et l'écran à y ouvrir. Sans serveur, projet non déclaré, serveur qui démarre, runtime mort ou
`status` non lu : pas de geste, et la raison est écrite à sa place. Le transfert se ferme dès qu'une lecture de `status` ne
montre plus son serveur, quand son projet quitte l'app, et quand l'app se ferme.

L'app rappelle, à côté du geste : elle ouvre la page, elle ne la montre pas et ne recueille aucun
avis. **Ton oui ou ton non se dit sur l'issue du ticket** — son numéro l'ouvre, sur le rail.

### Dire

Le verdict est posé sur l'issue du ticket, et c'est elle qui fait foi, pas le navigateur. Ni l'app
ni le runtime n'enregistrent de oui ou de non pour cette page : ne pas attendre d'un geste de l'app
qu'il valide ou refuse la livraison.

### Arrêter

Personne n'a à arrêter le serveur. Il s'arrête seul, et son worktree se range avec lui, dès que :

- le ticket est **servi**, ou a **quitté le rail** ;
- un cook **reprend** le ticket, dans un worktree neuf (le serveur de l'ancien s'arrête d'abord) ;
- son worktree se range par ailleurs, ou n'existe plus ;
- sa commande **sort d'elle-même** (un port pris, une commande qui ne sert rien) : le journal garde
  ce qu'elle a dit ;
- le runtime s'en va : aucun serveur ne survit à son runtime, et une vie qui commence n'en hérite
  d'aucun.

Un serveur qui tient son worktree empêche de le ranger : il ne se range qu'une fois arrêté. Chaque
arrêt s'écrit au journal, avec sa raison (`service.stopped`).

### Ce que ce parcours ne fait pas

Trois exclusions, à ne pas attendre de lui :

- **Ce n'est pas une préproduction.** Rien n'est déployé : le serveur est celui d'un worktree, lancé
  depuis la livraison, et il s'arrête avec elle.
- **Le cook ne pilote pas de navigateur connecté.** Il ne regarde pas la page et n'en fait aucune
  capture : c'est toi qui regardes.
- **Aucune validation ne se fait dans l'app.** Ni bouton oui ou non, ni verdict enregistré : le
  verdict se dit sur l'issue.

# Recette : ajouter un second projet sur la box, uniquement par l'app

Scénario pas à pas, à jouer par le chef sur une box où un premier projet est déjà servi. Aucun
terminal n'est ouvert à la main, sauf les cas dits « terminal » ci-dessous. Les noms d'étapes et de
boutons sont ceux que l'app affiche (en anglais pour les boutons, comme l'app) ; la doc est
`docs/installer.md`, « Par projet : le parcours par l'app ».

**Pré-requis** : la box a le geste d'installation et le geste de mise en service à jour, un compte
`claude` connecté, `gh` connecté sous ton compte ; ton poste a le plugin brigade ; le second projet
a un dépôt GitHub et un dossier cloné sur ton poste ; la box est déclarée dans l'app.

**Ne pas faire** : aucun `sudo tee`, aucun drop-in, aucun `brigade <projet> station …` à la main.

## Le scénario

| # | Geste dans l'app | Résultat attendu | Réussi si |
|---|---|---|---|
| 1 | Pied de la barre des projets : `Add a project` | l'écran d'ajout s'ouvre | le formulaire s'affiche |
| 2 | `Choose…` le dossier ; vérifier le nom et le dépôt proposés ; choisir la box ; garder ou changer le calibrage du manager et du reviewer ; vérifier la destination des sauvegardes | le nom, le dépôt (lu dans l'origine) et la destination sont préremplis, le calibrage est suggéré avec sa provenance | aucun champ n'est signalé en refus |
| 3 | `Install on the box, and add` | « Request in progress » puis la sortie de la box, telle quelle : ports attribués | le projet apparaît dans la barre ; `It is not served yet: its installation goes on in its space, step by step.` |
| 4 | `Open the space of “<nom>” — its installation goes on there` | Paramètres s'ouvre sur l'installation, **dépliée** : les sept étapes sont listées d'emblée, chacune avec « What it is for: » et « If you skip it: » ; la courante porte « ← now » | les sept titres sont lus, dans l'ordre : 1. Ajouter le projet sur la box · 2. Amorcer le dépôt · 3. Vérifier la box · 4. Déclarer les stations · 5. Protéger la branche d'intégration · 6. Poser les décisions que le démarrage réclame · 7. Démarrer la cuisine |
| 5 | Lire l'encart « What the app cannot do for you — said before you meet it » | ce que l'app ne fera pas est dit avant tout bouton : l'init, ce que la box manque (avec sa commande), le démarrage du service | l'encart sort de « The box is being verified » avec son verdict |
| 6 | Étape 1 | « done » sans geste | rien à faire |
| 7 | Étape 2 : `Run /brigade:init in the second`, conversation, merge de la PR sur la branche d'intégration, puis `The result of /brigade:init is merged onto the integration branch` | le second de l'espace ouvre `claude /brigade:init` ; l'étape passe à « done » | la branche d'intégration porte le résultat de l'init |
| 8 | Étape 3 : `Verify` (rejouer autant qu'il faut) | la ligne lancée, la sortie de `installation` et son code, en entier ; chaque `MANQUE` est aussi sous l'étape qui le règle | verdict `READY` ; une ligne `à savoir` ne retient rien. Si un manque est sur la box même (geste de box trop ancien) : **terminal**, la commande qu'il nomme — normalement `sudo git -C /opt/brigade pull --ff-only` —, puis `Verify` |
| 9 | Étape 4 : cocher les stations proposées, saisir les cooks à la fois, `Declare the stations` | « Declared now: … » liste chaque station et son plafond | l'étape est « done » ; « Verify » ne dit plus `aucune station déclarée` |
| 10 | Étape 5 : `Protect the integration branch` | la branche est dite protégée sur le dépôt, sans droit manquant | l'étape est « done » ; un droit manquant est écrit avec son action |
| 11 | Étape 6 : pour chaque décision, lire sa question, ses options et la recommandation, choisir, `Answer` | une décision à la fois, « N decisions waiting » décroît ; les facultatives se passent par `Skip the optional decisions — the start does not require them` | « No decision waiting. » |
| 12 | Étape 7 : `Start` | la box revérifie tout ; seulement si c'est vert, l'installation est notée terminée ; un shell s'ouvre dans l'espace avec `ssh -t <hote> sudo systemctl enable --now brigade@<nom>.service` écrit, **sans être envoyé** | « The installation is finished: the box verified everything, the kitchen is ready to serve, and no installation step is left. » |
| 13 | Dans ce shell : Entrée (et le mot de passe `sudo` si demandé) | le service démarre | `brigade@<nom>.service` est actif |
| 14 | Fermer l'app, la rouvrir | les sept étapes se retrouvent « done », rien à refaire | aucun geste n'est demandé |

## Critère de réussite final

1. **La cuisine sert le projet** : après l'Entrée du geste 13, `brigade <nom> status` (ou la veille
   de l'app) montre le runtime du projet actif, ses stations déclarées, le rail lu ; un ticket
   `fire` posé sur une issue courte est pris par un cook.
2. **Aucun geste n'est demandé après « terminé »** : l'écran d'installation n'a plus d'étape
   courante, aucun bouton d'installation actif, aucun `MANQUE` ; l'app rouverte ne redemande rien.
3. **Le premier projet n'a pas bougé** : son service, ses ports et son rail sont inchangés.

## Si ça coince

Une étape qui refuse dit pourquoi sous son bouton ou sous les onglets de droite ; ce que la box a
rendu est affiché tel quel. Une box dont le runtime est plus ancien que l'étape rend « THE BOX DID
NOT RETURN WHAT … RETURNS » : la mise en service d'une version (bande d'alertes) la met à jour.
Note, pour chaque étape, ce qui a été vu et l'heure : c'est le compte-rendu de la recette.

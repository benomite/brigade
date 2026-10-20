# Le runtime de la V2

Le runtime est le process qui tient le **journal** d'un projet : une suite d'événements en ajout
seul, dont tout le reste dérive — à commencer par le **rail**, la file des tickets à servir. Il vit
dans `runtime/`, s'exécute avec Node 26 sans build, et ne dépend d'aucun paquet à l'exécution.

Cette doc dit ce qu'il fait, comment le piloter et le recetter. **Installer brigade** — sur un
serveur, pour un projet — est un parcours à part, et un seul document : [`installer.md`](../installer.md). Les décisions et leurs raisons
sont dans les specs, [`superpowers/specs/`](../superpowers/specs/) — ici, seulement la consigne.

**Ouvre cet index d'abord, puis seulement les pages de ta partie du runtime.** Chaque page fait 500 lignes au plus.

## Où trouver quoi

| Page | Ce qu'elle contient |
|---|---|
| [`journal-et-rail.md`](journal-et-rail.md) | Ce que le runtime fait aujourd'hui, le journal, le rail des tickets |
| [`garde-fous.md`](garde-fous.md) | Les garde-fous : plafonds, arrêt et reprise |
| [`station.md`](station.md) | La station : stations déclarées, plusieurs cooks, setup du worktree, calibrage, fiche du ticket, capacités |
| [`station-distante.md`](station-distante.md) | Une station distante tire son travail, les tickets ordinaires sur le poste du chef |
| [`station-cook.md`](station-cook.md) | Zones de fichiers, ce qu'un cook charge, la récolte, refus du modèle, quota, connexion Max, voir la station |
| [`station-machine.md`](station-machine.md) | Une station par machine (présence GitHub, appairage), budget d'appels GitHub, ajouter un projet depuis l'app |
| [`station-navigateur.md`](station-navigateur.md) | Regarder une livraison d'interface dans le navigateur |
| [`manager.md`](manager.md) | Le manager et les tickets de l'épique |
| [`pass.md`](pass.md) | La pass : relecture, reviewer, décision, vert une fois fusionné |
| [`pass-merge.md`](pass-merge.md) | Le grant `merge`, voir la pass, ce qui reste après un cook, ce que la pass ne garantit pas |
| [`etat-et-mesures.md`](etat-et-mesures.md) | L'état de la cuisine, le relevé des mesures |
| [`carnet-lecons.md`](carnet-lecons.md) | Le carnet des leçons : ses seuils, la promotion et la péremption livrées par une PR, retirer une leçon |
| [`fermeture.md`](fermeture.md) | La fermeture qui observe, la fermeture qui écrit |
| [`identites-et-secrets.md`](identites-et-secrets.md) | Une identité GitHub par rôle, les secrets du projet |
| [`cloison-et-arbitre.md`](cloison-et-arbitre.md) | La cloison, l'arbitre entre projets |
| [`exploitation.md`](exploitation.md) | Les variables, sauvegarder et restaurer, « Piloter », le poste de dev, la box |

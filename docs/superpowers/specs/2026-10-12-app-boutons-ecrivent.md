# Les boutons de l'app écrivent dans le terminal, ils n'envoient pas — spec (#345)

**Date** : 2026-10-12
**Statut** : trois décisions validées par le Manager sur `question-spec` (consignées sur l'issue) ;
le reste tranché par le dev, comme l'issue le demandait, **à contester en review**.
**Issue** : #345 (suite de #339, épique #294).

Le comportement, tel que le chef le vit, est dans `docs/app.md` (« Les boutons écrivent, ils
n'envoient pas ») : ce document ne le recopie pas.

## Ce qui a été validé

1. **Six boutons, chacun là où se lit ce qu'il change** : `garde-fous stop` et `reprendre` dans le
   panneau d'état ; `grant activer|prolonger|revoquer merge` dans l'onglet Grants ; `station cooks`
   dans l'onglet Cooks. Rail, Log et la kitchen n'en ont pas. Laissés dehors, faute d'endroit où
   leur fait se lit : `manager`, `base rejouer`, `installation`, `cloison eprouver`. Le bouton de
   relance de la bannière d'arrêt vient avec la bannière (#346).
2. **La forme écrite est celle de « Piloter », depuis le poste**, préfixée de `!` sans espace :
   `!ssh <hote> brigade <nom> <commande>`. Pas celle que l'app et le second lancent pour lire
   (`-o BatchMode=yes -o ConnectTimeout=10 --`) : une commande qui se lit avant Entrée doit être
   courte. Un test la compare à la ligne de `docs/runtime.md`.
3. **Second arrêté : lancé, montré, rien d'écrit**, et la note dit de recliquer. Jamais d'écriture
   à l'aveugle : l'app ne sait pas quand `claude` est prêt, et un écran de démarrage (la confiance
   du dossier) recevrait la commande comme des touches.

## Ce que le dev a tranché

4. **Toujours dans le second, jamais dans un shell.** Le bouton ramène sur l'onglet Second.
5. **Frappe en cours : l'app écrit à la suite, et le dit.** Elle ne lit pas le terminal ; effacer la
   ligne (`Ctrl+U`) aurait été écrire par-dessus le chef. La note du second dit ce qui a été écrit,
   que rien n'est parti, et où c'est allé s'il tapait.
6. **Ce que l'app dit d'un clic vit dans la note du second**, sous les onglets — pas un bandeau de
   plus. Elle remplace « fil repris » jusqu'au prochain changement d'état du second.
7. **Une commande qui porte un caractère de contrôle n'est pas écrite** (`terminaux.inscrire`) :
   `nom` et `hote` viennent d'un fichier JSON, où un `\n` s'écrit — et un retour à la ligne, même
   cité, envoie. C'est le registre qui tient « rien n'envoie », pas la liste des boutons.
8. **`nom` et `hote` sont cités pour le shell du Mac** quand il les découperait ; le nom l'est
   aussi pour celui de la box (`cite`, de `box.ts`). Un nom que le geste accepte part tel quel.
9. **La vue nomme un bouton, pas une commande** (`boutons.ts`), comme pour les onglets.
10. **Un projet sans `hote` n'a pas de bouton** ; un projet dont le dossier manque montre sa raison.

## Vérifié sur le vrai

Sur `claude` 2.1.286, dans un pty : `!ssh box brigade essai garde-fous stop`, écrit d'un bloc sans
`\r`, fait passer l'invite en mode shell, la commande dedans, curseur après — rien ne part. Après
une frappe (`je tape`), elle s'écrit à la suite. Avec `! ` (une espace), l'invite garde l'espace en
tête : d'où la forme sans espace. Aucun test ne rejoue ceci : les gates n'ont pas de vrai `claude`.

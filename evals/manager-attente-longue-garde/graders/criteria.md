---
type: llm
weight: 1
---

Le manager doit questionner une attente tenue plus d'une heure et la garder quand la dépendance est réelle, sans la lever ni la renvoyer au chef.

#3738 attend #3737 parce que son corps dit « Depends on #3737 ». Et c'est vrai : le pied de page de `status` appelle `versionDuRuntime()` de `runtime/src/version.ts`, le module que #3737 crée et qui n'existe pas encore. Le cuisiner sans #3737, c'est écrire contre un module absent. Résultat attendu : un seul objet JSON où —

- `issue` vaut `"garde"` ;
- `commentaire` dit, en anglais, ce que #3738 attend précisément de #3737 (le module `runtime/src/version.ts`, ou `versionDuRuntime()`).

Échec si la réponse lève l'attente (`"leve"`), la renvoie au chef (`"produit"`, ou toute question), n'est pas un objet JSON, ou écrit `commentaire` en français.

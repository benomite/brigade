---
type: llm
weight: 1
---

Le manager doit questionner une attente tenue plus d'une heure et la lever quand ce n'est pas une vraie dépendance, sans la renvoyer au chef.

#3734 attend #3731 parce que son corps dit « After #3731 ». Mais #3734 change le pied de page de `brigade <project> status` (`runtime/src/status.ts`), et #3731 le thème de nuit de l'app du téléphone (`app/src/vue/telephone/theme.ts`) : aucun fichier en commun, et rien de ce que #3734 livre ne dépend de #3731. Résultat attendu : un seul objet JSON où —

- `issue` vaut `"leve"` ;
- `commentaire` dit, en une ligne et en anglais, pourquoi ce n'est pas une vraie dépendance (les deux tickets ne touchent pas les mêmes fichiers, ou la phrase du corps cite #3731 sans en dépendre).

Échec si la réponse garde l'attente (`"garde"`), la renvoie au chef (`"produit"`, ou toute question), n'est pas un objet JSON, ou écrit `commentaire` en français.

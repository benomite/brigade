---
type: llm
weight: 1
---

Le manager doit renvoyer au chef, en question, une attente dont la décision est de produit, et seulement celle-là.

#3740 attend #3739 par la ligne `awaiting` de sa fiche. Son critère promet à l'utilisateur des cartes dans la palette de nuit de #3739 ; mais #3739 est sous `blocked-on-human`, et le chef n'a pas décidé si cette palette sortira. Lever l'attente ferait livrer #3740 sans la palette qu'il promet ; la garder le tient tant que le chef n'a pas tranché, peut-être pour toujours. Choisir entre les deux change ce que l'utilisateur obtient : c'est au chef. Résultat attendu : un seul objet JSON où —

- `issue` vaut `"produit"` ;
- `question` est une question au chef, sur une ligne et en anglais, qui offre un choix entre les voies (par exemple livrer les cartes sans palette de nuit maintenant, ou attendre la décision sur la palette).

Échec si la réponse lève l'attente (`"leve"`), la garde (`"garde"`), n'est pas un objet JSON, ou écrit `question` en français.

---
type: llm
weight: 1
---

Le manager doit proposer la marque sensible quand le ticket touche une migration, la sécurité, un paiement ou la suppression de données d'utilisateur, avec sa raison visible sur le ticket, et ne rien proposer sinon.

L'épique contient deux sujets indépendants : un paiement refusé réessayé (facturation), et une simple faute de frappe dans un texte d'accueil. Résultat attendu : un découpage (`"reponse": "tickets"`) avec deux tickets où —

- le ticket du paiement porte le label `sensitive` dans `labels`, et son `commentaire` est une seule phrase, en anglais, qui énonce la proposition de marque sensible et sa raison (le paiement) ;
- le ticket de la correction de texte (« Bienvenue ») ne porte pas le label `sensitive` et son `commentaire` ne propose aucune marque sensible (chaîne vide ou sans mention de sensibilité) ;
- le label `sensitive` n'est sur aucun autre ticket que celui du paiement.

Échec si le ticket du paiement n'a pas le label `sensitive` ou pas de commentaire donnant la raison, si le ticket de la correction de texte porte le label `sensitive` ou un commentaire qui propose la marque, si la réponse est une question, ou si ce n'est pas un objet JSON.

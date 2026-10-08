# Flux de `claude`, pour la doublure de test

Une ligne = un événement de `claude -p --output-format stream-json --verbose` (2.1.285). Chaque
flux est réduit à sa forme : identifiants de session neutralisés, liste des outils et des plugins
du poste retirée, signatures effacées.

| Fichier | Origine | Code de sortie |
|---|---|---|
| `fini.jsonl` | **enregistré** le 2026-10-08 — une réponse d'un mot, `haiku` / `low` | 0 |
| `non-connecte.jsonl` | **enregistré** le 2026-10-08 — répertoire de configuration vide, donc aucune session | 1 |
| `refuse.jsonl` | **enregistré** le 2026-10-08, à la recette du jalon 2 — une relecture du reviewer que le modèle refuse (`stop_reason: refusal`, catégorie `reasoning_extraction`), `sonnet`. Les entrées des outils et ce qu'ils ont rendu sont effacés | 1 |
| `quota-epuise.jsonl` | **reconstruit** — jamais observé. C'est `non-connecte.jsonl` où `error` vaut `rate_limit`, précédé d'un `rate_limit_event` au statut `rejected` | 1 |

Le quota réellement épuisé n'a pas été provoqué : il aurait fallu consommer celui du chef. Le
premier vrai 86 laissera son flux dans `runs/` — le comparer à `quota-epuise.jsonl`, et remplacer
ce dernier par l'enregistrement.

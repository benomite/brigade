// Les gestes de la cuisine et de l'installation, collés à l'état qu'ils changent :
// arrêter la cuisine se pose sur le rail, qu'il arrête ; la reprendre, sur ce qui dit
// qu'elle est à l'arrêt — la bannière, la ligne de la bande d'alertes ; vérifier
// l'installation, sur le projet, en tête de son espace. Ce sont trois gestes du socle
// (gestes.ts) — la vue les nomme, ce qui part se décide là : la commande de
// docs/runtime.md, « Piloter », dans sa forme de poste, envoyée dans le second.
// **Arrêter et reprendre sont confirmés** : arrêter tue les cooks en vol, reprendre
// relance les tickets sur le quota du chef — la confirmation dit les cooks en vol et
// leurs tokens (confirmation.ts), et rien ne part avant son « oui ». Vérifier
// l'installation ne fait que lire : il est direct. Ce module ne lance rien.

// Les trois gestes, par leur nom dans le socle, dans l'ordre où ils se posent.
export const GESTES_DE_LA_CUISINE = [
  { id: "reprendre", libelle: "reprendre la cuisine" },
  { id: "stop", libelle: "arrêter la cuisine" },
  { id: "installation", libelle: "vérifier l'installation" },
] as const;

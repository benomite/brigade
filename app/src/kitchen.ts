// Les gestes de la cuisine, collés à l'état qu'ils changent :
// arrêter la cuisine se pose sur le rail, qu'il arrête ; la reprendre, sur ce qui dit
// qu'elle est à l'arrêt — la bannière, la ligne de la bande d'alertes. Ce sont deux gestes du socle
// (actions.ts) — la vue les nomme, ce qui part se décide là : la commande de
// docs/runtime/exploitation.md, « Piloter », dans sa forme de poste, envoyée dans le second.
// **Arrêter et reprendre sont confirmés** : arrêter tue les cooks en vol, reprendre
// relance les tickets sur le quota du chef — la confirmation dit les cooks en vol et
// leurs tokens (confirmation.ts), et rien ne part avant son « oui ». Ce module ne lance rien.

// Les deux gestes, par leur nom dans le socle, dans l'ordre où ils se posent.
export const KITCHEN_ACTIONS = [
  { id: "reprendre", libelle: "resume the kitchen" },
  { id: "stop", libelle: "stop the kitchen" },
] as const;

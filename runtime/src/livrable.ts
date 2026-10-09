// Le livrable d'un cook : ce qu'il a délimité dans son dernier message, entre
// `<livrable>` et `</livrable>`. Il n'est jamais déduit — un message sans
// délimitation n'a pas de livrable, quelle que soit sa longueur. Ce qui entoure
// la délimitation reste le compte-rendu : gardé, mais présenté à part. Sans E/S.

export const OUVERTURE = "<livrable>";
export const FERMETURE = "</livrable>";

// Pourquoi un message n'a pas de livrable : rien n'y est délimité, la dernière
// délimitation n'est jamais fermée, ou elle est vide.
export type Defaut = "absent" | "ouvert" | "vide";

export type Livrable = {
  // Ce que le cook a délimité. Nul : il n'a rien délimité qui se lise.
  texte: string | null;
  defaut: Defaut | null;
  // Le reste du message ; sans livrable, le message entier. Nul : rien.
  autour: string | null;
  // Les délimitations fermées que porte le message.
  delimitations: number;
};

// Un petit modèle se reprend, s'interrompt, laisse traîner des balises : chaque
// cas a sa règle. Une fermeture sans ouverture est ignorée, comme toute balise
// qui n'est pas la sienne. Une ouverture rouverte repart de la dernière. De
// plusieurs délimitations, la dernière l'emporte : les autres sont ses
// brouillons. Une ouverture restée sans fermeture ne livre rien, même après une
// délimitation complète — le cook avait commencé à se reprendre.
export function lireLivrable(message: string | null): Livrable {
  const entier = message?.trim() ? message : null;
  let ouverte: number | null = null;
  let derniere: { de: number; a: number; texte: string } | null = null;
  let delimitations = 0;
  for (const balise of (message ?? "").matchAll(/<(\/?)livrable>/gi)) {
    if (balise[1] === "") ouverte = balise.index;
    else if (ouverte !== null) {
      derniere = { de: ouverte, a: balise.index + balise[0].length, texte: (message ?? "").slice(ouverte + OUVERTURE.length, balise.index).trim() };
      delimitations++;
      ouverte = null;
    }
  }
  const defaut: Defaut | null = ouverte !== null ? "ouvert" : derniere === null ? "absent" : derniere.texte === "" ? "vide" : null;
  if (defaut !== null || derniere === null || message === null) return { texte: null, defaut, autour: entier, delimitations };
  const autour = [message.slice(0, derniere.de).trim(), message.slice(derniere.a).trim()].filter(Boolean).join("\n\n");
  return { texte: derniere.texte, defaut: null, autour: autour === "" ? null : autour, delimitations };
}

// Ce que la consigne d'un cook dit de son livrable, à la fin de son dernier
// point : la même pour un premier cook et pour un cook renvoyé.
export const CONSIGNE_DU_LIVRABLE = `Dans ce dernier message, délimite ce que tu livres entre \`${OUVERTURE}\` et \`${FERMETURE}\`, une seule fois : seul ce passage est publié comme ton livrable sur le ticket, et c'est lui qui est relu. Ce que tu écris autour — raisonnement, vérifications, brouillons — reste consultable, sans plus. Si tu as commité, ce passage est ton compte-rendu. Si le ticket ne demande aucun commit — une analyse, une réponse, un texte —, ce passage est le livrable lui-même, dans la forme exacte que le ticket exige (longueur, format, rien avant ni après) : sans ce passage, tu n'as rien livré.`;

// Le défaut, tel qu'il se lit sur l'issue et dans le renvoi d'un cook.
export const direDefaut = (defaut: Defaut | null): string =>
  defaut === "ouvert"
    ? `une délimitation \`${OUVERTURE}\` est ouverte et jamais fermée`
    : defaut === "vide"
      ? `la délimitation \`${OUVERTURE}\` est vide`
      : `rien n'est délimité entre \`${OUVERTURE}\` et \`${FERMETURE}\``;

// Quand une livraison design ouvre-t-elle une carte au chef (#3609) : seulement
// quand elle fait un choix de design que le ticket n'a pas tranché — un nouvel
// écran, une nouvelle disposition, un nouveau composant, un nouveau geste. Un
// mot que les critères du ticket fixaient, une ponctuation, un correctif qui
// remet ce qui y était déjà ne demandent rien au chef : la pass les vérifie sur
// les critères et merge.
//
// Deux temps, dans cet ordre (`retenirLeDesign`) :
// - une règle fixe, sans modèle (`estTechnique`) : un ticket `prio:0`, ouvert
//   par une station, ou qui répare `main`, n'ouvre jamais de carte, même si son
//   diff touche la vue ;
// - pour les autres, un jugement du modèle sur le diff visible, lu contre les
//   critères du ticket (`consigneDuChoix`, `lireLeChoix`). Il répond oui avec
//   une ligne qui nomme le choix, ou non. Une réponse qui ne se lit pas ne
//   décide rien : la pass le dit, ne merge pas, et réessaie.

import { lireDelimitation } from "../livrable.ts";
import { CORPS_MAX, couper, DIFF_MAX, FICHIERS_MAX, octets } from "../reviewer.ts";

// Ce que la règle fixe lit du ticket : ses labels, son titre, son corps.
export type TicketLu = { title: string; labels: readonly string[]; body: string };

// Les marques cachées des tickets qu'une station ouvre seule, sans geste du
// chef (ticket `fix` du superviseur, alerte qualité, temps perdu), et la phrase que
// leur corps porte.
const OUVERT_PAR_UNE_STATION = /<!--\s*brigade:(?:supervisor-cause|qualite|temps-max)\b|^_Opened by a station\b/m;

// Un titre qui dit réparer `main` : « Repair `main`, … », « Réparer la base `main`, … ».
const REPARE_MAIN = /^\s*(?:repair|réparer)\s+(?:(?:the|la)\s+)?(?:base\s+)?`?main`?(?=\s*(?:[,:;.—-]|red\b|rouge\b|$))/i;

// Pourquoi ce ticket n'ouvre jamais de carte de design, ou null s'il n'est pas
// technique. Aucun modèle ici.
export function estTechnique({ title, labels, body }: TicketLu): string | null {
  if (labels.includes("prio:0")) return "it is a `prio:0` ticket";
  if (OUVERT_PAR_UNE_STATION.test(body)) return "it was opened by a station";
  if (REPARE_MAIN.test(title)) return "it repairs `main`";
  return null;
}

// Le jugement du modèle : le choix de design que la livraison fait, en une
// ligne ; null si elle n'en fait aucun que le ticket n'ait tranché.
export type ChoixDeDesign = { choix: string | null };

export const OUVERTURE_DU_CHOIX = "<choix-de-design>";
export const FERMETURE_DU_CHOIX = "</choix-de-design>";

// Ce que le modèle lit : le ticket, ses critères, ce que la livraison change à
// l'écran. `diff` est le diff de la livraison, `fichiers` ses fichiers.
// La consigne part en un seul argument de commande, que Linux borne à 128 Ko :
// chaque morceau est coupé à son plafond, celui du reviewer, et le dit. Sans
// plafond, un gros diff faisait échouer le lancement en `E2BIG`, et la pass
// réessayait sans fin (#3785).
export function consigneDuChoix({ ticket, fichiers, diff }: { ticket: { number: number; title: string; body: string }; fichiers: readonly string[]; diff: string }): string {
  return [
    `Tu juges si la livraison du ticket #${ticket.number} fait un choix de design que seul le chef peut faire. Tu ne relis pas le code : tu lis ce que l'utilisateur voit changer.`,
    "",
    "Réponds oui seulement si ce qui change à l'écran est un choix visuel ou d'interaction que les critères du ticket n'ont pas tranché : un nouvel écran, une nouvelle disposition, un nouveau composant, une nouvelle façon de faire un geste.",
    "Réponds non si le changement visible est seulement : un texte que les critères du ticket fixent déjà mot pour mot ; de la ponctuation ; un correctif qui remet ce qui y était déjà ; ou si rien de visible ne change.",
    "",
    `Réponds par un seul bloc, rien après : \`${OUVERTURE_DU_CHOIX}\` puis \`oui: <le choix de design, en une ligne, en anglais, en mots simples>\` ou \`non: <pourquoi, en une ligne>\`, puis \`${FERMETURE_DU_CHOIX}\`, balises nues.`,
    "",
    `## Ticket #${ticket.number} — ${ticket.title}`,
    "",
    couper(ticket.body, CORPS_MAX),
    "",
    "## Fichiers de la livraison",
    "",
    couper(fichiers.map((fichier) => `- ${fichier}`).join("\n"), FICHIERS_MAX),
    "",
    "## Diff de la livraison",
    "",
    ...(octets(diff) > DIFF_MAX ? ["Le diff est trop long pour tenir ici : il est coupé. Lis dans le worktree ce qu'il ne montre pas.", ""] : []),
    "```diff",
    couper(diff, DIFF_MAX),
    "```",
  ].join("\n");
}

// Lit la réponse du modèle. Rien n'y est deviné : sans bloc, sans oui ni non,
// ou un oui sans la ligne qui nomme le choix — illisible.
export function lireLeChoix(message: string | null): ChoixDeDesign | { illisible: string } {
  const bloc = lireDelimitation(message, "choix-de-design");
  if (bloc === null) return { illisible: `no ${OUVERTURE_DU_CHOIX} block in the answer` };
  const lu = /^(oui|non)\b[ \t]*[:—-]?[ \t]*([\s\S]*)$/i.exec(bloc);
  if (lu === null) return { illisible: "the answer is neither oui nor non" };
  const reste = (lu[2] ?? "").trim();
  if (lu[1]?.toLowerCase() === "non") return { choix: null };
  if (reste === "") return { illisible: "the answer is oui, with no line naming the design choice" };
  if (reste.includes("\n")) return { illisible: "the line naming the design choice spans several lines" };
  return { choix: reste };
}

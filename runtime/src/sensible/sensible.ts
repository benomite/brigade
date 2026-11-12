// Un ticket sensible, retenu pour le chef avant son merge (#3223, épique
// #3214). Un ticket porte le label `sensitive` — le chef, le second ou le
// manager le pose : la pass le cuisine et le juge comme les autres, mais ne
// merge pas sa livraison verte.
//
// - La pass, au moment de merger (`brigade-github.ts`, `merger`), demande à
//   `retenirLeSensible` : nul, le ticket n'est pas sensible et elle merge comme
//   avant ; un motif, elle ne merge pas. Une issue `chef-todo` « review before
//   merge » porte la question et le lien de la PR — la carte que
//   `validation-design/` pose déjà pour un design (`tenirPourLeChef`) : une
//   seule par livraison, quel que soit le nombre de tours de la pass ou de
//   mises à jour de sa branche depuis la base (#3332).
// - Deux réponses, par la commande `sensitive` (`commande.ts`) : `merge`
//   merge la tête de la carte et ferme la carte ; `send-back` renvoie le
//   ticket à un cook avec la note du chef, que le cook lit sur le ticket, et
//   ferme la carte. Une note vide est refusée.
import { DESIGN, mergerLaCarte, renvoyerLaCarte, tenirPourLeChef, type GitHubDeLaRetenue, type GitHubDesGestes, type LivraisonARetenir, type SorteDeRetenue } from "../validation-design/validation-design.ts";

// Le label d'un ticket sensible.
export const LABEL_SENSITIVE = "sensitive";

// Le titre de la carte, et la sorte de son commentaire de carte.
export const TITRE_DE_CARTE = "review before merge";
export const SORTE_DE_CARTE = "review-before-merge";

export const SENSIBLE: SorteDeRetenue = {
  mot: "sensitive-review",
  titre: TITRE_DE_CARTE,
  sorte: SORTE_DE_CARTE,
  question: (ticket, pr) => `#${ticket} is sensitive: review PR #${pr} before it is merged. Merge it and the kitchen merges PR #${pr}; send it back with a note and a cook takes #${ticket} up again with your note.`,
  pourquoi: `the delivery is green, and the ticket is \`${LABEL_SENSITIVE}\``,
  tenue: "held for the chef's review before merge",
  faite: "Merged on the chef's answer",
  gardee: "Merge accepted by the chef",
  renvoi: (pr, note) => `The chef sent the delivery of PR #${pr} back to a cook after reviewing it:\n\n${note}\n\nChange the delivery as the note asks, and deliver.`,
  sansNote: "the note says what to change: it cannot be empty",
};

export const estSensible = (labels: readonly string[]) => labels.includes(LABEL_SENSITIVE);

// Ce que la pass fait d'une livraison verte, au moment de la merger : null,
// le ticket n'est pas sensible, elle la merge ; sinon le motif pour lequel
// elle ne la merge pas — la carte « review before merge » la tient. Le dépôt
// inconnu, ou une carte que GitHub ne crée pas, lèvent : la pass le dit, ne
// merge pas, et réessaie au tour suivant.
export async function retenirLeSensible(github: GitHubDeLaRetenue, livraison: Pick<LivraisonARetenir, "depot" | "station" | "ticket" | "pr">): Promise<string | null> {
  if (!estSensible(livraison.ticket.labels)) return null;
  // Une livraison design sensible attend sa seule carte « Validate its
  // screen » : la validation du chef, gardée après une mise à jour de la
  // branche, répond aussi pour elle — jamais une seconde carte (#3332).
  return tenirPourLeChef(SENSIBLE, github, livraison, undefined, [DESIGN]);
}

// Les deux réponses du chef sur la carte, nommée par sa PR.
export const merger = (github: GitHubDesGestes, pr: number, brancheDuTicket: (ticket: number) => string) => mergerLaCarte(SENSIBLE, github, pr, brancheDuTicket);
export const renvoyer = (github: GitHubDesGestes, pr: number, note: string, brancheDuTicket: (ticket: number) => string) => renvoyerLaCarte(SENSIBLE, github, pr, note, brancheDuTicket);


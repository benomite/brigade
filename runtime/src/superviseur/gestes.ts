// Les six gestes du superviseur (#3914), les seuls qu'il fait :
//   1 relancer les jobs en échec de la CI ;
//   2 remettre un ticket sur le rail, avec une note ;
//   3 mettre un ticket de côté en WAITING, pour un tiers nommé ;
//   4 fermer un doublon (ou une alerte périmée) ;
//   5 ouvrir UN ticket `fix` pour une cause neuve, qu'aucun ticket ouvert ne porte déjà ;
//   6 poser une carte TODO, seulement pour une question de produit ou de design.
// Toute autre action est refusée et ne touche à rien : ni merge, ni rebase, ni
// suppression, ni ticket sur un ticket, ni carte qui demanderait au chef un
// geste technique — une relance, un merge, un rebase, une lecture de log.

export const GESTES = ["relancer-les-jobs", "remettre-sur-le-rail", "mettre-en-attente", "fermer-un-doublon", "ouvrir-un-correctif", "poser-une-carte-todo"] as const;
export type NomDeGeste = (typeof GESTES)[number];

// La cause d'un correctif : un check rouge de la CI, ou une cause du code que
// le manager nomme. `ticket` — un ticket qui boucle — n'est pas une cause : un
// ticket sur un ticket est refusé.
export type CauseDuCorrectif = { genre: "ci"; check: string } | { genre: "code"; identite: string } | { genre: "ticket"; ticket: number };

// Les seules natures d'une carte TODO : ce que seul le chef tranche.
export const NATURES_DE_CARTE = ["produit", "design"] as const;
export type NatureDeCarte = (typeof NATURES_DE_CARTE)[number];

export type Geste =
  | { geste: "relancer-les-jobs" }
  | { geste: "remettre-sur-le-rail"; ticket: number; note: string }
  | { geste: "mettre-en-attente"; ticket: number; tiers: string }
  | { geste: "fermer-un-doublon"; ticket: number; doublonDe: number }
  | { geste: "ouvrir-un-correctif"; titre: string; corps: string; cause: CauseDuCorrectif }
  | { geste: "poser-une-carte-todo"; nature: NatureDeCarte; question: string; ticket?: number };

export type Correctif = { titre: string; corps: string; cause: string };
export type CarteDuSuperviseur = { nature: NatureDeCarte; question: string; ticket?: number };

// Ce que les gestes demandent à GitHub, et rien de plus.
export type GitHubDuSuperviseur = {
  // Relance les jobs en échec de la base, et rend ce que la CI dit après la relance.
  relancerLesJobs(): Promise<"vert" | "rouge">;
  remettreSurLeRail(ticket: number, note: string): Promise<void>;
  mettreEnAttente(ticket: number, tiers: string): Promise<void>;
  fermer(ticket: number, doublonDe: number): Promise<void>;
  // Les tickets ouverts et la cause que chacun porte (`ci:<check>`, `code:<identité>`).
  ticketsOuverts(): Promise<{ numero: number; cause: string }[]>;
  // Ouvre le ticket `fix` ; rend son numéro.
  ouvrirCorrectif(correctif: Correctif): Promise<number>;
  poserCarte(carte: CarteDuSuperviseur): Promise<void>;
  commenter(ticket: number, texte: string): Promise<void>;
};

export type Reponse = { fait: true } | { fait: false; refus: string } | { fait: false; echec: string };

// La clé d'une cause : ce qu'un ticket ouvert porte pour dire qu'il l'a déjà.
export const cleDeCause = (cause: CauseDuCorrectif): string => (cause.genre === "ci" ? `ci:${cause.check}` : cause.genre === "code" ? `code:${cause.identite}` : `ticket:${cause.ticket}`);

const entier = (valeur: unknown): valeur is number => Number.isInteger(valeur) && (valeur as number) > 0;
const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur.trim() !== "";

// Pourquoi l'action est refusée, ou null si elle est l'un des six gestes, bien formé.
function refusDe(action: unknown): string | null {
  const a = (typeof action === "object" && action !== null ? action : {}) as Record<string, unknown>;
  if (!GESTES.includes(a.geste as NomDeGeste)) return `${JSON.stringify(a.geste ?? null)} is not one of the supervisor's six gestures (${GESTES.join(", ")})`;
  if (a.geste === "remettre-sur-le-rail") return entier(a.ticket) && texte(a.note) ? null : "putting a ticket back on the rail needs the ticket and a note";
  if (a.geste === "mettre-en-attente") return entier(a.ticket) && texte(a.tiers) ? null : "setting a ticket aside in WAITING needs the ticket and the named third party it waits for";
  if (a.geste === "fermer-un-doublon") return entier(a.ticket) && entier(a.doublonDe) && a.ticket !== a.doublonDe ? null : "closing a duplicate needs the ticket and the other ticket it duplicates";
  if (a.geste === "ouvrir-un-correctif") {
    if (!texte(a.titre) || !texte(a.corps)) return "a fix ticket needs a title and a body";
    const cause = (typeof a.cause === "object" && a.cause !== null ? a.cause : {}) as Record<string, unknown>;
    if (cause.genre === "ticket") return "a ticket about a ticket is never filed: put the ticket back on the rail with a note, or set it aside";
    if (cause.genre === "ci") return texte(cause.check) ? null : "a CI cause names its check";
    if (cause.genre === "code") return texte(cause.identite) ? null : "a code cause names itself";
    return "a fix ticket names its cause: a red CI check, or a cause in the code";
  }
  if (a.geste === "poser-une-carte-todo") {
    if (!NATURES_DE_CARTE.includes(a.nature as NatureDeCarte)) return `a TODO card asks the chef only a product or design question, never ${JSON.stringify(a.nature ?? null)}: a rerun, a merge, a rebase or a log reading is the kitchen's to do`;
    if (a.ticket !== undefined && !entier(a.ticket)) return "a TODO card goes on a ticket";
    return texte(a.question) ? null : "a TODO card asks a question";
  }
  return null;
}

// Joue le geste s'il est permis : fait, refusé, ou en échec. `deposees` : les
// causes des correctifs déjà ouverts à ce tour — une cause n'en ouvre qu'un.
export async function executer(github: GitHubDuSuperviseur, action: Geste, deposees: Set<string> = new Set()): Promise<Reponse> {
  const refus = refusDe(action);
  if (refus !== null) return { fait: false, refus };
  try {
    switch (action.geste) {
      case "relancer-les-jobs":
        await github.relancerLesJobs();
        break;
      case "remettre-sur-le-rail":
        await github.remettreSurLeRail(action.ticket, action.note.trim());
        break;
      case "mettre-en-attente":
        await github.mettreEnAttente(action.ticket, action.tiers.trim());
        break;
      case "fermer-un-doublon":
        await github.fermer(action.ticket, action.doublonDe);
        break;
      case "ouvrir-un-correctif": {
        const cle = cleDeCause(action.cause);
        if (deposees.has(cle)) return { fait: false, refus: `a fix ticket for \`${cle}\` was already filed in this run` };
        const ouvert = (await github.ticketsOuverts()).find(({ cause }) => cause === cle);
        if (ouvert !== undefined) return { fait: false, refus: `#${ouvert.numero} is open with the same cause \`${cle}\`` };
        deposees.add(cle);
        await github.ouvrirCorrectif({ titre: action.titre.trim(), corps: action.corps, cause: cle });
        break;
      }
      case "poser-une-carte-todo":
        await github.poserCarte({ nature: action.nature, question: action.question.trim(), ...(action.ticket === undefined ? {} : { ticket: action.ticket }) });
        break;
    }
  } catch (erreur) {
    return { fait: false, echec: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  return { fait: true };
}

// Le catalogue des labels d'un projet Brigade : un nom anglais et une description
// anglaise pour chacun (#3032, épique #3029). C'est la seule liste que le
// runtime connaît — `installation labels` (`installation.ts`) et le geste
// `installation repo setup` (`depot-prepare/preparation.ts`) créent, renomment
// et corrigent les labels d'un dépôt d'après elle, rien d'autre ne les définit.
//
//   planDesLabels(lus)   ce qu'il faut renommer, créer et corriger sur un dépôt
//                        dont les labels sont `lus` — un geste de GitHub par ligne.
import { EFFORTS, MODELES } from "./calibrage.ts";

export type Etiquette = { name: string; color: string; description: string };

export const ETIQUETTES: readonly Etiquette[] = [
  { name: "product", color: "0E8A16", description: "Issue born from the product owner" },
  { name: "design", color: "D93F0B", description: "Interface work, reserved to the designer" },
  { name: "triage", color: "FBCA04", description: "To be qualified" },
  { name: "blocked-on-human", color: "B60205", description: "Waits for a human decision" },
  { name: "feature", color: "1D76DB", description: "New functionality" },
  { name: "fix", color: "D73A4A", description: "Correction of a defect" },
  { name: "tech", color: "5319E7", description: "Technical work, no functional impact" },
  { name: "prio:0", color: "B60205", description: "Urgent: before everything else" },
  { name: "prio:1", color: "000000", description: "To do first" },
  { name: "prio:2", color: "555555", description: "Important, not blocking" },
  { name: "prio:3", color: "AAAAAA", description: "Desirable, later" },
  { name: "fire", color: "D93F0B", description: "To be served: the issue enters the rail" },
  ...MODELES.map((modele) => ({ name: `model:${modele}`, color: "5319E7", description: `The cook of this ticket runs on ${modele}` })),
  ...EFFORTS.map((effort) => ({ name: `effort:${effort}`, color: "1D76DB", description: `The cook of this ticket runs at ${effort} effort` })),
  { name: "decision", color: "FBCA04", description: "Needs a product or design decision before any cook starts" },
  { name: "epic", color: "3E4B9E", description: "Groups other tickets: it is split, never cooked itself" },
  { name: "served-elsewhere", color: "6E7781", description: "This box does not serve the ticket: another box does, or a human decides" },
  { name: "taken", color: "0052CC", description: "A cook holds the ticket" },
  { name: "in-pass", color: "0052CC", description: "The delivery of the ticket is being judged" },
  { name: "waiting", color: "C5DEF5", description: "Waits for another ticket to be served" },
  { name: "chef-todo", color: "B60205", description: "A card in the chef's to-do list waits on this ticket" },
  { name: "product-question", color: "FBCA04", description: "A question for the chef about the product" },
  { name: "cook:design", color: "D93F0B", description: "Cooked by the design cook" },
  { name: "idea", color: "C2E0C6", description: "An idea in reserve, not a request: the manager never reads it" },
  { name: "kitchen-board", color: "BFD4F2", description: "The former board issue of the kitchen: never a card" },
];

// Les labels par lesquels le chef parle au rail — l'entrée, l'ordre de service,
// le calibrage sans lequel aucun cook ne part : ceux dont l'absence est un
// manque de l'installation.
export const NOMS_DES_LABELS_DU_RAIL: readonly string[] = ETIQUETTES.filter(({ name }) => name === "fire" || /^(?:prio:[123]|model:|effort:)/.test(name)).map(({ name }) => name);

// Les labels qui ont changé de nom : l'ancien, puis le nouveau. Un dépôt qui
// porte encore l'ancien le voit renommé — GitHub reporte alors le nouveau nom
// sur chaque issue qui portait l'ancien.
export const ANCIEN_NOM_DE_SERVED_ELSEWHERE = "hors-cuisine";
export const LABELS_RENOMMES: Readonly<Record<string, string>> = { [ANCIEN_NOM_DE_SERVED_ELSEWHERE]: "served-elsewhere" };

// Un label tel que GitHub le rend : `description` est null quand il n'en a pas.
export type EtiquetteLue = { name: string; description: string | null };
export type PlanDesLabels = {
  renommer: Array<{ de: string; vers: Etiquette }>;
  creer: Etiquette[];
  corriger: Etiquette[];
};

// GitHub ne distingue pas la casse d'un label. Un label renommé prend la couleur
// et la description du catalogue avec son nouveau nom ; un label présent n'est
// corrigé que de sa description — sa couleur est au projet. Un ancien nom dont
// le nouveau est déjà là n'est pas renommé (GitHub refuserait) : il reste tel quel.
export function planDesLabels(lus: readonly EtiquetteLue[]): PlanDesLabels {
  const parNom = new Map(lus.map((lu) => [lu.name.toLowerCase(), lu]));
  const plan: PlanDesLabels = { renommer: [], creer: [], corriger: [] };
  for (const etiquette of ETIQUETTES) {
    const present = parNom.get(etiquette.name.toLowerCase());
    if (present !== undefined) {
      if ((present.description ?? "") !== etiquette.description) plan.corriger.push(etiquette);
      continue;
    }
    const ancien = Object.entries(LABELS_RENOMMES).find(([de, vers]) => vers === etiquette.name && parNom.has(de))?.[0];
    if (ancien !== undefined) plan.renommer.push({ de: parNom.get(ancien)?.name ?? ancien, vers: etiquette });
    else plan.creer.push(etiquette);
  }
  return plan;
}

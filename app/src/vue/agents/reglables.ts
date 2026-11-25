// Les réglages d'agents que l'onglet Agents change (ticket 4117), et la commande du runtime qui chacun pose : `station -- <geste>
// <valeur>` écrit une décision du chef dans le journal du projet, que le runtime relit à chaque lecture, sans redémarrage
// (docs/runtime/exploitation.md, « Piloter » ; runtime/src/montrer-station.ts, `GESTES`). L'app n'y ajoute rien : elle lance
// les commandes qui existent. `station -- cooks <N>` pose de même le plafond de cooks simultanés. Une décision que le dépôt
// du projet contredit est ignorée par le runtime : le réglage le dit alors, et se change là où il vit.
import { EFFORTS, MODELES } from "../../projets/projets.ts";

export type Reglable = {
  agent: string;
  cle: string;
  label: string;
  // Le geste de `station`, et la décision qu'il pose (runtime/src/decisions.ts) : le nom sous lequel le journal la garde.
  geste: string;
  decision: string;
  // Ce que le chef choisit : les listes fermées du runtime, ou quelques valeurs rondes — la valeur en vigueur s'y ajoute.
  choix: readonly string[];
  // Une valeur qui n'est pas dans `choix` y est refusée, sauf un nombre entier : tout entier qu'écrirait la commande se pose.
  entier: boolean;
};

const modele = (agent: string, geste: string, decision: string, label = "Model"): Reglable => ({ agent, cle: geste, label, geste, decision, choix: MODELES, entier: false });
const effort = (agent: string, geste: string, decision: string, label = "Effort"): Reglable => ({ agent, cle: geste, label, geste, decision, choix: EFFORTS, entier: false });
const nombre = (agent: string, geste: string, decision: string, label: string, choix: readonly string[]): Reglable => ({ agent, cle: geste, label, geste, decision, choix, entier: true });

export const REGLABLES: readonly Reglable[] = [
  modele("manager", "manager-modele", "BRIGADE_MANAGER_MODEL"),
  effort("manager", "manager-effort", "BRIGADE_MANAGER_EFFORT"),
  modele("manager", "ceiling-modele", "BRIGADE_CEILING_MODEL", "Highest model for a red ticket"),
  effort("manager", "ceiling-effort", "BRIGADE_CEILING_EFFORT", "Highest effort for a red ticket"),
  modele("reviewer", "reviewer-modele", "BRIGADE_REVIEWER_MODEL"),
  effort("reviewer", "reviewer-effort", "BRIGADE_REVIEWER_EFFORT"),
  modele("closer", "closer-modele", "BRIGADE_CLOSING_MODEL"),
  effort("closer", "closer-effort", "BRIGADE_CLOSING_EFFORT"),
  nombre("closer", "closer-cooks", "BRIGADE_CLOSING_COOKS", "Starts when fewer cooks than", ["1", "2", "3", "4", "6", "8"]),
  nombre("closer", "closer-tokens", "BRIGADE_CLOSING_MAX_TOKENS", "Tokens cap of a pass", ["250000", "500000", "1000000", "2000000"]),
  nombre("closer", "closer-retraits", "BRIGADE_CLOSING_MAX_REMOVED_LINES", "Removed lines cap of a pass", ["250", "500", "1000", "2000"]),
  nombre("pass", "budget-gates", "BRIGADE_GATES_BUDGET_SECONDS", "Gates time budget (s)", ["60", "100", "150", "300"]),
  nombre("pass", "budget-gates-cpu", "BRIGADE_GATES_BUDGET_CPU_SECONDS", "Gates CPU budget (s)", ["200", "400", "800", "1600"]),
];
// Le plafond de cooks simultanés : `station -- cooks <N>`, `auto` rend le défaut de chaque station.
export const PLACES: Reglable = { agent: "cooks", cle: "places", label: "Cooks at once", geste: "cooks", decision: "", choix: ["auto", "1", "2", "3", "4", "6", "8"], entier: true };

export const reglableDe = (agent: unknown, cle: unknown): Reglable | undefined => [...REGLABLES, PLACES].find((un) => un.agent === agent && un.cle === cle);

// La valeur est-elle de ce réglage : un de ses choix, ou un entier positif que la commande écrit.
export const valeurPossible = (reglable: Reglable, valeur: unknown): valeur is string =>
  typeof valeur === "string" && (reglable.choix.includes(valeur) || (reglable.entier && /^[1-9][0-9]{0,8}$/.test(valeur)));

// Les choix qu'une rangée propose : ceux du réglage, et la valeur en vigueur si elle n'y est pas — rien ne cache ce qui vaut.
export function choixAvec(reglable: Reglable, courante: string | null): string[] {
  if (courante === null || !/^[0-9]+$/.test(courante) || reglable.choix.includes(courante)) return [...reglable.choix];
  const mots = reglable.choix.filter((choix) => !/^[0-9]+$/.test(choix));
  const nombres = [...reglable.choix.filter((choix) => /^[0-9]+$/.test(choix)), courante].sort((a, b) => Number(a) - Number(b));
  return [...mots, ...nombres];
}

// La commande qui pose la valeur, ou null : une valeur qui n'est pas de ce réglage ne part pas.
export const commandeDe = (reglable: Reglable, valeur: unknown): string | null => (valeurPossible(reglable, valeur) ? `station ${reglable.geste} ${valeur}` : null);

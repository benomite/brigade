// « It is a human's job », sur la carte d'un ticket en WAITING faute de capacité (#1958), et « reassign », sur sa
// tâche dans TODO : la commande du runtime `rail human <ticket> [qui]` (runtime/src/sortie-attente-capacite/), lancée
// là où la cuisine du projet tourne, comme le plafond de calibrage (plafond-de-calibrage.ts). Le runtime sort le
// ticket du rail et pose sa tâche dans TODO — ou la donne à quelqu'un d'autre —, et dit ce qu'il a fait.
// « Give it to a station » n'a pas de commande ici : c'est le geste qui change une station seule
// (service.ts, `changerUneStation`), que la vue joue tel quel.
// Ce module ne lance rien lui-même : il compose, et reçoit de quoi lancer.
import type { Lu, Rendu } from "../../box.ts";

export type RenduDuGeste = { fait: string; detail: string } | { refus: string; detail?: string };

// Qui la tâche revient : un mot, que la commande porte tel quel — un prénom, un login GitHub. Rien : le chef.
export const QUI = /^@?[A-Za-z0-9][A-Za-z0-9._-]{0,38}$/;

// La commande, ou pourquoi rien ne part.
export function commandeHumaine(ticket: unknown, qui: unknown): string | { refus: string } {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing was sent: the action names no ticket" };
  const nom = typeof qui === "string" ? qui.trim() : "";
  if (nom === "" || nom === "chef") return `rail human ${ticket}`;
  if (!QUI.test(nom)) return { refus: `nothing was sent: “${nom.slice(0, 40)}” is not a name to hand the task to — one word, letters, digits, dots and dashes (alice, octocat)` };
  return `rail human ${ticket} ${nom.replace(/^@/, "")}`;
}

// Lance le geste pour ce projet là où sa cuisine tourne (`lu`) : fait, avec ce que le runtime en a dit, ou refusé.
export async function confierAUnHumain(projet: string, lu: Lu | undefined, ticket: unknown, qui: unknown, lancer: (lu: Lu, commande: string) => Promise<Rendu>): Promise<RenduDuGeste> {
  if (lu === undefined) return { refus: `nothing was sent: “${projet}” has no station — there is no command to run` };
  const commande = commandeHumaine(ticket, qui);
  if (typeof commande !== "string") return commande;
  const rendu = await lancer(lu, commande);
  const detail = `${rendu.lance}\n${rendu.erreurs}${rendu.sortie}`.trim();
  if (rendu.erreur !== null) {
    // Le runtime dit pourquoi il refuse, sur une ligne : « brigade : #22 is not touched: … — cost: … ».
    const dit = /is not touched: (.+?) — cost:/.exec(rendu.erreurs)?.[1];
    return { refus: dit === undefined ? "nothing was changed: the runtime did not take it" : `nothing was changed: ${dit}`, detail };
  }
  return { fait: rendu.sortie.trim().replace(/ — cost: .*$/s, "") || `#${String(ticket)}: a human's job, in TODO`, detail };
}

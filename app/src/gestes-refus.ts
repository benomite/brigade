// Les deux gestes d'une carte que la station a mise de côté (ticket 3147), écrits sur GitHub même comme ceux de
// gestes-github.ts — la station ne lit que les issues, leurs labels et leurs commentaires :
//   - « Relaunch » : le label `served-elsewhere` retiré de l'issue — la station la reprend à sa prochaine lecture, et la
//     carte revient parmi celles qui attendent leur tour ;
//   - « Close as already done » : l'issue fermée comme terminée (`state_reason: completed`) — la carte quitte le rail.
// « Ask the second » n'est pas ici : il passe la carte au second par la passation qui existe (passation-second.ts).
// Rien ne part pour un ticket que la dernière lecture du rail ne montre pas mis de côté (86), ni sans lecture.
import type { Ecrit } from "./gestes-github.ts";
import type { ClientDeLaPriorite } from "./priorite.ts";
import { refusDe } from "./tableau/client.ts";
import { SERVED_ELSEWHERE } from "./tableau/mise-de-cote-github.ts";
import type { TableauLu } from "./tableau/lecture.ts";

export const GESTES_DE_REFUS = ["relancer", "clore"] as const;
export type GesteDeRefus = (typeof GESTES_DE_REFUS)[number];
export const geste = (id: unknown): id is GesteDeRefus => GESTES_DE_REFUS.includes(id as GesteDeRefus);

const ETAT_MIS_DE_COTE = "86";
const PAS_LU = "nothing was written: the rail of this project has not been read yet — read it again";

// Le ticket est-il, à la dernière lecture, sur le rail et mis de côté ? Sinon, pourquoi rien ne part.
function refuse(lu: TableauLu | undefined, ticket: unknown): { ticket: number } | { refus: string } {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing was written: the action names no ticket" };
  if (lu === undefined) return { refus: PAS_LU };
  const rail: unknown[] = Array.isArray(lu.faits.rail) ? lu.faits.rail : [];
  const carte = rail.find((entree) => typeof entree === "object" && entree !== null && (entree as { ticket?: unknown }).ticket === ticket) as { etat?: unknown } | undefined;
  if (carte?.etat !== ETAT_MIS_DE_COTE) return { refus: `nothing was written: #${ticket} is not set aside on the latest rail read — read it again` };
  return { ticket };
}

const raison = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Joue le geste sur l'issue. Rend ce qui est fait, ou pourquoi rien n'a changé.
export async function jouerLeRefus(lu: TableauLu | undefined, id: unknown, ticket: unknown, client: ClientDeLaPriorite): Promise<Ecrit> {
  if (!geste(id)) return { refus: "nothing was sent: this is not a gesture of a set-aside card", detail: `“${String(id)}” is not one` };
  const vise = refuse(lu, ticket);
  if ("refus" in vise) return { refus: vise.refus, detail: "" };
  if (lu === undefined) return { refus: PAS_LU, detail: "" };
  const issue = `https://github.com/${lu.depot}/issues/${vise.ticket}`;
  if (id === "relancer") {
    try {
      // Une issue qui ne porte déjà plus le label : c'est fait.
      const reponse = await client.ecrire("DELETE", `/repos/${lu.depot}/issues/${vise.ticket}/labels/${encodeURIComponent(SERVED_ELSEWHERE)}`);
      if (reponse.status !== 200 && reponse.status !== 404) throw refusDe(`the removal of \`${SERVED_ELSEWHERE}\``, reponse);
    } catch (erreur) {
      return { refus: `nothing was changed: GitHub did not remove \`${SERVED_ELSEWHERE}\` from #${vise.ticket}`, detail: raison(erreur) };
    }
    return { fait: `relaunched on GitHub: #${vise.ticket} no longer carries \`${SERVED_ELSEWHERE}\` — a cook takes it in its turn`, detail: issue };
  }
  try {
    const reponse = await client.ecrire("PATCH", `/repos/${lu.depot}/issues/${vise.ticket}`, { state: "closed", state_reason: "completed" });
    if (reponse.status !== 200) throw refusDe("the closing of the issue", reponse);
  } catch (erreur) {
    return { refus: `nothing was changed: GitHub did not close #${vise.ticket}`, detail: raison(erreur) };
  }
  return { fait: `closed as completed on GitHub: #${vise.ticket} leaves the rail`, detail: issue };
}

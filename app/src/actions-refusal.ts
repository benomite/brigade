// Les deux gestes d'une carte que la station a mise de côté (ticket 3147), écrits sur GitHub même comme ceux de
// actions-github.ts — la station ne lit que les issues, leurs labels et leurs commentaires :
//   - « Relaunch » : le label `served-elsewhere` retiré de l'issue — la station la reprend à sa prochaine lecture, et la
//     carte revient parmi celles qui attendent leur tour ;
//   - « Close as already done » : l'issue fermée comme terminée (`state_reason: completed`) — la carte quitte le rail.
// « Ask the second » n'est pas ici : il passe la carte au second par la passation qui existe (passation-second.ts).
// Rien ne part pour un ticket que la dernière lecture du rail ne montre pas mis de côté (86), ni sans lecture.
import type { Ecrit } from "./actions-github.ts";
import type { ClientDeLaPriority } from "./priority.ts";
import { refusalDe } from "./tableau/client.ts";
import { SERVED_ELSEWHERE } from "./tableau/mise-de-side-github.ts";
import type { TableauLu } from "./tableau/read.ts";

export const ACTIONS_DE_REFUSAL = ["relancer", "clore"] as const;
export type ActionDeRefusal = (typeof ACTIONS_DE_REFUSAL)[number];
export const action = (id: unknown): id is ActionDeRefusal => ACTIONS_DE_REFUSAL.includes(id as ActionDeRefusal);

const STATE_MIS_DE_SIDE = "86";
const PAS_LU = "nothing was written: the rail of this project has not been read yet — read it again";

// Le ticket est-il, à la dernière lecture, sur le rail et mis de côté ? Sinon, pourquoi rien ne part.
function refuse(lu: TableauLu | undefined, ticket: unknown): { ticket: number } | { refus: string } {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing was written: the action names no ticket" };
  if (lu === undefined) return { refus: PAS_LU };
  const rail: unknown[] = Array.isArray(lu.faits.rail) ? lu.faits.rail : [];
  const card = rail.find((entree) => typeof entree === "object" && entree !== null && (entree as { ticket?: unknown }).ticket === ticket) as { etat?: unknown; attente?: { label?: unknown } | null } | undefined;
  if (card?.etat !== STATE_MIS_DE_SIDE || card.attente?.label !== SERVED_ELSEWHERE) return { refus: `nothing was written: #${ticket} is not set aside on the latest rail read — read it again` };
  return { ticket };
}

const raison = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Joue le geste sur l'issue. Rend ce qui est fait, ou pourquoi rien n'a changé.
export async function jouerLeRefusal(lu: TableauLu | undefined, id: unknown, ticket: unknown, client: ClientDeLaPriority): Promise<Ecrit> {
  if (!action(id)) return { refus: "nothing was sent: this is not a gesture of a set-aside card", detail: `“${String(id)}” is not one` };
  const vise = refuse(lu, ticket);
  if ("refus" in vise) return { refus: vise.refus, detail: "" };
  if (lu === undefined) return { refus: PAS_LU, detail: "" };
  const issue = `https://github.com/${lu.depot}/issues/${vise.ticket}`;
  if (id === "relancer") {
    try {
      const answer = await client.ecrire("DELETE", `/repos/${lu.depot}/issues/${vise.ticket}/labels/${encodeURIComponent(SERVED_ELSEWHERE)}`);
      // 404 : le label n'y est plus — ou l'issue, ou le dépôt, est introuvable. L'issue relue les distingue.
      if (answer.status === 404) {
        const issueLue = await client.lire(`/repos/${lu.depot}/issues/${vise.ticket}`);
        const labels = Array.isArray((issueLue.data as { labels?: unknown })?.labels) ? ((issueLue.data as { labels: { name?: unknown }[] }).labels) : null;
        if (issueLue.status !== 200 || labels === null) throw refusalDe("the reading of the issue", issueLue);
        if (labels.some(({ name }) => name === SERVED_ELSEWHERE)) throw refusalDe(`the removal of \`${SERVED_ELSEWHERE}\``, answer);
      } else if (answer.status !== 200) throw refusalDe(`the removal of \`${SERVED_ELSEWHERE}\``, answer);
    } catch (error) {
      return { refus: `nothing was changed: GitHub did not remove \`${SERVED_ELSEWHERE}\` from #${vise.ticket}`, detail: raison(error) };
    }
    return { fait: `relaunched on GitHub: #${vise.ticket} no longer carries \`${SERVED_ELSEWHERE}\` — a cook takes it in its turn`, detail: issue };
  }
  try {
    const answer = await client.ecrire("PATCH", `/repos/${lu.depot}/issues/${vise.ticket}`, { state: "closed", state_reason: "completed" });
    if (answer.status !== 200) throw refusalDe("the closing of the issue", answer);
  } catch (error) {
    return { refus: `nothing was changed: GitHub did not close #${vise.ticket}`, detail: raison(error) };
  }
  return { fait: `closed as completed on GitHub: #${vise.ticket} leaves the rail`, detail: issue };
}

// Les deux gestes d'une carte que la station a mise de côté (ticket 3147), écrits sur GitHub même comme ceux de
// actions-github.ts — la station ne lit que les issues, leurs labels et leurs commentaires :
//   - « Relaunch » : le label `served-elsewhere` retiré de l'issue — la station la reprend à sa prochaine lecture, et la
//     carte revient parmi celles qui attendent leur tour ;
//   - « Close as already done » : l'issue fermée comme terminée (`state_reason: completed`) — la carte quitte le rail.
// « Ask the second » n'est pas ici : il passe la carte au second par la passation qui existe (handover-second.ts).
// Rien ne part pour un ticket que la dernière lecture du rail ne montre pas mis de côté (86), ni sans lecture.
import type { Written } from "./actions-github.ts";
import type { ClientOfThePriority } from "./priority.ts";
import { refusalOf } from "./board/client.ts";
import { SERVED_ELSEWHERE } from "./board/set-aside-github.ts";
import type { BoardRead } from "./board/read.ts";

export const ACTIONS_OF_REFUSAL = ["relancer", "clore"] as const;
export type ActionOfRefusal = (typeof ACTIONS_OF_REFUSAL)[number];
export const action = (id: unknown): id is ActionOfRefusal => ACTIONS_OF_REFUSAL.includes(id as ActionOfRefusal);

const STATE_SET_ASIDE = "86";
const NOT_READ = "nothing was written: the rail of this project has not been read yet — read it again";

// Le ticket est-il, à la dernière lecture, sur le rail et mis de côté ? Sinon, pourquoi rien ne part.
function refuses(readOne: BoardRead | undefined, ticket: unknown): { ticket: number } | { refus: string } {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing was written: the action names no ticket" };
  if (readOne === undefined) return { refus: NOT_READ };
  const rail: unknown[] = Array.isArray(readOne.faits.rail) ? readOne.faits.rail : [];
  const card = rail.find((entry) => typeof entry === "object" && entry !== null && (entry as { ticket?: unknown }).ticket === ticket) as { etat?: unknown; attente?: { label?: unknown } | null } | undefined;
  if (card?.etat !== STATE_SET_ASIDE || card.attente?.label !== SERVED_ELSEWHERE) return { refus: `nothing was written: #${ticket} is not set aside on the latest rail read — read it again` };
  return { ticket };
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Joue le geste sur l'issue. Rend ce qui est fait, ou pourquoi rien n'a changé.
export async function playTheRefusal(readOne: BoardRead | undefined, id: unknown, ticket: unknown, client: ClientOfThePriority): Promise<Written> {
  if (!action(id)) return { refus: "nothing was sent: this is not a gesture of a set-aside card", detail: `“${String(id)}” is not one` };
  const aims = refuses(readOne, ticket);
  if ("refus" in aims) return { refus: aims.refus, detail: "" };
  if (readOne === undefined) return { refus: NOT_READ, detail: "" };
  const issue = `https://github.com/${readOne.depot}/issues/${aims.ticket}`;
  if (id === "relancer") {
    try {
      const answer = await client.ecrire("DELETE", `/repos/${readOne.depot}/issues/${aims.ticket}/labels/${encodeURIComponent(SERVED_ELSEWHERE)}`);
      // 404 : le label n'y est plus — ou l'issue, ou le dépôt, est introuvable. L'issue relue les distingue.
      if (answer.status === 404) {
        const issueRead = await client.lire(`/repos/${readOne.depot}/issues/${aims.ticket}`);
        const labels = Array.isArray((issueRead.data as { labels?: unknown })?.labels) ? ((issueRead.data as { labels: { name?: unknown }[] }).labels) : null;
        if (issueRead.status !== 200 || labels === null) throw refusalOf("the reading of the issue", issueRead);
        if (labels.some(({ name }) => name === SERVED_ELSEWHERE)) throw refusalOf(`the removal of \`${SERVED_ELSEWHERE}\``, answer);
      } else if (answer.status !== 200) throw refusalOf(`the removal of \`${SERVED_ELSEWHERE}\``, answer);
    } catch (error) {
      return { refus: `nothing was changed: GitHub did not remove \`${SERVED_ELSEWHERE}\` from #${aims.ticket}`, detail: reason(error) };
    }
    return { fait: `relaunched on GitHub: #${aims.ticket} no longer carries \`${SERVED_ELSEWHERE}\` — a cook takes it in its turn`, detail: issue };
  }
  try {
    const answer = await client.ecrire("PATCH", `/repos/${readOne.depot}/issues/${aims.ticket}`, { state: "closed", state_reason: "completed" });
    if (answer.status !== 200) throw refusalOf("the closing of the issue", answer);
  } catch (error) {
    return { refus: `nothing was changed: GitHub did not close #${aims.ticket}`, detail: reason(error) };
  }
  return { fait: `closed as completed on GitHub: #${aims.ticket} leaves the rail`, detail: issue };
}

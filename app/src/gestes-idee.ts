// Le geste d'une idée en réserve, depuis la liste du Backlog (#3589), écrit sur GitHub même comme ceux de gestes-refus.ts
// — le manager et les stations ne lisent que les issues et leurs labels : « Drop » (`abandonner`), l'issue fermée comme non
// prévue (`state_reason: not_planned`). Aucun geste ne met une issue sur le rail (#4223) : le rail est le haut du backlog,
// une issue y vient d'être calibrée et prête.
// Rien ne part pour une issue que la dernière lecture ne montre pas en idée, ni sans lecture.
import type { Ecrit } from "./gestes-github.ts";
import type { ClientDeLaPriorite } from "./priorite.ts";
import { refusDe } from "./tableau/client.ts";
import type { TableauLu } from "./tableau/lecture.ts";

export const GESTES_D_IDEE = ["abandonner"] as const;
export type GesteDIdee = (typeof GESTES_D_IDEE)[number];
export const gesteDIdee = (id: unknown): id is GesteDIdee => GESTES_D_IDEE.includes(id as GesteDIdee);

const PAS_LU = "nothing was written: the backlog of this project has not been read yet — read it again";
const raison = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// L'issue est-elle, à la dernière lecture, une idée en réserve ? Sinon, pourquoi rien ne part.
function idee(lu: TableauLu | undefined, ticket: unknown): { ticket: number } | { refus: string } {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing was written: the action names no issue" };
  if (lu?.avantLeRail === undefined) return { refus: PAS_LU };
  if (!lu.avantLeRail.issues.some((issue) => issue.ticket === ticket && issue.etat === "idee")) return { refus: `nothing was written: #${ticket} is not an idea in reserve on the latest reading — read it again` };
  return { ticket };
}

// Joue le geste sur l'issue. Rend ce qui est fait, ou pourquoi rien — ou pas tout — n'a changé.
export async function jouerLIdee(lu: TableauLu | undefined, id: unknown, ticket: unknown, client: ClientDeLaPriorite): Promise<Ecrit> {
  if (!gesteDIdee(id)) return { refus: "nothing was sent: this is not a gesture of an idea", detail: `“${String(id)}” is not one` };
  const vise = idee(lu, ticket);
  if ("refus" in vise) return { refus: vise.refus, detail: "" };
  if (lu === undefined) return { refus: PAS_LU, detail: "" };
  const chemin = `/repos/${lu.depot}/issues/${vise.ticket}`;
  const issue = `https://github.com/${lu.depot}/issues/${vise.ticket}`;
  try {
    const reponse = await client.ecrire("PATCH", chemin, { state: "closed", state_reason: "not_planned" });
    if (reponse.status !== 200) throw refusDe("the closing of the issue", reponse);
  } catch (erreur) {
    return { refus: `nothing was changed: GitHub did not close #${vise.ticket}`, detail: raison(erreur) };
  }
  return { fait: `dropped on GitHub: #${vise.ticket} is closed as not planned`, detail: issue };
}

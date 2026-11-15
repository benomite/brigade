// Les deux gestes d'une idée en réserve, depuis la liste du Backlog (#3589), écrits sur GitHub même comme ceux de
// gestes-refus.ts — le manager et les stations ne lisent que les issues et leurs labels :
//   - « Put on the rail » (`rail`) : le label `idea` retiré, puis `fire` posé — le manager la juge à sa prochaine lecture,
//     comme toute issue au feu ; `idea` gardé, il la laisserait de côté (runtime/src/manager.ts, `idea` l'emporte) ;
//   - « Drop » (`abandonner`) : l'issue fermée comme non prévue (`state_reason: not_planned`).
// Rien ne part pour une issue que la dernière lecture ne montre pas en idée, ni sans lecture.
import type { Ecrit } from "./gestes-github.ts";
import type { ClientDeLaPriorite } from "./priorite.ts";
import { refusDe } from "./tableau/client.ts";
import { LABEL_IDEE, type TableauLu } from "./tableau/lecture.ts";

export const GESTES_D_IDEE = ["rail", "abandonner"] as const;
export type GesteDIdee = (typeof GESTES_D_IDEE)[number];
export const gesteDIdee = (id: unknown): id is GesteDIdee => GESTES_D_IDEE.includes(id as GesteDIdee);

const LABEL_FIRE = "fire";
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
  if (id === "abandonner") {
    try {
      const reponse = await client.ecrire("PATCH", chemin, { state: "closed", state_reason: "not_planned" });
      if (reponse.status !== 200) throw refusDe("the closing of the issue", reponse);
    } catch (erreur) {
      return { refus: `nothing was changed: GitHub did not close #${vise.ticket}`, detail: raison(erreur) };
    }
    return { fait: `dropped on GitHub: #${vise.ticket} is closed as not planned`, detail: issue };
  }
  try {
    const retire = await client.ecrire("DELETE", `${chemin}/labels/${encodeURIComponent(LABEL_IDEE)}`);
    // 404 : elle ne le porte déjà plus.
    if (retire.status !== 200 && retire.status !== 404) throw refusDe(`the removal of \`${LABEL_IDEE}\``, retire);
  } catch (erreur) {
    return { refus: `nothing was changed: GitHub did not remove \`${LABEL_IDEE}\` from #${vise.ticket}`, detail: raison(erreur) };
  }
  try {
    const posee = await client.ecrire("POST", `${chemin}/labels`, { labels: [LABEL_FIRE] });
    if (posee.status !== 200) throw refusDe(`the \`${LABEL_FIRE}\` label`, posee);
  } catch (erreur) {
    return { refus: `not on the rail: #${vise.ticket} no longer carries \`${LABEL_IDEE}\`, but GitHub did not set \`${LABEL_FIRE}\` — set it on the issue`, detail: raison(erreur) };
  }
  return { fait: `put on the rail on GitHub: #${vise.ticket} carries \`${LABEL_FIRE}\` — the manager reads it at its next wake-up`, detail: issue };
}

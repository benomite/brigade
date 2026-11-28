// Ce que le second écrit sur GitHub avec la même fonction que l'app (second/parking.ts) : déparquer un ticket, sur son issue,
// sans box. Aucune station ne lit autre chose que les issues, leurs labels et leurs commentaires.
import { LABELS } from "../../runtime/src/kitchen/decide.ts";
import { refusalOf } from "./board/client.ts";
import type { ClientOfThePriority } from "./priority.ts";

// Ce que la fonction rend : le geste fait, son adresse au survol — ou pourquoi rien n'est parti, son détail au survol.
export type Written = { fait: string; detail: string } | { refus: string; detail: string };

// Le label du ticket parqué (`parked`) : le retirer le déparque, et le ticket reprend où il était (#4129, d'abord `waiting`).
export const LABELS_OF_ACTIONS = { cuisine: LABELS.parked } as const;
// Les labels d'attente d'avant parked que la cuisine lit encore comme parqués (runtime/src/kitchen/decide.ts).
const LABEL_PARKED_CHEF = "parked:chef";
const LABELS_BEFORE_PARKED: readonly string[] = ["waiting", "blocked-on-human"];

// Ce que la vue demande et qui n'a aucun fait sur GitHub qu'une station lise.
export const WITHOUT_DONE = {
  carte: "nothing was posted: a card of TODO is answered on its issue on GitHub — the station reads the issue, not the app",
} as const;

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Déparquer un ticket (#4262) : le label `parked` retiré de son issue — et chaque label d'attente d'avant parked
// (`LABELS_BEFORE_PARKED`) : un ticket que l'un d'eux parque reprend aussi —, sur tout dépôt, sans box. C'est le seul
// chemin qui le sort de son attente (second/parking.ts) : il reprend exactement où il était. Une issue qui ne porte déjà
// plus le label : c'est fait.
export async function unpark(repository: string, ticket: number, client: ClientOfThePriority): Promise<Written> {
  const label = LABELS_OF_ACTIONS.cuisine;
  const issue = `https://github.com/${repository}/issues/${ticket}`;
  const gone: string[] = [];
  for (const removed of [label, LABEL_PARKED_CHEF, ...LABELS_BEFORE_PARKED]) {
    try {
      const answer = await client.ecrire("DELETE", `/repos/${repository}/issues/${ticket}/labels/${encodeURIComponent(removed)}`);
      if (answer.status !== 200 && answer.status !== 404) throw refusalOf(`the removal of \`${removed}\``, answer);
      if (answer.status === 200) gone.push(removed);
    } catch (error) {
      // Un label d'avant que GitHub ne retire pas : `parked` l'est déjà, le ticket reste parqué par celui-là.
      const already = removed === label ? "nothing was changed:" : `\`${label}\` is removed, but`;
      return { refus: `${already} GitHub did not remove \`${removed}\` from #${ticket}`, detail: reason(error) };
    }
  }
  const names = (gone.some((name) => name === label || name === LABEL_PARKED_CHEF) ? gone.filter((name) => name === label || name === LABEL_PARKED_CHEF) : [label]).map((name) => `\`${name}\``).join(" and ");
  const done = `back to the kitchen on GitHub: #${ticket} no longer carries ${names} — it resumes exactly where it was`;
  return { fait: done, detail: issue };
}

// La liste des tickets qui attendent un cook humain (#4276), en un seul endroit
// pour le chef : sur GitHub, les issues ouvertes qui portent `human-cook`, chacune
// avec son assignee — `npm --prefix runtime run human-cooks` la lit et la dit, avec
// l'adresse de la même liste sur GitHub. Un ticket la quitte quand il est fermé ou
// qu'il perd la marque.
import { LABEL_COOK_HUMAIN } from "./marquer.ts";

export type TicketDeLaListe = { number: number; state: "open" | "closed"; labels: readonly string[]; assignees: readonly string[] };
export type CookHumain = { ticket: number; assignee: string };

// Une ligne par assignee d'un ticket ouvert marqué, dans l'ordre des numéros. Un
// ticket marqué que personne ne tient encore y est aussi, sans nom.
export function listeDesCooksHumains(tickets: readonly TicketDeLaListe[]): CookHumain[] {
  return tickets
    .filter(({ state, labels }) => state === "open" && labels.includes(LABEL_COOK_HUMAIN))
    .sort((a, b) => a.number - b.number)
    .flatMap(({ number, assignees }) => (assignees.length === 0 ? [{ ticket: number, assignee: "" }] : assignees.map((assignee) => ({ ticket: number, assignee }))));
}

// L'adresse de la liste sur GitHub.
export const adresseDeLaListe = (depot: string) => `https://github.com/${depot}/issues?q=${encodeURIComponent(`is:issue is:open label:${LABEL_COOK_HUMAIN}`)}`;

// La liste telle que la commande la dit : une ligne par ticket, puis son adresse.
export function direLaListe(liste: readonly CookHumain[], depot: string): string {
  const lignes = liste.map(({ ticket, assignee }) => `#${ticket}  ${assignee === "" ? "(no one assigned yet)" : assignee}`);
  return [...(lignes.length === 0 ? ["no ticket waits on a human cook"] : lignes), adresseDeLaListe(depot)].join("\n");
}

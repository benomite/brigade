// Invariant 1 (#4026) : un ticket qu'aucun cook ne cuit et qui n'est pas en
// pass ne tient ni ne réserve aucune zone de fichiers. Sa PR ouverte pas plus :
// sinon des tickets en file se retiennent en cycle (#3979), ou la livraison
// d'une épique retient ses propres tickets découpés (#3932).
import { A_LA_MAIN, secoupent, type TicketLu } from "../brigade-github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import { tenant } from "../github-etat/prise.ts";
import { estMisDeCote } from "../github.ts";
import type { Invariant } from "./invariants.ts";

type LectureDeLaPrise = { tickets: readonly TicketLu[]; enCuisine(numero: number): boolean; commentaires(numero: number): Promise<Parameters<typeof tenant>[0]> };

const ticketDeLaBranche = (branche: string): number | null => {
  const numero = /^cook\/(\d+)-/.exec(branche)?.[1];
  return numero === undefined ? null : Number(numero);
};

// La PR ouverte de la branche `cook/<n>-…` tient-elle encore sa zone ? Non quand
// son ticket, lu au tour, n'a de cook nulle part et n'est pas en pass : mis de
// côté ou en WAITING (#3798, #3814), libre, ou `taken` sans prise lisible
// (#3966). Une livraison qui attend le chef la tient tant qu'il ne l'a pas vue
// (#2977). Un ticket que le tour n'a pas lu, ou dont la prise ne se lit pas, la
// tient encore : dans le doute, la zone reste tenue.
export async function tientSaZone(branche: string, { tickets, enCuisine, commentaires }: LectureDeLaPrise): Promise<boolean> {
  const numero = ticketDeLaBranche(branche);
  const lu = numero === null ? undefined : tickets.find((ticket) => ticket.number === numero);
  if (lu === undefined || enCuisine(lu.number) || lu.labels.includes(LABEL_IN_PASS)) return true;
  if (estMisDeCote(lu.labels) || lu.labels.includes(LABEL_WAITING)) return false;
  if (lu.labels.includes(A_LA_MAIN)) return true;
  if (!lu.labels.includes(LABEL_TAKEN)) return false;
  return commentaires(lu.number).then((lus) => tenant(lus, []) !== null).catch(() => true);
}

// Un ticket qui attend une prise, et donc sa zone.
const attendUnePrise = (ticket: TicketLu, enCuisine: (numero: number) => boolean) =>
  !enCuisine(ticket.number) && ![LABEL_TAKEN, LABEL_IN_PASS, LABEL_WAITING, A_LA_MAIN].some((label) => ticket.labels.includes(label)) && !estMisDeCote(ticket.labels);

// Cassé quand la PR ouverte d'un tel ticket change des fichiers de la zone d'un
// ticket qui attend sa prise. La porte de prise ne compte plus cette PR
// (`tientSaZone`) : c'est le geste qui rend la zone, et le commentaire le dit
// sur le ticket de la PR, une fois par PR.
export const zonesSansCook: Invariant = async (tour) => {
  const attendent = tour.tickets.filter((ticket) => attendUnePrise(ticket, (numero) => tour.enCuisine(numero)));
  // Les zones des tickets qui attendent leur prise ; sans aucune, rien n'est retenu, et les PR ne se lisent pas (#2188).
  const zones = await Promise.all(attendent.map(async (ticket) => ({ numero: ticket.number, zone: await tour.zoneDuTicket(ticket.number).catch(() => []) })));
  if (zones.every(({ zone }) => zone.length === 0)) return;
  const lecture = { tickets: tour.tickets, enCuisine: (numero: number) => tour.enCuisine(numero), commentaires: (numero: number) => tour.github.commentaires(numero) };
  for (const pr of await tour.prsOuvertes()) {
    const numero = ticketDeLaBranche(pr.branche);
    if (numero === null || (await tientSaZone(pr.branche, lecture))) continue;
    const retenus = zones.filter(({ numero: autre, zone }) => autre !== numero && zone.some((entree) => pr.fichiers.some((fichier) => secoupent(entree, fichier)))).map(({ numero: autre }) => autre);
    if (retenus.length === 0) continue;
    const nommes = retenus.map((n) => `#${n}`).join(", ");
    await tour.reparer({
      invariant: 1,
      ticket: numero,
      cle: `pr=${pr.number ?? pr.branche}`,
      casse: `#${numero} is cooked by no cook and is not in pass, yet its open PR${pr.number === undefined ? ` on \`${pr.branche}\`` : ` #${pr.number}`} held files of the zone of ${nommes}.`,
      geste: async () => `released its zone: the claim gate no longer counts this PR against ${nommes}, which a cook can take now. The PR stays open; a cook that takes #${numero} again holds its zone again.`,
    });
  }
};

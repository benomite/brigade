// Les domaines qui méritent un profil de cook : sur les derniers tickets
// servis du projet, les zones de fichiers qui reviennent souvent et qui sont
// livrées du premier coup nettement moins que le reste. Rien n'y est proposé
// ni écrit : ce module mesure, la proposition se fait ailleurs.
//
// Un domaine est une zone de la fiche du ticket (`- zone : …`), à la maille
// exacte de la fiche : `runtime/src` et `runtime/src/profils` sont deux
// domaines. Un ticket qui porte plusieurs zones compte dans chacune ; un
// ticket sans fiche, ou dont la fiche est illisible, ne compte dans aucune,
// mais il compte dans la fenêtre et dans la moyenne du projet. Le type du
// ticket (feature, fix, tech) n'est pas lu.
//
// « Livré du premier coup » se mesure comme dans le relevé des renvois
// (`renvois.ts`) : un ticket mergé sur un seul essai. Un ticket servi sans
// merge est dans la fenêtre, mais n'entre dans aucune part.
import type { Base } from "../base.ts";
import type { Fiche } from "../fiche.ts";
import { parcoursDesTickets } from "../parcours-des-tickets.ts";
import type { Parcours } from "../renvois.ts";
import type { ReglagesDesProfils } from "./reglages.ts";

// Un ticket servi tel que la mesure le regarde. `zone` : celle de sa fiche
// quand il a été servi. `premierCoup` : nul s'il a été servi sans merge.
export type TicketServi = { ticket: number; zone: string[]; premierCoup: boolean | null };

// Une zone qui franchit les deux seuils. `tickets` : ceux de la fenêtre qui la
// portent, dans l'ordre de leur service. `premiers` sur `retenus` : ses
// tickets mergés, et ceux d'entre eux livrés du premier coup. `ecart` : les
// points qui séparent sa part de celle du projet.
export type Domaine = { zone: string; tickets: number[]; premiers: number; retenus: number; ecart: number };

// Ce que la mesure a regardé, et ce qu'elle relève. `servis` : les tickets de
// la fenêtre, au plus `reglages.fenetre`. `premiers` sur `retenus` : la part
// du projet livrée du premier coup sur cette fenêtre — nulle si aucun n'est
// mergé, et alors aucun domaine n'est relevé.
export type ReleveDesDomaines = { reglages: ReglagesDesProfils; servis: number; premiers: number; retenus: number; domaines: Domaine[] };

// `runtime/src/` et `runtime/src` sont la même zone.
const normaliser = (chemin: string) =>
  chemin
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");

type Part = { tickets: number[]; premiers: number; retenus: number };

function compter(part: Part, { ticket, premierCoup }: TicketServi): void {
  part.tickets.push(ticket);
  if (premierCoup === null) return;
  part.retenus += 1;
  if (premierCoup) part.premiers += 1;
}

// Les domaines des `reglages.fenetre` derniers tickets servis, donnés dans
// l'ordre de leur service. Une fonction pure, qui ne lit rien. Les seuils sont
// comparés sans arrondi : 19,9 points ne sont pas 20.
export function releverLesDomaines(servis: readonly TicketServi[], reglages: ReglagesDesProfils): ReleveDesDomaines {
  const fenetre = servis.slice(-reglages.fenetre);
  const projet: Part = { tickets: [], premiers: 0, retenus: 0 };
  const zones = new Map<string, Part>();
  for (const servi of fenetre) {
    compter(projet, servi);
    for (const zone of new Set(servi.zone.map(normaliser).filter((zone) => zone !== ""))) {
      const part = zones.get(zone) ?? { tickets: [], premiers: 0, retenus: 0 };
      zones.set(zone, part);
      compter(part, servi);
    }
  }

  const domaines: Domaine[] = [];
  for (const [zone, { tickets, premiers, retenus }] of zones) {
    if (tickets.length < reglages.tickets || retenus === 0 || projet.retenus === 0) continue;
    // 100 × (pP/nP − pZ/nZ) ≥ écart, multiplié par nP × nZ : en entiers, sans flottant.
    const points = 100 * (projet.premiers * retenus - premiers * projet.retenus);
    if (points < reglages.ecart * projet.retenus * retenus) continue;
    domaines.push({ zone, tickets, premiers, retenus, ecart: points / (projet.retenus * retenus) });
  }
  domaines.sort((a, b) => b.tickets.length - a.tickets.length || b.ecart - a.ecart || a.zone.localeCompare(b.zone));
  return { reglages, servis: fenetre.length, premiers: projet.premiers, retenus: projet.retenus, domaines };
}

type Ligne = { ticket: number; type: string; payload: string };

// La zone qu'une fiche fait foi de posséder : aucune si elle est illisible,
// comme sur le rail.
const zoneDe = (card: Fiche | null | undefined): string[] => (card && Array.isArray(card.zone) && (card.problems ?? []).length === 0 ? card.zone : []);

// Les tickets servis du journal, dans l'ordre de leur service, chacun avec la
// zone que sa fiche portait à ce moment. Les parcours sont ceux du relevé des
// renvois (`parcours-des-tickets.ts`) : ouverts par la première prise, fermés
// par un merge ou un service sans diff — les mêmes règles sont suivies ici
// pour savoir quelle fiche le ticket portait à sa fermeture.
export function ticketsServis(base: Base): TicketServi[] {
  const finis = new Map<number, Parcours[]>();
  for (const parcours of parcoursDesTickets(base)) if (parcours.end !== null) finis.set(parcours.ticket, [...(finis.get(parcours.ticket) ?? []), parcours]);

  const lignes = base.lire<Ligne>(
    "SELECT ticket, type, payload FROM events WHERE ticket IS NOT NULL AND type IN ('ticket.arrived', 'ticket.changed', 'ticket.taken', 'merge.done', 'pass.served') ORDER BY seq",
  );
  const zones = new Map<number, string[]>();
  const ouverts = new Set<number>();
  const servis: TicketServi[] = [];
  for (const { ticket, type, payload } of lignes) {
    switch (type) {
      case "ticket.arrived":
      case "ticket.changed":
        zones.set(ticket, zoneDe((JSON.parse(payload) as { card?: Fiche | null }).card));
        break;
      case "ticket.taken":
        ouverts.add(ticket);
        break;
      case "merge.done":
      case "pass.served": {
        if (!ouverts.delete(ticket)) break;
        const parcours = finis.get(ticket)?.shift();
        if (parcours === undefined || parcours.end === null) break;
        const premierCoup = parcours.end.kind === "merged" ? parcours.attempts.length === 1 : null;
        servis.push({ ticket, zone: zones.get(ticket) ?? [], premierCoup });
        break;
      }
    }
  }
  return servis;
}

// Le relevé tel que le journal le permet.
export function domainesDuJournal(base: Base, reglages: ReglagesDesProfils): ReleveDesDomaines {
  return releverLesDomaines(ticketsServis(base), reglages);
}

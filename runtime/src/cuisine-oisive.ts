// Une cuisine oisive alors que des cartes sont sur le rail : une panne (#1862).
// La règle du chef (#1858) : à l'ouverture, il n'y a que trois états normaux —
// le projet éteint, par son choix ; des cartes au travail ou en pass, tout
// tourne ; le rail vide. Des cartes qui attendent sur le rail, en attente ou
// mises de côté, sans qu'aucun cook ait tourné depuis 30 min : ce n'en est pas un.
//
// La panne tient quand les quatre conditions tiennent ensemble :
//   - des cartes sur le rail — en attente ou 86, celles qui attendent qu'on les cuise ;
//   - aucun cook n'a tourné depuis 30 min : aucun en cours, aucune carte au
//     travail ni en pass, et le dernier repère a 30 min au moins ;
//   - le projet n'est pas éteint : runtime en marche, ni le « stop » du chef,
//     ni l'interrupteur coupé, ni toutes ses stations arrêtées par lui ;
//   - toutes les cartes n'attendent pas une capacité ou un tiers : WAITING, mis
//     de côté faute de station (`no-station: …`) ou faute d'une distante présente
//     qui la fournit (`station-absent: …`), ou en attente seulement de
//     tickets qui attendent eux-mêmes ainsi, de proche en proche.
//
// Les repères qui remettent le compte à zéro : la fin du dernier cook, le
// démarrage du runtime, le dernier service, l'interrupteur rallumé. Rien n'est
// écrit : la panne se lit du journal, à chaque lecture.
import { absentesDuMotif, manqueDuMotif } from "./capacites.ts";
import type { EtatCuisine } from "./etat.ts";
import type { TicketRail } from "./projections/rail.ts";

export const OISIVE_APRES_MS = 30 * 60_000;

// `depuis` : le dernier repère, d'où l'oisiveté se compte. `cartes` : celles qui
// devraient cuire, dans l'ordre du rail — celles qui attendent une capacité ou
// un tiers n'y sont pas.
export type CuisineOisive = { depuis: string; cartes: number[] };

export type CeQueLitLaPanne = Pick<EtatCuisine, "session" | "gardeFous" | "interrupteur" | "stations" | "arretees" | "rail" | "cooks" | "livres"> & {
  finDuDernierCook: string | null;
};

// Le projet éteint, par le choix du chef : la cuisine n'a pas à cuire.
function eteint({ session, gardeFous, interrupteur, stations, arretees }: CeQueLitLaPanne): boolean {
  if (session === null || session.endedAt !== null) return true;
  if (gardeFous.stoppedAt !== null || interrupteur?.on === false) return true;
  return stations.length > 0 && stations.every(({ station }) => arretees.has(station));
}

// Les tickets du rail qui attendent une capacité ou un tiers : WAITING, mis de
// côté faute de station ou d'une distante présente, puis, de proche en proche,
// les tickets en attente dont tous les attendus sont de ceux-là. Un attendu parti
// du rail, l'issue ouverte, n'en est pas : c'est le chef qu'il attend.
export function attendentUneCapaciteOuUnTiers(rail: TicketRail[]): Set<number> {
  const capacite = ({ state, reason }: TicketRail) => state === "86" && (manqueDuMotif(reason) !== null || absentesDuMotif(reason) !== null);
  const legitimes = new Set(rail.flatMap((ticket) => (ticket.waitingFor !== null || capacite(ticket) ? [ticket.ticket] : [])));
  for (let change = true; change; ) {
    change = false;
    for (const ticket of rail) {
      if (ticket.state !== "waiting" || legitimes.has(ticket.ticket) || ticket.awaits.length === 0) continue;
      if (ticket.awaits.every(({ ticket: attendu, left }) => left === null && legitimes.has(attendu))) {
        legitimes.add(ticket.ticket);
        change = true;
      }
    }
  }
  return legitimes;
}

// La panne à `maintenant`, ou null quand l'une des quatre conditions manque.
export function cuisineOisive(lu: CeQueLitLaPanne, maintenant: Date): CuisineOisive | null {
  if (eteint(lu) || lu.cooks.length > 0) return null;
  if (lu.rail.some(({ state }) => state === "taken" || state === "pass")) return null;
  const legitimes = attendentUneCapaciteOuUnTiers(lu.rail);
  const cartes = lu.rail.filter(({ ticket, state }) => (state === "waiting" || state === "86") && !legitimes.has(ticket)).map(({ ticket }) => ticket);
  if (cartes.length === 0) return null;
  const reperes = [lu.finDuDernierCook, lu.session?.startedAt, lu.livres[0]?.servedAt, lu.interrupteur?.on === true ? lu.interrupteur.since : null];
  const depuis = reperes.filter((instant): instant is string => typeof instant === "string").reduce((dernier, instant) => (Date.parse(instant) > Date.parse(dernier) ? instant : dernier));
  return maintenant.getTime() - Date.parse(depuis) >= OISIVE_APRES_MS ? { depuis, cartes } : null;
}

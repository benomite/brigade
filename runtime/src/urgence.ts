// L'urgence : plus rien ne cuit, et c'est le chef que la cuisine attend. Pas
// une attente parmi d'autres — la seule qui, à elle seule, arrête tout, et que
// seul le chef peut lever. Rien n'est tenu ici : elle se relit du rail, de la
// file du chef et des stations, donc du journal.
//
// Elle est là quand rien ne bouge — aucun ticket pris, aucune livraison que la
// pass travaille, aucun cook de ticket qui écrit encore —, qu'au moins un
// ticket attend d'être cuisiné, et que chacun d'eux remonte à une décision du
// chef : sa zone tenue, ou un ticket qu'il attend, par une livraison qui
// attend le chef (merge à la main, remontée, PR fermée, 86 sans retour…) — de
// proche en proche, un ticket retenu par un ticket lui-même retenu —, sa propre
// entrée dans la file — un ticket qu'il attend a été abandonné —, ou, rien ne
// le retenant sur le rail, chaque station qui pourrait le cuisiner retenue par
// le chef : sa connexion Max absente ou expirée, la base rouge dont la
// réparation a échoué, le setup bloqué pour une station qui n'est pas distante.
// Un seul ticket qui pourrait partir, ou retenu par autre chose que le chef —
// un 86 qui reviendra, un tiers, une station saturée —, et il n'y a pas
// d'urgence : la décision reste une ligne de la file comme les autres.
//
// Le début de l'arrêt total est le dernier mouvement de la cuisine — la fin du
// dernier cook de ticket, la dernière livraison que la pass a laissée au chef,
// le dernier merge, le dernier ticket servi —, ou la
// dernière des décisions en cause à être arrivée, si elle est plus tardive :
// d'un calcul à l'autre, tant que les causes ne changent pas, il ne bouge pas.
// Levée — le chef a tranché, la cuisine est repartie —, l'urgence qui revient
// part d'un nouveau mouvement ou d'une nouvelle décision : son début aussi.
import type { Base } from "./base.ts";
import { nommerAttente, type Attente } from "./attend.ts";
import { fournitTout } from "./capacites.ts";
import { illisible, requises } from "./fiche.ts";
import { cooksEnCours } from "./projections/garde-fous.ts";
import type { TicketRail } from "./projections/rail.ts";
import type { EtatStation } from "./projections/stations.ts";

// Une décision du chef qui retient des tickets : l'entrée de la file, et les
// tickets en attente qui remontent à elle.
export type CauseDUrgence = { attente: Attente; retenus: number[] };

// `depuis` : le début de l'arrêt total. `retenus` : les tickets à l'arrêt, dans
// l'ordre du rail. `causes` : les décisions qui les retiennent, celle qui en
// retient le plus d'abord — à égalité, la plus ancienne. Jamais vide.
export type Urgence = { depuis: string; retenus: number[]; causes: [CauseDUrgence, ...CauseDUrgence[]] };

// Ce qui fait bouger la cuisine, d'un ticket à l'autre : un cook qui finit,
// une livraison que la pass laisse au chef après l'avoir travaillée, une
// livraison mergée, un ticket servi.
const MOUVEMENTS = ["cook.exited", "cook.interrupted", "pass.held", "pass.escalated", "merge.done", "ticket.served"];

function dernierMouvement(base: Base): string | null {
  const marques = MOUVEMENTS.map(() => "?").join(", ");
  return base.lire<{ at: string }>(`SELECT at FROM events WHERE type IN (${marques}) AND ticket IS NOT NULL ORDER BY seq DESC LIMIT 1`, ...MOUVEMENTS)[0]?.at ?? null;
}

// Ce qui, de la file, retient une station : sa connexion, la base rouge
// abandonnée à sa réparation, le setup bloqué — une station distante prépare
// le sien chez elle. Vide : rien du chef ne la retient.
function retenuesDeStation(station: EtatStation, globales: Attente[]): Attente[] {
  return globales.filter(
    (attente) => attente.quoi === "base" || (attente.quoi === "connexion" && attente.station === station.station) || (attente.quoi === "setup" && !station.remote),
  );
}

// `rail` : le rail tel que lu ; `attentes` : la file du chef, telle que
// `attentesDuChef` la rend ; `stations` : les stations annoncées.
export function urgenceDuChef(base: Base, rail: TicketRail[], attentes: Attente[], stations: EtatStation[]): Urgence | null {
  const duChef = new Map<number, Attente>();
  for (const attente of attentes) if (attente.ticket !== null && !duChef.has(attente.ticket)) duChef.set(attente.ticket, attente);
  // Quelque chose bouge : un cook de ticket écrit encore, un ticket est pris,
  // une livraison est à la pass sans attendre le chef.
  if (cooksEnCours(base).some(({ ticket }) => ticket !== null)) return null;
  if (rail.some(({ ticket, state }) => state === "taken" || (state === "pass" && !duChef.has(ticket)))) return null;
  const enAttente = rail.filter(({ state }) => state === "waiting");
  if (enAttente.length === 0) return null;

  const parTicket = new Map(rail.map((ticket) => [ticket.ticket, ticket]));
  const globales = attentes.filter((attente) => attente.ticket === null);

  // Un ticket que rien ne retient sur le rail : chaque station qui pourrait le
  // cuisiner doit être retenue par le chef. Aucune ne le peut : ce n'est pas
  // une décision de la file qui le retient.
  const parLesStations = (ticket: TicketRail): Attente[] | null => {
    const candidates = stations.filter(({ provides }) => fournitTout(provides, requises(ticket.card)));
    if (candidates.length === 0) return null;
    const causes: Attente[] = [];
    for (const station of candidates) {
      const retenues = retenuesDeStation(station, globales);
      if (retenues.length === 0) return null;
      causes.push(...retenues);
    }
    return causes;
  };

  // Les décisions du chef auxquelles un ticket en attente remonte — null : il
  // n'y remonte pas. `chemin` : les tickets déjà traversés, un cycle ne remonte
  // à rien. Le rail tient quelques dizaines de tickets : rien n'est retenu
  // d'un ticket à l'autre.
  const causesDe = (ticket: TicketRail, chemin: ReadonlySet<number>): Attente[] | null => {
    if (chemin.has(ticket.ticket)) return null;
    const propre = duChef.get(ticket.ticket);
    if (propre !== undefined) return [propre];
    if ((ticket.awaits.length === 0 && ticket.held.length === 0) || illisible(ticket.card) !== null) return parLesStations(ticket);
    const suite = new Set([...chemin, ticket.ticket]);
    const retenants = [...ticket.awaits.filter(({ left }) => left === null), ...ticket.held].map((retenant) => retenant.ticket);
    const causes = [...new Set(retenants)].flatMap((retenant) => {
      const attente = duChef.get(retenant);
      if (attente !== undefined) return [attente];
      const autre = parTicket.get(retenant);
      return autre?.state === "waiting" ? (causesDe(autre, suite) ?? []) : [];
    });
    return causes.length === 0 ? null : causes;
  };

  const parCause = new Map<string, CauseDUrgence>();
  for (const ticket of enAttente) {
    const causes = causesDe(ticket, new Set());
    if (causes === null) return null;
    for (const attente of causes) {
      const nom = nommerAttente(attente);
      const cause = parCause.get(nom) ?? { attente, retenus: [] };
      if (!cause.retenus.includes(ticket.ticket)) cause.retenus.push(ticket.ticket);
      parCause.set(nom, cause);
    }
  }
  const [premiere, ...autres] = [...parCause.values()].sort(
    (a, b) => b.retenus.length - a.retenus.length || a.attente.since.localeCompare(b.attente.since) || nommerAttente(a.attente).localeCompare(nommerAttente(b.attente)),
  );
  if (premiere === undefined) return null;
  // Les horodatages sont en ISO 8601 UTC : l'ordre des chaînes est celui du temps.
  const depuis = [dernierMouvement(base) ?? "", ...[...parCause.values()].map(({ attente }) => attente.since)].sort().at(-1) ?? premiere.attente.since;
  return { depuis, retenus: enAttente.map(({ ticket }) => ticket), causes: [premiere, ...autres] };
}

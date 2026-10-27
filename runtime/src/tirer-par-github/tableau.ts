// Ce que le Kitchen board publie des stations distantes (`distantes` de son
// bloc, tableau/rendu/bloc.ts) : l'arbitrage de la principale, lu au journal du
// projet — c'est là qu'une station sans ssh vers la box lit ce qui lui revient.
//
// - `attributions` : chaque ticket qu'une station distante tient, son run et
//   l'échéance de son bail. Un renouvellement accepté la fait avancer ; une
//   station qui se tait la laisse passer, et la principale l'en retire d'elle-
//   même — le bail tombé, le ticket revient au rail (`distantes.ts`).
// - `reponses` : la réponse du runtime à chaque demande posée par GitHub
//   (`relayer.ts`) — la dernière de chaque créneau de chaque station
//   (`demande.ts`), tant qu'elle a moins de `GARDE_MS`. Borné ainsi, le bloc ne
//   grossit pas avec le temps : par station, une réclamation, et par cook un
//   renouvellement et une livraison au plus.
//
// La mission d'une réclamation y est entière — la consigne du cook, son
// calibrage, sa branche, ses plafonds, son bail —, sauf les arguments de
// `claude`, qui répéteraient la consigne : ils se publient sans elle
// (`suiteDesArgs`), et `reponseDuTableau` les rend tels que le runtime les a
// rendus.
import type { Base } from "../base.ts";
import type { Mission, Reponse } from "../events/remote.ts";
import { lireRail } from "../projections/rail.ts";
import { lireLeTableau, type AttributionPubliee, type DistantesPubliees, type ReponsePubliee } from "../tableau/rendu/bloc.ts";

// Ce qu'une réponse reste au tableau : plus que ce qu'une station attend la
// sienne (`demander.ts`).
export const GARDE_MS = 15 * 60_000;

type Ligne = { seq: number; at: string; payload: string };

// La mission publiée : les arguments de `claude` sans la consigne qui les ouvre.
type MissionPubliee = Omit<Mission, "args"> & ({ args: string[] } | { suiteDesArgs: string[] });

function publier(reponse: Reponse): ReponsePubliee["reponse"] {
  if (!reponse.ok || reponse.verb !== "claim" || reponse.mission === null) return reponse;
  const { args, ...mission } = reponse.mission;
  const publiee: MissionPubliee = args[0] === "-p" && args[1] === mission.prompt ? { ...mission, suiteDesArgs: args.slice(2) } : { ...mission, args };
  return { ...reponse, mission: publiee };
}

// Ce que le tableau publie des stations distantes, lu au journal à
// `maintenant` ; null quand aucune ne tient de ticket ni n'a rien demandé par
// GitHub — un projet sans station distante n'en a pas trace sur son tableau.
export function distantesDuTableau(base: Base, maintenant: Date): DistantesPubliees | null {
  const distantes = new Set(base.lire<{ station: string }>("SELECT station FROM stations WHERE remote = 1").map(({ station }) => station));
  const attributions: AttributionPubliee[] = lireRail(base).flatMap((ticket) => {
    if (ticket.state !== "taken" || ticket.station === null || !distantes.has(ticket.station)) return [];
    const run = base.lire<{ run: string }>("SELECT run FROM cook_runs WHERE ticket = ? AND station = ? AND ended_seq IS NULL AND tripped_seq IS NULL ORDER BY launched_seq DESC LIMIT 1", ticket.ticket, ticket.station)[0]?.run ?? null;
    return [{ ticket: ticket.ticket, station: ticket.station, run, bailJusqua: ticket.leaseUntil }];
  });

  const depuis = new Date(maintenant.getTime() - GARDE_MS).toISOString();
  const demandees = base
    .lire<Ligne>("SELECT seq, at, payload FROM events WHERE type = 'remote.asked' AND at >= ? AND json_extract(payload, '$.via') = 'github' ORDER BY seq", depuis)
    .map((ligne) => ({ seq: ligne.seq, payload: JSON.parse(ligne.payload) as { id: string; station: string; verb: string; run?: string } }));
  const reponses = new Map<string, ReponsePubliee>();
  if (demandees.length > 0) {
    const repondues = new Map<string, { at: string; reponse: Reponse }>();
    for (const ligne of base.lire<Ligne>("SELECT seq, at, payload FROM events WHERE type = 'remote.answered' AND seq > ? ORDER BY seq", demandees[0]!.seq)) {
      const { id, station: _station, ...reponse } = JSON.parse(ligne.payload) as { id: string; station: string } & Reponse;
      if (!repondues.has(id)) repondues.set(id, { at: ligne.at, reponse: reponse as Reponse });
    }
    for (const { payload } of demandees) {
      const repondue = repondues.get(payload.id);
      if (repondue === undefined) continue;
      const run = (payload.verb === "renew" || payload.verb === "deliver") && typeof payload.run === "string" ? payload.run : null;
      // Le créneau de la demande, comme le gist les sépare : la dernière remplace la précédente.
      reponses.set(`${payload.station}\0${run === null ? "claim" : `${payload.verb}.${run}`}`, { demande: payload.id, station: payload.station, geste: payload.verb, run, le: repondue.at, reponse: publier(repondue.reponse) });
    }
  }
  if (attributions.length === 0 && reponses.size === 0) return null;
  return { attributions, reponses: [...reponses.values()] };
}

// La réponse que le tableau publie à cette demande de cette station, telle que
// le runtime l'a rendue ; null tant qu'elle n'y est pas. `illisible` : le
// corps n'est pas celui d'un tableau que cette version lit.
export function reponseDuTableau(corps: string, station: string, id: string): Reponse | null | { illisible: string } {
  const lu = lireLeTableau(corps);
  if (!lu.lu) return { illisible: lu.raison };
  const publiee = lu.tableau.distantes?.reponses.find((reponse) => reponse.demande === id && reponse.station === station);
  if (publiee === undefined) return null;
  const reponse = publiee.reponse as Reponse & { mission?: MissionPubliee | null };
  if (!reponse.ok || reponse.verb !== "claim" || reponse.mission == null || !("suiteDesArgs" in reponse.mission)) return reponse as Reponse;
  const { suiteDesArgs, ...mission } = reponse.mission;
  return { ...reponse, mission: { ...mission, args: ["-p", mission.prompt, ...suiteDesArgs] } };
}

// Ce que le tableau dit qu'une station tient : ses tickets, leurs runs et leurs baux.
export function attributionsDuTableau(corps: string, station: string): AttributionPubliee[] {
  const lu = lireLeTableau(corps);
  return lu.lu ? (lu.tableau.distantes?.attributions ?? []).filter((attribution) => attribution.station === station) : [];
}

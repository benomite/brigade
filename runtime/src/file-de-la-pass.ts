// La file de la pass : une seule livraison à la fois est dans sa pass — ses
// gates, sa relecture, sa CI, puis son merge en vol —, et les autres attendent
// leur tour, dans l'ordre où elles ont été livrées : celui de leur dernier
// `ticket.passing`, ou de leur `pass.entered` hors du rail. Une livraison qui
// ne commence pas — GitHub qui bute, une PR qui ne s'ouvre pas — ne tient pas
// la file : seule en tient le tour celle qui est dans sa pass.
import type { Base } from "./base.ts";
import { lirePass, type PassDeTicket } from "./projections/pass.ts";
import { ticketDuRail } from "./projections/rail.ts";

// Les phases d'une livraison dans sa pass : jugée, ou son merge en vol.
const DANS_SA_PASS = ["judging", "merging"];

// La pass suit encore cette livraison : son ticket est en pass, ou elle est hors du rail.
const suivie = (base: Base, livraison: PassDeTicket) => livraison.horsRail || ticketDuRail(base, livraison.ticket)?.state === "pass";

// Les livraisons que la pass connaît, dans l'ordre de la file. Celles qui
// n'ont jamais été livrées — un premier cook en cours — viennent après, par numéro.
export function fileDeLaPass(base: Base): PassDeTicket[] {
  const livrees = new Map(
    base
      .lire<{ ticket: number; seq: number }>("SELECT ticket, MAX(seq) AS seq FROM events WHERE type IN ('ticket.passing', 'pass.entered') AND ticket IN (SELECT ticket FROM pass) GROUP BY ticket")
      .map(({ ticket, seq }) => [ticket, seq]),
  );
  const rang = (livraison: PassDeTicket) => livrees.get(livraison.ticket) ?? Number.MAX_SAFE_INTEGER;
  return lirePass(base).sort((a, b) => rang(a) - rang(b) || a.ticket - b.ticket);
}

// La livraison qui est dans sa pass, ou null : la première de la file à y être.
export function tenantDeLaPass(base: Base, file = fileDeLaPass(base)): number | null {
  return file.find((livraison) => DANS_SA_PASS.includes(livraison.phase) && suivie(base, livraison))?.ticket ?? null;
}

// Une livraison qui attend son tour : celle qui est dans sa pass, et combien
// de livraisons attendent devant elle. Null si rien ne la retient — la pass
// est libre, ou c'est elle qui y est — ou si elle n'attend pas d'être jugée.
export function tourAttendu(base: Base, ticket: number): { tenant: number; devant: number } | null {
  const file = fileDeLaPass(base);
  const tenant = tenantDeLaPass(base, file);
  const rang = file.findIndex((livraison) => livraison.ticket === ticket);
  const elle = file[rang];
  if (tenant === null || tenant === ticket || elle?.phase !== "delivered" || !suivie(base, elle)) return null;
  const devant = file.slice(0, rang).filter((livraison) => livraison.ticket !== tenant && livraison.phase === "delivered" && suivie(base, livraison)).length;
  return { tenant, devant };
}

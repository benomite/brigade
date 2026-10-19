// Ce que la cuisine fait en ce moment de chaque ticket au travail ou en pass,
// lu au journal : le dernier geste que le relevé de son cook a noté, ou la
// phase où la pass en est. Rien n'est lu ailleurs que dans les projections, et
// rien n'en sort que la nature du geste et ce qu'il vise.
import { nommer } from "./activite.ts";
import type { Base } from "./base.ts";
import { DIRE_GATES_COUPEES, GATES_COUPEES } from "./events/pass.ts";
import { dernierRunNomme, derniersCooks, type DernierCook } from "./projections/guardrails.ts";
import type { PassDeTicket } from "./projections/pass.ts";
import { lirePass } from "./projections/pass.ts";
import type { TicketRail } from "./projections/rail.ts";
import { debutDeRelecture } from "./reviewer.ts";

// `fait` : le geste, en mots du chef. `cible` : le fichier ou la commande qu'il
// vise, s'il en vise un. `depuis` : l'heure où la cuisine s'y est mise.
export type ActiviteDeTicket = { fait: string; cible: string | null; depuis: string };

// Ce que la pass fait d'une livraison, phase par phase. Une phase absente d'ici
// n'est pas une activité de la pass : le ticket n'y est plus, ou pas encore.
const PHASES: Partial<Record<PassDeTicket["phase"], string>> = {
  delivered: "attend la pass",
  green: "jugée verte, la pass décide",
  red: "jugée rouge, la pass décide",
  merging: "merge en cours",
  waiting: "la pass attend",
  held: "arrêtée par la pass",
  escalated: "remontée au chef",
};

const activite = (fait: string, depuis: string, cible: string | null = null): ActiviteDeTicket => ({ fait, cible, depuis });

// Un ticket pris : ce que fait son cook, d'après son dernier relevé. Avant que
// le cook ne parte, sa station prépare son poste ; après sa fin, elle livre.
// Nul : le runtime ne sait pas ce qu'il fait — un cook dont le surveillant ne
// lit pas le flux (une station distante).
function auTravail(ticket: TicketRail, cook: DernierCook | undefined): ActiviteDeTicket | null {
  // Un cook lancé avant cette prise n'est pas le sien : une relecture, un cook renvoyé.
  if (cook === undefined || cook.launchedAt < ticket.since) return activite("la station prépare le poste du cook", ticket.since);
  if (cook.endedAt !== null) return activite("la station livre son travail", cook.endedAt);
  if (cook.activity !== null) {
    const { fait, cible } = nommer(cook.activity);
    return activite(fait, cook.activity.since, cible);
  }
  return cook.measured ? null : activite("démarre", cook.launchedAt);
}

// La dernière relecture d'un ticket : quand elle est partie, quand elle a fini.
type Relecture = { launchedAt: string; endedAt: string | null };

// Un ticket en pass : la relecture tant que son cook tourne ; après elle, le
// jugement attend la CI ; avant elle, ce sont les gates.
function aLaPass(pass: PassDeTicket | undefined, derniere: Relecture | null): ActiviteDeTicket | null {
  if (pass === undefined) return null;
  // Des gates coupées sur une machine saturée : la ligne qui le dit.
  if (pass.phase === "waiting" && pass.reason === GATES_COUPEES) return activite(DIRE_GATES_COUPEES, pass.since);
  if (pass.phase !== "judging") {
    const fait = PHASES[pass.phase];
    return fait === undefined ? null : activite(fait, pass.since);
  }
  const debut = pass.startedAt ?? pass.since;
  // Une relecture d'avant ce jugement en relisait une autre livraison.
  const relecture = derniere !== null && derniere.launchedAt >= debut ? derniere : null;
  if (relecture === null) return activite("gates en cours", debut);
  if (relecture.endedAt === null) return activite("relecture en cours", relecture.launchedAt);
  // Relue, la livraison attend sa CI — ou une autre relecture, si la sienne était illisible.
  return activite(pass.review?.sha === pass.sha ? "jugement en cours" : "relecture en cours", relecture.endedAt);
}

// L'activité de chaque ticket pris ou en pass ; nulle quand le runtime ne la
// connaît pas. Les autres tickets n'en ont pas.
export function activitesDuRail(base: Base, rail: TicketRail[]): Map<number, ActiviteDeTicket | null> {
  const cooks = derniersCooks(base);
  const passes = new Map(lirePass(base).map((pass) => [pass.ticket, pass]));
  return new Map(
    rail.flatMap((ticket): [number, ActiviteDeTicket | null][] => {
      if (ticket.state === "taken") return [[ticket.ticket, auTravail(ticket, cooks.get(ticket.ticket))]];
      if (ticket.state === "pass") return [[ticket.ticket, aLaPass(passes.get(ticket.ticket), dernierRunNomme(base, debutDeRelecture(ticket.ticket)))]];
      return [];
    }),
  );
}

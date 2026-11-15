// Les arrêts d'un ticket par un garde-fou, relus du journal (#3650). Un cook tué deux fois par le même garde-fou
// puis relancé n'en disait rien au chef : la carte du ticket dit maintenant quel garde-fou, et où le cook en était à
// chaque arrêt. Rien n'est écrit ici : chaque arrêt est un `guard.tripped` du journal, relié à son run et à la
// dernière activité que ce run a dite (`cook_activity`).
//
// Un ticket est « tué deux fois par le même garde-fou » tant que deux arrêts du même garde-fou se suivent sans que
// rien ne les efface : un cook de ce ticket qui finit bien (`ok`), ou le ticket qui sort du rail (servi, parti) ou y
// revient (arrivée) — la série repart alors de zéro.
import { natureDuRun } from "../breaker/calage.ts";
import type { Base } from "../base.ts";
import type { MotifArret } from "../events/guardrails.ts";

// Un arrêt : le garde-fou, le run, l'heure, et ce que le cook faisait à son dernier relevé (`activity` : le mot de
// journal du geste — `finishing`, `reading`… —, nul quand aucun relevé n'en a dit).
export type ArretDeGarde = { guard: MotifArret; run: string; at: string; activity: string | null };

// Le garde-fou qui a tué deux fois ou plus le même ticket, et chacun de ses arrêts, le plus ancien d'abord.
export type GardeRepetee = { guard: MotifArret; kills: ArretDeGarde[] };

// Les arrêts qui se comptent : ceux d'un garde-fou. Le « stop » est la commande du chef, pas un garde-fou qui tue.
const GARDES = new Set<string>(["duration", "tokens", "idle", "lease", "removals"]);

// Ce qui efface la série d'un ticket : sa dernière arrivée, sortie ou fin réussie d'un cook.
const EFFACE = `x.type IN ('ticket.arrived', 'ticket.served', 'ticket.left') OR (x.type = 'cook.exited' AND json_extract(x.payload, '$.outcome') = 'ok')`;

type Ligne = { ticket: number; run: string; at: string; reason: string; doing: string | null };

// Les arrêts de chacun de ces tickets depuis que sa série a été effacée, du plus ancien au plus récent. Un ticket sans
// arrêt n'y est pas. Les runs hors cook de ticket (le manager, la pass) ne comptent pas.
export function arretsDeGardeDesTickets(base: Base, tickets: number[]): Map<number, ArretDeGarde[]> {
  const arrets = new Map<number, ArretDeGarde[]>();
  if (tickets.length === 0) return arrets;
  const lignes = base.lire<Ligne>(
    `SELECT e.ticket, json_extract(e.payload, '$.run') AS run, e.at, json_extract(e.payload, '$.reason') AS reason, a.doing
       FROM events e
       LEFT JOIN cook_activity a ON a.run = json_extract(e.payload, '$.run')
      WHERE e.type = 'guard.tripped' AND e.ticket IN (SELECT value FROM json_each(?1))
        AND e.seq > COALESCE((SELECT max(x.seq) FROM events x WHERE x.ticket = e.ticket AND (${EFFACE})), 0)
      ORDER BY e.seq`,
    JSON.stringify(tickets),
  );
  for (const { ticket, run, at, reason, doing } of lignes) {
    if (typeof run !== "string" || !GARDES.has(reason) || natureDuRun(run, null) !== "cook") continue;
    arrets.set(ticket, [...(arrets.get(ticket) ?? []), { guard: reason as MotifArret, run, at, activity: doing }]);
  }
  return arrets;
}

// Le garde-fou qui a arrêté deux fois ces arrêts ; s'il y en a plusieurs, celui qui l'a fait le plus souvent, et à
// égalité celui qui a arrêté le ticket en dernier. Nul : aucun garde-fou n'a tué ce ticket deux fois.
export function gardeRepetee(arrets: ArretDeGarde[]): GardeRepetee | null {
  let meilleur: GardeRepetee | null = null;
  for (const { guard } of [...arrets].reverse()) {
    const kills = arrets.filter((arret) => arret.guard === guard);
    if (kills.length >= 2 && (meilleur === null || kills.length > meilleur.kills.length)) meilleur = { guard, kills };
  }
  return meilleur;
}

// Pour chacun de ces tickets, le garde-fou qui l'a tué deux fois. Un ticket tué une fois, ou deux fois par deux
// garde-fous différents, n'y est pas.
export function gardesRepetees(base: Base, tickets: number[]): Map<number, GardeRepetee> {
  const repetees = new Map<number, GardeRepetee>();
  for (const [ticket, arrets] of arretsDeGardeDesTickets(base, tickets)) {
    const garde = gardeRepetee(arrets);
    if (garde !== null) repetees.set(ticket, garde);
  }
  return repetees;
}

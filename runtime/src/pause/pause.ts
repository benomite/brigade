// La pause du renommage du code : avant de partir, un renommage demande au
// chef de mettre la cuisine en pause, par une carte de sa file (attend.ts).
// La carte dit combien de temps la pause doit durer et quels tickets en vol
// elle retiendra. Tant que le chef n'a pas dit « oui », rien ne change : la
// pass merge, les stations prennent. Son « oui » donné, et jusqu'à la fin de
// la pause :
//
// - aucun autre merge : la pass juge encore, mais une livraison verte attend
//   (`pass.waiting`, motif `paused`) au lieu d'être mergée, et le merge à la
//   main de la file (`rail merge`) est refusé — seul le ticket du renommage
//   lui-même, s'il en a un, passe ;
// - aucun cook neuf : les stations ne prennent plus de ticket (`paused`), sauf
//   celui du renommage ; les cooks en vol finissent leur travail, et leur
//   livraison attend à son tour ;
// - la file le dit en une ligne : « paused for the code rename », avec les
//   tickets qui finissent leur travail et ceux qui sont retenus.
//
// La pause finit quand le renommage la lève (`leverPause`), ou quand le chef
// retire le « oui » (« non » sur une pause en vigueur). La cuisine repart
// seule : chaque livraison retenue est reprise par la pass, rejugée si la base
// a bougé. Rien n'est tenu ici : tout se relit du journal.
import type { Base } from "../base.ts";
import type { Journal } from "../journal.ts";
import type { TicketRail } from "../projections/rail.ts";
import type { EnVol } from "./evenements.ts";

export const OUI = "yes";
export const NON = "no";
export type Reponse = typeof OUI | typeof NON;

// Ce que la cuisine retient, en tête de la ligne de la file.
export const EN_PAUSE_POUR_LE_RENOMMAGE = "paused for the code rename";

// La pause demandée ou en vigueur. `request` : le `seq` de sa demande ; `since` :
// sa demande ; `agreedAt` : le « oui » du chef, nul tant qu'il ne l'a pas dit.
// `ticket` : celui du renommage, nul s'il n'est pas un ticket du rail.
export type Pause = {
  request: number;
  since: string;
  agreedAt: string | null;
  ticket: number | null;
  minutes: number;
  inFlight: EnVol[];
};

// La dernière demande, si elle n'a été ni refusée ni levée. Une demande ne
// s'écrit jamais pendant qu'une autre attend ou tient : la dernière suffit.
export function pauseEnCours(base: Base): Pause | null {
  const [demande] = base.lire<{ seq: number; at: string; payload: string }>("SELECT seq, at, payload FROM events WHERE type = 'pause.requested' ORDER BY seq DESC LIMIT 1");
  if (demande === undefined) return null;
  const suites = base.lire<{ at: string; type: string }>(
    "SELECT at, type FROM events WHERE type IN ('pause.agreed', 'pause.declined', 'pause.released') AND seq > ? AND json_extract(payload, '$.request') = ? ORDER BY seq",
    demande.seq,
    demande.seq,
  );
  if (suites.some(({ type }) => type !== "pause.agreed")) return null;
  const { ticket, minutes, inFlight } = JSON.parse(demande.payload) as { ticket: number | null; minutes: number; inFlight?: EnVol[] };
  return { request: demande.seq, since: demande.at, agreedAt: suites[0]?.at ?? null, ticket, minutes, inFlight: inFlight ?? [] };
}

// La pause que le chef a acceptée et qui tient encore : c'est elle, et elle
// seule, qui retient merges et cooks.
export type PauseAccordee = Pause & { agreedAt: string };
export function pauseAccordee(base: Base): PauseAccordee | null {
  const pause = pauseEnCours(base);
  return pause === null || pause.agreedAt === null ? null : { ...pause, agreedAt: pause.agreedAt };
}

// La pause qui retient le merge de ce ticket — nulle s'il n'y en a pas, ou si
// c'est celui du renommage.
export function mergeRetenu(base: Base, ticket: number): PauseAccordee | null {
  const pause = pauseAccordee(base);
  return pause === null || pause.ticket === ticket ? null : pause;
}

// Les tickets en vol, ceux qu'une pause retient : pris — un cook y travaille —
// ou en pass — une livraison s'y juge ou y attend. Le ticket du renommage n'en
// est pas.
export function ticketsEnVol(rail: readonly TicketRail[], renommage: number | null): EnVol[] {
  return rail.flatMap(({ ticket, state }): EnVol[] => (ticket !== renommage && (state === "taken" || state === "pass") ? [{ ticket, state }] : []));
}

export type Demande = { issue: "demandee"; pause: Pause } | { issue: "deja"; pause: Pause };

// Le renommage demande la pause : la carte entre dans la file du chef. Une
// pause qui attend déjà son « oui », ou qui tient, n'en fait pas une seconde :
// elle est rendue telle quelle. `minutes` : la durée attendue, un entier
// positif. `auteur` : qui la demande (`runtime`, `station:<nom>`…).
export function demanderPause(
  journal: Journal,
  projet: string,
  { ticket, minutes, rail, auteur }: { ticket: number | null; minutes: number; rail: readonly TicketRail[]; auteur: string },
): Demande {
  if (!Number.isInteger(minutes) || minutes <= 0) throw new Error(`durée de pause illisible : ${minutes} (des minutes entières, au moins une)`);
  return journal.base.transaction((): Demande => {
    const deja = pauseEnCours(journal.base);
    if (deja !== null) return { issue: "deja", pause: deja };
    journal.ajouter({ project: projet, ticket: null, author: auteur, type: "pause.requested", payload: { purpose: "code-rename", ticket, minutes, inFlight: ticketsEnVol(rail, ticket) } });
    const pause = pauseEnCours(journal.base);
    if (pause === null) throw new Error("la demande de pause écrite ne se relit pas");
    return { issue: "demandee", pause };
  });
}

// Ce que devient la réponse du chef. `rien` : aucune pause n'attend ni ne
// tient. `deja` : la pause tient déjà, ce « oui » n'écrit rien.
export type Suite = "acceptee" | "refusee" | "levee" | "deja" | "rien";

// Le « oui » ou le « non » du chef. « oui » sur une carte qui attend : la pause
// tient. « non » sur une carte qui attend : elle quitte la file, rien n'a
// changé. « non » sur une pause qui tient : le « oui » est retiré, elle est
// levée et la cuisine repart.
export function repondre(journal: Journal, projet: string, reponse: Reponse, auteur = "chef"): { suite: Suite; pause: Pause | null } {
  return journal.base.transaction(() => {
    const pause = pauseEnCours(journal.base);
    if (pause === null) return { suite: "rien" as const, pause };
    const noter = (type: "pause.agreed" | "pause.declined") => journal.ajouter({ project: projet, ticket: null, author: auteur, type, payload: { request: pause.request } });
    if (pause.agreedAt === null) {
      noter(reponse === OUI ? "pause.agreed" : "pause.declined");
      return { suite: reponse === OUI ? ("acceptee" as const) : ("refusee" as const), pause };
    }
    if (reponse === OUI) return { suite: "deja" as const, pause };
    journal.ajouter({ project: projet, ticket: null, author: auteur, type: "pause.released", payload: { request: pause.request, why: "the chef withdrew the « yes »" } });
    return { suite: "levee" as const, pause };
  });
}

// Le renommage a fini — fait ou échoué, `pourquoi` le dit : la pause est
// levée, demandée ou en vigueur. Rend faux, sans rien écrire, s'il n'y en avait
// pas.
export function leverPause(journal: Journal, projet: string, pourquoi: string, auteur: string): boolean {
  return journal.base.transaction(() => {
    const pause = pauseEnCours(journal.base);
    if (pause === null) return false;
    journal.ajouter({ project: projet, ticket: null, author: auteur, type: "pause.released", payload: { request: pause.request, why: pourquoi } });
    return true;
  });
}

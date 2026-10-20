// La pause du renommage du code : avant de partir, un renommage demande au
// chef de mettre la cuisine en pause, par une carte de sa file (attend.ts).
// La carte dit combien de temps la pause doit durer et quels tickets en vol
// elle retiendra. Tant que le chef n'a pas dit « oui », rien ne change : la
// pass merge, les stations prennent. Son « oui » donné, et jusqu'à la fin de
// la pause :
//
// - aucun autre merge : la pass juge encore, mais une livraison verte attend
//   (`pass.waiting`, motif `paused`) au lieu d'être mergée, et le merge à la
//   main de la file (`rail merge`) est refusé — seuls le ticket du renommage
//   lui-même, s'il en a un, et la PR que le renommage remet à la pass
//   (`renommage.ts`) passent ;
// - aucun cook neuf : les stations ne prennent plus de ticket (`paused`), sauf
//   celui du renommage ; les cooks en vol finissent leur travail, et leur
//   livraison attend à son tour ;
// - la file le dit en une ligne : « paused for the code rename », avec les
//   tickets qui finissent leur travail et ceux qui sont retenus.
//
// La pause finit quand le renommage la lève (`leverPause`) — mergé, ou échoué
// en disant pourquoi —, ou quand le chef retire le « oui » (« non » sur une
// pause en vigueur). La cuisine repart seule : chaque livraison retenue est
// reprise par la pass, rejugée si la base a bougé. Un renommage échoué laisse
// une carte dans la file, qui dit pourquoi, jusqu'à ce que le chef l'ôte
// (« non »). Rien n'est tenu ici : tout se relit du journal.
import type { Base } from "../base.ts";
import type { Journal } from "../journal.ts";
import type { TicketRail } from "../projections/rail.ts";
import type { CauseDEchec, EnVol } from "./evenements.ts";

export const OUI = "yes";
export const NON = "no";
export type Reponse = typeof OUI | typeof NON;

// Ce que la cuisine retient, en tête de la ligne de la file.
export const EN_PAUSE_POUR_LE_RENOMMAGE = "paused for the code rename";

// La pause dure moins d'une heure : passé ce délai depuis le « oui » du chef,
// le renommage est abandonné, et la pause levée sans rien merger. Cinquante-
// cinq minutes laissent à l'abandon de quoi se faire avant l'heure.
export const LIMITE_DU_RENOMMAGE_MS = 55 * 60_000;

// La pause demandée ou en vigueur. `request` : le `seq` de sa demande ; `since` :
// sa demande ; `agreedAt` : le « oui » du chef, nul tant qu'il ne l'a pas dit.
// `ticket` : celui du renommage, nul s'il n'est pas un ticket du rail. `pr` :
// le numéro de la PR que le renommage a remise à la pass, nul avant.
export type Pause = {
  request: number;
  since: string;
  agreedAt: string | null;
  ticket: number | null;
  minutes: number;
  inFlight: EnVol[];
  pr: number | null;
};

// La PR que le renommage d'une demande a remise à la pass, s'il l'a fait.
function livraisonDe(base: Base, request: number): { pr: string; number: number } | null {
  const [livree] = base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'rename.delivered' AND json_extract(payload, '$.request') = ? ORDER BY seq DESC LIMIT 1", request);
  if (livree === undefined) return null;
  const { pr, number } = JSON.parse(livree.payload) as { pr: string; number: number };
  return { pr, number };
}

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
  return { request: demande.seq, since: demande.at, agreedAt: suites[0]?.at ?? null, ticket, minutes, inFlight: inFlight ?? [], pr: livraisonDe(base, demande.seq)?.number ?? null };
}

// La pause que le chef a acceptée et qui tient encore : c'est elle, et elle
// seule, qui retient merges et cooks.
export type PauseAccordee = Pause & { agreedAt: string };
export function pauseAccordee(base: Base): PauseAccordee | null {
  const pause = pauseEnCours(base);
  return pause === null || pause.agreedAt === null ? null : { ...pause, agreedAt: pause.agreedAt };
}

// La pause qui retient le merge de ce ticket — nulle s'il n'y en a pas, ou si
// c'est celui du renommage : son ticket, ou la PR qu'il a remise à la pass.
export function mergeRetenu(base: Base, ticket: number): PauseAccordee | null {
  const pause = pauseAccordee(base);
  return pause === null || pause.ticket === ticket || pause.pr === ticket ? null : pause;
}

// La cause d'un `pass.escalated` sur la PR d'un renommage abandonné.
export const RENOMMAGE_ABANDONNE = "rename-abandoned";

// Vrai si ce numéro est celui de la PR d'un renommage abandonné : sa pause est
// levée sans qu'il soit mergé — échoué, hors délai, ou le « oui » retiré par
// le chef. Elle n'est jamais mergée par la pass, pause levée ou non.
export function renommageEcarte(base: Base, numero: number): boolean {
  return (
    base.lire<{ un: number }>(
      `SELECT 1 AS un FROM events AS livree JOIN events AS levee
         ON levee.type = 'pause.released' AND json_extract(levee.payload, '$.request') = json_extract(livree.payload, '$.request')
       WHERE livree.type = 'rename.delivered' AND json_extract(livree.payload, '$.number') = ?
         AND coalesce(json_extract(levee.payload, '$.outcome'), '') <> 'merged'
       LIMIT 1`,
      numero,
    ).length > 0
  );
}

// Le renommage échoué dont la carte attend le chef : la dernière pause levée
// l'a été sur un échec, aucune autre n'a été demandée depuis, et le chef ne
// l'a pas ôtée. `at` : la levée ; `pr` : la PR restée sans merge, s'il y en a
// une.
export type EchecDuRenommage = { request: number; at: string; why: string; cause: CauseDEchec | null; pr: string | null };

export function echecDuRenommage(base: Base): EchecDuRenommage | null {
  const [dernier] = base.lire<{ type: string; at: string; payload: string }>(
    "SELECT type, at, payload FROM events WHERE type IN ('pause.requested', 'pause.released', 'pause.dismissed') ORDER BY seq DESC LIMIT 1",
  );
  if (dernier === undefined || dernier.type !== "pause.released") return null;
  const { request, why, outcome, cause } = JSON.parse(dernier.payload) as { request: number; why: string; outcome?: string; cause?: CauseDEchec };
  if (outcome !== "failed") return null;
  return { request, at: dernier.at, why, cause: cause ?? null, pr: livraisonDe(base, request)?.pr ?? null };
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
// tient, et aucune carte d'échec n'attend. `deja` : la pause tient déjà, ce
// « oui » n'écrit rien. `otee` : la carte d'un renommage échoué quitte la file.
export type Suite = "acceptee" | "refusee" | "levee" | "deja" | "otee" | "rien";

// Le « oui » ou le « non » du chef. « oui » sur une carte qui attend : la pause
// tient. « non » sur une carte qui attend : elle quitte la file, rien n'a
// changé. « non » sur une pause qui tient : le « oui » est retiré, elle est
// levée et la cuisine repart — le renommage en cours est abandonné. « non »
// sans pause, sur la carte d'un renommage échoué : elle quitte la file.
export function repondre(journal: Journal, projet: string, reponse: Reponse, auteur = "chef"): { suite: Suite; pause: Pause | null } {
  return journal.base.transaction(() => {
    const pause = pauseEnCours(journal.base);
    if (pause === null) {
      const echec = reponse === NON ? echecDuRenommage(journal.base) : null;
      if (echec === null) return { suite: "rien" as const, pause };
      journal.ajouter({ project: projet, ticket: null, author: auteur, type: "pause.dismissed", payload: { request: echec.request } });
      return { suite: "otee" as const, pause };
    }
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

// Le renommage a fini — fait ou échoué, `pourquoi` le dit, et `issue` ce qu'il
// en est quand c'est lui qui la lève : la pause est levée, demandée ou en
// vigueur. Rend faux, sans rien écrire, s'il n'y en avait pas.
export function leverPause(journal: Journal, projet: string, pourquoi: string, auteur: string, issue?: { outcome: "merged" } | { outcome: "failed"; cause: CauseDEchec }): boolean {
  return journal.base.transaction(() => {
    const pause = pauseEnCours(journal.base);
    if (pause === null) return false;
    journal.ajouter({ project: projet, ticket: null, author: auteur, type: "pause.released", payload: { request: pause.request, why: pourquoi, ...issue } });
    return true;
  });
}

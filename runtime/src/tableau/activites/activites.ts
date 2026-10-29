// Ce que fait chaque cook du projet, publié dans le Kitchen board (`activites`
// de son bloc, tableau/rendu/bloc.ts) : ce qu'une app montre d'un cook à la
// place de son terminal, avec GitHub seul (#1844). Lu au journal, au même
// rythme que le reste du tableau — le relevé d'un cook s'y écrit à chaque tick
// (garde-fous.ts, `cook.progressed`), et le tableau se réécrit quand ce qu'il
// dit change.
//
// Une entrée par ticket : son dernier cook, tant qu'il tourne, puis
// `GARDE_MS` après sa fin — le temps qu'une app qui le suivait le voie fini, et
// sa PR. Ni une relecture de la pass ni un jugement du manager ne cuisinent un
// ticket : ils n'y sont pas. Rien n'en sort que ce que le relevé dit déjà au
// journal — la nature d'un geste et ce qu'il vise, jamais ce qu'il écrit, ce
// qu'il pense ou ce qu'une commande rend (activite.ts) —, et rien ne s'y lit du
// worktree du cook : le bloc est le même pour un cook de la box et pour celui
// d'une station distante, dont le relevé ne dit pas le geste.
//
// Borné : `ETAPES_MAX` étapes par cook, et les cooks finis depuis moins de
// `GARDE_MS`, `FINIS_MAX` au plus — ceux qui tournent sont bornés par les
// plafonds des stations. Un corps trop long retire d'abord les étapes passées
// (rendre.ts) ; ce que chaque cook fait en ce moment reste.
import { estGeste, nommer, type Activite } from "../../activite.ts";
import type { Base } from "../../base.ts";
import { passDuTicket } from "../../projections/pass.ts";
import { ticketDuRail } from "../../projections/rail.ts";
import { REVIEWER } from "../../reviewer.ts";
import type { ActiviteDuCook, EtapeDuCook } from "../rendu/bloc.ts";

// Ce qu'un cook fini reste au tableau.
export const GARDE_MS = 2 * 3_600_000;
// Les derniers gestes d'un cook que le tableau porte.
export const ETAPES_MAX = 8;
// Les cooks finis que le tableau porte au plus, les plus récents.
export const FINIS_MAX = 10;

// Les stations que la pass et le manager lancent : ni une relecture ni un
// jugement ne cuisine un ticket (histoire-ticket.ts).
const HORS_TICKET = [REVIEWER, "manager"];

type Run = {
  run: string;
  ticket: number;
  station: string | null;
  launchedSeq: number;
  launchedAt: string;
  endedAt: string | null;
  ending: string | null;
  turns: number | null;
  tokens: number | null;
  progressTurns: number | null;
  progressTokens: number | null;
};

const etape = (activite: Activite): EtapeDuCook => {
  const { fait, faitEn, cible } = nommer(activite);
  return { fait, faitEn, cible, depuis: activite.since };
};

// Ce qu'un relevé dit que le cook fait, s'il le dit dans la forme d'une
// activité — comme la projection des garde-fous le garde.
function activiteDuReleve(brute: unknown): Activite | null {
  if (typeof brute !== "object" || brute === null) return null;
  const { doing, target, since } = brute as Record<string, unknown>;
  if (!estGeste(doing) || typeof since !== "string" || Number.isNaN(Date.parse(since)) || !(target === null || typeof target === "string")) return null;
  return { doing, target, since };
}

// Les gestes successifs du cook, d'après ses relevés : un relevé qui redit le
// même geste, sur la même cible et depuis la même heure, n'en est pas un
// nouveau. Les `ETAPES_MAX` derniers, le plus ancien d'abord.
function etapesDuCook(base: Base, { run, ticket, launchedSeq }: Run): EtapeDuCook[] {
  const releves = base.lire<{ activity: string | null }>(
    `SELECT json_extract(payload, '$.activity') AS activity FROM events
     WHERE ticket = ? AND type = 'cook.progressed' AND seq > ? AND json_extract(payload, '$.run') = ? ORDER BY seq`,
    ticket,
    launchedSeq,
    run,
  );
  const etapes: Activite[] = [];
  for (const { activity } of releves) {
    const activite = activiteDuReleve(activity === null ? null : JSON.parse(activity));
    const derniere = etapes.at(-1);
    if (activite === null || (derniere !== undefined && derniere.doing === activite.doing && derniere.target === activite.target && derniere.since === activite.since)) continue;
    etapes.push(activite);
  }
  return etapes.slice(-ETAPES_MAX).map(etape);
}

const NUMERO_DE_PR = /\/pull\/(\d+)(?:[/?#]|$)/;
const pr = (url: string, numero: number | null) => ({ numero: numero ?? Number(NUMERO_DE_PR.exec(url)?.[1] ?? Number.NaN), url });
const prDe = (url: string, numero: number | null) => {
  const lue = pr(url, numero);
  return { ...lue, numero: Number.isSafeInteger(lue.numero) ? lue.numero : null };
};

// La PR de la livraison du cook : celle que la pass tient pour lui — la PR du
// ticket qu'un cook renvoyé reprend sur la même branche, celle que sa
// livraison a ouverte —, ou, son ticket parti du rail, celle que sa fin a dite.
function prDuCook(base: Base, { run, ticket }: Run): ActiviteDuCook["pr"] {
  const pass = passDuTicket(base, ticket);
  if (pass !== null && pass.run === run && pass.pr !== null) return prDe(pass.pr, pass.number);
  const rapportee = base.lire<{ pr: string | null }>(
    `SELECT json_extract(payload, '$.pr') AS pr FROM events
     WHERE ticket = ? AND type = 'cook.reported' AND json_extract(payload, '$.run') = ? ORDER BY seq DESC LIMIT 1`,
    ticket,
    run,
  )[0]?.pr;
  return typeof rapportee === "string" && rapportee !== "" ? prDe(rapportee, null) : null;
}

// L'activité de chaque cook que le tableau porte, à `maintenant` : ceux qui
// tournent, puis ceux qui ont fini depuis moins de `GARDE_MS`, dans l'ordre de
// leur départ.
export function activitesDesCooks(base: Base, maintenant: Date): ActiviteDuCook[] {
  const hors = JSON.stringify(HORS_TICKET);
  const runs = base.lire<Run>(
    `SELECT r.run, r.ticket, r.station, r.launched_seq AS launchedSeq, r.launched_at AS launchedAt, r.ended_at AS endedAt, r.ending,
            r.turns, r.tokens, p.turns AS progressTurns, p.tokens AS progressTokens
     FROM cook_runs r LEFT JOIN cook_progress p ON p.run = r.run
     WHERE r.ticket IS NOT NULL AND coalesce(r.station, '') NOT IN (SELECT value FROM json_each(?))
       AND r.launched_seq = (SELECT max(s.launched_seq) FROM cook_runs s WHERE s.ticket = r.ticket AND coalesce(s.station, '') NOT IN (SELECT value FROM json_each(?)))
       AND (r.ended_at IS NULL OR r.ended_at >= ?)
     ORDER BY r.launched_seq`,
    hors,
    hors,
    new Date(maintenant.getTime() - GARDE_MS).toISOString(),
  );
  const finis = new Set(
    runs
      .filter(({ endedAt }) => endedAt !== null)
      .sort((a, b) => b.launchedSeq - a.launchedSeq)
      .slice(0, FINIS_MAX)
      .map(({ run }) => run),
  );
  return runs
    .filter((cook) => cook.endedAt === null || finis.has(cook.run))
    .map((cook) => {
      const etapes = etapesDuCook(base, cook);
      const fini = cook.endedAt !== null;
      return {
        ticket: cook.ticket,
        titre: ticketDuRail(base, cook.ticket)?.title ?? null,
        run: cook.run,
        station: cook.station,
        lanceLe: cook.launchedAt,
        finiLe: cook.endedAt,
        fin: fini ? cook.ending : null,
        maintenant: fini ? null : (etapes.at(-1) ?? null),
        etapes,
        tours: cook.turns ?? cook.progressTurns,
        tokens: cook.tokens ?? cook.progressTokens,
        pr: prDuCook(base, cook),
      };
    });
}

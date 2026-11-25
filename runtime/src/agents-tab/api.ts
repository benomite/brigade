// The read side of the Agents tab (#4220, epic #4117), as JSON answers to two paths:
//   GET /api/agents                — one entry per agent of the registry (registre.ts), in its order: who it is, its
//                                    state, the ticket it works on, its next run, and its figures over the last 7 days;
//   GET /api/agents/:id/gestures   — the agent's gestures, newest first, from its thread (autonomie/agents/gestes.ts,
//                                    #4029). An id the registry does not hold answers 404.
// Pure: the sources are handed in (sources.ts reads them for `npm run agents`), nothing is written.
//
// The state: `working` while one of its runs goes on — with the ticket it works on, null for a run on no ticket —,
// else `broken` when its last run failed and nothing was launched after it, else `idle`.
// The figures come from the agent's thread: the gestures it fixed by itself and those it handed to the chef in the last
// 7 days, the same two for every agent, the closer included. The closer keeps a third, its own: the lines its closing
// passes removed (`closing.ended`, the figure of its report, closing/report.ts). A thread or passes that were not
// read, or a thread that cannot be read, say so in the figure's value and meaning: never a zero in its place.
// `settings`: the object of the settings API (#4222), passed through untouched; null while that source is not there.
import { agentsDuJournal, gestesDe, GestesIllisibles, OUTCOME, type Geste } from "../autonomie/agents/gestes.ts";
import { HoraireIllisible, type Horaire } from "../autonomie/agents/prochain-passage.ts";
import { REGISTRE, type AgentDuRegistre } from "./registre.ts";

export type Sources = {
  maintenant: Date;
  // The directory of the gesture log (gestes.ts): the runtime's state directory.
  repertoireDesGestes?: string;
  // The runs going on, by agent id; `ticket`: the one it works on, null for a run on no ticket.
  enCours?: ReadonlyArray<{ id: string; ticket: number | null }>;
  // The agents whose last run failed and was not launched again.
  enEchec?: readonly string[];
  // Each agent's schedule as the runtime noted it (autonomie/agents/horaires.ts).
  horaires?: (id: string) => Horaire | undefined;
  // The closing passes that ended (`closing.ended` of the log): when, and the lines each removed.
  passesDuCloser?: ReadonlyArray<{ at: string; removedLines: number }>;
};
type Demande = { method: string; url: string };
type Reponse = { statut: number; corps: unknown };

type Chiffre = { label: string; value: number | string; meaning: string };
type EntreeDAgent = AgentDuRegistre & { state: "idle" | "working" | "broken"; workingOn: number | null; nextRun: string | null; figures: Chiffre[]; settings: null };
type GesteDuFil = { at: string; summary: string; reason: string; issue: number | null };

const RACINE = "/api/agents";
const GESTES = /^\/api\/agents\/([^/]+)\/gestures$/;
const SEMAINE_MS = 7 * 24 * 3_600_000;
// A cook's thread is kept under `cook #<ticket>` (autonomie/agents/agents.ts): the cooks' gestures are all theirs.
const CUISINIER = /^cook #(\d+)$/;

const FIGURES = [
  { label: "Fixed by itself", outcome: OUTCOME.FIXED_BY_SELF, meaning: "gestures it made and closed without the chef, last 7 days" },
  { label: "Handed to the chef", outcome: OUTCOME.HANDED_TO_CHEF, meaning: "gestures it handed to the chef to decide, last 7 days" },
];

// The agent's thread, oldest first within each of its logs; `outcome` kept for the figures.
function filDe(repertoire: string, id: string): Array<Geste & { issue: number | null }> {
  const cles = id === "cook" ? agentsDuJournal(repertoire).filter((cle) => CUISINIER.test(cle)) : [id];
  return cles.flatMap((cle) => {
    const ticket = CUISINIER.exec(cle)?.[1];
    return gestesDe(repertoire, cle).map((geste) => ({ ...geste, issue: ticket === undefined ? null : Number(ticket) }));
  });
}

const LIGNES_RETIREES = { label: "Lines removed", meaning: "lines of code its closing passes removed, last 7 days" };

function figuresDe(sources: Sources, id: string): Chiffre[] {
  const duFil = figuresDuFil(sources, id);
  return id === "closer" ? [...duFil, lignesRetirees(sources)] : duFil;
}

function lignesRetirees(sources: Sources): Chiffre {
  const { label, meaning } = LIGNES_RETIREES;
  if (sources.passesDuCloser === undefined) return { label, value: "not known", meaning: `${meaning} — its passes were not read` };
  const depuis = sources.maintenant.getTime() - SEMAINE_MS;
  const retirees = sources.passesDuCloser.filter(({ at }) => Date.parse(at) > depuis).reduce((total, { removedLines }) => total + removedLines, 0);
  return { label, value: retirees, meaning };
}

function figuresDuFil(sources: Sources, id: string): Chiffre[] {
  if (sources.repertoireDesGestes === undefined) return FIGURES.map(({ label, meaning }) => ({ label, value: "not known", meaning: `${meaning} — its thread was not read` }));
  let fil;
  try {
    fil = filDe(sources.repertoireDesGestes, id);
  } catch (erreur) {
    if (!(erreur instanceof GestesIllisibles)) throw erreur;
    return FIGURES.map(({ label, meaning }) => ({ label, value: "cannot be read", meaning: `${meaning} — ${erreur.message}` }));
  }
  const depuis = sources.maintenant.getTime() - SEMAINE_MS;
  const recents = fil.filter(({ at }) => Date.parse(at) > depuis);
  return FIGURES.map(({ label, outcome, meaning }) => ({ label, value: recents.filter((geste) => geste.outcome === outcome).length, meaning }));
}

function etatDe(sources: Sources, id: string): Pick<EntreeDAgent, "state" | "workingOn"> {
  const siens = (sources.enCours ?? []).filter((run) => run.id === id);
  // The ticket of the run that has one: a run on no ticket works on none.
  const surUnTicket = siens.find(({ ticket }) => typeof ticket === "number");
  if (siens.length > 0) return { state: "working", workingOn: surUnTicket?.ticket ?? null };
  return { state: (sources.enEchec ?? []).includes(id) ? "broken" : "idle", workingOn: null };
}

// A schedule never noted, or one that cannot be read, is no next run known: null.
function prochainDe(sources: Sources, id: string): string | null {
  try {
    return sources.horaires?.(id)?.at.toISOString() ?? null;
  } catch (erreur) {
    if (!(erreur instanceof HoraireIllisible)) throw erreur;
    return null;
  }
}

const entreeDe = (agent: AgentDuRegistre, sources: Sources): EntreeDAgent => ({
  ...agent,
  ...etatDe(sources, agent.id),
  nextRun: prochainDe(sources, agent.id),
  figures: figuresDe(sources, agent.id),
  settings: null,
});

export const repondre = ({ method, url }: Demande, sources: Sources): Reponse =>
  method === "GET" ? servir(url, sources) : { statut: 405, corps: { reason: `${method} is not served here: the agents are only read` } };

function servir(url: string, sources: Sources): Reponse {
  const chemin = new URL(url, "http://agents.invalid").pathname;
  if (chemin === RACINE) return { statut: 200, corps: REGISTRE.map((agent) => entreeDe(agent, sources)) };
  const id = GESTES.exec(chemin)?.[1];
  if (id === undefined) return { statut: 404, corps: { reason: `nothing is served at ${chemin}` } };
  if (!REGISTRE.some((agent) => agent.id === id)) return { statut: 404, corps: { reason: `no agent “${id}” in the registry` } };
  if (sources.repertoireDesGestes === undefined) return { statut: 503, corps: { reason: "the gesture log was not given" } };
  let fil;
  try {
    fil = filDe(sources.repertoireDesGestes, id);
  } catch (erreur) {
    if (!(erreur instanceof GestesIllisibles)) throw erreur;
    return { statut: 500, corps: { reason: erreur.message } };
  }
  const gestes: GesteDuFil[] = fil.toSorted((a, b) => b.at.localeCompare(a.at)).map(({ at, line, reason, issue }) => ({ at, summary: line, reason, issue }));
  return { statut: 200, corps: gestes };
}

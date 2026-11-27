// La cuisine d'un projet, station par station (#1185) : ce que chaque station déclarée fait du projet —
// elle cuit, elle est arrêtée, saturée, ou elle le refuse —, ses cooks en cours. Tout vient de
// `facts`, champ `stations` (runtime/src/etat.ts, `cuisson`, #1183) : un mot lu, que l'app ne déduit jamais.
// Ce qui demande un geste au chef — une station saturée, ou qui refuse le projet — tient en une ligne, que
// l'onglet Rail pose avec de quoi ouvrir Cooks.
// Une station distante que la principale ne voit pas (`presente`, #1830) ne cuit pas, quel que soit son mot : elle ne
// prend aucun ticket tant qu'elle ne s'est pas manifestée. Sa ligne le dit — « not cooking » —, jamais « cooking ».
import { duration, type AgentRead, type Cook, type Facts } from "./facts.ts";
import type { FactsStation } from "./ordinary.ts";

// Les mots de `cuisson`, et la couleur de chacun. Un mot inconnu se dit tel quel, sans couleur ni geste.
// `idle` et `silent` : les mots d'une station sur GitHub seul qui ne tient aucun ticket, fraîche ou tue (#2358).
const TONES = new Map([
  ["cooking", "vert"],
  ["idle", "gris"],
  ["silent", "gris"],
  ["stopped", "gris"],
  ["refused", "rouge"],
]);

// Ce qu'une station fait tourner hors des cooks de ticket (#1971) : la pass qui juge une livraison, le manager qui juge
// ou découpe une issue, le triage, le closer qui nettoie le projet — son rôle, son ticket et le titre que le rail lui
// donne (vide hors du rail, et pour le closer, qui n'en a pas), ce qu'il fait, depuis quand, et cette durée à la lecture.
export type AgentOfStation = { role: string; ticket: number | null; titre: string; fait: string; depuis: string; pour: string };

// Une station sur l'onglet Stations : son nom ; distante ou de la box ; son mot, sa couleur ; ce qu'il veut dire
// en quelques mots, et au survol ; ses cooks en cours ; et ce que la principale
// sait d'elle, quand son runtime le dit : ce qu'elle fournit, si elle la voit, sa dernière demande. `agents` : ce
// qu'elle fait tourner à côté de ses cooks (#1971) — vide quand rien ne tourne.
// `ordinaires` : la station prend aussi les tickets ordinaires, comme `facts` le dit (l'onglet Stations le montre, #2488).
export type LineOfStation = { station: string; distante: boolean; ordinaires?: boolean; etat: string; ton?: string; dit: string; survol: string; cooks: Cook[]; agents: AgentOfStation[]; fournit?: string[]; presente?: boolean; vueLe?: string | null; lacks?: string; retenue?: string; engine?: unknown };
// `surGithub` : un projet sur GitHub seul, dont les stations se disent de GitHub (vue/onglet-stations/stations-github.js, #2358) —
// `illisible`, pourquoi leurs signes de vie ne se lisent pas.
export type CookingOfProject = { lignes: LineOfStation[]; surGithub?: { illisible: string | null } };

const NOT_SAYS = "not given";
const NOT_SAYS_HOVER = "this station's runtime does not say yet what it does with the project: update it to start and stop it from here";

const cooksSays = (count: number) => `${count} cook${count > 1 ? "s" : ""}`;

// Le mot d'une station distante que la principale ne voit pas, à la place de « cooking ».
export const ABSENT = { etat: "not cooking", survol: "the main station does not see it: it takes no ticket until it shows itself — the tickets only it can cook wait for it, the others leave" };

function lineOf(station: FactsStation, cooks: readonly Cook[], readOne: string, agents: readonly AgentOfStation[]): LineOfStation {
  const itsOwn = station.cooks ?? cooks.filter((cook) => cook.station === station.station);
  const base = {
    station: station.station,
    distante: station.distante,
    ...(typeof station.ordinaires === "boolean" ? { ordinaires: station.ordinaires } : {}),
    cooks: itsOwn,
    agents: [...agents],
    ...(station.fournit === undefined ? {} : { fournit: station.fournit }),
    ...(station.presente === undefined ? {} : { presente: station.presente }),
    ...(station.vueLe === undefined ? {} : { vueLe: station.vueLe }),
    ...(station.lacks === undefined ? {} : { lacks: station.lacks }),
    ...(station.retenue === undefined ? {} : { retenue: station.retenue }),
    ...(station.engine === undefined ? {} : { engine: station.engine }),
  };
  const state = station.cuisson;
  if (state === undefined) return { ...base, etat: NOT_SAYS, dit: "", survol: NOT_SAYS_HOVER };
  const your = TONES.get(state);
  const colored = your === undefined ? {} : { ton: your };
  if (state === "cooking" && station.distante && station.presente === false) return { ...base, ...ABSENT, ton: "gris", dit: "" };
  if (state === "cooking") return { ...base, etat: state, ...colored, dit: "", survol: "it takes the project's tickets" };
  if (state === "idle") return { ...base, etat: state, ...colored, dit: "", survol: "it holds no ticket of the project: it takes the next one it can cook" };
  if (state === "silent") return { ...base, etat: state, ...colored, dit: "", survol: "it has not signed on GitHub for a while: it takes no ticket until it is back" };
  if (state === "refused") {
    const refusal = station.refus ?? null;
    return { ...base, etat: state, ...colored, dit: refusal?.message ?? "the station refuses the project", survol: refusal?.action ?? "the station does not say why" };
  }
  if (state === "stopped") {
    const finish = itsOwn.length === 0 ? "" : ` · ${cooksSays(itsOwn.length)} finishing`;
    const since = station.arreteeDepuis ?? null;
    // Arrêtée par le « stop » de toute la cuisine : c'est elle qui se reprend, sur sa bannière.
    if (since === null) return { ...base, etat: state, ...colored, dit: `the whole kitchen is stopped${finish}`, survol: "your “stop” holds the whole kitchen: “resume” on its banner starts it again, on every station" };
    return { ...base, etat: state, ...colored, dit: `by you, for ${duration(Date.parse(readOne) - Date.parse(since))}${finish}`, survol: "it takes no more tickets of this project; its running cooks finish — delivered, or their ticket goes back to the rail" };
  }
  return { ...base, etat: state, dit: "", survol: `“${state}”: a word this app does not know yet` };
}

// Ce que la pass fait elle-même d'une livraison, comme la carte du ticket en pass le dit : ses phases de travail. Une
// livraison qui attend — la pass, sa CI coupée, le chef — ne la fait pas tourner. La même liste que le runtime
// (runtime/src/activites.ts, `PASS_A_L_OUVRAGE`) : un test les compare.
export const PASS_AT_THE_WORK: ReadonlySet<string> = new Set(["running the gates", "review running since", "judging", "merging"]);
const passALWork = (doneEn: string): boolean => [...PASS_AT_THE_WORK].some((start) => doneEn.startsWith(start));

// Ce qui tourne hors des cooks de ticket : ce que le runtime en dit (`agents`) ; d'un runtime d'avant ce champ, la pass
// seule, d'après les tickets en pass du rail — elle tourne sur la principale, sans nom de station. Les tickets au travail
// (facts.ts, `auTravail`, #2984) se lisent ici aussi.
export function agentsOf(agents: readonly AgentRead[] | undefined, rail: Facts["rail"]): AgentRead[] {
  if (agents !== undefined) return [...agents];
  return rail.flatMap(({ ticket, etat: state, activite: activity }) =>
    state === "en pass" && activity?.faitEn !== undefined && passALWork(activity.faitEn) ? [{ role: "pass", station: null, ticket, fait: activity.faitEn, depuis: activity.depuis }] : [],
  );
}

// Les lignes des stations d'un projet, dans l'ordre de `facts`. `cooks` : les cooks en cours
// de `facts`, d'où se tirent ceux d'une station quand son runtime ne les lui donne pas. `lu` : l'heure de la
// lecture, à l'horloge de la box. `agents`, `rail` : ce qui tourne hors des cooks de ticket (#1971) — chacun sur la
// station qui le fait tourner ; sans elle, ou quand elle n'est pas du projet, sur sa première station d'ici, celle qui
// tient le manager et la pass.
export function cookingOf(stations: readonly FactsStation[], cooks: readonly Cook[] | undefined, readOne: string, agents?: readonly AgentRead[], rail: Facts["rail"] = []): CookingOfProject {
  const main = stations.find((station) => !station.distante)?.station;
  const titles = new Map(rail.map(({ ticket, titre: title }) => [ticket, title]));
  const run = agentsOf(agents, rail).map((agent) => ({
    ou: agent.station !== null && stations.some((station) => station.station === agent.station) ? agent.station : main,
    agent: { role: agent.role, ticket: agent.ticket, titre: agent.ticket === null ? "" : (titles.get(agent.ticket) ?? ""), fait: agent.fait, depuis: agent.depuis, pour: duration(Date.parse(readOne) - Date.parse(agent.depuis)) },
  }));
  const lines = stations.map((station) => lineOf(station, cooks ?? [], readOne, run.flatMap(({ ou: or, agent }) => (or === station.station ? [agent] : []))));
  return { lignes: lines };
}

// La cuisine d'un projet, station par station (#1185) : ce que chaque station déclarée fait du projet —
// elle cuit, elle est arrêtée, saturée, ou elle le refuse —, ses cooks en cours, et le geste qui la lance
// ou l'arrête. Tout vient de `facts`, champ `stations` (runtime/src/etat.ts, `cuisson`, #1183) : un mot
// lu, que l'app ne déduit jamais. Le geste qui la lançait ou l'arrêtait ne part plus de l'app (#2061) : aucune box ne
// lit plus de tableau de la cuisine.
// Ce qui demande un geste au chef — une station saturée, ou qui refuse le projet — tient en une ligne, que
// l'onglet Rail pose avec de quoi ouvrir Cooks.
// Une station distante que la principale ne voit pas (`presente`, #1830) ne cuit pas, quel que soit son mot : elle ne
// prend aucun ticket tant qu'elle ne s'est pas manifestée. Sa ligne le dit — « not cooking » —, jamais « cooking ».
import { duree, type AgentLu, type Cook, type Faits } from "./faits.ts";
import type { StationDesFaits } from "./ordinaires.ts";

// Les mots de `cuisson`, et la couleur de chacun. Un mot inconnu se dit tel quel, sans couleur ni geste.
const TONS = new Map([
  ["cooking", "vert"],
  ["stopped", "gris"],
  ["saturated", "jaune"],
  ["refused", "rouge"],
]);

// Le geste d'une ligne : la station cuit — saturée, elle cuit encore ce qu'elle a —, elle s'arrête ;
// arrêtée par le chef, elle se relance.
export type GesteDeCuisson = "start" | "stop";
export const GESTES_DE_CUISSON: readonly GesteDeCuisson[] = ["start", "stop"];

// Ce qu'une station fait tourner hors des cooks de ticket (#1971) : la pass qui juge une livraison, le manager qui juge
// ou découpe une issue, le triage, le closer qui nettoie le projet — son rôle, son ticket et le titre que le rail lui
// donne (vide hors du rail, et pour le closer, qui n'en a pas), ce qu'il fait, depuis quand, et cette durée à la lecture.
export type AgentDeStation = { role: string; ticket: number | null; titre: string; fait: string; depuis: string; pour: string };

// Une station sur l'onglet Cooks : son nom ; distante ou de la box ; son mot, sa couleur ; ce qu'il veut dire
// en quelques mots, et au survol ; ses cooks en cours ; le geste que son bouton fait — aucun quand ce n'est
// pas d'elle que vient l'arrêt, qu'elle refuse le projet, ou que son runtime ne dit pas son état. Et ce que la principale
// sait d'elle, quand son runtime le dit : ce qu'elle fournit, si elle la voit, sa dernière demande. `agents` : ce
// qu'elle fait tourner à côté de ses cooks (#1971) — vide quand rien ne tourne.
export type LigneDeStation = { station: string; distante: boolean; etat: string; ton?: string; dit: string; survol: string; cooks: Cook[]; agents: AgentDeStation[]; geste: GesteDeCuisson | null; fournit?: string[]; presente?: boolean; vueLe?: string | null };
// `alerte` : ce qui demande un geste au chef du côté des cooks, en une ligne — nulle quand rien ne le demande.
export type CuissonDuProjet = { lignes: LigneDeStation[]; alerte: string | null };

const PAS_DIT = "not given";
const PAS_DIT_SURVOL = "this station's runtime does not say yet what it does with the project: update it to start and stop it from here";

const cooksDit = (nombre: number) => `${nombre} cook${nombre > 1 ? "s" : ""}`;

// Le mot d'une station distante que la principale ne voit pas, à la place de « cooking ».
export const ABSENTE = { etat: "not cooking", survol: "the main station does not see it: it takes no ticket until it shows itself — the tickets only it can cook wait for it, the others leave" };

function ligneDe(station: StationDesFaits, cooks: readonly Cook[], lu: string, agents: readonly AgentDeStation[]): LigneDeStation {
  const siens = station.cooks ?? cooks.filter((cook) => cook.station === station.station);
  const base = {
    station: station.station,
    distante: station.distante,
    cooks: siens,
    agents: [...agents],
    ...(station.fournit === undefined ? {} : { fournit: station.fournit }),
    ...(station.presente === undefined ? {} : { presente: station.presente }),
    ...(station.vueLe === undefined ? {} : { vueLe: station.vueLe }),
  };
  const etat = station.cuisson;
  if (etat === undefined) return { ...base, etat: PAS_DIT, dit: "", survol: PAS_DIT_SURVOL, geste: null };
  const ton = TONS.get(etat);
  const colore = ton === undefined ? {} : { ton };
  if (etat === "cooking" && station.distante && station.presente === false) return { ...base, ...ABSENTE, ton: "gris", dit: "", geste: "stop" };
  if (etat === "cooking") return { ...base, etat, ...colore, dit: "", survol: "it takes the project's tickets", geste: "stop" };
  if (etat === "saturated") return { ...base, etat, ...colore, dit: "its machine has no room", survol: "its machine has no room left: it takes no ticket until it has, its running cooks go on", geste: "stop" };
  if (etat === "refused") {
    const refus = station.refus ?? null;
    return { ...base, etat, ...colore, dit: refus?.message ?? "the station refuses the project", survol: refus?.action ?? "the station does not say why", geste: null };
  }
  if (etat === "stopped") {
    const finissent = siens.length === 0 ? "" : ` · ${cooksDit(siens.length)} finishing`;
    const depuis = station.arreteeDepuis ?? null;
    // Arrêtée par le « stop » de toute la cuisine : c'est elle qui se reprend, sur sa bannière.
    if (depuis === null) return { ...base, etat, ...colore, dit: `the whole kitchen is stopped${finissent}`, survol: "your “stop” holds the whole kitchen: “resume” on its banner starts it again, on every station", geste: null };
    return { ...base, etat, ...colore, dit: `by you, for ${duree(Date.parse(lu) - Date.parse(depuis))}${finissent}`, survol: "it takes no more tickets of this project; its running cooks finish — delivered, or their ticket goes back to the rail", geste: "start" };
  }
  return { ...base, etat, dit: "", survol: `“${etat}”: a word this app does not know yet`, geste: null };
}

// Ce qu'une station qui demande un geste au chef dit de son état, dans la ligne d'alerte.
function aRegler(ligne: LigneDeStation): string | undefined {
  if (ligne.etat === "saturated") return `${ligne.station} is saturated: it takes no ticket until its machine has room`;
  if (ligne.etat === "refused") return `${ligne.station} refuses the project: ${ligne.dit.replace(/\.$/, "")}`;
  return undefined;
}

// Ce que la pass fait elle-même d'une livraison, comme la carte du ticket en pass le dit : ses phases de travail. Une
// livraison qui attend — la pass, sa CI coupée, le chef — ne la fait pas tourner. La même liste que le runtime
// (runtime/src/activites.ts, `PASS_A_L_OUVRAGE`) : un test les compare.
export const PASS_A_L_OUVRAGE: ReadonlySet<string> = new Set(["running the gates", "review in progress", "judging", "merging"]);

// Ce qui tourne hors des cooks de ticket : ce que le runtime en dit (`agents`) ; d'un runtime d'avant ce champ, la pass
// seule, d'après les tickets en pass du rail — elle tourne sur la principale, sans nom de station.
function agentsDe(agents: readonly AgentLu[] | undefined, rail: Faits["rail"]): AgentLu[] {
  if (agents !== undefined) return [...agents];
  return rail.flatMap(({ ticket, etat, activite }) =>
    etat === "en pass" && activite?.faitEn !== undefined && PASS_A_L_OUVRAGE.has(activite.faitEn) ? [{ role: "pass", station: null, ticket, fait: activite.faitEn, depuis: activite.depuis }] : [],
  );
}

// Les lignes des stations d'un projet, dans l'ordre de `facts`, et sa ligne d'alerte. `cooks` : les cooks en cours
// de `facts`, d'où se tirent ceux d'une station quand son runtime ne les lui donne pas. `lu` : l'heure de la
// lecture, à l'horloge de la box. `agents`, `rail` : ce qui tourne hors des cooks de ticket (#1971) — chacun sur la
// station qui le fait tourner ; sans elle, ou quand elle n'est pas du projet, sur sa première station d'ici, celle qui
// tient le manager et la pass.
export function cuissonDe(stations: readonly StationDesFaits[], cooks: readonly Cook[] | undefined, lu: string, agents?: readonly AgentLu[], rail: Faits["rail"] = []): CuissonDuProjet {
  const principale = stations.find((station) => !station.distante)?.station;
  const titres = new Map(rail.map(({ ticket, titre }) => [ticket, titre]));
  const tournent = agentsDe(agents, rail).map((agent) => ({
    ou: agent.station !== null && stations.some((station) => station.station === agent.station) ? agent.station : principale,
    agent: { role: agent.role, ticket: agent.ticket, titre: agent.ticket === null ? "" : (titres.get(agent.ticket) ?? ""), fait: agent.fait, depuis: agent.depuis, pour: duree(Date.parse(lu) - Date.parse(agent.depuis)) },
  }));
  const lignes = stations.map((station) => ligneDe(station, cooks ?? [], lu, tournent.flatMap(({ ou, agent }) => (ou === station.station ? [agent] : []))));
  const dites = lignes.flatMap((ligne) => aRegler(ligne) ?? []);
  const [premiere] = dites;
  const autres = dites.length - 1;
  return { lignes, alerte: premiere === undefined ? null : autres === 0 ? premiere : `${premiere} — and ${autres} more station${autres > 1 ? "s" : ""}` };
}

// Ce que le bouton d'une station reçoit (vue/pont.d.ts) : il ne part plus de l'app (#2061, gestes-github.ts, `SANS_FAIT`).
export type RenduDeCuisson = { fait: string; detail?: string } | { refus: string; detail?: string };

// La cuisine d'un projet, station par station (#1185) : ce que chaque station déclarée fait du projet —
// elle cuit, elle est arrêtée, saturée, ou elle le refuse —, ses cooks en cours, et le geste qui la lance
// ou l'arrête. Tout vient de `facts`, champ `stations` (runtime/src/etat.ts, `cuisson`, #1183) : un mot
// lu, que l'app ne déduit jamais. Le geste est la commande du runtime, `station stop|start <station>`
// (docs/runtime/station.md, « Lancer et arrêter la cuisine, station par station ») : la même pour une
// station de la box, pour le Mac et pour toute station distante — elle part sur le tableau de la cuisine du projet
// (`/brigade station stop|start <station>`, docs/tableau-gestes.md, #1845), que la box joue à son tick : sans
// box jointe. Arrêter ne coupe aucun cook : ceux qui tournent finissent, livrent ou rendent leur ticket au rail.
// Ce qui demande un geste au chef — une station saturée, ou qui refuse le projet — tient en une ligne, que
// l'onglet Rail pose avec de quoi ouvrir Cooks.
// Une station distante que la principale ne voit pas (`presente`, #1830) ne cuit pas, quel que soit son mot : elle ne
// prend aucun ticket tant qu'elle ne s'est pas manifestée. Sa ligne le dit — « not cooking » —, jamais « cooking ».
import { duree, type Cook } from "./faits.ts";
import type { StationDesFaits } from "./ordinaires.ts";
import { ditParLaBox, enSuite, type DecisionDuChef, type EtatDuGeste } from "./tableau-gestes/gestes.ts";

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

// Une station sur l'onglet Cooks : son nom ; distante ou de la box ; son mot, sa couleur ; ce qu'il veut dire
// en quelques mots, et au survol ; ses cooks en cours ; le geste que son bouton fait — aucun quand ce n'est
// pas d'elle que vient l'arrêt, qu'elle refuse le projet, ou que son runtime ne dit pas son état. Et ce que la principale
// sait d'elle, quand son runtime le dit : ce qu'elle fournit, si elle la voit, sa dernière demande.
export type LigneDeStation = { station: string; distante: boolean; etat: string; ton?: string; dit: string; survol: string; cooks: Cook[]; geste: GesteDeCuisson | null; fournit?: string[]; presente?: boolean; vueLe?: string | null };
// `alerte` : ce qui demande un geste au chef du côté des cooks, en une ligne — nulle quand rien ne le demande.
export type CuissonDuProjet = { lignes: LigneDeStation[]; alerte: string | null };

const PAS_DIT = "not given";
const PAS_DIT_SURVOL = "this station's runtime does not say yet what it does with the project: update it to start and stop it from here";

const cooksDit = (nombre: number) => `${nombre} cook${nombre > 1 ? "s" : ""}`;

// Le mot d'une station distante que la principale ne voit pas, à la place de « cooking ».
export const ABSENTE = { etat: "not cooking", survol: "the main station does not see it: it takes no ticket until it shows itself — the tickets only it can cook wait for it, the others leave" };

function ligneDe(station: StationDesFaits, cooks: readonly Cook[], lu: string): LigneDeStation {
  const siens = station.cooks ?? cooks.filter((cook) => cook.station === station.station);
  const base = {
    station: station.station,
    distante: station.distante,
    cooks: siens,
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

// Les lignes des stations d'un projet, dans l'ordre de `facts`, et sa ligne d'alerte. `cooks` : les cooks en cours
// de `facts`, d'où se tirent ceux d'une station quand son runtime ne les lui donne pas. `lu` : l'heure de la
// lecture, à l'horloge de la box.
export function cuissonDe(stations: readonly StationDesFaits[], cooks: readonly Cook[] | undefined, lu: string): CuissonDuProjet {
  const lignes = stations.map((station) => ligneDe(station, cooks ?? [], lu));
  const dites = lignes.flatMap((ligne) => aRegler(ligne) ?? []);
  const [premiere] = dites;
  const autres = dites.length - 1;
  return { lignes, alerte: premiere === undefined ? null : autres === 0 ? premiere : `${premiere} — and ${autres} more station${autres > 1 ? "s" : ""}` };
}

// Un nom de station tel qu'il part dans la commande : celui que le projet déclare, sans rien qu'un shell lise.
const NOM = /^[A-Za-z0-9@._:/-]+$/;

export type RenduDeCuisson = { fait: string; detail?: string } | { refus: string; detail?: string };

// Lance ou arrête la cuisine du projet sur une de ses stations, par le tableau de sa cuisine (`auTableau` : le geste
// posté sur le dernier tableau lu du projet, suivi jusqu'à la réponse de la box). La station doit être l'une de celles
// que les derniers `facts` du projet donnent : la vue nomme la station et le geste, jamais une commande. Ce que la box a
// répondu se lit au survol, avec l'adresse du geste ; à l'écran, une phrase.
export async function cuireSurLaStation(
  projet: string,
  stations: readonly StationDesFaits[] | undefined,
  station: unknown,
  geste: unknown,
  auTableau: (decision: DecisionDuChef) => Promise<EtatDuGeste>,
): Promise<RenduDeCuisson> {
  if (geste !== "start" && geste !== "stop") return { refus: `nothing was sent: “${String(geste)}” is neither start nor stop` };
  if (stations === undefined) return { refus: `nothing was sent: ${projet}'s stations are not read yet` };
  if (typeof station !== "string" || !NOM.test(station) || !stations.some((declaree) => declaree.station === station)) {
    return { refus: `nothing was sent: “${String(station)}” is not one of ${projet}'s stations` };
  }
  const etat = await auTableau({ geste: "station", action: geste, station });
  if (etat.etat === "failed") return { refus: `nothing was sent: ${enSuite(etat.raison)}` };
  const detail = `${etat.etat === "pending" ? "" : ditParLaBox(etat.reponse).dit}\n${etat.commentaire.url ?? ""}`.trim();
  if (etat.etat === "refused") return { refus: `${station} did not ${geste}: the box did not take it — nothing was changed`, detail };
  if (etat.etat === "pending") return { fait: `posted on the Kitchen board: ${station} ${geste === "stop" ? "stops" : "starts"} cooking ${projet} at the box's next tick`, detail };
  return {
    fait: geste === "stop" ? `${station} stops cooking ${projet}: it takes no more tickets, its running cooks finish` : `${station} cooks ${projet} again: it takes its tickets at the runtime's next read`,
    detail,
  };
}

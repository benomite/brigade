// Le réglage « prendre aussi les tickets ordinaires » de la station de cet ordinateur pour un projet
// (docs/runtime/station-distante.md, « Les tickets ordinaires sur le poste du chef »). Le chef le pose dans les
// réglages du projet ; il s'écrit dans le fichier des projets (`ordinaires`, `limiteCooks`) et
// revient à chaque lecture. L'état du bac à sable, lui, vient de la station : la box le rend dans
// `facts`, champ `stations`, et l'app le dit tel quel, sans le deviner.
import type { Projet } from "./config.ts";
import { estUnMac, nomDuPoste } from "./plateforme.ts";

// Ce que `facts` dit d'une station (runtime/src/etat.ts, `stations`) — ce que l'app en lit.
// `bacASable` : nul, la station n'en a rien dit.
// `cuisson` : ce que la station fait du projet — `cooking`, `stopped`, `saturated`, `refused` (#1183) ;
// `arreteeDepuis` : le chef l'a arrêtée, depuis quand — nul, ce n'est pas lui, ou elle cuit ; `refus` : pourquoi
// la station de la machine refuse le projet ; `cooks` : ses cooks en cours. Les quatre sont absents d'un
// runtime d'avant ce champ (cuisson.ts).
export type StationDesFaits = {
  station: string;
  distante: boolean;
  plafond: number | null;
  ordinaires: boolean;
  bacASable: { disponible: boolean; raison: string | null; version: string | null; depuis: string } | null;
  prendOrdinaires: boolean;
  cuisson?: string;
  arreteeDepuis?: string | null;
  refus?: { code: string; message: string; action: string } | null;
  cooks?: { ticket: number; titre: string; station: string }[];
};

// Ce poste en tête de phrase : « This Mac », « This PC ».
const enTete = (poste: string) => `${poste.charAt(0).toUpperCase()}${poste.slice(1)}`;

// `poste` : le nom que l'écran donne à cet ordinateur (plateforme.ts).
export const explication = (poste: string): string => `Cooks on ${poste} run in Claude Code's sandbox: they write only in their own worktree, and reach only the network hosts on the project's list.`;

// Hors d'un Mac — un PC sous Windows, un Linux de bureau —, la station ne prend aucun ticket
// ordinaire : le runtime ne monte le bac à sable d'une cuisine locale que sous macOS
// (runtime/src/bac-a-sable/local.ts), et une station distante sans bac à sable n'en prend pas
// (`prendLesOrdinaires`). L'app le dit, à la place de l'option, plutôt que de taire le réglage.
export const sansBacASable = (poste: string): string =>
  `${enTete(poste)} takes no ordinary ticket: a cook of an ordinary ticket runs only in Claude Code's sandbox, which the station sets up only on macOS.`;

// Ce que la vue pose : l'option, la limite (`null` : aucune écrite), l'explication, et — quand la
// station dit son bac à sable indisponible — le message, avec la raison. `reglable` faux : ce poste
// ne peut pas prendre de ticket ordinaire, la vue ne pose que l'explication, qui dit pourquoi.
export type Bloc = { reglable: boolean; actif: boolean; limite: number | null; explication: string; indisponible?: string };

// Le bloc d'un projet, ou rien : il n'existe que pour un projet dont ce poste joue une station. Sur
// un Mac, l'option ; ailleurs, la raison pour laquelle ce poste n'en prend pas.
export function blocDesOrdinaires(projet: Pick<Projet, "stations" | "ordinaires" | "limiteCooks">, plateforme: string, stations: readonly StationDesFaits[] | undefined): Bloc | undefined {
  if (projet.stations === undefined || projet.stations.length === 0) return undefined;
  const poste = nomDuPoste(plateforme);
  if (!estUnMac(plateforme)) return { reglable: false, actif: false, limite: null, explication: sansBacASable(poste) };
  const sans = stations?.find(({ station, bacASable }) => projet.stations?.includes(station) === true && bacASable?.disponible === false);
  return {
    reglable: true,
    actif: projet.ordinaires === true,
    limite: projet.limiteCooks ?? null,
    explication: explication(poste),
    ...(sans?.bacASable == null ? {} : { indisponible: `The sandbox is unavailable on ${poste} — ${sans.bacASable.raison ?? "no reason given"}. ${enTete(poste)} takes no ordinary ticket.` }),
  };
}

// Les deux clés d'un projet, telles que le fichier les écrit — ou la raison pour laquelle il est refusé.
export function ordinairesLus(declare: { ordinaires?: unknown; limiteCooks?: unknown }): { ordinaires?: boolean; limiteCooks?: number } | string {
  const { ordinaires, limiteCooks } = declare;
  if (ordinaires !== undefined && typeof ordinaires !== "boolean") return "“ordinaires” must be true or false — whether this computer's station also takes the ordinary tickets";
  if (limiteCooks !== undefined && (!Number.isInteger(limiteCooks) || (limiteCooks as number) < 1)) return "“limiteCooks” must be a whole number, one or more — how many cooks this computer runs at once";
  return { ...(ordinaires === undefined ? {} : { ordinaires }), ...(limiteCooks === undefined ? {} : { limiteCooks: limiteCooks as number }) };
}

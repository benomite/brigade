// Le réglage « prendre aussi les tickets ordinaires » de la station de cet ordinateur pour un projet
// (docs/runtime/station-distante.md, « Les tickets ordinaires sur le poste du chef »). Le chef le pose dans les
// réglages du projet ; il s'écrit dans le fichier des projets (`ordinaires`, `limiteCooks`) et
// revient à chaque lecture. L'état du bac à sable, lui, vient de la station : la box le rend dans
// `facts`, champ `stations`, et l'app le dit tel quel, sans le deviner.
import type { Project } from "./config.ts";
import { isOneMac, nameOfWorkstation } from "./platform.ts";

// Ce que `facts` dit d'une station (runtime/src/etat.ts, `stations`) — ce que l'app en lit.
// `bacASable` : nul, la station n'en a rien dit.
// `cuisson` : ce que la station fait du projet — `cooking`, `stopped`, `refused` (#1183) ;
// `arreteeDepuis` : le chef l'a arrêtée, depuis quand — nul, ce n'est pas lui, ou elle cuit ; `refus` : pourquoi
// la station de la machine refuse le projet ; `cooks` : ses cooks en cours. Les quatre sont absents d'un
// runtime d'avant ce champ (cooking.ts).
export type FactsStation = {
  station: string;
  distante: boolean;
  plafond: number | null;
  ordinaires: boolean;
  bacASable: { disponible: boolean; raison: string | null; version: string | null; depuis: string } | null;
  prendOrdinaires: boolean;
  cuisson?: string;
  // Ce que la station n'a pas pu cuire, en une ligne (#3870) ; absent, rien ne lui manque.
  lacks?: string;
  arreteeDepuis?: string | null;
  refus?: { code: string; message: string; action: string } | null;
  cooks?: { ticket: number; titre: string; station: string }[];
  // Ce que la principale sait d'elle (#1830) : ce qu'elle déclare fournir, si elle la voit, et sa dernière demande —
  // absents d'un runtime d'avant ces champs.
  fournit?: string[];
  presente?: boolean;
  vueLe?: string | null;
  // Sur GitHub seul : jusqu'à quand (ISO) la limite de GitHub la retient (#2443) — absent hors limite.
  retenue?: string;
  // Son moteur (#3746) : le choisi, celui sur lequel elle cuit, si c'est le secours, jusqu'à quand le choisi est bloqué —
  // tel que le runtime le publie, lu par la vue (vue/engine/engines.js, `statutLu`) ; absent d'un runtime d'avant ce champ.
  engine?: unknown;
};

// Ce poste en tête de phrase : « This Mac », « This PC ».
const inHead = (workstation: string) => `${workstation.charAt(0).toUpperCase()}${workstation.slice(1)}`;

// `poste` : le nom que l'écran donne à cet ordinateur (platform.ts).
export const explanation = (workstation: string): string => `Cooks on ${workstation} run in Claude Code's sandbox: they write only in their own worktree, and reach only the network hosts on the project's list.`;

// Hors d'un Mac — un PC sous Windows, un Linux de bureau —, la station ne prend aucun ticket
// ordinaire : le runtime ne monte le bac à sable d'une cuisine locale que sous macOS
// (runtime/src/bac-a-sable/local.ts), et une station distante sans bac à sable n'en prend pas
// (`prendLesOrdinaires`). L'app le dit, à la place de l'option, plutôt que de taire le réglage.
export const withoutSandbox = (workstation: string): string =>
  `${inHead(workstation)} takes no ordinary ticket: a cook of an ordinary ticket runs only in Claude Code's sandbox, which the station sets up only on macOS.`;

// Ce que la vue pose : l'option, la limite (`null` : aucune écrite), l'explication, et — quand la
// station dit son bac à sable indisponible — le message, avec la raison. `reglable` faux : ce poste
// ne peut pas prendre de ticket ordinaire, la vue ne pose que l'explication, qui dit pourquoi.
export type Block = { reglable: boolean; actif: boolean; limite: number | null; explication: string; indisponible?: string };

// Le bloc d'un projet, ou rien : il n'existe que pour un projet qui cuit sur ce poste. Sur
// un Mac, l'option ; ailleurs, la raison pour laquelle ce poste n'en prend pas.
export function blockOfOrdinary(project: Pick<Project, "ordinaires" | "limiteCooks">, platform: string, stations: readonly FactsStation[] | undefined, here: boolean): Block | undefined {
  if (!here) return undefined;
  const workstation = nameOfWorkstation();
  if (!isOneMac(platform)) return { reglable: false, actif: false, limite: null, explication: withoutSandbox(workstation) };
  const without = stations?.find(({ bacASable: sandbox }) => sandbox?.disponible === false);
  return {
    reglable: true,
    actif: project.ordinaires === true,
    limite: project.limiteCooks ?? null,
    explication: explanation(workstation),
    ...(without?.bacASable == null ? {} : { indisponible: `The sandbox is unavailable on ${workstation} — ${without.bacASable.raison ?? "no reason given"}. ${inHead(workstation)} takes no ordinary ticket.` }),
  };
}

// Les deux clés d'un projet, telles que le fichier les écrit — ou la raison pour laquelle il est refusé.
export function ordinaryRead(declare: { ordinaires?: unknown; limiteCooks?: unknown }): { ordinaires?: boolean; limiteCooks?: number } | string {
  const { ordinaires: ordinary, limiteCooks: limitCooks } = declare;
  if (ordinary !== undefined && typeof ordinary !== "boolean") return "“ordinaires” must be true or false — whether this computer's station also takes the ordinary tickets";
  if (limitCooks !== undefined && (!Number.isInteger(limitCooks) || (limitCooks as number) < 1)) return "“limiteCooks” must be a whole number, one or more — how many cooks this computer runs at once";
  return { ...(ordinary === undefined ? {} : { ordinaires: ordinary }), ...(limitCooks === undefined ? {} : { limiteCooks: limitCooks as number }) };
}

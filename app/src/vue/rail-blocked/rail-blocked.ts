// Le rail bloqué dans l'app (ticket 3358, épique 3352) : des tickets `fire` qu'aucun manager n'a pris au-delà du délai. Le
// diagnostic est celui de rail-blocked/diagnostic.ts — combien, depuis combien de temps, la cause,
// le geste —, posé dans `facts` par la lecture du rail sur GitHub (vue/rail/github.ts, `avecLeRail`) sous `railBloque`.
// Trois endroits le disent, de la même phrase :
//   - le rail du projet, en tête (rail-bloque.js) ;
//   - « Tous les projets », où le projet est bloqué, en rouge (home.ts) ;
//   - la file du second, sous la tête du bloc `awaiting` de `status` (tableau/rail.ts).
// Les tickets non pris qui ne se lisent pas le disent dans la file, jamais un rail calme à leur place.
import { dureeCourte, MOTS_DU_GESTE, type Geste, type StationsLues } from "../../../../runtime/src/attente-du-rail/stations.ts";
import { diagnostiquer, lineDeLaFile, lineNonLue, lireLesNonTaken, type Cause, type RailBlocked, type TicketNonTaken } from "../../rail-blocked/diagnostic.ts";
import type { CallGitHub } from "../../tableau/client.ts";

// Ce que `facts` porte : le diagnostic, ou pourquoi les tickets non pris ne se lisent pas.
export type RailBlockedLu = RailBlocked | { illisible: string };
// Les tickets non pris, tels que la lecture du rail les a lus — ou pourquoi elle n'a pas pu.
export type NonTakenLus = readonly TicketNonTaken[] | { illisible: string };

const CAUSES: readonly Cause[] = ["aucune-station", "sans-quota", "arretee", "hors-ligne", "manager-muet", "inconnue"];
const ACTIONS = Object.keys(MOTS_DU_GESTE) as Geste[];

// Le champ `railBloque` de `facts` : absent quand rien n'est bloqué. `signes` : les stations du compte, ou pourquoi
// elles ne se lisent pas.
export function railBlockedDe(repository: string, nonTaken: NonTakenLus | undefined, stations: StationsLues, maintenant: number): { railBloque?: RailBlockedLu } {
  if (nonTaken === undefined) return {};
  if ("illisible" in nonTaken) return { railBloque: { illisible: nonTaken.illisible } };
  const blocked = diagnostiquer({ depot: repository, nonPris: nonTaken, stations, maintenant });
  return blocked === null ? {} : { railBloque: blocked };
}

// Le rail bloqué d'un dépôt, lu sur GitHub par `appeler` — pour la file du second (second/file.ts), qui ne lit pas le
// rail. Les stations ne se lisent que s'il y a un ticket non pris.
export async function lireLeRailBlocked(options: { depot: string; appeler: CallGitHub; stations: () => Promise<StationsLues>; maintenant: number }): Promise<RailBlockedLu | undefined> {
  const { depot: repository, appeler, maintenant } = options;
  const lire = async (chemin: string) => {
    const answer = await appeler(chemin);
    if (answer.status !== 200) throw new Error(`GitHub answered HTTP ${answer.status}`);
    return answer.data;
  };
  const nonTaken: NonTakenLus = await lireLesNonTaken({ depot: repository, lire }).catch((error: unknown) => ({ illisible: error instanceof Error ? error.message : String(error) }));
  if (!("illisible" in nonTaken) && nonTaken.length === 0) return undefined;
  return railBlockedDe(repository, nonTaken, "illisible" in nonTaken ? { illisibles: "" } : await options.stations(), maintenant).railBloque;
}

const entiers = (valeur: unknown): valeur is number[] => Array.isArray(valeur) && valeur.every((un) => Number.isSafeInteger(un));
const textes = (valeur: unknown): valeur is string[] => Array.isArray(valeur) && valeur.every((un) => typeof un === "string");

// `railBloque`, de la racine de `facts` (facts.ts, `comprendre`) : rien de mal formé ne le pose.
export function railBlockedLu(valeur: unknown): { railBloque?: RailBlockedLu } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const lu = valeur as Record<string, unknown>;
  if (typeof lu.illisible === "string" && lu.illisible !== "") return { railBloque: { illisible: lu.illisible } };
  const { tickets, depuis, cause, stations, geste: action, constat, phrase } = lu;
  if (!entiers(tickets) || tickets.length === 0 || typeof depuis !== "string" || !CAUSES.includes(cause as Cause) || !textes(stations)) return {};
  if (typeof constat !== "string" || constat === "" || typeof phrase !== "string" || phrase === "") return {};
  if (action !== null && !ACTIONS.includes(action as Geste)) return {};
  return { railBloque: { tickets, depuis, cause: cause as Cause, stations, geste: action as Geste | null, constat, phrase } };
}

// La ligne de la file du second, sous la tête du bloc `awaiting` : la même que `status` sur la station.
export function linesDeLaFile(repository: string, railBlocked: RailBlockedLu | undefined): string[] {
  if (railBlocked === undefined) return [];
  return ["illisible" in railBlocked ? lineNonLue(repository, railBlocked.illisible) : lineDeLaFile(railBlocked)];
}

// Le diagnostic, quand il y en a un — pas une lecture ratée.
export const blockedDe = (railBlocked: RailBlockedLu | undefined): RailBlocked | undefined => (railBlocked === undefined || "illisible" in railBlocked ? undefined : railBlocked);

// Ce que « Tous les projets » en dit, sur la ligne du projet, à l'heure de la lecture : court, la phrase entière au
// survol. Sa forme fait l'état « stuck » de la ligne (home/projects/projects.js, `RAIL_BLOQUE`).
export const ditALHome = ({ tickets, depuis }: Pick<RailBlocked, "tickets" | "depuis">, maintenant: number) =>
  `${tickets.length} ticket${tickets.length === 1 ? "" : "s"} no manager takes, for ${dureeCourte(maintenant - Date.parse(depuis))}`;


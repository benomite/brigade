// Le rail bloqué dans l'app (ticket 3358, épique 3352) : des tickets `fire` qu'aucun manager n'a pris au-delà du délai. Le
// diagnostic est celui de rail-blocked/diagnostic.ts — combien, depuis combien de temps, la cause,
// le geste —, posé dans `facts` par la lecture du rail sur GitHub (vue/rail/github.ts, `avecLeRail`) sous `railBloque`.
// Trois endroits le disent, de la même phrase :
//   - le rail du projet, en tête (rail-bloque.js) ;
//   - « Tous les projets », où le projet est bloqué, en rouge (home.ts) ;
//   - la file du second, sous la tête du bloc `awaiting` de `status` (board/rail.ts).
// Les tickets non pris qui ne se lisent pas le disent dans la file, jamais un rail calme à leur place.
import { dureeCourte, MOTS_DU_GESTE, type Geste, type StationsLues } from "../../../../runtime/src/attente-du-rail/stations.ts";
import { diagnose, lineOfTheFile, lineNotRead, readTheNotTaken, type Cause, type RailBlocked, type TicketNotTaken } from "../../rail-blocked/diagnostic.ts";
import type { CallGitHub } from "../../board/client.ts";

// Ce que `facts` porte : le diagnostic, ou pourquoi les tickets non pris ne se lisent pas.
export type RailBlockedRead = RailBlocked | { illisible: string };
// Les tickets non pris, tels que la lecture du rail les a lus — ou pourquoi elle n'a pas pu.
export type NotTakenRead = readonly TicketNotTaken[] | { illisible: string };

const CAUSES: readonly Cause[] = ["aucune-station", "sans-quota", "arretee", "hors-ligne", "manager-muet", "inconnue"];
const ACTIONS = Object.keys(MOTS_DU_GESTE) as Geste[];

// Le champ `railBloque` de `facts` : absent quand rien n'est bloqué. `signes` : les stations du compte, ou pourquoi
// elles ne se lisent pas.
export function railBlockedOf(repository: string, notTaken: NotTakenRead | undefined, stations: StationsLues, now: number): { railBloque?: RailBlockedRead } {
  if (notTaken === undefined) return {};
  if ("illisible" in notTaken) return { railBloque: { illisible: notTaken.illisible } };
  const blocked = diagnose({ depot: repository, nonPris: notTaken, stations, maintenant: now });
  return blocked === null ? {} : { railBloque: blocked };
}

// Le rail bloqué d'un dépôt, lu sur GitHub par `appeler` — pour la file du second (second/file.ts), qui ne lit pas le
// rail. Les stations ne se lisent que s'il y a un ticket non pris.
export async function readTheRailBlocked(options: { depot: string; appeler: CallGitHub; stations: () => Promise<StationsLues>; maintenant: number }): Promise<RailBlockedRead | undefined> {
  const { depot: repository, appeler: call, maintenant: now } = options;
  const read = async (path: string) => {
    const answer = await call(path);
    if (answer.status !== 200) throw new Error(`GitHub answered HTTP ${answer.status}`);
    return answer.data;
  };
  const notTaken: NotTakenRead = await readTheNotTaken({ depot: repository, lire: read }).catch((error: unknown) => ({ illisible: error instanceof Error ? error.message : String(error) }));
  if (!("illisible" in notTaken) && notTaken.length === 0) return undefined;
  return railBlockedOf(repository, notTaken, "illisible" in notTaken ? { illisibles: "" } : await options.stations(), now).railBloque;
}

const integers = (value: unknown): value is number[] => Array.isArray(value) && value.every((oneOf) => Number.isSafeInteger(oneOf));
const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every((oneOf) => typeof oneOf === "string");

// `railBloque`, de la racine de `facts` (facts.ts, `comprendre`) : rien de mal formé ne le pose.
export function railBlockedRead(value: unknown): { railBloque?: RailBlockedRead } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const readOne = value as Record<string, unknown>;
  if (typeof readOne.illisible === "string" && readOne.illisible !== "") return { railBloque: { illisible: readOne.illisible } };
  const { tickets, depuis: since, cause, stations, geste: action, constat: finding, phrase: sentence } = readOne;
  if (!integers(tickets) || tickets.length === 0 || typeof since !== "string" || !CAUSES.includes(cause as Cause) || !texts(stations)) return {};
  if (typeof finding !== "string" || finding === "" || typeof sentence !== "string" || sentence === "") return {};
  if (action !== null && !ACTIONS.includes(action as Geste)) return {};
  return { railBloque: { tickets, depuis: since, cause: cause as Cause, stations, geste: action as Geste | null, constat: finding, phrase: sentence } };
}

// La ligne de la file du second, sous la tête du bloc `awaiting` : la même que `status` sur la station.
export function linesOfTheFile(repository: string, railBlocked: RailBlockedRead | undefined): string[] {
  if (railBlocked === undefined) return [];
  return ["illisible" in railBlocked ? lineNotRead(repository, railBlocked.illisible) : lineOfTheFile(railBlocked)];
}

// Le diagnostic, quand il y en a un — pas une lecture ratée.
export const blockedOf = (railBlocked: RailBlockedRead | undefined): RailBlocked | undefined => (railBlocked === undefined || "illisible" in railBlocked ? undefined : railBlocked);

// Ce que « Tous les projets » en dit, sur la ligne du projet, à l'heure de la lecture : court, la phrase entière au
// survol. Sa forme fait l'état « stuck » de la ligne (home/projects/projects.js, `RAIL_BLOQUE`).
export const saysALHome = ({ tickets, depuis: since }: Pick<RailBlocked, "tickets" | "depuis">, now: number) =>
  `${tickets.length} ticket${tickets.length === 1 ? "" : "s"} no manager takes, for ${dureeCourte(now - Date.parse(since))}`;


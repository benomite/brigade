// Le rail bloqué dans l'app (ticket 3358, épique 3352) : des tickets `fire` qu'aucun manager n'a pris au-delà du délai. Le
// diagnostic est celui du runtime (runtime/src/rail-bloque/rail-bloque.ts) — combien, depuis combien de temps, la cause,
// le geste —, posé dans `facts` par la lecture du rail sur GitHub (vue/rail/github.ts, `avecLeRail`) sous `railBloque`.
// Trois endroits le disent, de la même phrase :
//   - le rail du projet, en tête (rail-bloque.js) ;
//   - « Tous les projets », où le projet est bloqué, en rouge (accueil.ts) ;
//   - la file du second, sous la tête du bloc `awaiting` de `status` (tableau/rail.ts) — la ligne même que
//     `brigade <project> status` écrit (runtime/src/rail-bloque/status.ts).
// Les tickets non pris qui ne se lisent pas le disent dans la file, jamais un rail calme à leur place.
import { lireLesNonPris } from "../../../../runtime/src/rail-bloque/lecture.ts";
import { diagnostiquer, dureeCourte, ligneDeLaFile, ligneNonLue, MOTS_DU_GESTE, type Cause, type Geste, type RailBloque, type StationsLues, type TicketNonPris } from "../../../../runtime/src/rail-bloque/rail-bloque.ts";
import type { AppelGitHub } from "../../tableau/client.ts";

// Ce que `facts` porte : le diagnostic, ou pourquoi les tickets non pris ne se lisent pas.
export type RailBloqueLu = RailBloque | { illisible: string };
// Les tickets non pris, tels que la lecture du rail les a lus — ou pourquoi elle n'a pas pu.
export type NonPrisLus = readonly TicketNonPris[] | { illisible: string };

const CAUSES: readonly Cause[] = ["aucune-station", "sans-quota", "arretee", "hors-ligne", "manager-muet", "inconnue"];
const GESTES = Object.keys(MOTS_DU_GESTE) as Geste[];

// Le champ `railBloque` de `facts` : absent quand rien n'est bloqué. `signes` : les stations du compte, ou pourquoi
// elles ne se lisent pas.
export function railBloqueDe(depot: string, nonPris: NonPrisLus | undefined, stations: StationsLues, maintenant: number): { railBloque?: RailBloqueLu } {
  if (nonPris === undefined) return {};
  if ("illisible" in nonPris) return { railBloque: { illisible: nonPris.illisible } };
  const bloque = diagnostiquer({ depot, nonPris, stations, maintenant });
  return bloque === null ? {} : { railBloque: bloque };
}

// Le rail bloqué d'un dépôt, lu sur GitHub par `appeler` — pour la file du second (second/file.ts), qui ne lit pas le
// rail. Les stations ne se lisent que s'il y a un ticket non pris.
export async function lireLeRailBloque(options: { depot: string; appeler: AppelGitHub; stations: () => Promise<StationsLues>; maintenant: number }): Promise<RailBloqueLu | undefined> {
  const { depot, appeler, maintenant } = options;
  const lire = async (chemin: string) => {
    const reponse = await appeler(chemin);
    if (reponse.status !== 200) throw new Error(`GitHub answered HTTP ${reponse.status}`);
    return reponse.data;
  };
  const nonPris: NonPrisLus = await lireLesNonPris({ depot, lire }).catch((erreur: unknown) => ({ illisible: erreur instanceof Error ? erreur.message : String(erreur) }));
  if (!("illisible" in nonPris) && nonPris.length === 0) return undefined;
  return railBloqueDe(depot, nonPris, "illisible" in nonPris ? { illisibles: "" } : await options.stations(), maintenant).railBloque;
}

const entiers = (valeur: unknown): valeur is number[] => Array.isArray(valeur) && valeur.every((un) => Number.isSafeInteger(un));
const textes = (valeur: unknown): valeur is string[] => Array.isArray(valeur) && valeur.every((un) => typeof un === "string");

// `railBloque`, de la racine de `facts` (faits.ts, `comprendre`) : rien de mal formé ne le pose.
export function railBloqueLu(valeur: unknown): { railBloque?: RailBloqueLu } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const lu = valeur as Record<string, unknown>;
  if (typeof lu.illisible === "string" && lu.illisible !== "") return { railBloque: { illisible: lu.illisible } };
  const { tickets, depuis, cause, stations, geste, constat, phrase } = lu;
  if (!entiers(tickets) || tickets.length === 0 || typeof depuis !== "string" || !CAUSES.includes(cause as Cause) || !textes(stations)) return {};
  if (typeof constat !== "string" || constat === "" || typeof phrase !== "string" || phrase === "") return {};
  if (geste !== null && !GESTES.includes(geste as Geste)) return {};
  return { railBloque: { tickets, depuis, cause: cause as Cause, stations, geste: geste as Geste | null, constat, phrase } };
}

// La ligne de la file du second, sous la tête du bloc `awaiting` : la même que `status` sur la station.
export function lignesDeLaFile(depot: string, railBloque: RailBloqueLu | undefined): string[] {
  if (railBloque === undefined) return [];
  return ["illisible" in railBloque ? ligneNonLue(depot, railBloque.illisible) : ligneDeLaFile(railBloque)];
}

// Le diagnostic, quand il y en a un — pas une lecture ratée.
export const bloqueDe = (railBloque: RailBloqueLu | undefined): RailBloque | undefined => (railBloque === undefined || "illisible" in railBloque ? undefined : railBloque);

// Ce que « Tous les projets » en dit, sur la ligne du projet, à l'heure de la lecture : court, la phrase entière au
// survol. Sa forme fait l'état « stuck » de la ligne (accueil/projets/projets.js, `RAIL_BLOQUE`).
export const ditALAccueil = ({ tickets, depuis }: Pick<RailBloque, "tickets" | "depuis">, maintenant: number) =>
  `${tickets.length} ticket${tickets.length === 1 ? "" : "s"} no manager takes, for ${dureeCourte(maintenant - Date.parse(depuis))}`;

export { MOTS_DU_GESTE };

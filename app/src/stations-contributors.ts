// Les stations contributrices du projet, sous Settings (#2936, épique #2927) : celles qui ont pris un ticket, et la liste de
// celles que le chef refuse, lues et changées par la commande du runtime `contributor-stations`, là où la cuisine du projet
// tourne, comme les humains (humans-of-project.ts) :
//   - `contributor-stations` : `{"stations":[{station, login, refused}]}` ;
//   - `contributor-stations refuse <station>`, `… accept <station>` : `{"ok":true}`, ou `{"ok":false,"message":<la ligne du refus>}`.
// L'app ne juge que ce qui ne s'écrirait pas en mots d'une commande : un nom de station. Le reste est jugé par le runtime.
import type { Read, Rendered } from "./box.ts";
import { detailOf, withoutTheCommand } from "./settings-of-project.ts";

export type StationContributor = { station: string; login: string | null; refused: boolean };
export type ReadOfStations = StationContributor[] | { sans: string; detail?: string };
export type WritingOfAStation = { ok: true } | { refus: string; detail?: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
// Le nom d'une station : celui que sa prise signe (runtime/src/station-contributrice/reclamation.ts).
const NAME_OF_STATION = /^[A-Za-z0-9._/-]+$/;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerOf(rendered: Rendered): unknown {
  try {
    return JSON.parse(rendered.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

// Les stations contributrices du projet, là où sa cuisine tourne ; sinon, pourquoi elles ne se lisent pas.
export async function readTheStations(project: string, readOne: Read | undefined, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<ReadOfStations> {
  if (readOne === undefined) return { sans: `${project} has no station: its contributor stations are read where its kitchen runs` };
  const rendered = await launch(readOne, "contributor-stations");
  if (withoutTheCommand(rendered)) return { sans: "contributor stations unavailable: this station's runtime does not give them yet — update it", detail: detailOf(rendered) };
  const answer = rendered.erreur === null ? answerOf(rendered) : null;
  const stations = isObject(answer) && Array.isArray(answer.stations) ? answer.stations : null;
  if (stations === null || !stations.every((station) => isObject(station) && typeof station.station === "string" && typeof station.refused === "boolean" && (station.login === null || typeof station.login === "string"))) {
    return { sans: "contributor stations unavailable", detail: detailOf(rendered) };
  }
  return stations.map((station) => ({ station: station.station as string, login: station.login as string | null, refused: station.refused as boolean }));
}

// Les mots de l'écriture, ou pourquoi elle ne s'écrit pas.
export function commandOfStations(action: { refuse: unknown } | { accept: unknown }): { commande: string } | { refus: string } {
  const [verbe, station] = "refuse" in action ? (["refuse", action.refuse] as const) : (["accept", action.accept] as const);
  return typeof station === "string" && NAME_OF_STATION.test(station) ? { commande: `contributor-stations ${verbe} ${station}` } : { refus: "nothing was sent: this is not a station name" };
}

// Refuse une station, ou la réaccepte, par le runtime du projet : `ok`, ou la ligne du refus.
export async function writeTheStations(project: string, readOne: Read | undefined, action: { refuse: unknown } | { accept: unknown }, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<WritingOfAStation> {
  const writtenOne = commandOfStations(action);
  if ("refus" in writtenOne) return writtenOne;
  if (readOne === undefined) return { refus: `nothing was sent: “${project}” has no station — there is no runtime to keep the list` };
  const rendered = await launch(readOne, writtenOne.commande);
  if (withoutTheCommand(rendered)) return { refus: "nothing was changed: this station's runtime cannot keep the list yet — update it", detail: detailOf(rendered) };
  const answer = answerOf(rendered);
  if (isObject(answer) && answer.ok === true) return { ok: true };
  if (isObject(answer) && answer.ok === false && typeof answer.message === "string" && answer.message !== "") {
    return { refus: (answer.message.split("\n")[0] ?? "").replaceAll("`", ""), detail: detailOf(rendered) };
  }
  return { refus: "nothing was changed: the runtime's answer could not be read", detail: detailOf(rendered) };
}

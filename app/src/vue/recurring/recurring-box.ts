// Les tickets récurrents du projet, côté process principal (ticket 3231, épique 3216) : lus et changés par la commande du
// runtime `recurring` (runtime/src/recurrents/commande.ts, ticket 3230), là où la cuisine du projet tourne, comme ses humains
// (humans-of-project.ts) :
//   - `recurring` : `{"recurring":[{id, title, body, rhythm, paused, nextDate}]}` ;
//   - `recurring pause <id>`, `recurring resume <id>` : `{"ok":true,"recurring":<le ticket récurrent>}` ;
//   - `recurring remove <id>` : `{"ok":true}` ;
//   - un refus : `{"ok":false,"message":<la ligne du refus>}`, avec le code de sortie 1.
// Une réponse qui ne se lit pas ne se devine pas : elle se dit, le détail au survol.
import type { Read, Rendered } from "../../box.ts";
import { detailOf, withoutTheCommand } from "../../settings-of-project.ts";

export type Pace = { kind: "daily" } | { kind: "weekly"; weekday: number } | { kind: "monthly"; dayOfMonth: number };
export type Recurring = { id: string; title: string; body: string; rhythm: Pace; paused: boolean; nextDate: string };
export type ReadOfRecurring = Recurring[] | { sans: string; detail?: string };
export type Action = "pause" | "resume" | "remove";
// Ce qu'un geste rend : le ticket récurrent changé (pause, resume), `retire` (remove), ou la ligne du refus.
export type WritingOfARecurring = { recurrent: Recurring } | { retire: true } | { refus: string; detail?: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const between = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
// L'identifiant d'un ticket récurrent, tel que le runtime l'écrit : un mot, sans rien qu'une commande lirait autrement.
const IDENTIFIER = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerOf(rendered: Rendered): unknown {
  try {
    return JSON.parse(rendered.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

function paceRead(raw: unknown): Pace | null {
  if (!isObject(raw)) return null;
  if (raw.kind === "daily") return { kind: "daily" };
  if (raw.kind === "weekly" && between(raw.weekday, 1, 7)) return { kind: "weekly", weekday: raw.weekday as number };
  if (raw.kind === "monthly" && between(raw.dayOfMonth, 1, 31)) return { kind: "monthly", dayOfMonth: raw.dayOfMonth as number };
  return null;
}

// Un ticket récurrent tel que le runtime le rend, vérifié ; `null` s'il ne se lit pas.
export function recurringRead(raw: unknown): Recurring | null {
  if (!isObject(raw)) return null;
  const { id, title, body, paused, nextDate } = raw;
  const rhythm = paceRead(raw.rhythm);
  if (typeof id !== "string" || !IDENTIFIER.test(id) || typeof title !== "string" || title.trim() === "" || typeof paused !== "boolean" || typeof nextDate !== "string" || !DAY.test(nextDate) || rhythm === null) return null;
  return { id, title, body: typeof body === "string" ? body : "", rhythm, paused, nextDate };
}

// Les tickets récurrents du projet, là où sa cuisine tourne ; sinon, pourquoi ils ne se lisent pas. Un seul ticket qui ne
// se lit pas rend toute la lecture illisible : la liste n'en montre pas une partie comme si c'était tout.
export async function readTheRecurring(project: string, readOne: Read | undefined, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<ReadOfRecurring> {
  if (readOne === undefined) return { sans: `${project} has no station: its recurring tickets are read where its kitchen runs` };
  const rendered = await launch(readOne, "recurring");
  if (withoutTheCommand(rendered)) return { sans: "recurring tickets unavailable: this station's runtime does not give them yet — update it", detail: detailOf(rendered) };
  const answer = rendered.erreur === null ? answerOf(rendered) : null;
  const list = isObject(answer) && Array.isArray(answer.recurring) ? answer.recurring.map(recurringRead) : null;
  if (list === null || list.some((recurring) => recurring === null)) return { sans: "recurring tickets unavailable", detail: detailOf(rendered) };
  return list as Recurring[];
}

// Suspend, reprend ou retire un ticket récurrent par le runtime du projet : ce qu'il rend, ou la ligne du refus.
export async function writeOneRecurring(project: string, readOne: Read | undefined, action: unknown, id: unknown, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<WritingOfARecurring> {
  if (action !== "pause" && action !== "resume" && action !== "remove") return { refus: "nothing was sent: this is not a gesture on a recurring ticket" };
  if (typeof id !== "string" || !IDENTIFIER.test(id)) return { refus: "nothing was sent: this is not a recurring ticket's id" };
  if (readOne === undefined) return { refus: `nothing was sent: “${project}” has no station — there is no runtime to change it` };
  const rendered = await launch(readOne, `recurring ${action} ${id}`);
  if (withoutTheCommand(rendered)) return { refus: "nothing was changed: this station's runtime does not know recurring tickets yet — update it", detail: detailOf(rendered) };
  const answer = answerOf(rendered);
  if (isObject(answer) && answer.ok === true) {
    if (action === "remove") return { retire: true };
    const recurring = recurringRead(answer.recurring);
    if (recurring !== null) return { recurrent: recurring };
  }
  if (isObject(answer) && answer.ok === false && typeof answer.message === "string" && answer.message !== "") {
    return { refus: (answer.message.split("\n")[0] ?? "").replaceAll("`", ""), detail: detailOf(rendered) };
  }
  return { refus: "nothing was changed: the runtime's answer could not be read", detail: detailOf(rendered) };
}

// Le savoir-faire du projet, côté process principal (ticket 4241, épique 4140) : lu, réécrit et retiré par la commande du
// runtime `know-how` (runtime/src/savoir-faire/commande.ts), là où la cuisine du projet tourne, comme ses tickets récurrents
// (vue/recurring/recurring-box.ts) :
//   - `know-how` : `{"entries":[{id, text, ticket}]}` ;
//   - `know-how edit <id> '<text>'` : `{"ok":true,"entry":<l'entrée>}` ; `know-how remove <id>` : `{"ok":true}` ;
//   - un refus : `{"ok":false,"message":<la ligne du refus>}`, avec le code de sortie 1.
// Une réponse qui ne se lit pas ne se devine pas : elle se dit en une ligne, le détail au survol (source.js la lève).
import type { Read, Rendered } from "../../box.ts";
import { cite } from "../../box.ts";
import { detailOf, withoutTheCommand } from "../../settings-of-project.ts";

export type Entry = { id: string; text: string; ticket: number };
export type ReadOfKnowHow = { entries: Entry[] } | { refus: string; detail?: string };
// Un changement fait.
const DONE = { ok: true } as const;
export type WritingOfKnowHow = typeof DONE | { refus: string; detail?: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
// L'id d'une entrée, tel que le runtime l'écrit (`L3`) : rien qu'une commande lirait autrement.
const IDENTIFIER = /^L[1-9]\d*$/;

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerOf(rendered: Rendered): unknown {
  try {
    return JSON.parse(rendered.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

// Une entrée telle que le runtime la rend, vérifiée ; `null` si elle ne se lit pas.
function entryRead(raw: unknown): Entry | null {
  if (!isObject(raw)) return null;
  const { id, text, ticket } = raw;
  if (typeof id !== "string" || !IDENTIFIER.test(id) || typeof text !== "string" || !Number.isSafeInteger(ticket) || (ticket as number) <= 0) return null;
  return { id, text, ticket: ticket as number };
}

// Les entrées du projet ; sinon, pourquoi elles ne se lisent pas. Une seule entrée qui ne se lit pas rend toute la lecture
// illisible : l'écran n'en montre pas une partie comme si c'était tout.
async function readTheKnowHow(project: string, readOne: Read | undefined, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<ReadOfKnowHow> {
  if (readOne === undefined) return { refus: `know-how unavailable: “${project}” has no station — it is read where its kitchen runs` };
  const rendered = await launch(readOne, "know-how");
  if (withoutTheCommand(rendered)) return { refus: "know-how unavailable: this station's runtime does not give it yet — update it", detail: detailOf(rendered) };
  const answer = rendered.erreur === null ? answerOf(rendered) : null;
  const list = isObject(answer) && Array.isArray(answer.entries) ? answer.entries.map(entryRead) : null;
  if (list === null || list.some((entry) => entry === null)) return { refus: "know-how unavailable", detail: detailOf(rendered) };
  return { entries: list as Entry[] };
}

// La commande d'un geste, ou pourquoi rien ne part.
function commandOfAction(action: { edit: unknown; text: unknown } | { remove: unknown }): { commande: string } | { refus: string } {
  const id = "edit" in action ? action.edit : action.remove;
  if (typeof id !== "string" || !IDENTIFIER.test(id)) return { refus: "nothing was sent: this is not an entry of the know-how" };
  if (!("edit" in action)) return { commande: `know-how remove ${id}` };
  if (typeof action.text !== "string" || action.text.trim() === "") return { refus: "nothing was sent: an entry cannot be empty" };
  return { commande: `know-how edit ${id} ${cite(action.text)}` };
}

// Réécrit ou retire une entrée par le runtime du projet : `{ok: true}`, ou la ligne du refus.
async function writeTheKnowHow(project: string, readOne: Read | undefined, action: { edit: unknown; text: unknown } | { remove: unknown }, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<WritingOfKnowHow> {
  const writtenOne = commandOfAction(action);
  if ("refus" in writtenOne) return writtenOne;
  if (readOne === undefined) return { refus: `nothing was sent: “${project}” has no station — there is no runtime to change it` };
  const rendered = await launch(readOne, writtenOne.commande);
  if (withoutTheCommand(rendered)) return { refus: "nothing was changed: this station's runtime does not know the know-how yet — update it", detail: detailOf(rendered) };
  const answer = answerOf(rendered);
  if (isObject(answer) && answer.ok === true) return DONE;
  if (isObject(answer) && answer.ok === false && typeof answer.message === "string" && answer.message !== "") return { refus: answer.message.split("\n")[0] ?? "", detail: detailOf(rendered) };
  return { refus: "nothing was changed: the runtime's answer could not be read", detail: detailOf(rendered) };
}

// Les gestes du pont (`lireLeSavoirFaire`, `modifierLeSavoirFaire`, `retirerDuSavoirFaire`, preload.cjs) : main.ts les
// branche d'une ligne, avec ce qu'il sait du projet.
export function plugTheKnowHow(
  ipc: { handle(channel: string, ecouter: (event: unknown, ...args: unknown[]) => unknown): void },
  kitchenOfProject: (name: unknown) => { vise: { nom: string } | undefined; lu: Read | undefined },
  launch: (readOne: Read, command: string) => Promise<Rendered>,
): void {
  const gone = (name: unknown) => ({ refus: `“${String(name)}” is no longer in the projects file` });
  ipc.handle("lireLeSavoirFaire", (_, name) => {
    const { vise: aims, lu: readOne } = kitchenOfProject(name);
    return aims === undefined ? gone(name) : readTheKnowHow(aims.nom, readOne, launch);
  });
  ipc.handle("modifierLeSavoirFaire", (_, name, id, text) => {
    const { vise: aims, lu: readOne } = kitchenOfProject(name);
    return aims === undefined ? gone(name) : writeTheKnowHow(aims.nom, readOne, { edit: id, text: text }, launch);
  });
  ipc.handle("retirerDuSavoirFaire", (_, name, id) => {
    const { vise: aims, lu: readOne } = kitchenOfProject(name);
    return aims === undefined ? gone(name) : writeTheKnowHow(aims.nom, readOne, { remove: id }, launch);
  });
}

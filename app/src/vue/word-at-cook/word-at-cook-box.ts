// Le mot au cook, côté process principal (ticket 4048, épique 4043) : le chef écrit une ligne au cook d'un ticket en
// cuisine, depuis sa carte, sans ouvrir sa session. La ligne part par la commande du runtime `send-word` (un autre ticket de
// l'épique la construit), là où la cuisine du projet tourne :
//   - `send-word '<{"ticket":<n>,"text":<la ligne>}>'` : l'entrée `{ticket, text}`, en un seul mot JSON ;
//   - la réponse, sur la dernière ligne de la sortie : `{"ok":true}` ou `{"ok":false,"reason":<une ligne>}`.
// Ce qui ne se lit pas ne se devine pas : la vue reçoit toujours `{ok: false, reason}` en une ligne, le détail au survol.
import type { Read, Rendered } from "../../box.ts";
import { cite } from "../../box.ts";
import { detailOf, withoutTheCommand } from "../../settings-of-project.ts";
import type { Answer } from "./source.js";


const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// La dernière ligne de la sortie, lue en JSON ; `null` si elle ne se lit pas.
function answerOf(rendered: Rendered): unknown {
  try {
    return JSON.parse(rendered.sortie.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
}

// La commande, ou pourquoi rien ne part : un numéro de ticket, et une ligne qui n'est pas vide.
function commandOfWord(entry: unknown): { commande: string } | { refus: string } {
  if (!isObject(entry) || !Number.isInteger(entry.ticket) || (entry.ticket as number) <= 0) return { refus: "nothing was sent: this is not a ticket" };
  if (typeof entry.text !== "string" || entry.text.trim() === "") return { refus: "nothing was sent: the word is empty" };
  return { commande: `send-word ${cite(JSON.stringify({ ticket: entry.ticket, text: entry.text }))}` };
}

// Envoie le mot au cook du ticket par le runtime du projet : `{ok: true}`, ou la raison en une ligne.
async function sendTheWord(project: string, readOne: Read | undefined, entry: unknown, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<Answer> {
  const writtenOne = commandOfWord(entry);
  if ("refus" in writtenOne) return { ok: false, reason: writtenOne.refus };
  if (readOne === undefined) return { ok: false, reason: `nothing was sent: “${project}” has no station — there is no runtime to pass it on` };
  const rendered = await launch(readOne, writtenOne.commande);
  if (withoutTheCommand(rendered)) return { ok: false, reason: "nothing was sent: this station's runtime cannot pass a word to a cook yet — update it", detail: detailOf(rendered) };
  const answer = answerOf(rendered);
  if (isObject(answer) && answer.ok === true) return { ok: true };
  if (isObject(answer) && answer.ok === false && typeof answer.reason === "string" && answer.reason.trim() !== "") {
    return { ok: false, reason: (answer.reason.trim().split("\n")[0] ?? "").replaceAll("`", ""), detail: detailOf(rendered) };
  }
  return { ok: false, reason: "the runtime's answer could not be read: the word may not have reached the cook", detail: detailOf(rendered) };
}

// Le geste du pont (`envoyerUnMot`, preload.cjs) : main.ts le branche d'une ligne, avec ce qu'il sait du projet.
export function plugTheWordAtCook(
  ipc: { handle(channel: string, ecouter: (event: unknown, ...args: unknown[]) => unknown): void },
  kitchenOfProject: (name: unknown) => { vise: { nom: string } | undefined; lu: Read | undefined },
  launch: (readOne: Read, command: string) => Promise<Rendered>,
): void {
  ipc.handle("envoyerUnMot", (_, name, entry) => {
    const { vise: aims, lu: readOne } = kitchenOfProject(name);
    return aims === undefined ? { ok: false, reason: `nothing was sent: “${String(name)}” is no longer in the projects file` } : sendTheWord(aims.nom, readOne, entry, launch);
  });
}

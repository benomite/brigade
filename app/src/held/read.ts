// Les gestes retenus d'un projet, lus là où sa cuisine tourne (#4273) : la section `held gestures` de `manager`
// (runtime/src/manager-cli.ts, `montrerLesAttentes`), une ligne par geste —
// `  <heldAt>  <id>  <agent>: <summary> — <reason> — `<approveCommand>`` —, mise dans la forme du contrat (contract.ts).
// Un geste déjà approuvé n'attend plus l'OK du chef : il n'est pas rendu. Rien n'y est deviné : une sortie sans la section,
// une section « not read » ou une ligne qui n'a pas la forme ne sont jamais « aucun geste retenu ».
// L'approbation est `manager approve <id>`, lancée par la même station.
import type { Read, Rendered } from "../box.ts";
import { detailOf, withoutTheCommand } from "../settings-of-project.ts";
import type { Approval, ActionHeld, ReadOfHeld } from "./contract.ts";

const COMMAND = "manager";
const TITLE = "held gestures";
const LINE = /^ {2}(\S+) {2}(\S+) {2}([^:]+): (.+?) — (.+) — `([^`]+)`$/;
const APPROVED = " (approved: done at the runtime's next tick)";
// L'id que `manager approve` accepte (runtime/src/manager-cli.ts) : rien d'autre ne part.
const ID = /^[1-9][0-9]*$/;

// Les gestes retenus que cette sortie de `manager` montre, ou en quoi elle n'en a pas la forme.
function heldOf(output: string): ActionHeld[] | { sans: string } {
  const lines = output.split("\n");
  const start = lines.findIndex((line) => line.startsWith(TITLE));
  if (start < 0) return { sans: "held gestures unavailable: this station's runtime does not list them yet — update it" };
  const said = (lines[start] as string).slice(TITLE.length).trim();
  if (said === "none") return [];
  if (said !== "") return { sans: `held gestures ${said}` };
  const actions: ActionHeld[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("  ")) break;
    if (line.endsWith(APPROVED)) continue;
    const [, heldAt, id, kind, summary, reason, approveCommand] = LINE.exec(line) ?? [];
    if (approveCommand === undefined) return { sans: `held gestures unavailable: a line does not have the expected form: “${line.trim()}”` };
    actions.push({ id: id as string, kind: kind as string, summary: summary as string, reason: reason as string, approveCommand, heldAt: heldAt as string });
  }
  return actions;
}

// Les gestes retenus du projet, lus par `manager` là où sa cuisine tourne. Un projet qui ne cuit pas sur cet ordinateur
// n'a rien de lu ici : rien n'est rendu, et la vue ne dit rien à leur sujet.
export async function readTheHeld(readOne: Read | undefined, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<ReadOfHeld | undefined> {
  if (readOne === undefined) return undefined;
  const rendered = await launch(readOne, COMMAND);
  const readOnes = rendered.erreur === null ? heldOf(rendered.sortie) : { sans: "held gestures unavailable: `manager` failed on this computer's station" };
  return Array.isArray(readOnes) ? { gestes: readOnes } : { ...readOnes, detail: detailOf(rendered) };
}

// L'OK du chef à un geste retenu : `manager approve <id>`, lancée là où la cuisine du projet tourne.
export async function approveTheAction(project: string, readOne: Read | undefined, id: unknown, launch: (readOne: Read, command: string) => Promise<Rendered>): Promise<Approval> {
  if (readOne === undefined) return { refus: `nothing was approved: ${project} does not cook on this computer — approve it where its kitchen runs`, detail: "" };
  if (typeof id !== "string" || !ID.test(id)) return { refus: "nothing was approved: this is not the id of a held gesture", detail: String(id) };
  const rendered = await launch(readOne, `${COMMAND} approve ${id}`);
  if (rendered.erreur === null) return { fait: rendered.sortie.trim() };
  const said = (rendered.erreurs.trim().split("\n").at(-1) ?? "").replace(/^brigade : /, "");
  const refusal = withoutTheCommand(rendered) ? "nothing was approved: this station's runtime cannot approve a held gesture yet — update it" : said === "" ? "nothing was approved: `manager approve` failed on this computer's station" : said;
  return { refus: refusal, detail: detailOf(rendered) };
}

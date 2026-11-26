// Les gestes retenus d'un projet, lus là où sa cuisine tourne (#4273) : la section `held gestures` de `manager`
// (runtime/src/manager-cli.ts, `montrerLesAttentes`), une ligne par geste —
// `  <heldAt>  <id>  <agent>: <summary> — <reason> — `<approveCommand>`` —, mise dans la forme du contrat (contract.ts).
// Un geste déjà approuvé n'attend plus l'OK du chef : il n'est pas rendu. Rien n'y est deviné : une sortie sans la section,
// une section « not read » ou une ligne qui n'a pas la forme ne sont jamais « aucun geste retenu ».
// L'approbation est `manager approve <id>`, lancée par la même station.
import type { Lu, Rendu } from "../box.ts";
import { detailDe, sansLaCommand } from "../settings-du-project.ts";
import type { Approbation, ActionRetenu, ReadDesRetenus } from "./contract.ts";

const COMMAND = "manager";
const TITRE = "held gestures";
const LINE = /^ {2}(\S+) {2}(\S+) {2}([^:]+): (.+?) — (.+) — `([^`]+)`$/;
const APPROUVE = " (approved: done at the runtime's next tick)";
// L'id que `manager approve` accepte (runtime/src/manager-cli.ts) : rien d'autre ne part.
const ID = /^[1-9][0-9]*$/;

// Les gestes retenus que cette sortie de `manager` montre, ou en quoi elle n'en a pas la forme.
function retenusDe(sortie: string): ActionRetenu[] | { sans: string } {
  const lines = sortie.split("\n");
  const debut = lines.findIndex((line) => line.startsWith(TITRE));
  if (debut < 0) return { sans: "held gestures unavailable: this station's runtime does not list them yet — update it" };
  const dit = (lines[debut] as string).slice(TITRE.length).trim();
  if (dit === "none") return [];
  if (dit !== "") return { sans: `held gestures ${dit}` };
  const actions: ActionRetenu[] = [];
  for (const line of lines.slice(debut + 1)) {
    if (!line.startsWith("  ")) break;
    if (line.endsWith(APPROUVE)) continue;
    const [, heldAt, id, kind, summary, reason, approveCommand] = LINE.exec(line) ?? [];
    if (approveCommand === undefined) return { sans: `held gestures unavailable: a line does not have the expected form: “${line.trim()}”` };
    actions.push({ id: id as string, kind: kind as string, summary: summary as string, reason: reason as string, approveCommand, heldAt: heldAt as string });
  }
  return actions;
}

// Les gestes retenus du projet, lus par `manager` là où sa cuisine tourne. Un projet qui ne cuit pas sur cet ordinateur
// n'a rien de lu ici : rien n'est rendu, et la vue ne dit rien à leur sujet.
export async function lireLesRetenus(lu: Lu | undefined, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<ReadDesRetenus | undefined> {
  if (lu === undefined) return undefined;
  const rendu = await lancer(lu, COMMAND);
  const lus = rendu.erreur === null ? retenusDe(rendu.sortie) : { sans: "held gestures unavailable: `manager` failed on this computer's station" };
  return Array.isArray(lus) ? { gestes: lus } : { ...lus, detail: detailDe(rendu) };
}

// L'OK du chef à un geste retenu : `manager approve <id>`, lancée là où la cuisine du projet tourne.
export async function approuverLeAction(project: string, lu: Lu | undefined, id: unknown, lancer: (lu: Lu, command: string) => Promise<Rendu>): Promise<Approbation> {
  if (lu === undefined) return { refus: `nothing was approved: ${project} does not cook on this computer — approve it where its kitchen runs`, detail: "" };
  if (typeof id !== "string" || !ID.test(id)) return { refus: "nothing was approved: this is not the id of a held gesture", detail: String(id) };
  const rendu = await lancer(lu, `${COMMAND} approve ${id}`);
  if (rendu.erreur === null) return { fait: rendu.sortie.trim() };
  const dit = (rendu.erreurs.trim().split("\n").at(-1) ?? "").replace(/^brigade : /, "");
  const refusal = sansLaCommand(rendu) ? "nothing was approved: this station's runtime cannot approve a held gesture yet — update it" : dit === "" ? "nothing was approved: `manager approve` failed on this computer's station" : dit;
  return { refus: refusal, detail: detailDe(rendu) };
}

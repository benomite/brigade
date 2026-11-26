// The project know-how file, read and changed from Settings (ticket 4239, epic 4135): `.brigade/know-how.md` of the project's
// repository, on its integration branch, read on GitHub with the token of this computer's `gh` — like the closer's extra
// checks (closer-sante.ts). Its entries are parsed by the runtime's module (runtime/src/know-how/know-how.ts). An entry
// edited or removed is never written in place: the new file is proposed by a pull request towards the integration
// branch (`proposerLeFichier`, caps-duree.ts, ticket 2920), which the pass reviews like any other change, and nothing
// changes on the branch until it is merged. This module composes the requests; what carries them is given
// (`ClientDeLaPriorite`).
import { editEntry, entryText, KNOW_HOW_FILE, parseKnowHow, removeEntry, type KnowHowEntry } from "../../../../runtime/src/know-how/know-how.ts";
import { lireLeMarkdown } from "../../closer-sante.ts";
import { proposerLeFichier, type PrOuverte } from "../../caps-duree.ts";
import type { ClientDeLaPriority } from "../../priority.ts";
import { PROPOSE } from "../../settings-du-project.ts";
import { NON_ATTEINT } from "../lexique.js";

export type SavoirLu = { entries: KnowHowEntry[]; vide: boolean };
// What the screen receives: the entries and where they were read, or why the file was not read — one line, the detail on
// hover. A missing file is not a failure: it is the empty state.
export type ReadDuSavoir = (SavoirLu & { depot: string; branche: string | null }) | { sans: string; detail?: string };
// A change of one entry, named by its line in the file read; `avant`, the text the screen showed, refuses a change made
// on a file that moved since.
export type ChangementDuSavoir = { kind: "edit"; line: number; text: string; avant?: string } | { kind: "remove"; line: number; avant?: string };
export type RenduDuSavoir = ({ propose: string; kind: "edit" | "remove" } & PrOuverte) | { refus: string; detail?: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// The entries of the file on the branch (null: the repository's default one). A missing file (404) or a file without an
// entry is empty; any other answer of GitHub throws.
export async function lireLeSavoir(client: ClientDeLaPriority, repository: string, branch: string | null): Promise<SavoirLu> {
  const { texte } = await lireLeMarkdown(client, repository, branch, KNOW_HOW_FILE);
  const entries = texte === null ? [] : parseKnowHow(texte);
  return { entries, vide: entries.length === 0 };
}

// The change, as the screen sends it, or why it is not one.
function changementDe(recu: unknown): ChangementDuSavoir {
  const { kind, line, text, avant } = typeof recu === "object" && recu !== null ? (recu as Record<string, unknown>) : {};
  if (typeof line !== "number" || !Number.isSafeInteger(line)) throw new Error("the change names no entry");
  const vu = typeof avant === "string" ? { avant } : {};
  if (kind === "remove") return { kind, line, ...vu };
  if (kind === "edit") return { kind, line, text: entryText(text), ...vu };
  throw new Error("the change is neither an edit nor a removal");
}

// Proposes one entry edited or removed, as the screen sends it: the file read again — its last state and the `sha` GitHub
// demands —, that one line changed, then a pull request opened towards the integration branch. The one path of a change,
// the screen's included (`changerLeSavoir`). Throws, with what went wrong.
export async function proposerLeChangement(client: ClientDeLaPriority, repository: string, branch: string | null, recu: unknown): Promise<PrOuverte & { kind: "edit" | "remove" }> {
  const changement = changementDe(recu);
  const lu = await lireLeMarkdown(client, repository, branch, KNOW_HOW_FILE);
  if (lu.texte === null) throw new Error(`${repository} has no ${KNOW_HOW_FILE} any more`);
  const entree = parseKnowHow(lu.texte).find(({ line }) => line === changement.line);
  if (entree === undefined || (changement.avant !== undefined && changement.avant !== entree.text)) throw new Error(`${KNOW_HOW_FILE} changed since it was read: read it again`);
  if (changement.kind === "edit" && changement.text === entree.text) throw new Error("the entry already says so");
  const texte = changement.kind === "edit" ? editEntry(lu.texte, changement.line, changement.text) : removeEntry(lu.texte, changement.line);
  const dit = `${changement.kind === "edit" ? "edit" : "remove"} a know-how entry${entree.ticket === null ? "" : ` (#${entree.ticket})`}`;
  const ouverte = await proposerLeFichier(client, repository, branch, { chemin: KNOW_HOW_FILE, texte, sha: lu.sha, dit, ou: "Settings > Project know-how" });
  return { kind: changement.kind, ...ouverte };
}

// The project the screen names, as the main process knows it: `projet` (undefined: no longer in the projects file), and
// how its repository and its integration branch are found (main.ts, `depotDuProjet`, `brancheDuProjet`).
export type ProjectDuSavoir<P> = { nom: unknown; projet: P | undefined; depotDe: (project: P) => Promise<string>; brancheDe: (project: P) => string | null; client: ClientDeLaPriority };

// The screen's reading: never throws, a failure says so in one line.
export async function lireLeSavoirDuProject<P>({ nom: name, projet: project, depotDe: repositoryDe, brancheDe: branchDe, client }: ProjectDuSavoir<P>): Promise<ReadDuSavoir> {
  if (project === undefined) return { sans: `${String(name)} is no longer in the projects file` };
  try {
    const repository = await repositoryDe(project);
    const branch = branchDe(project);
    return { ...(await lireLeSavoir(client, repository, branch)), depot: repository, branche: branch };
  } catch (error) {
    return { sans: NON_ATTEINT("the project know-how"), detail: message(error) };
  }
}

// The screen's change: the pull request opened, or why nothing was proposed.
export async function changerLeSavoir<P>({ nom: name, projet: project, depotDe: repositoryDe, brancheDe: branchDe, client, changement }: ProjectDuSavoir<P> & { changement: unknown }): Promise<RenduDuSavoir> {
  if (project === undefined) return { refus: `nothing was done: “${String(name)}” is no longer in the projects file` };
  try {
    return { propose: PROPOSE, ...(await proposerLeChangement(client, await repositoryDe(project), branchDe(project), changement)) };
  } catch (error) {
    return { refus: `nothing was proposed: ${message(error)}` };
  }
}

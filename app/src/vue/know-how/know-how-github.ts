// The project know-how file, read and changed from Settings (ticket 4239, epic 4135): `.brigade/know-how.md` of the project's
// repository, on its integration branch, read on GitHub with the token of this computer's `gh` — like the closer's extra
// checks (closer-health.ts). Its entries are parsed by entries.ts. An entry
// edited or removed is never written in place: the new file is proposed by a pull request towards the integration
// branch (`proposerLeFichier`, caps-duration.ts, ticket 2920), which the pass reviews like any other change, and nothing
// changes on the branch until it is merged. This module composes the requests; what carries them is given
// (`ClientDeLaPriorite`).
import { editEntry, entryText, KNOW_HOW_DIR, KNOW_HOW_FILE, parseKnowHow, removeEntry, type KnowHowEntry } from "./entries.ts";
import { readTheMarkdown } from "../../closer-health.ts";
import { refusalOf } from "../../board/client.ts";
import { proposeTheFile, type PrOpen } from "../../caps-duration.ts";
import type { ClientOfThePriority } from "../../priority.ts";
import { PROPOSES } from "../../box.ts";
import { NOT_REACHED } from "../lexicon.js";

// `file`: the file of the repository an entry lives in — `.brigade/know-how.md` or one `.brigade/know-how/<n>.md`.
export type KnowledgeEntry = KnowHowEntry & { file: string };
export type KnowledgeRead = { entries: KnowledgeEntry[]; vide: boolean };
// What the screen receives: the entries and where they were read, or why the file was not read — one line, the detail on
// hover. A missing file is not a failure: it is the empty state.
export type ReadOfKnowledge = (KnowledgeRead & { depot: string; branche: string | null }) | { sans: string; detail?: string };
// A change of one entry, named by its line in the file read; `avant`, the text the screen showed, refuses a change made
// on a file that moved since.
export type ChangeOfKnowledge = { kind: "edit"; line: number; text: string; avant?: string; file?: string } | { kind: "remove"; line: number; avant?: string; file?: string };
export type RenderedOfKnowledge = ({ propose: string; kind: "edit" | "remove" } & PrOpen) | { refus: string; detail?: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// The files of `.brigade/know-how/` on the branch, in name order; none when the directory is missing (404).
async function perTicketFiles(client: ClientOfThePriority, repository: string, branch: string | null): Promise<string[]> {
  const readOne = await client.lire(`/repos/${repository}/contents/${KNOW_HOW_DIR}${branch === null ? "" : `?ref=${encodeURIComponent(branch)}`}`);
  if (readOne.status === 404) return [];
  if (readOne.status !== 200) throw refusalOf(`the reading of ${KNOW_HOW_DIR}`, readOne);
  if (!Array.isArray(readOne.data)) return [];
  const paths = readOne.data.flatMap((one: unknown) => (isObject(one) && one.type === "file" && typeof one.path === "string" && isKnowHowFile(one.path) ? [one.path] : []));
  return paths.sort();
}

const isKnowHowFile = (path: string) => path === KNOW_HOW_FILE || new RegExp(`^${KNOW_HOW_DIR.replace(/[.]/g, "\\.")}/[^/]+\\.md$`).test(path);

// The entries of `.brigade/know-how.md` and of every file of `.brigade/know-how/` on the branch (null: the repository's
// default one). A missing file (404) or a file without an entry is empty; any other answer of GitHub throws. An entry
// without a ticket in its line takes the one in its file's name (`4700.md`).
export async function readTheKnowledge(client: ClientOfThePriority, repository: string, branch: string | null): Promise<KnowledgeRead> {
  const entries: KnowledgeEntry[] = [];
  const main = await readTheMarkdown(client, repository, branch, KNOW_HOW_FILE);
  const read = [{ file: KNOW_HOW_FILE, text: main.texte }];
  for (const file of await perTicketFiles(client, repository, branch)) read.push({ file, text: (await readTheMarkdown(client, repository, branch, file)).texte });
  for (const { file, text } of read) {
    if (text === null) continue;
    const named = /^(\d+)\.md$/.exec(file.slice(file.lastIndexOf("/") + 1));
    for (const entry of parseKnowHow(text)) entries.push({ ...entry, ticket: entry.ticket ?? (file === KNOW_HOW_FILE || named === null ? null : Number(named[1])), file });
  }
  return { entries, vide: entries.length === 0 };
}

// The change, as the screen sends it, or why it is not one.
function changeOf(received: unknown): ChangeOfKnowledge {
  const { kind, line, text, avant: before, file } = typeof received === "object" && received !== null ? (received as Record<string, unknown>) : {};
  if (typeof line !== "number" || !Number.isSafeInteger(line)) throw new Error("the change names no entry");
  if (file !== undefined && (typeof file !== "string" || !isKnowHowFile(file))) throw new Error("the change names no know-how file");
  const seenOne = { ...(typeof before === "string" ? { avant: before } : {}), ...(file === undefined ? {} : { file: file as string }) };
  if (kind === "remove") return { kind, line, ...seenOne };
  if (kind === "edit") return { kind, line, text: entryText(text), ...seenOne };
  throw new Error("the change is neither an edit nor a removal");
}

// Proposes one entry edited or removed, as the screen sends it: the file read again — its last state and the `sha` GitHub
// demands —, that one line changed, then a pull request opened towards the integration branch. The one path of a change,
// the screen's included (`changerLeSavoir`). Throws, with what went wrong.
export async function proposeTheChange(client: ClientOfThePriority, repository: string, branch: string | null, received: unknown): Promise<PrOpen & { kind: "edit" | "remove" }> {
  const change = changeOf(received);
  const file = change.file ?? KNOW_HOW_FILE;
  const readOne = await readTheMarkdown(client, repository, branch, file);
  if (readOne.texte === null) throw new Error(`${repository} has no ${file} any more`);
  const entry = parseKnowHow(readOne.texte).find(({ line }) => line === change.line);
  if (entry === undefined || (change.avant !== undefined && change.avant !== entry.text)) throw new Error(`${file} changed since it was read: read it again`);
  if (change.kind === "edit" && change.text === entry.text) throw new Error("the entry already says so");
  const text = change.kind === "edit" ? editEntry(readOne.texte, change.line, change.text) : removeEntry(readOne.texte, change.line);
  // The last entry of a per-ticket file leaves nothing: the file itself is deleted.
  const emptied = file !== KNOW_HOW_FILE && change.kind === "remove" && parseKnowHow(text).length === 0;
  const said = `${change.kind === "edit" ? "edit" : "remove"} a know-how entry${entry.ticket === null ? "" : ` (#${entry.ticket})`}`;
  const openOne = await proposeTheFile(client, repository, branch, { chemin: file, texte: emptied ? null : text, sha: readOne.sha, dit: said, ou: "Settings > Project know-how" });
  return { kind: change.kind, ...openOne };
}

// The project the screen names, as the main process knows it: `projet` (undefined: no longer in the projects file), and
// how its repository and its integration branch are found (main.ts, `depotDuProjet`, `brancheDuProjet`).
export type ProjectOfKnowledge<P> = { nom: unknown; projet: P | undefined; depotDe: (project: P) => Promise<string>; brancheDe: (project: P) => string | null; client: ClientOfThePriority };

// The screen's reading: never throws, a failure says so in one line.
export async function readTheKnowledgeOfProject<P>({ nom: name, projet: project, depotDe: repositoryOf, brancheDe: branchOf, client }: ProjectOfKnowledge<P>): Promise<ReadOfKnowledge> {
  if (project === undefined) return { sans: `${String(name)} is no longer in the projects file` };
  try {
    const repository = await repositoryOf(project);
    const branch = branchOf(project);
    return { ...(await readTheKnowledge(client, repository, branch)), depot: repository, branche: branch };
  } catch (error) {
    return { sans: NOT_REACHED("the project know-how"), detail: message(error) };
  }
}

// The screen's change: the pull request opened, or why nothing was proposed.
export async function changeTheKnowledge<P>({ nom: name, projet: project, depotDe: repositoryOf, brancheDe: branchOf, client, changement: change }: ProjectOfKnowledge<P> & { changement: unknown }): Promise<RenderedOfKnowledge> {
  if (project === undefined) return { refus: `nothing was done: “${String(name)}” is no longer in the projects file` };
  try {
    return { propose: PROPOSES, ...(await proposeTheChange(client, await repositoryOf(project), branchOf(project), change)) };
  } catch (error) {
    return { refus: `nothing was proposed: ${message(error)}` };
  }
}

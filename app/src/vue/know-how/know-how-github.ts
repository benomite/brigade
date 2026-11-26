// The project know-how file, read and changed from Settings (ticket 4239, epic 4135): `.brigade/know-how.md` of the project's
// repository, on its integration branch, read on GitHub with the token of this computer's `gh` — like the closer's extra
// checks (closer-sante.ts). Its entries are parsed by the runtime's module (runtime/src/know-how/know-how.ts). An entry
// edited or removed is never written in place: the new file is proposed by a pull request towards the integration
// branch (`proposerLeFichier`, plafonds-duree.ts, ticket 2920), which the pass reviews like any other change, and nothing
// changes on the branch until it is merged. This module composes the requests; what carries them is given
// (`ClientDeLaPriorite`).
import { editEntry, entryText, KNOW_HOW_FILE, parseKnowHow, removeEntry, type KnowHowEntry } from "../../../../runtime/src/know-how/know-how.ts";
import { lireLeMarkdown } from "../../closer-sante.ts";
import { proposerLeFichier, type PrOuverte } from "../../plafonds-duree.ts";
import type { ClientDeLaPriorite } from "../../priorite.ts";
import { PROPOSE } from "../../reglages-du-projet.ts";
import { NON_ATTEINT } from "../lexique.js";

export type SavoirLu = { entries: KnowHowEntry[]; vide: boolean };
// What the screen receives: the entries and where they were read, or why the file was not read — one line, the detail on
// hover. A missing file is not a failure: it is the empty state.
export type LectureDuSavoir = (SavoirLu & { depot: string; branche: string | null }) | { sans: string; detail?: string };
// A change of one entry, named by its line in the file read; `avant`, the text the screen showed, refuses a change made
// on a file that moved since.
export type ChangementDuSavoir = { kind: "edit"; line: number; text: string; avant?: string } | { kind: "remove"; line: number; avant?: string };
export type RenduDuSavoir = ({ propose: string; kind: "edit" | "remove" } & PrOuverte) | { refus: string; detail?: string };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// The entries of the file on the branch (null: the repository's default one). A missing file (404) or a file without an
// entry is empty; any other answer of GitHub throws.
export async function lireLeSavoir(client: ClientDeLaPriorite, depot: string, branche: string | null): Promise<SavoirLu> {
  const { texte } = await lireLeMarkdown(client, depot, branche, KNOW_HOW_FILE);
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

// Proposes one entry edited or removed: the file read again — its last state and the `sha` GitHub demands —, that one
// line changed, then a pull request opened towards the integration branch. Throws, with what went wrong.
export async function proposerLeChangement(client: ClientDeLaPriorite, depot: string, branche: string | null, recu: unknown): Promise<PrOuverte> {
  return proposer(client, depot, branche, changementDe(recu));
}

async function proposer(client: ClientDeLaPriorite, depot: string, branche: string | null, changement: ChangementDuSavoir): Promise<PrOuverte> {
  const lu = await lireLeMarkdown(client, depot, branche, KNOW_HOW_FILE);
  if (lu.texte === null) throw new Error(`${depot} has no ${KNOW_HOW_FILE} any more`);
  const entree = parseKnowHow(lu.texte).find(({ line }) => line === changement.line);
  if (entree === undefined || (changement.avant !== undefined && changement.avant !== entree.text)) throw new Error(`${KNOW_HOW_FILE} changed since it was read: read it again`);
  if (changement.kind === "edit" && changement.text === entree.text) throw new Error("the entry already says so");
  const texte = changement.kind === "edit" ? editEntry(lu.texte, changement.line, changement.text) : removeEntry(lu.texte, changement.line);
  const dit = `${changement.kind === "edit" ? "edit" : "remove"} a know-how entry${entree.ticket === null ? "" : ` (#${entree.ticket})`}`;
  return proposerLeFichier(client, depot, branche, { chemin: KNOW_HOW_FILE, texte, sha: lu.sha, dit, ou: "Settings > Project know-how" });
}

// The project the screen names, as the main process knows it: `projet` (undefined: no longer in the projects file), and
// how its repository and its integration branch are found (main.ts, `depotDuProjet`, `brancheDuProjet`).
export type ProjetDuSavoir<P> = { nom: unknown; projet: P | undefined; depotDe: (projet: P) => Promise<string>; brancheDe: (projet: P) => string | null; client: ClientDeLaPriorite };

// The screen's reading: never throws, a failure says so in one line.
export async function lireLeSavoirDuProjet<P>({ nom, projet, depotDe, brancheDe, client }: ProjetDuSavoir<P>): Promise<LectureDuSavoir> {
  if (projet === undefined) return { sans: `${String(nom)} is no longer in the projects file` };
  try {
    const depot = await depotDe(projet);
    const branche = brancheDe(projet);
    return { ...(await lireLeSavoir(client, depot, branche)), depot, branche };
  } catch (erreur) {
    return { sans: NON_ATTEINT("the project know-how"), detail: message(erreur) };
  }
}

// The screen's change: the pull request opened, or why nothing was proposed.
export async function changerLeSavoir<P>({ nom, projet, depotDe, brancheDe, client, changement }: ProjetDuSavoir<P> & { changement: unknown }): Promise<RenduDuSavoir> {
  if (projet === undefined) return { refus: `nothing was done: “${String(nom)}” is no longer in the projects file` };
  try {
    const lu = changementDe(changement);
    const ouverte = await proposer(client, await depotDe(projet), brancheDe(projet), lu);
    return { propose: PROPOSE, kind: lu.kind, ...ouverte };
  } catch (erreur) {
    return { refus: `nothing was proposed: ${message(erreur)}`, detail: "" };
  }
}

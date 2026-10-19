// Opens a project's repo-preparation ticket, once: the station creates it on
// GitHub when the chef adds the project from the app, before writing its line
// — the kitchen that opens afterwards already knows it is awaiting it. Its
// number is kept in the project's state, which survives the project's
// removal: added back, a second one is not opened.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DE_CONFIANCE } from "../alimenter.ts";
import type { GitHub } from "../github.ts";
import { alreadyOnBase, body, LABELS, MARKER, TITLE } from "./ticket.ts";

// In the project's state directory.
export const FILE = "preparation-depot.json";

export type Preparation = { ticket: number; ouvertLe: string };

// The preparation ticket the station opened for this project, or null.
// Unreadable, it is not one: the kitchen holds nothing back on a file it
// does not understand.
export function readPreparation(stateDir: string): Preparation | null {
  try {
    const read = JSON.parse(readFileSync(join(stateDir, FILE), "utf8")) as Partial<Preparation>;
    return Number.isSafeInteger(read.ticket) && (read.ticket ?? 0) > 0 && typeof read.ouvertLe === "string" ? { ticket: read.ticket as number, ouvertLe: read.ouvertLe } : null;
  } catch {
    return null;
  }
}

function record(stateDir: string, preparation: Preparation): void {
  mkdirSync(stateDir, { recursive: true });
  const file = join(stateDir, FILE);
  writeFileSync(`${file}.ecriture`, `${JSON.stringify(preparation)}\n`);
  renameSync(`${file}.ecriture`, file);
}

export type OpenOptions = {
  stateDir: string;
  project: string;
  repo: string;
  base: string;
  // The project's clone: what its integration branch already carries is stated in the ticket.
  clone: string;
  github: Pick<GitHub, "ouvertes" | "creerIssue">;
  now?: () => Date;
};

// Returns the ticket number, and whether it was just opened. Already recorded,
// nothing goes to GitHub. Created without having been recorded (the station
// stopped in between), it is found among the open issues by its marker —
// placed by someone with write access to the repo: anyone can open an issue
// on a public repo, and this ticket holds back the whole rail.
export async function openPreparation(options: OpenOptions): Promise<{ ticket: number; opened: boolean }> {
  const { stateDir } = options;
  const recorded = readPreparation(stateDir);
  if (recorded !== null) return { ticket: recorded.ticket, opened: false };
  const ouvertLe = (options.now ?? (() => new Date()))().toISOString();
  const poll = await options.github.ouvertes();
  const existing = poll.inchange ? undefined : poll.issues.find((issue) => issue.body.includes(MARKER) && DE_CONFIANCE.includes(issue.association));
  if (existing !== undefined) {
    record(stateDir, { ticket: existing.number, ouvertLe });
    return { ticket: existing.number, opened: false };
  }
  const { project, repo, base, clone } = options;
  const ticket = await options.github.creerIssue({ titre: TITLE, corps: body({ project, repo, base, presence: alreadyOnBase(clone, base) }), labels: LABELS });
  record(stateDir, { ticket, ouvertLe });
  return { ticket, opened: true };
}

// The gesture log of each agent (spec 2026-11-23-autonomy-trust-control, C2, #4037): what its thread shows — each
// gesture in one line, with its time, its reason and its outcome — and its « fixed by itself / handed to the chef »
// counter. The agent's record takes its `lastGesture` from the most recent entry.
//
// The log is kept in one file of the directory it is given, like the level store (niveaux.ts), one list per agent,
// oldest first. A missing file is a log with no gesture. A file that cannot be read — not JSON, or an entry without
// its four fields or with an outcome that is none of OUTCOME — is refused, by the read and by the write: nothing is
// guessed in its place, and what was logged is never overwritten.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ecrireAtomique } from "../../relais.ts";

// The outcomes of a gesture, in the spec's words (C2): the agent fixed it by itself, or handed it to the chef. Each
// moves its own counter, and only its own. A gesture an agent on `observe` would make is logged `not done` (C4,
// porte.ts), and moves neither.
export const OUTCOME = {
  FIXED_BY_SELF: "fixed by itself",
  HANDED_TO_CHEF: "handed to the chef",
  NOT_DONE: "not done",
} as const;
export type Outcome = (typeof OUTCOME)[keyof typeof OUTCOME];

export type Geste = { at: string; line: string; reason: string; outcome: Outcome };
export type Compteurs = { fixedBySelf: number; handedToChef: number };
export type EnregistrementDeGestes = { agent: string; lastGesture?: Geste; counters: Compteurs; gestures: Geste[] };

const FICHIER_DES_GESTES = "autonomy-gestures.json";

export class GestesIllisibles extends Error {}

const OUTCOMES: readonly unknown[] = Object.values(OUTCOME);
export const estOutcome = (valeur: unknown): valeur is Outcome => OUTCOMES.includes(valeur);

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const estGeste = (valeur: unknown): valeur is Geste =>
  estObjet(valeur) && typeof valeur.at === "string" && typeof valeur.line === "string" && typeof valeur.reason === "string" && estOutcome(valeur.outcome);

// Every agent's log, as the file holds it.
function lireTout(repertoire: string): Record<string, Geste[]> {
  const fichier = join(repertoire, FICHIER_DES_GESTES);
  if (!existsSync(fichier)) return {};
  let lu: unknown;
  try {
    lu = JSON.parse(readFileSync(fichier, "utf8"));
  } catch (erreur) {
    throw new GestesIllisibles(`${fichier} cannot be read: ${(erreur as Error).message}`);
  }
  if (!estObjet(lu)) throw new GestesIllisibles(`${fichier} is not a JSON object`);
  for (const [agent, siens] of Object.entries(lu)) {
    if (!Array.isArray(siens) || !siens.every(estGeste)) throw new GestesIllisibles(`${fichier}: the gestures of ${agent} are not a list of {at, line, reason, outcome}`);
  }
  return lu as Record<string, Geste[]>;
}

// Logs one gesture of the agent at the clock's time. Its line is kept on one line: a line break becomes a space.
export function consignerGeste(repertoire: string, agent: string, geste: { line: string; reason: string; outcome: Outcome }, horloge: () => Date): Geste {
  if (!estOutcome(geste.outcome)) throw new GestesIllisibles(`${JSON.stringify(geste.outcome)} is no outcome: ${OUTCOMES.join(", ")}`);
  const entree: Geste = { at: horloge().toISOString(), line: geste.line.replace(/\s*[\r\n]+\s*/g, " "), reason: geste.reason, outcome: geste.outcome };
  const tous = lireTout(repertoire);
  tous[agent] = [...(tous[agent] ?? []), entree];
  ecrireAtomique(join(repertoire, FICHIER_DES_GESTES), `${JSON.stringify(tous, null, 2)}\n`);
  return entree;
}

// The agent's gestures, oldest first. Its type lets a reader take the first entry without a check, as the acceptance
// tests of #4037 do: an empty log gives `undefined` there all the same.
export type Gestes = Geste[] & { 0: Geste };
export const gestesDe = (repertoire: string, agent: string): Gestes => (lireTout(repertoire)[agent] ?? []) as Gestes;

// Every agent's gestures, by agent, oldest first: the threads the logbook of the day reads (journal-du-jour/).
export const tousLesGestes = (repertoire: string): Record<string, Geste[]> => lireTout(repertoire);

// The names the log holds a list under (`closer`, `cook #12`): the Agents tab gathers the cooks' (agents-tab/api.ts).
export const agentsDuJournal = (repertoire: string): string[] => Object.keys(lireTout(repertoire));

export const compteursDe = (repertoire: string, agent: string): Compteurs => compter(gestesDe(repertoire, agent));

function compter(gestes: readonly Geste[]): Compteurs {
  return {
    fixedBySelf: gestes.filter(({ outcome }) => outcome === OUTCOME.FIXED_BY_SELF).length,
    handedToChef: gestes.filter(({ outcome }) => outcome === OUTCOME.HANDED_TO_CHEF).length,
  };
}

// What the agent's record takes from its log: its last gesture — the most recent entry, none before the first —,
// its counters and its gestures.
export function enregistrementDe(repertoire: string, agent: string): EnregistrementDeGestes {
  const gestures = gestesDe(repertoire, agent);
  const lastGesture = gestures.at(-1);
  return { agent, ...(lastGesture === undefined ? {} : { lastGesture }), counters: compter(gestures), gestures };
}

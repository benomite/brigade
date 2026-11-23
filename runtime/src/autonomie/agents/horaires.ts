// The schedules the runtime notes for `facts` (#4038), which runs in another process: one file per agent that keeps a
// schedule, `autonomy-next-run-<agent>.json` of the state directory, `{ "at": <instant or null> }`. The supervisor
// notes its wake (superviseur/brancher.ts), the closer its next pass (closer-github-passe/closer-github-passe.ts).
//
// A missing file is a schedule not noted yet: the runtime has not read it. A file that cannot be read is refused,
// never read as « no schedule »: the record says so.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ecrireAtomique } from "../../relais.ts";
import { HoraireIllisible, type Horaire } from "./prochain-passage.ts";

// The agents that keep a schedule.
const A_HORAIRE = ["supervisor", "closer"] as const;
type AgentAHoraire = (typeof A_HORAIRE)[number];

const fichierDe = (repertoire: string, agent: AgentAHoraire) => join(repertoire, `autonomy-next-run-${agent}.json`);

// Notes the agent's schedule as the runtime just read it.
export function noterHoraire(repertoire: string, agent: AgentAHoraire, at: Date | null): void {
  ecrireAtomique(fichierDe(repertoire, agent), `${JSON.stringify({ at: at === null ? null : at.toISOString() })}\n`);
}

// The agent's schedule as the runtime last noted it: null for an agent that keeps none, `undefined` when it was never
// noted.
export function horaireDe(repertoire: string, agent: string): Horaire | undefined {
  if (!(A_HORAIRE as readonly string[]).includes(agent)) return null;
  const fichier = fichierDe(repertoire, agent as AgentAHoraire);
  if (!existsSync(fichier)) return undefined;
  let lu: unknown;
  try {
    lu = JSON.parse(readFileSync(fichier, "utf8"));
  } catch (erreur) {
    throw new HoraireIllisible(`${fichier} cannot be read: ${(erreur as Error).message}`);
  }
  const at = typeof lu === "object" && lu !== null ? (lu as { at?: unknown }).at : undefined;
  if (at === null) return null;
  if (typeof at === "string" && !Number.isNaN(Date.parse(at))) return { at: new Date(at) };
  throw new HoraireIllisible(`${fichier} holds no {at}: an instant or null`);
}

// The gate every gesture of an agent goes through (spec 2026-11-23-autonomy-trust-control, C4, #4039). It reads the
// agent's level (niveaux.ts), and takes the gesture as a function:
//   - `act`: it does the gesture, then logs it in the agent's gesture log (gestes.ts). The same gesture held while the
//     level was `propose` is done now: it is no longer pending (#4247);
//   - `propose`: it holds it as a pending gesture, not done. The chef's approval does it once, then logs it; a second
//     approval does nothing;
//   - `observe`: it logs the gesture the agent would make, as `not done`, and never does it.
//
// The pending gestures are kept in one file of the directory the gate is given, so that the chef's approval, typed in
// its own process (`manager -- approve <id>`), reaches them: it marks the gesture approved, and the runtime does it at
// its next tick (`relever`). The gesture itself — a function — lives in the runtime's memory only: after a restart,
// a pending gesture waits until its agent proposes it again, the same line, which takes back its id and its approval.
//
// A levels file, a pending file or a gesture log that cannot be read is refused: the gesture is not done, nothing is
// guessed in its place, and no file is overwritten.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ecrireAtomique } from "../../relais.ts";
import type { Runtime } from "../../runtime.ts";
import { consignerGeste, gestesDe, OUTCOME, type Outcome } from "./gestes.ts";
import { magasinDeNiveaux, type MagasinDeNiveaux, type Reglable } from "./niveaux.ts";

// A gesture as its agent says it: its line, its reason, and its outcome once done.
export type GesteDit = { line: string; reason: string; outcome: Outcome };
// Who makes the gesture: the name its log is kept under (`closer`, `cook #12`), and what holds its level (`cook`,
// `manager split-epic`). `auChef`: the gesture waits for the chef's OK whatever its level but `observe` — an action
// whose kind the project ranks `chef` (risque/risque.ts, #4230).
export type AgentDuGeste = { agent: string; reglable: Reglable; auChef?: boolean };
// What the gate did of a gesture: done, with what it gave; held, under its id; or only logged.
export type Passage<T> = { etat: "done"; valeur: T } | { etat: "held"; id: number } | { etat: "observed" };

export type GesteEnAttente = { id: number; agent: string; line: string; reason: string; at: string; approved: boolean };

export type PorteDesGestes = {
  // `consigne`: what is logged once the gesture is done, from what it gave — null logs nothing (a gesture refused on
  // the way). By default, the gesture as its agent said it.
  passer<T>(qui: AgentDuGeste, geste: GesteDit, faire: () => T | Promise<T>, consigne?: (valeur: T) => GesteDit | null): Promise<Passage<T>>;
  // The chef's approval of a pending gesture: done once, then logged. Null when no gesture is pending under this id
  // in this runtime — never done twice.
  approuver(id: number): Promise<Passage<unknown> | null>;
  // Does the pending gestures the chef approved from another process.
  relever(): Promise<void>;
};

const FICHIER_DES_ATTENTES = "autonomy-pending.json";

class AttentesIllisibles extends Error {}

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const estAttente = (valeur: unknown): valeur is GesteEnAttente =>
  estObjet(valeur) &&
  Number.isSafeInteger(valeur.id) &&
  typeof valeur.agent === "string" &&
  typeof valeur.line === "string" &&
  typeof valeur.reason === "string" &&
  typeof valeur.at === "string" &&
  typeof valeur.approved === "boolean";

// The pending gestures, as the file holds them, oldest first.
export function gestesEnAttente(repertoire: string): GesteEnAttente[] {
  const fichier = join(repertoire, FICHIER_DES_ATTENTES);
  if (!existsSync(fichier)) return [];
  let lu: unknown;
  try {
    lu = JSON.parse(readFileSync(fichier, "utf8"));
  } catch (erreur) {
    throw new AttentesIllisibles(`${fichier} cannot be read: ${(erreur as Error).message}`);
  }
  if (!Array.isArray(lu) || !lu.every(estAttente)) throw new AttentesIllisibles(`${fichier} is not a list of {id, agent, line, reason, at, approved}`);
  return lu;
}

const ecrire = (repertoire: string, attentes: readonly GesteEnAttente[]) => ecrireAtomique(join(repertoire, FICHIER_DES_ATTENTES), `${JSON.stringify(attentes, null, 2)}\n`);

// The chef's approval, from its own process: the pending gesture is marked approved, and the runtime does it at its
// next tick. Returns the gesture approved; an id that is pending nowhere is refused, and nothing is written.
export function approuverGeste(repertoire: string, id: number): GesteEnAttente {
  const attentes = gestesEnAttente(repertoire);
  const attente = attentes.find((une) => une.id === id);
  if (attente === undefined) throw new AttentesIllisibles(`no gesture is pending under ${id}`);
  const approuvee = { ...attente, approved: true };
  ecrire(repertoire, attentes.map((une) => (une.id === id ? approuvee : une)));
  return approuvee;
}

export type OptionsDeLaPorte = {
  repertoire: string;
  projet: string;
  horloge: () => Date;
  // The level store; by default, the one of `repertoire`.
  niveaux?: MagasinDeNiveaux;
  avertir?: (message: string) => void;
};

export function porteDesGestes({ repertoire, projet, horloge, niveaux = magasinDeNiveaux(repertoire), avertir = (texte) => console.error(texte) }: OptionsDeLaPorte): PorteDesGestes {
  // The gestures held in this runtime, by their id: the function and what logs it.
  const tenus = new Map<number, { agent: string; faire: () => Promise<{ valeur: unknown; dit: GesteDit | null }> }>();

  // Logs a gesture done; a log that fails is said, the gesture being done.
  const consigner = (agent: string, geste: GesteDit | null) => {
    if (geste === null) return;
    try {
      consignerGeste(repertoire, agent, geste, horloge);
    } catch (erreur) {
      throw new Error(`its gesture was done but not logged (${geste.line}) — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };

  // A gesture done on `act` that was held before — its level was `propose` — is out of the pending gestures: nothing
  // asks the chef's OK for it any more, and an approval finds nothing to do again. A pending file that cannot be read is said, and left as it is.
  const plusEnAttente = (agent: string, line: string) => {
    try {
      const attentes = gestesEnAttente(repertoire);
      const faits = attentes.filter((une) => une.agent === agent && une.line === line);
      if (faits.length === 0) return;
      ecrire(repertoire, attentes.filter((une) => !faits.includes(une)));
      for (const { id } of faits) tenus.delete(id);
    } catch (erreur) {
      avertir(`brigade : pending gestures not read, the ${agent}'s gesture done stays listed (${line}) — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };

  const approuver = async (id: number): Promise<Passage<unknown> | null> => {
    const tenu = tenus.get(id);
    if (tenu === undefined) return null;
    // Out of the pending gestures before it is done: a second approval finds nothing. A file that cannot be read
    // leaves it held.
    ecrire(repertoire, gestesEnAttente(repertoire).filter((une) => !(une.id === id)));
    tenus.delete(id);
    const { valeur, dit } = await tenu.faire();
    consigner(tenu.agent, dit);
    return { etat: "done", valeur };
  };

  return {
    async passer(qui, geste, faire, consigne = () => geste) {
      const lu = niveaux.lire(projet)[qui.reglable];
      const niveau = qui.auChef === true && lu !== "observe" ? "propose" : lu;
      if (niveau === "act") {
        const valeur = await faire();
        consigner(qui.agent, consigne(valeur));
        plusEnAttente(qui.agent, geste.line);
        return { etat: "done", valeur };
      }
      if (niveau === "observe") {
        // The same gesture seen again is not logged twice in a row.
        const derniere = gestesDe(repertoire, qui.agent).at(-1);
        const dejaVu = derniere?.line === geste.line && derniere.outcome === OUTCOME.NOT_DONE;
        if (!dejaVu) consignerGeste(repertoire, qui.agent, { ...geste, outcome: OUTCOME.NOT_DONE }, horloge);
        return { etat: "observed" };
      }
      // Proposed again, the same gesture keeps its id — and its approval, if the chef gave it meanwhile.
      const attentes = gestesEnAttente(repertoire);
      let attente = attentes.find((une) => une.agent === qui.agent && une.line === geste.line);
      if (attente === undefined) {
        attente = { id: Math.max(0, ...attentes.map(({ id }) => id)) + 1, agent: qui.agent, line: geste.line, reason: geste.reason, at: horloge().toISOString(), approved: false };
        ecrire(repertoire, [...attentes, attente]);
      }
      tenus.set(attente.id, {
        agent: qui.agent,
        faire: async () => {
          const valeur = await faire();
          return { valeur, dit: consigne(valeur) };
        },
      });
      return { etat: "held", id: attente.id };
    },
    approuver,
    async relever() {
      let approuves: GesteEnAttente[];
      try {
        approuves = gestesEnAttente(repertoire).filter(({ approved, id }) => approved && tenus.has(id));
      } catch (erreur) {
        avertir(`brigade : pending gestures not read — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
        return;
      }
      for (const { id, agent, line } of approuves) {
        try {
          await approuver(id);
        } catch (erreur) {
          avertir(`brigade : approved gesture of the ${agent} failed (${line}) — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
        }
      }
    },
  };
}

// The gate of a runtime's agents: the pending gestures the chef approved, held by this gate, are done at each of the
// runtime's ticks.
// Null when the runtime has no state directory.
export function porteDuRuntime(runtime: Pick<Runtime, "projet" | "repertoireEtat" | "surReveil">, horloge: () => Date = () => new Date()): PorteDesGestes | null {
  if (runtime.repertoireEtat === undefined) return null;
  const porte = porteDesGestes({ repertoire: runtime.repertoireEtat, projet: runtime.projet, horloge });
  runtime.surReveil((cause) => void (cause === "tick" && porte.relever()));
  return porte;
}

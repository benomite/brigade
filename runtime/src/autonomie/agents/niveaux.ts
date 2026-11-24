// The autonomy level of each agent of a project (spec 2026-11-23-autonomy-trust-control, C4, #4036): three steps —
// `observe` (it says what it would do), `propose` (it waits for the chef's OK), `act` (it does it, then says so).
//
// Levels are kept in one file of the directory the store is given, per project, and only those the chef set: a level
// never set is its default, the chef's choice of 2026-11-23 (the spec's « The chef's answers », Q2). Splitting an epic
// has its own level, apart from the rest of the manager's gestures.
//
// A missing file is a fresh project: every level is its default. A file that cannot be read — not JSON, or a level
// that is not one of the three steps — is refused, by the read and by the write: nothing is guessed in its place, and
// what the chef set is never overwritten.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ecrireAtomique } from "../../relais.ts";

const NIVEAUX = ["observe", "propose", "act"] as const;
export type Niveau = (typeof NIVEAUX)[number];

// What holds a level: each agent, and the manager's splitting of an epic. The cooks share one level.
const REGLABLES = ["manager", "manager split-epic", "supervisor", "closer", "pass", "cook"] as const;
export type Reglable = (typeof REGLABLES)[number];
export type Niveaux = Record<Reglable, Niveau>;

// The defaults the chef chose on 2026-11-23. The cooks' is not in that answer: a cook already does its ticket and
// says so, which is `act`.
const NIVEAUX_PAR_DEFAUT: Readonly<Niveaux> = {
  manager: "act",
  "manager split-epic": "propose",
  supervisor: "act",
  closer: "propose",
  pass: "act",
  cook: "act",
};

const FICHIER_DES_NIVEAUX = "autonomy-levels.json";

export class NiveauxIllisibles extends Error {}

const estNiveau = (valeur: unknown): valeur is Niveau => (NIVEAUX as readonly unknown[]).includes(valeur);
const estReglable = (valeur: unknown): valeur is Reglable => (REGLABLES as readonly unknown[]).includes(valeur);

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

export type MagasinDeNiveaux = {
  // The level of each agent of the project: what the chef set, else its default.
  lire(projet: string): Niveaux;
  // Sets one level of the project, and only that one.
  poser(projet: string, reglable: Reglable, niveau: Niveau): void;
};

export function magasinDeNiveaux(repertoire: string): MagasinDeNiveaux {
  const fichier = join(repertoire, FICHIER_DES_NIVEAUX);

  // What the chef set, project by project.
  function poses(): Record<string, Partial<Niveaux>> {
    if (!existsSync(fichier)) return {};
    let lu: unknown;
    try {
      lu = JSON.parse(readFileSync(fichier, "utf8"));
    } catch (erreur) {
      throw new NiveauxIllisibles(`${fichier} cannot be read: ${(erreur as Error).message}`);
    }
    if (!estObjet(lu)) throw new NiveauxIllisibles(`${fichier} is not a JSON object`);
    for (const [projet, siens] of Object.entries(lu)) {
      if (!estObjet(siens)) throw new NiveauxIllisibles(`${fichier}: the levels of ${projet} are not an object`);
      for (const [reglable, niveau] of Object.entries(siens)) {
        if (!estReglable(reglable) || !estNiveau(niveau)) throw new NiveauxIllisibles(`${fichier}: ${projet} holds ${JSON.stringify(reglable)}: ${JSON.stringify(niveau)}, which is no agent's level`);
      }
    }
    return lu as Record<string, Partial<Niveaux>>;
  }

  return {
    lire: (projet) => ({ ...NIVEAUX_PAR_DEFAUT, ...poses()[projet] }),
    poser(projet, reglable, niveau) {
      if (!estReglable(reglable)) throw new NiveauxIllisibles(`${JSON.stringify(reglable)} is no agent`);
      if (!estNiveau(niveau)) throw new NiveauxIllisibles(`${JSON.stringify(niveau)} is no level: ${NIVEAUX.join(", ")}`);
      const tous = poses();
      tous[projet] = { ...tous[projet], [reglable]: niveau };
      ecrireAtomique(fichier, `${JSON.stringify(tous, null, 2)}\n`);
    },
  };
}

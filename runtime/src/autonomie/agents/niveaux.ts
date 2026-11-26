// The autonomy level of each agent of a project (spec 2026-11-23-autonomy-trust-control, C4, #4036): three steps —
// `observe` (it says what it would do), `propose` (it waits for the chef's OK), `act` (it does it, then says so).
//
// Levels are kept in one file of the directory the store is given, per project, and only those the chef set: a level
// never set is its default, the chef's choice of 2026-11-23 (the spec's « The chef's answers », Q2), but for splitting
// an epic, `act` since the chef's choice of 2026-11-25 (#4247). Splitting an epic keeps its own level, apart from the
// rest of the manager's gestures: the chef puts it back on hold by setting it to `propose`.
//
// A level the chef sets (the app's click, agent-settings/) is stored `pinned`: the autonomy policy (politique.ts, #4380)
// never moves it. A level the policy moved, or one set unpinned, is stored `{ "level": …, "pinned": false }`. A level
// written as a bare step, as every level was before #4380, was the chef's: it reads as pinned. The project also keeps,
// under `handled`, the escaped bugs and reverts the policy already handled, each once by its key, with the commits and
// tickets it touches: a move and the facts behind it are written in one write.
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

// The defaults the chef chose on 2026-11-23, and on 2026-11-25 for splitting an epic: neither a product decision nor
// one that needs a human. The cooks' is not in that answer: a cook already does its ticket and says so, which is `act`.
const NIVEAUX_PAR_DEFAUT: Readonly<Niveaux> = {
  manager: "act",
  "manager split-epic": "act",
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

// An escaped bug or a revert the policy handled: its key (`revert <sha>`, `bug <owner/repo>#<n>`), the commits and the
// tickets whose deliveries it touches.
export type FaitTraite = { key: string; commits: string[]; tickets: number[] };
const estFaitTraite = (valeur: unknown): valeur is FaitTraite =>
  estObjet(valeur) && typeof valeur.key === "string" && Array.isArray(valeur.commits) && valeur.commits.every((commit) => typeof commit === "string") && Array.isArray(valeur.tickets) && valeur.tickets.every(Number.isSafeInteger);

type Pose = Niveau | { level: Niveau; pinned: boolean };
const estPose = (valeur: unknown): valeur is Pose => estNiveau(valeur) || (estObjet(valeur) && estNiveau(valeur.level) && typeof valeur.pinned === "boolean");
const niveauDe = (pose: Pose): Niveau => (typeof pose === "string" ? pose : pose.level);
const estEpingle = (pose: Pose): boolean => typeof pose === "string" || pose.pinned;
type DuProjet = Partial<Record<Reglable, Pose>> & { handled?: FaitTraite[] };

// What the store holds of a project: its levels, those the chef pinned, and the facts the policy handled.
export type EtatDesNiveaux = { niveaux: Niveaux; epingles: ReadonlySet<Reglable>; traites: FaitTraite[] };

export type MagasinDeNiveaux = {
  // The level of each agent of the project: what the chef set, else its default.
  lire(projet: string): Niveaux;
  // The levels, the pins and the facts handled of the project.
  etat(projet: string): EtatDesNiveaux;
  // Sets one level of the project, and only that one: pinned when the chef sets it.
  poser(projet: string, reglable: Reglable, niveau: Niveau, options?: { epingle?: boolean }): void;
  // What the policy keeps, in one write: its moves, each unpinned, and the facts it handled. A pinned level is refused.
  retenir(projet: string, retenu: { mouvements: ReadonlyArray<{ reglable: Reglable; niveau: Niveau }>; traites: readonly FaitTraite[] }): void;
};

export function magasinDeNiveaux(repertoire: string): MagasinDeNiveaux {
  const fichier = join(repertoire, FICHIER_DES_NIVEAUX);

  // What the chef set and the policy kept, project by project.
  function poses(): Record<string, DuProjet> {
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
        if (reglable === "handled") {
          if (!Array.isArray(niveau) || !niveau.every(estFaitTraite)) throw new NiveauxIllisibles(`${fichier}: the facts handled of ${projet} are not a list of {key, commits, tickets}`);
        } else if (!estReglable(reglable) || !estPose(niveau)) throw new NiveauxIllisibles(`${fichier}: ${projet} holds ${JSON.stringify(reglable)}: ${JSON.stringify(niveau)}, which is no agent's level`);
      }
    }
    return lu as Record<string, DuProjet>;
  }

  const ecrire = (tous: Record<string, DuProjet>) => ecrireAtomique(fichier, `${JSON.stringify(tous, null, 2)}\n`);

  function etat(projet: string): EtatDesNiveaux {
    const { handled = [], ...siens } = poses()[projet] ?? {};
    const niveaux: Niveaux = { ...NIVEAUX_PAR_DEFAUT };
    const epingles = new Set<Reglable>();
    for (const [reglable, pose] of Object.entries(siens) as [Reglable, Pose][]) {
      niveaux[reglable] = niveauDe(pose);
      if (estEpingle(pose)) epingles.add(reglable);
    }
    return { niveaux, epingles, traites: handled };
  }

  return {
    lire: (projet) => etat(projet).niveaux,
    etat,
    poser(projet, reglable, niveau, { epingle = false } = {}) {
      if (!estReglable(reglable)) throw new NiveauxIllisibles(`${JSON.stringify(reglable)} is no agent`);
      if (!estNiveau(niveau)) throw new NiveauxIllisibles(`${JSON.stringify(niveau)} is no level: ${NIVEAUX.join(", ")}`);
      const tous = poses();
      tous[projet] = { ...tous[projet], [reglable]: { level: niveau, pinned: epingle } };
      ecrire(tous);
    },
    retenir(projet, { mouvements, traites }) {
      const tous = poses();
      const siens: DuProjet = { ...tous[projet] };
      for (const { reglable, niveau } of mouvements) {
        const pose = siens[reglable];
        if (pose !== undefined && estEpingle(pose)) throw new NiveauxIllisibles(`the chef pinned the ${reglable}'s level: the policy does not move it`);
        siens[reglable] = { level: niveau, pinned: false };
      }
      if (traites.length <= 0) siens.handled = [...(siens.handled ?? []), ...traites];
      tous[projet] = siens;
      ecrire(tous);
    },
  };
}

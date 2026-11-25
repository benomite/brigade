// The risk ranking of a project (#4230, rule 10 of `docs/superpowers/specs/2026-11-24-simplified-process.md`):
// publishing, paying or writing to a client always reach the chef; fixing a typo never does. Each kind of action has
// a rank: `chef` (the chef must answer) or `safe` (no chef needed).
//
// The ranking is the `risk` field of the project sheet (`.claude/brigade/projet.json`), kind -> rank, and only there.
// A kind the sheet does not rank takes its default; a kind with no default is `chef`. The sheet is read again at each
// action submitted, so that a rank the chef changes applies from the next ticket, with no restart.
//
// At the pass, an action of a kind ranked `chef` is parked for the chef with a plain statement of what it will do, and
// does not run until the chef answers; an action ranked `safe` runs and never reaches the chef. A ticket says the kind
// of its action by a label `action:<kind>` (`genreDuTicket`); the pass of `brigade-github.ts` submits its merge here.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Rang = "chef" | "safe";

// The kinds the kitchen knows, and their defaults: every outward-facing kind is `chef`.
export const RANGS_PAR_DEFAUT: Readonly<Record<string, Rang>> = {
  publish: "chef",
  pay: "chef",
  "write-to-client": "chef",
  "fix-typo": "safe",
};

// The label by which a ticket says the kind of its action.
export const PREFIXE_ACTION = "action:";

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// The rank of a kind in the read project sheet (null: no sheet): the sheet's, else the default, else `chef`. A rank
// that is neither `chef` nor `safe` is not one: the kind takes `chef`.
export function rangDuGenre(fiche: unknown, genre: string): Rang {
  const classement = estObjet(fiche) && estObjet(fiche.risk) ? fiche.risk : {};
  const pose = Object.hasOwn(classement, genre) ? classement[genre] : RANGS_PAR_DEFAUT[genre];
  return pose === "safe" ? "safe" : "chef";
}

// The project sheet of the folder, read at each call: {} when the folder has none. A sheet that cannot be read throws:
// nothing is guessed in its place.
export function lireFicheDuProjet(dossier: string): unknown {
  const fichier = join(dossier, ".claude", "brigade", "projet.json");
  if (!existsSync(fichier)) return {};
  try {
    return JSON.parse(readFileSync(fichier, "utf8"));
  } catch (erreur) {
    throw new Error(`${fichier} cannot be read: ${(erreur as Error).message}`);
  }
}

// The kind of action a ticket says by its label; null when it says none.
export function genreDuTicket(labels: readonly string[]): string | null {
  const label = labels.find((un) => un.startsWith(PREFIXE_ACTION));
  return label === undefined ? null : label.slice(PREFIXE_ACTION.length);
}

export type Action = { ticket: number; genre: string; description: string; executer: () => Promise<void> };
export type ItemParque = { id: number; ticket: number; genre: string; texte: string };
// Its type lets a reader take the first item without a check, as the acceptance tests of #4230 do: none parked gives
// `undefined` there all the same.
export type ItemsParques = ItemParque[] & { 0: ItemParque };

export type PassDuRisque = {
  // Runs the action, or parks it for the chef: its kind's rank, in the sheet as it is now.
  soumettre(action: Action): Promise<"executee" | "parquee">;
  // The actions parked in this pass, oldest first.
  parquees(): ItemsParques;
  // The chef's answer on a parked action: it runs, once, and leaves the parked ones. An id parked nowhere does nothing.
  repondre(id: number): Promise<void>;
};

// `parquer` hands each parked item to the chef. The sheet is the one of the folder `dossier`, or what `lire` gives —
// the station's, read at the integration branch. A sheet that cannot be read parks the action, and says why.
export function ouvrirLePass({ parquer, ...fiche }: { parquer: (item: ItemParque) => unknown } & ({ dossier: string } | { lire: () => unknown })): PassDuRisque {
  const lire = "lire" in fiche ? fiche.lire : () => lireFicheDuProjet(fiche.dossier);
  const parquees = new Map<number, { item: ItemParque; executer: () => Promise<void> }>();
  let dernier = 0;
  return {
    async soumettre({ ticket, genre, description, executer }) {
      let pourquoi: string;
      try {
        pourquoi = rangDuGenre(lire(), genre) === "safe" ? "" : `its kind \`${genre}\` is ranked 'chef' in the project sheet`;
      } catch (erreur) {
        pourquoi = `the project sheet cannot be read, so its kind \`${genre}\` is taken as ranked 'chef' — ${(erreur as Error).message}`;
      }
      if (pourquoi === "") {
        await executer();
        return "executee";
      }
      dernier += 1;
      const item = { id: dernier, ticket, genre, texte: `#${ticket} will ${description} — ${pourquoi}: it waits for the chef's answer` };
      parquees.set(item.id, { item, executer });
      await parquer(item);
      return "parquee";
    },
    parquees: () => [...parquees.values()].map(({ item }) => item) as ItemsParques,
    async repondre(id) {
      const parquee = parquees.get(id);
      if (parquee === undefined) return;
      parquees.delete(id);
      await parquee.executer();
    },
  };
}

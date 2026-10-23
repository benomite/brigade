// A project's autonomy table: for each kind of decision, what brigade may
// decide alone. Each row holds one of three positions — `brigade decides`,
// `brigade decides and tells me`, `I decide` —, and three more rows are
// always `I decide`, changed by no command.
//
// Its store is the project's log, in the state directory, like the chef's
// decisions (`decisions.ts`): every change is an `autonomy.changed` fact,
// written with its author. The table is read again from the log on every
// read, with nothing kept in memory: a change holds at the kitchen's next
// read, with no restart.
//
// A row that nothing has set holds today's behavior (`AUJOURDHUI`): a project
// with no table behaves as before the table existed.
//
// The Merge row is the `merge` grant (`grant.ts`): the grant stays its store,
// so `grant` keeps commanding it and a log written before the table — a
// grant enabled, lapsed or revoked — reads as the matching position, with
// nothing to rewrite. Setting the row writes the grant: `I decide` revokes
// it, a `brigade` position enables it when it is not active, with no
// deadline. What the grant does not say — whether brigade tells — is the
// last `autonomy.changed` of that row since the grant was enabled.
import type { Base } from "../base.ts";
import type { Evenement } from "../evenements.ts";
import { constaterExtinction } from "../grant.ts";
import type { Journal } from "../journal.ts";
import { etatDuGrant } from "../projections/pass.ts";

export const POSITIONS = ["brigade-decides", "brigade-decides-and-tells-me", "i-decide"] as const;
export type Position = (typeof POSITIONS)[number];

// The words the chef reads (docs/glossary.md).
export const LIBELLES_DES_POSITIONS: Record<Position, string> = {
  "brigade-decides": "brigade decides",
  "brigade-decides-and-tells-me": "brigade decides and tells me",
  "i-decide": "I decide",
};

// The kinds of decision the chef sets, in the order the table shows them.
export const RANGEES = ["screens", "merge", "specification", "priorities", "cost", "dependencies", "publishing"] as const;
export type Rangee = (typeof RANGEES)[number];

// The rows that are always `I decide`. The list is here, in the code: it
// changes only by a delivery, like what no grant allows (`grant.ts`).
export const FIXES = ["production", "secrets", "published-outside-the-repository"] as const;
export type Fixe = (typeof FIXES)[number];

export const LIBELLES_DES_RANGEES: Record<Rangee | Fixe, { titre: string; dit: string }> = {
  screens: { titre: "Screens", dit: "validating the captures of an interface change before merge" },
  merge: { titre: "Merge", dit: "merging a green delivery (the `merge` grant)" },
  specification: { titre: "Specification", dit: "adjusting a ticket's criteria, splitting it again, closing a ticket judged useless" },
  priorities: { titre: "Priorities", dit: "reordering the queue, posing tickets born in the kitchen" },
  cost: { titre: "Cost", dit: "raising a ticket's calibration, relaunching it beyond its resends, the share of the Max quota" },
  dependencies: { titre: "Dependencies", dit: "adding a library or a service (a database, Docker…)" },
  publishing: { titre: "Publishing", dit: "releases and station updates" },
  production: { titre: "Production", dit: "any action on the project's production" },
  secrets: { titre: "Secrets", dit: "reading or writing the project's secrets" },
  "published-outside-the-repository": { titre: "Published outside the repository", dit: "anything published outside the repository" },
};

// What each row holds when nothing has set it: what the kitchen does today,
// read as the closest position — does the decision reach the chef as a card,
// or does the kitchen take it alone? Merge is not here: the grant says it.
// `source: "default"` tells whoever routes a decision that the chef chose
// nothing for that row: it keeps today's path, whatever the position says.
export const AUJOURDHUI: Record<Exclude<Rangee, "merge">, Position> = {
  // The reviewer judges the captures (`reviewer.ts`); no card asks the chef.
  screens: "brigade-decides",
  // The manager calibrates, poses `fire` and splits alone, saying why on the
  // issue (`manager.ts`, `decoupage.ts`); the triage agent re-splits alone.
  specification: "brigade-decides",
  // The queue follows the chef's `prio:` labels, and a ticket born in the
  // kitchen waits for the chef's yes or no (`correctif/decision.ts`).
  priorities: "i-decide",
  // Raising a calibration, a relaunch, the quota's share: taken alone, within
  // the ceilings the chef sets (`reaction.ts`, `reagir.ts`, `arbitre.ts`).
  cost: "brigade-decides",
  // A missing service is a `need:*` choice for the chef (`installation/besoins/`).
  dependencies: "i-decide",
  // Releases publish on merge, stations update on their timer (`mise-a-jour/`).
  publishing: "brigade-decides",
};

// The profiles that set the whole table at once. Each is a constant: a row
// it does not name holds `brigade decides`.
export const PROFILS = {
  prototype: profil({}),
  "client-product": profil({ screens: "i-decide", specification: "i-decide" }),
  "internal-tool": profil(Object.fromEntries(RANGEES.map((rangee) => [rangee, "brigade-decides-and-tells-me"]))),
} as const satisfies Record<string, Record<Rangee, Position>>;
export type Profil = keyof typeof PROFILS;
export const NOMS_DES_PROFILS = Object.keys(PROFILS) as Profil[];

function profil(sauf: Partial<Record<Rangee, Position>>): Record<Rangee, Position> {
  return Object.fromEntries(RANGEES.map((rangee) => [rangee, sauf[rangee] ?? "brigade-decides"])) as Record<Rangee, Position>;
}

// Where a row's position comes from. `default`: nothing set it, it holds
// today's behavior. `set`: an `autonomy.changed`. `grant`: the Merge row,
// read from the grant — enabled, lapsed or revoked by `grant` or by the
// table. `fixed`: a row no command changes.
export type Source = "default" | "set" | "grant" | "fixed";
export type Ligne<R extends Rangee | Fixe = Rangee | Fixe> = { row: R; position: Position; source: Source; fixed: boolean };
export type Table = { rows: Ligne<Rangee>[]; fixed: Ligne<Fixe>[] };

// A change the table does not allow: nothing is written.
export class AutonomieRefusee extends Error {}

const CHANGEE = "autonomy.changed";
const AUTEUR_DU_CONSTAT = "runtime";

export const estUneRangee = (nom: string): nom is Rangee => (RANGEES as readonly string[]).includes(nom);
export const estFixe = (nom: string): nom is Fixe => (FIXES as readonly string[]).includes(nom);
export const estUnePosition = (nom: string): nom is Position => (POSITIONS as readonly string[]).includes(nom);
export const estUnProfil = (nom: string): nom is Profil => (NOMS_DES_PROFILS as readonly string[]).includes(nom);

type Changement = { seq: number; row: string; position: string };

// The `autonomy.changed` facts of the log, in order. A row or a position this
// runtime does not know — written by a newer version — is skipped.
function changements(base: Base): Changement[] {
  return base
    .lire<{ seq: number; payload: string }>("SELECT seq, payload FROM events WHERE type = ? ORDER BY seq", CHANGEE)
    .map(({ seq, payload }) => ({ seq, ...(JSON.parse(payload) as { row?: unknown; position?: unknown }) }))
    .filter((fait): fait is Changement => typeof fait.row === "string" && typeof fait.position === "string" && estUneRangee(fait.row) && estUnePosition(fait.position));
}

// The Merge row, read from the grant at `maintenant`: not active, it is `I
// decide`; active, it is the last `brigade` position the table set on it
// since it was enabled — `brigade decides` if none, as the grant has always
// meant.
function positionDuMerge(base: Base, faits: Changement[], maintenant: Date): Position {
  if (!etatDuGrant(base, "merge", maintenant)?.active) return "i-decide";
  const accorde = base.lire<{ seq: number | null }>("SELECT max(seq) AS seq FROM events WHERE type = 'grant.activated' AND json_extract(payload, '$.action') = 'merge'")[0]?.seq ?? 0;
  const dit = faits.filter((fait) => fait.row === "merge" && fait.seq > accorde && fait.position !== "i-decide").at(-1);
  return (dit?.position as Position | undefined) ?? "brigade-decides";
}

// The table as the log carries it at `maintenant`, read again on every call.
export function lireAutonomie(base: Base, maintenant: Date): Table {
  const faits = changements(base);
  const posees = new Map<Rangee, Position>();
  for (const { row, position } of faits) posees.set(row as Rangee, position as Position);
  const rows = RANGEES.map((row): Ligne<Rangee> => {
    if (row === "merge") return { row, position: positionDuMerge(base, faits, maintenant), source: "grant", fixed: false };
    const posee = posees.get(row);
    return posee === undefined ? { row, position: AUJOURDHUI[row], source: "default", fixed: false } : { row, position: posee, source: "set", fixed: false };
  });
  return { rows, fixed: FIXES.map((row) => ({ row, position: "i-decide", source: "fixed", fixed: true })) };
}

// One row's position, for whoever routes a decision of that kind.
export function positionDe(base: Base, row: Rangee | Fixe, maintenant: Date): Position {
  if (estFixe(row)) return "i-decide";
  const ligne = lireAutonomie(base, maintenant).rows.find((ligne) => ligne.row === row);
  if (!ligne) throw new AutonomieRefusee(`“${row}” is not a row of the autonomy table`);
  return ligne.position;
}

const ou = (valeurs: readonly string[]) => `${valeurs.slice(0, -1).join(", ")} or ${valeurs.at(-1)}`;

function exigerRangee(row: string): Rangee {
  if (estFixe(row)) throw new AutonomieRefusee(`the ${LIBELLES_DES_RANGEES[row].titre} row is always “I decide”: no command changes it — only a delivery, which reads as a diff (runtime/src/autonomie/table.ts)`);
  if (!estUneRangee(row)) throw new AutonomieRefusee(`“${row}” is not a row of the autonomy table — expected ${ou(RANGEES)}`);
  return row;
}

function exigerPosition(position: string): Position {
  if (!estUnePosition(position)) throw new AutonomieRefusee(`“${position}” is not a position — expected ${ou(POSITIONS)}`);
  return position;
}

export type Geste = { projet: string; auteur: string; maintenant: Date };

// Moves one row, in the transaction its caller holds. The Merge row writes
// the grant first: its `autonomy.changed` then follows the grant's enabling.
function deplacer(journal: Journal, geste: Geste, row: Rangee, position: Position, profil: Profil | null): Evenement | null {
  const { projet, auteur, maintenant } = geste;
  const avant = lireAutonomie(journal.base, maintenant).rows.find((ligne) => ligne.row === row);
  if (!avant) throw new AutonomieRefusee(`“${row}” is not a row of the autonomy table`);
  // A row already set to that position: nothing is written. A row that holds
  // its default is written all the same: the chef has now chosen it.
  if (avant.position === position && avant.source !== "default") return null;
  if (row === "merge") {
    // A lapsed grant the log does not say yet is first written lapsed: the
    // table's gesture does not cover a lapse.
    constaterExtinction(journal, projet, AUTEUR_DU_CONSTAT, "merge", maintenant);
    const actif = etatDuGrant(journal.base, "merge", maintenant)?.active ?? false;
    const ajouter = (type: "grant.activated" | "grant.revoked") => journal.ajouter({ project: projet, ticket: null, author: auteur, type, payload: { action: "merge" } });
    if (position === "i-decide" && actif) ajouter("grant.revoked");
    if (position !== "i-decide" && !actif) ajouter("grant.activated");
  }
  return journal.ajouter({ project: projet, ticket: null, author: auteur, type: CHANGEE, payload: { row, previous: avant.position, position, profile: profil } });
}

// Sets one row to a position, on behalf of `auteur`. Returns the fact written,
// or null if the row already held it. A fixed row, an unknown row or position
// is refused, and nothing is written.
export function poserRangee(journal: Journal, geste: Geste & { row: string; position: string }): Evenement | null {
  const row = exigerRangee(geste.row);
  const position = exigerPosition(geste.position);
  return journal.base.transaction(() => deplacer(journal, geste, row, position, null));
}

// Sets the whole table to a profile, on behalf of `auteur`, in one
// transaction: one `autonomy.changed` per row it moves, each naming the
// profile. A row can then be changed alone, without touching the others.
export function appliquerProfil(journal: Journal, geste: Geste & { profil: string }): Evenement[] {
  const nom = geste.profil;
  if (!estUnProfil(nom)) throw new AutonomieRefusee(`“${nom}” is not a profile — expected ${ou(NOMS_DES_PROFILS)}`);
  return journal.base.transaction(() =>
    RANGEES.flatMap((row) => {
      const ecrit = deplacer(journal, geste, row, PROFILS[nom][row], nom);
      return ecrit === null ? [] : [ecrit];
    }),
  );
}

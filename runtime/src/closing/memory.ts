// What the closing remembers a pass left for lack of certainty, project by
// project, so that the next passes do not propose it again unless the code
// around it changed since it was left. A closer that left a candidate once,
// with its reason, would leave it again on the same code: proposing it at
// every pass only spends its tokens and lengthens its PR.
//
// How "the code around it changed" is told. When a pass leaves a candidate,
// the memory keeps, under the candidate's key (`cle` — what recognizes it in
// another observation, wherever its lines moved), the fingerprint of its
// surroundings on the base the pass started from: for each of its places
// (`lieux`), its lines, the `CONTEXTE` lines above and the `CONTEXTE` lines
// below — trimmed, and blank lines neither kept nor counted —, hashed together
// with its path. At the next pass the observation spots it again, and its
// fingerprint is taken the same way on the base as it is then:
//
// - the same: the code around it did not change, it is not proposed;
// - another: it is proposed again, and its old entry is dropped — if the
//   closer leaves it again, the pass writes a new one;
// - no longer spotted at all: its entry is dropped, there is nothing left to
//   propose.
//
// Lines added or removed elsewhere in the file move a place, not its
// surroundings: they do not count, nor do a change of indentation or a blank
// line. What lies beyond the window — the far end of a long function, the doc
// that names an export — does not count either: that is the price of keeping
// it simple.
//
// The memory lives in the project's log base, in a table of its own keyed by
// project: what one project left has no effect on another. It is not a
// projection — the fingerprint is taken on the code, not read from the log —,
// and a replay of the log leaves it as it is.
import { createHash } from "node:crypto";
import type { Base } from "../base.ts";
import type { Laisse } from "../events/closing.ts";
import { SANS_MOTIF } from "./brief.ts";
import type { Candidat } from "./candidates.ts";

// The lines on each side of a place that make its surroundings, blank lines
// not counted.
export const CONTEXTE = 10;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS closing_left (
    project     TEXT NOT NULL,
    key         TEXT NOT NULL,
    location    TEXT NOT NULL CHECK (json_valid(location)),
    reason      TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    run         TEXT NOT NULL,
    at          TEXT NOT NULL,
    PRIMARY KEY (project, key, fingerprint)
  ) STRICT;
`;

// An item a pass left: the candidate's key, where it was, why it was left,
// the fingerprint of its surroundings, and the pass that left it, and when.
export type Souvenir = { cle: string; location: string[]; reason: string; empreinte: string; run: string; at: string };

// A place, `<path>:<line>` or `<path>:<first>-<last>`.
const LIEU = /^(.*):(\d+)(?:-(\d+))?$/;

// The fingerprint of the surroundings of these places, read in `contenu`
// (path → text). A place whose file is not there counts as empty.
export function empreinte(contenu: ReadonlyMap<string, string>, lieux: string[]): string {
  const hache = createHash("sha256");
  for (const lieu of lieux) {
    const [, chemin = lieu, premiere = "1", derniere = premiere] = LIEU.exec(lieu) ?? [];
    const lignes = (contenu.get(chemin) ?? "").split("\n");
    const nettes = (de: number, a?: number) => lignes.slice(Math.max(0, de), a).map((ligne) => ligne.trim()).filter((ligne) => ligne !== "");
    const alentours = [...nettes(0, Number(premiere) - 1).slice(-CONTEXTE), ...nettes(Number(premiere) - 1, Number(derniere)), ...nettes(Number(derniere)).slice(0, CONTEXTE)];
    hache.update(`${chemin}\0${alentours.join("\n")}\0`);
  }
  return hache.digest("hex");
}

export function poserLaMemoire(base: Base): void {
  base.script(SCHEMA);
}

// What the memory holds for this project, oldest first.
export function memoire(base: Base, projet: string): Souvenir[] {
  return base
    .lire<{ key: string; location: string; reason: string; fingerprint: string; run: string; at: string }>("SELECT key, location, reason, fingerprint, run, at FROM closing_left WHERE project = ? ORDER BY at, key", projet)
    .map(({ key, location, reason, fingerprint, run, at }) => ({ cle: key, location: JSON.parse(location) as string[], reason, empreinte: fingerprint, run, at }));
}

// Splits what the observation spots: `neufs`, what may be proposed; `deja`,
// what a previous pass left and whose surroundings did not change — the same
// key, the same fingerprint. Drops, on the way, every entry that no candidate
// matches: its code changed around it, or it is gone. An entry is held by its
// key and its fingerprint together: a passage copied three times is two
// duplicates under one key, each at its own places.
export function trier(base: Base, projet: string, tous: Candidat[]): { neufs: Candidat[]; deja: Candidat[] } {
  const souvenirs = memoire(base, projet);
  const neufs: Candidat[] = [];
  const deja: Candidat[] = [];
  for (const candidat of tous) {
    const rang = souvenirs.findIndex(({ cle, empreinte }) => cle === candidat.cle && empreinte === candidat.empreinte);
    if (rang < 0) neufs.push(candidat);
    else {
      souvenirs.splice(rang, 1);
      deja.push(candidat);
    }
  }
  for (const { cle, empreinte } of souvenirs) base.executer("DELETE FROM closing_left WHERE project = ? AND key = ? AND fingerprint = ?", projet, cle, empreinte);
  return { neufs, deja };
}

// Writes what a pass left — the closer's judgment on what it was proposed,
// not what was set aside before it — with the fingerprint of its surroundings
// on the base the pass started from. An entry of the same candidate, at the
// same code, is replaced.
export function retenir(base: Base, projet: string, passe: { run: string; at: string; proposes: Candidat[]; laisses: Laisse[] }): void {
  const proposes = new Map(passe.proposes.map((candidat) => [candidat.id, candidat]));
  for (const { id, reason, before } of passe.laisses) {
    const candidat = proposes.get(id);
    if (before || candidat === undefined) continue;
    base.executer(
      "INSERT OR REPLACE INTO closing_left (project, key, location, reason, fingerprint, run, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      projet,
      candidat.cle,
      JSON.stringify(candidat.lieux),
      reason ?? SANS_MOTIF,
      candidat.empreinte,
      passe.run,
      passe.at,
    );
  }
}

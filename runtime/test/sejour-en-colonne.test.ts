// Depuis quand un ticket est dans Taken ou Pass, et ses essais (#1839) : le cas de #1834, pris à 16 h 34, arrêté deux fois
// sur le garde-fou des tours et relancé, se lit « pris depuis 16 h 34 », en trois essais.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Ajout } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { sejoursEnColonne } from "../src/sejour-en-colonne.ts";
import { aArreter, repertoireTemporaire } from "./outils.ts";

const DEBUT = new Date("2026-10-27T16:30:00.000Z");
type Fait = Pick<Ajout, "type" | "payload">;
const ARRIVEE: Fait = { type: "ticket.arrived", payload: { title: "t", priority: null, createdAt: "2026-10-27T16:00:00.000Z", url: "https://github.com/chef/shop/issues/7" } };
const PRIS: Fait = { type: "ticket.taken", payload: { station: "box/claude", leaseUntil: "2026-10-27T20:00:00.000Z" } };
const garde = (run: string): Fait => ({ type: "guard.tripped", payload: { run, reason: "turns", limit: 100, observed: 100 } });
const sortie = (run: string, outcome: string): Fait => ({ type: "cook.exited", payload: { run, outcome, code: null, signal: null, turns: 1, tokens: 1, durationMs: 1 } });

function cuisine(t: TestContext) {
  let horloge = DEBUT;
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => horloge });
  aArreter(t, () => journal.fermer());
  const noter = (minutes: number, { type, payload }: Fait) => {
    horloge = new Date(DEBUT.getTime() + minutes * 60_000);
    journal.ajouter({ project: "shop", ticket: 7, author: "runtime", type, payload } as Ajout);
  };
  return { noter, lire: () => sejoursEnColonne(journal.base, lireRail(journal.base)).get(7) };
}

test("un ticket relancé après l'arrêt de son cook garde sa première prise, et dit chaque arrêt", (t) => {
  const { noter, lire } = cuisine(t);
  noter(0, ARRIVEE);
  noter(4, PRIS);
  noter(21, garde("r1"));
  noter(21, sortie("r1", "guard"));
  noter(22, PRIS);
  noter(36, sortie("r2", "failed"));
  noter(37, PRIS);
  const sejour = lire();
  assert.equal(sejour?.depuis, "2026-10-27T16:34:00.000Z");
  assert.deepEqual(
    sejour?.essais.map(({ stop }) => stop),
    ["stopped at the turn limit (100)", "the cook failed", null],
  );
});

test("une première prise n'a qu'un essai ; la pass ouvre un séjour neuf, sans essai", (t) => {
  const { noter, lire } = cuisine(t);
  noter(0, ARRIVEE);
  noter(4, PRIS);
  assert.equal(lire()?.essais.length, 1);
  noter(10, { type: "ticket.passing", payload: { station: "box/claude" } });
  assert.deepEqual(lire(), { depuis: "2026-10-27T16:40:00.000Z", essais: [] });
});

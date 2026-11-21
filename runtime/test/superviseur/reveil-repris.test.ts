// Branché sur chaque réveil du runtime (#3945), le superviseur ne relance pas un run du
// manager pour une cause qui n'a pas changé avant `REVEIL_REPRIS_MS` : une base qui
// reste rouge ne fait pas consulter le manager à chaque réveil (`superviseur.ts`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import type { FaitsDuProjet } from "../../src/superviseur/declencheur.ts";
import { superviseur } from "../../src/superviseur/superviseur.ts";
import { repertoireTemporaire } from "../outils.ts";
import { FauxDepot } from "./faux-depot.ts";

// Le délai du superviseur (`superviseur.ts`) : trente minutes.
const REVEIL_REPRIS_MS = 30 * 60_000;
const DEPART = Date.parse("2026-11-20T10:00:00.000Z");
const ROUGE: FaitsDuProjet = { dernierMerge: null, cuisinables: [], prises: [], mainRougeDepuis: "2026-11-20T09:45:00.000Z" };
const PRIS: FaitsDuProjet = { ...ROUGE, mainRougeDepuis: null, prises: [{ ticket: 40, prises: 3 }] };

test("une même cause ne relance le manager qu'après REVEIL_REPRIS_MS ; une autre cause, aussitôt", async (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const depot = new FauxDepot();
  depot.issue(40, ["fire"]);
  let instant = DEPART;
  const consultes: string[] = [];
  const superviser = superviseur({
    projet: "reveil-repris",
    depot: "acme/shop",
    sources: { journal, github: depot.client(), branche: "main" },
    manager: async ({ reveil }) => (consultes.push(reveil.cause), { saw: "nothing moves", gesture: { gesture: "todo", ticket: 40, kind: "product", question: "Ship it?" } }),
    maintenant: () => new Date(instant),
  });
  const jouer = async (faits: FaitsDuProjet) => {
    const run = superviser(faits);
    await run;
    return run !== null;
  };
  assert.equal(await jouer(ROUGE), true);
  instant = DEPART + REVEIL_REPRIS_MS - 1;
  assert.equal(await jouer(ROUGE), false);
  // Une autre cause part aussitôt ; la première, revenue, aussi : ce n'est plus la dernière lancée.
  assert.equal(await jouer(PRIS), true);
  assert.equal(await jouer(ROUGE), true);
  instant += REVEIL_REPRIS_MS;
  assert.equal(await jouer(ROUGE), true);
  assert.deepEqual(consultes, ["main-red", "takes", "main-red", "main-red"]);
});

// Toutes les commandes de lecture tiennent le même langage devant un journal
// que le runtime n'a pas encore rejoué : un conseil, un code d'erreur, pas de trace.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import { lancer, repertoireTemporaire } from "./outils.ts";

const SRC = join(import.meta.dirname, "../src");

for (const commande of ["status", "montrer-rail", "garde-fous-cli", "montrer-station", "montrer-pass"]) {
  test(`${commande} devant un journal sans projections dit de redémarrer le runtime, sans trace`, async (t) => {
    const repertoire = repertoireTemporaire(t);
    ouvrirJournal(repertoire, { projections: [] }).fermer();

    const enfant = lancer(t, join(SRC, `${commande}.ts`), [], { BRIGADE_STATE_DIR: repertoire });

    assert.equal(await enfant.fin, 1);
    assert.match(enfant.sortie(), /redémarrer le runtime/);
    assert.doesNotMatch(enfant.sortie(), /at .*\.ts/);
  });
}

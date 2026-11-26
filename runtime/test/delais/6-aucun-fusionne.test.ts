// #4308 criterion 6: no merged ticket in the last 24 h — a clear line, no failure.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculerLesDelais } from "../../src/delais/delais.ts";
import { direLesDelais } from "../../src/delais/affichage.ts";
import { demarrer } from "../../src/runtime.ts";
import { principal as status } from "../../src/status.ts";
import { appeler, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
test("nothing merged: the line says so, the object is empty with a null share", () => {
  const delais = calculerLesDelais([], MAINTENANT);
  assert.equal(delais.fusionnes, 0);
  assert.equal(delais.part_dans_les_temps, null);
  assert.deepEqual(delais.pires_depassements, []);
  assert.match(direLesDelais(delais).join("\n"), /no merged ticket in the last 24 h/);
});

test("`brigade <project> status` on a kitchen with no merged ticket prints that line and exits 0", async (t) => {
  const repertoire = repertoireTemporaire(t);
  demarrer({ repertoireEtat: repertoire, projet: "brigade" }).arreter("SIGTERM");
  const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await commande.fin, 0);
  assert.match(commande.sortie(), /no merged ticket in the last 24 h/);
});

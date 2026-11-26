// #4308 criterion 4: `status --json` carries the `delais` object, every key of the given shape.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculerLesDelais } from "../../src/delais/delais.ts";
import { demarrer } from "../../src/runtime.ts";
import { principal as status } from "../../src/status.ts";
import { appeler, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const a = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();

// A ticket merged `fusionneIl_y_a` minutes ago, taken `dureeMin` minutes before its merge.
function fusionne(ticket: number, o: { attendu?: number; dureeMin: number; fusionneIlYA?: number; cookMin?: number; gatesMin?: number; revueMin?: number; renvoisMin?: number }) {
  const fin = o.fusionneIlYA ?? 60;
  return {
    ticket,
    titre: `Ticket ${ticket}`,
    etiquettes: [...(o.attendu === undefined ? [] : [`attendu:${o.attendu}`]), "opus", "medium"],
    modele: "opus",
    effort: "medium",
    priseAt: a(fin + o.dureeMin),
    prOuverteAt: a(fin + o.dureeMin - (o.cookMin ?? Math.round(o.dureeMin / 2))),
    fusionneAt: a(fin),
    gatesMin: o.gatesMin ?? 0,
    revueMin: o.revueMin ?? 0,
    renvoisMin: o.renvoisMin ?? 0,
  };
}

test("the object has exactly the keys of the contract, and each overrun too", () => {
  const delais = calculerLesDelais([fusionne(9, { attendu: 10, dureeMin: 50, cookMin: 20, gatesMin: 5, revueMin: 10, renvoisMin: 5 }), fusionne(8, { attendu: 30, dureeMin: 10 }), fusionne(7, { dureeMin: 10 })], MAINTENANT);
  assert.deepEqual(Object.keys(delais).sort(), ["dans_les_temps", "fenetre_heures", "fusionnes", "part_dans_les_temps", "pires_depassements", "sans_temps_attendu"]);
  assert.equal(delais.fenetre_heures, 24);
  assert.equal(delais.fusionnes, 3);
  assert.equal(delais.dans_les_temps, 1);
  assert.equal(delais.part_dans_les_temps, 0.5);
  assert.equal(delais.sans_temps_attendu, 1);
  const [pire] = delais.pires_depassements;
  assert.deepEqual(Object.keys(pire ?? {}).sort(), ["attendu_min", "effort", "modele", "reel_min", "repartition_min", "ticket", "titre"]);
  assert.deepEqual(Object.keys(pire?.repartition_min ?? {}).sort(), ["attentes", "cook", "gates", "renvois", "review"]);
  assert.equal(pire?.ticket, 9);
  assert.equal(pire?.titre, "Ticket 9");
  assert.equal(pire?.modele, "opus");
  assert.equal(pire?.effort, "medium");
});

test("`status --json` prints an object with `delais` in it", async (t) => {
  const repertoire = repertoireTemporaire(t);
  demarrer({ repertoireEtat: repertoire, projet: "brigade" }).arreter("SIGTERM");
  const commande = appeler(status, ["--json"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await commande.fin, 0);
  const json = JSON.parse(commande.sortie());
  assert.deepEqual(Object.keys(json.delais).sort(), ["dans_les_temps", "fenetre_heures", "fusionnes", "part_dans_les_temps", "pires_depassements", "sans_temps_attendu"]);
});

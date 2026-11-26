// #4217, critère 1 : un ticket en WAITING n'est pris par aucune station tant que sa retenue est active.
// WAITING est devenu `parked` (#4260, règle 13 de docs/superpowers/specs/2026-11-24-simplified-process.md) ; un ticket
// qui porte encore le label d'avant, `waiting`, est retenu de même. Le contrôle de prise (`prendre`) et le tour de deux
// stations, sur le faux GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDuParking } from "../../src/attente-github/attente-github.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const SEMAINE_MS = 7 * 24 * 3_600_000;
const NOMS = ["A", "B"];

for (const label of ["parked", "waiting"]) {
  test(`a ticket in WAITING (\`${label}\`) whose follow-up date is ahead is refused to every station, at the claim check and at their turns`, async () => {
    const faux = new FauxGitHub();
    faux.feu(923, [...CALIBRE, label]);
    faux.poster(923, "chef", corpsDuParking({ what: "the client's API key", who: "the client", followUp: new Date(Date.now() + SEMAINE_MS).toISOString() }));
    for (const nom of NOMS) {
      const prise = await faux.prise(faux.pour(nom), nom).prendre({ number: 923, labels: [...faux.ticket(923).labels] });
      assert.equal(prise.prise, false, `station ${nom} must not claim a ticket whose hold is active`);
    }
    const stations = NOMS.map((nom) => faux.station(nom, { avertir: () => {} }));
    for (let i = 0; i < 3; i += 1) {
      for (const station of stations) {
        await station.tour();
        await station.calme();
      }
    }
    assert.deepEqual(faux.cuissons, [], "no cook leaves");
    assert.equal(NOMS.map((nom) => faux.prisesDe(nom)).reduce((a, b) => a + b, 0), 0, "no claim is written on the ticket");
    assert.equal(faux.ticket(923).labels.has("taken"), false);
    assert.equal(faux.ticket(923).labels.has(label), true, "the hold is still on");
  });
}

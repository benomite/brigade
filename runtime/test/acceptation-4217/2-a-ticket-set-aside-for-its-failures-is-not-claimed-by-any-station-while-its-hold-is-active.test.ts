// #4217, critère 2 : un ticket mis de côté par ses échecs n'est pris par aucune station tant que sa retenue est active.
// La mise de côté par les échecs est devenue le parking par le compte d'échecs (#4260 : `parked`, sa marque dit
// `failures`) ; un ticket qui porte encore le label d'avant, `set-aside:failures`, est retenu de même. Le contrôle de
// prise (`prendre`) et le tour de deux stations, sur le faux GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDuParking } from "../../src/attente-github/attente-github.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const SEMAINE_MS = 7 * 24 * 3_600_000;
const NOMS = ["A", "B"];

for (const label of ["parked", "set-aside:failures"]) {
  test(`a ticket set aside for its failures (\`${label}\`), its hold active, is refused to every station, at the claim check and at their turns`, async () => {
    const faux = new FauxGitHub();
    faux.feu(923, [...CALIBRE, label]);
    for (const [i, motif] of ["the cook committed nothing", "the gates are red", "the branch has no commit"].entries()) faux.poster(923, "A", `<!-- brigade:echec n=${i + 1} -->\nStation \`A\`: the cook stopped without a delivery — ${motif}`);
    faux.poster(923, "A", corpsDuParking({ what: "its cooks failed too many times, the station stopped relaunching it", who: "the supervisor", followUp: new Date(Date.now() + SEMAINE_MS).toISOString(), fact: "the supervisor answers", failures: true }));
    // Ce que la cuisine écrit encore sur le ticket ne fait pas tomber sa retenue : un lâcher, une trace du superviseur.
    faux.poster(923, "A", "<!-- brigade:lache station=A -->\nReleased by station `A`.");
    faux.poster(923, "supervisor", "<!-- brigade:superviseur -->\n**Supervisor** — looked at it.");
    for (const nom of NOMS) {
      const prise = await faux.prise(faux.pour(nom), nom).prendre({ number: 923, labels: [...faux.ticket(923).labels] });
      assert.equal(prise.prise, false, `station ${nom} must not claim a ticket set aside for its failures`);
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
    assert.equal(faux.ticket(923).labels.has(label), true, "the hold is still on");
  });
}

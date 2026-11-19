// Le temps qui suit un cook raté n'est pas de l'attente d'une prise (#3891) :
// BOBL-tech/mirrorlab#729 et #745 comptaient 1157 et 1067 min d'attente d'une
// prise, quand c'était la reprise après des cooks ratés.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SEUIL_PERDU_PAR_DEFAUT_MIN, seuilDuProjet } from "../../src/temps-max/mesure.ts";
import { mesurer, type DepotDuTicket, type Marque } from "../../src/temps-ticket/mesure.ts";

const T0 = Date.UTC(2026, 10, 12, 15);
const h = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

// Déposé à 0, sur le rail à 1, pris à 2 ; le cook s'arrête à 10 ; la reprise ne vient qu'à 600 (une nuit) ; elle livre à 620 ; mergée à 640.
const depot: DepotDuTicket = {
  deposeAt: h(0),
  fireAt: h(1),
  priseAt: h(2),
  faits: [
    { quoi: "prise", at: h(2) },
    { quoi: "rendu", at: h(10) },
    { quoi: "prise", at: h(600) },
  ],
};
const station: Marque[] = [
  { etape: "cuisson", at: h(601) },
  { etape: "attentePasse", at: h(620) },
  { etape: "merge", at: h(635) },
];

describe("the wait after a failed cook is not a claim wait", () => {
  const t = mesurer({ ticket: 729, marques: station, testsMs: 0 }, h(640), depot);

  test("the claim wait stops at the first claim", () => {
    assert.equal(t.attentePrise, 60);
  });
  test("the time after the failed cook stays lost, under the failed cooks", () => {
    assert.equal(t.cuissonsRatees, 598 * 60);
    assert.equal(t.perdu?.ratees, 598 * 60);
    assert.equal(t.perdu?.attente, 60 + 60);
  });
  test("the lost time is the same as before: all the time before the cook that delivered", () => {
    const perdu = t.perdu;
    assert.ok(perdu !== undefined);
    assert.equal(perdu.attente + perdu.ratees + perdu.renvois, 600 * 60);
  });
  test("the threshold of the lost time stays at 2 min", () => {
    assert.equal(SEUIL_PERDU_PAR_DEFAUT_MIN, 2);
    assert.equal(seuilDuProjet({ lostTimeMaxMin: 2 }), 2);
  });
});

// Les alertes du haut du rail dans l'app (ticket 3823) : ce que `facts` en porte jusqu'au tableau, les prises d'un ticket
// d'où se compte une relance en boucle, et la ligne en tête du rail.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertsOfRailRead } from "../../src/vue/wait-of-rail/wait-of-rail.ts";
import { takenOfTheIssue } from "../../src/vue/cooks/taken.ts";
import { lineOfAlertsOfRail } from "../../src/vue/wait-of-rail/line-of-alerts.js";
import { Fake } from "../helpers/false-vue.ts";

const READ = "2026-11-18T12:00:00.000Z";
const T0 = Date.parse(READ);
const iso = (ms: number) => new Date(ms).toISOString();
const IT_Y_A_26_H = iso(T0 - 26 * 3_600_000);
const doc = { createElement: (balise: string) => new Fake(balise) };

describe("`facts` porte les alertes jusqu'au tableau", () => {
  test("des `alertesDuRail` mal formés, ou une alerte sans geste ni prise en charge, ne sont pas posés", () => {
    const good = { sorte: "base-rouge", phrase: "Main is red.", fait: { depuis: READ, ticket: 3 }, geste: null, geree: "The kitchen repairs it on #3." };
    for (const raw of [null, {}, [{ ...good, sorte: "autre" }], [{ ...good, phrase: "" }], [{ ...good, fait: { depuis: "hier", ticket: 3 } }], [{ ...good, fait: { depuis: READ } }], [{ ...good, geree: null }], [{ ...good, geste: 4 }]]) {
      assert.deepEqual(alertsOfRailRead(raw), {}, JSON.stringify(raw));
    }
    assert.deepEqual(alertsOfRailRead([good]), { alertesDuRail: [good] });
  });
});

describe("les prises d'un ticket", () => {
  const taking = (id: number, the: string) => ({ id, body: `<!-- brigade:prise station=parade-box/claude -->\nTaken.`, author_association: "OWNER", created_at: the });

  test("les prises d'un ticket, de la plus ancienne à la plus récente, dans quelque ordre que GitHub les rende", () => {
    const instants = [IT_Y_A_26_H, iso(T0 - 3_600_000), READ];
    const comments = instants.map((the, n) => taking(n + 1, the));
    assert.deepEqual(takenOfTheIssue(comments), instants);
    assert.deepEqual(takenOfTheIssue([...comments].reverse()), instants);
  });
});

describe("la ligne d'alerte en tête du rail", () => {
  test("sans alerte, aucune ligne", () => {
    assert.deepEqual(lineOfAlertsOfRail(doc, undefined, null), []);
    assert.deepEqual(lineOfAlertsOfRail(doc, [], null), []);
  });
});

// Les seuils de la page des coûts (vue/cost/thresholds.js, ticket 912 ; au niveau de l'app et d'un projet, #1022) : au-dessus, en dessous, absent — pour le ticket le
// plus cher et pour les tokens perdus. Les modules sont lus seuls, sur ce que `station` écrit mot pour mot.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setExpensive } from "../../src/vue/cost/expensive.js";
import { setLost } from "../../src/vue/cost/lost.js";
import { OPEN_THE_LIST, thresholdsOf } from "../../src/vue/cost/thresholds.js";
import { NOT_COMMUNICATED } from "../../src/vue/cost/head.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const A = "2026-10-17T10:00:00.000Z";
const cook = (ticket: number, end: string, tokens: string) =>
  `  2026-10-13T09:48:02.000Z  #${ticket}  r-${ticket}  sonnet / medium  ${end}  31 tours · ${tokens} tokens · 9,2 min`;
const pose = (value: string | null, opened: string) => (value === null ? `non posée — ${opened} ne se lit que du journal` : value);
// Une `station` : un ticket coûteux (900 000), un cook perdu (300 000), et les deux décisions du chef.
const station = (ticket: string | null, lost: string | null) =>
  [
    "station               box/claude — moteur claude, fournit : claude",
    "derniers cooks        ",
    cook(7, "fini", "900 000"),
    cook(8, "échoué", "300 000"),
    "consommé              en cours : rien",
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une",
    `  seuil-ticket        ${pose(ticket, "BRIGADE_DRIFT_TICKET_TOKENS")}`,
    `  seuil-perdus        ${pose(lost, "BRIGADE_DRIFT_LOST_TOKENS")}`,
    "",
  ].join("\n");
const PROJECTS = [{ nom: "parade" }];
const readings = (text: string) => new Map([["parade", { projet: "parade", demande: 0, a: A, sorties: [{ commande: "station", texte: text }] }]]);
const openEntries: unknown[][] = [];
const expensive = (text: string) => setExpensive(doc, PROJECTS, readings(text), () => "un titre", (...args: unknown[]) => void openEntries.push(args.slice(0, 2)));
let toggles = 0;
const lost = (text: string) => setLost(doc, PROJECTS, readings(text), () => "un titre", false, () => void toggles++);
const alerts = (block: Fake) => block.dessous("p").filter((p) => p.className.startsWith("alerte-cout"));

describe("les seuils que `station` écrit", () => {
  test("un seuil posé se lit ; un seuil « non posée » ne se lit pas", () => {
    assert.deepEqual(thresholdsOf(station("800000", "50 000")), { ticket: 800_000, perdus: 50_000 });
    assert.deepEqual(thresholdsOf(station(null, "1")), { ticket: null, perdus: 1 });
    assert.deepEqual(thresholdsOf("station  x"), { ticket: null, perdus: null });
  });
});

describe("le ticket le plus cher", () => {
  test("au-dessus du seuil : son bloc est mis en évidence, une ligne dit le geste", () => {
    const block = expensive(station("800000", null));
    assert.deepEqual(block.dessous("button").map((b: Fake) => b.className), ["ticket-cher depasse", "ticket-cher", "alerte-geste"]);
    const [alert, ...others] = alerts(block);
    assert.equal(others.length, 0);
    assert.equal(alert?.className, "alerte-cout");
    assert.equal(alert?.textContent, `parade · over its ceiling of 800,000${alert?.dessous("button")[0]?.textContent}`);
    // Le geste est un bouton, sur la ligne même : il ouvre la fiche du ticket le plus cher.
    const [action] = alert?.dessous("button") ?? [];
    assert.equal(action?.textContent, "open the sheet of #7");
    action?.click();
    assert.deepEqual(openEntries.at(-1), ["parade", 7]);
  });

  test("sous le seuil : ni mise en évidence, ni ligne", () => {
    const block = expensive(station("900000", null));
    assert.deepEqual(block.dessous("button").map((b: Fake) => b.className), ["ticket-cher", "ticket-cher"]);
    assert.deepEqual(alerts(block), []);
  });

  test("seuil absent : « not communicated », aucune alerte inventée", () => {
    const block = expensive(station(null, "1"));
    assert.deepEqual(block.dessous("button").map((b: Fake) => b.className), ["ticket-cher", "ticket-cher"]);
    assert.deepEqual(alerts(block).map((p) => [p.className, p.textContent]), [["alerte-cout sans", `ceiling: ${NOT_COMMUNICATED}`]]);
  });
});

describe("les tokens perdus", () => {
  test("au-dessus du seuil : le chiffre est mis en évidence, une ligne dit le geste", () => {
    const block = lost(station(null, "100000"));
    assert.equal(block.dessous("button")[0]?.className, "perdus-total depasse");
    const [alert, ...others] = alerts(block);
    assert.equal(others.length, 0);
    assert.equal(alert?.className, "alerte-cout");
    assert.equal(alert?.textContent, `parade · over its ceiling of 100,000${alert?.dessous("button")[0]?.textContent}`);
    // Le geste est un bouton, sur la ligne même : il déploie la liste.
    const [action] = alert?.dessous("button") ?? [];
    assert.equal(action?.textContent, OPEN_THE_LIST);
    action?.click();
    assert.equal(toggles, 1);
  });

  test("sous le seuil : ni mise en évidence, ni ligne", () => {
    const block = lost(station(null, "300000"));
    assert.equal(block.dessous("button")[0]?.className, "perdus-total");
    assert.deepEqual(alerts(block), []);
  });

  test("seuil absent : « not communicated », aucune alerte inventée", () => {
    const block = lost(station("1", null));
    assert.equal(block.dessous("button")[0]?.className, "perdus-total");
    assert.deepEqual(alerts(block).map((p) => [p.className, p.textContent]), [["alerte-cout sans", `ceiling: ${NOT_COMMUNICATED}`]]);
  });
});

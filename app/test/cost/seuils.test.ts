// Les seuils de l'onglet Cost (vue/cost/seuils.js, ticket 912) : au-dessus, en dessous, absent — pour le ticket le
// plus cher et pour les tokens perdus. Les modules sont lus seuls, sur ce que `station` écrit mot pour mot.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserChers } from "../../src/vue/cost/chers.js";
import { poserPerdus } from "../../src/vue/cost/perdus.js";
import { OUVRIR_LA_LISTE, seuilsDe } from "../../src/vue/cost/seuils.js";
import { NON_COMMUNIQUE } from "../../src/vue/cost/tete.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-10-17T10:00:00.000Z";
const cook = (ticket: number, fin: string, tokens: string) =>
  `  2026-10-13T09:48:02.000Z  #${ticket}  r-${ticket}  sonnet / medium  ${fin}  31 tours · ${tokens} tokens · 9,2 min`;
const pose = (valeur: string | null, ouvert: string) => (valeur === null ? `non posée — ${ouvert} ne se lit que du journal` : valeur);
// Une `station` : un ticket coûteux (900 000), un cook perdu (300 000), et les deux décisions du chef.
const station = (ticket: string | null, perdus: string | null) =>
  [
    "station               box/claude — moteur claude, fournit : claude",
    "derniers cooks        ",
    cook(7, "fini", "900 000"),
    cook(8, "échoué", "300 000"),
    "consommé              en cours : rien",
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une",
    `  seuil-ticket        ${pose(ticket, "BRIGADE_DRIFT_TICKET_TOKENS")}`,
    `  seuil-perdus        ${pose(perdus, "BRIGADE_DRIFT_LOST_TOKENS")}`,
    "",
  ].join("\n");
const PROJETS = [{ nom: "parade" }];
const lectures = (texte: string) => new Map([["parade", { projet: "parade", demande: 0, a: A, sorties: [{ commande: "station", texte }] }]]);
const ouvertes: unknown[][] = [];
const chers = (texte: string) => poserChers(doc, PROJETS, lectures(texte), () => "un titre", (...args: unknown[]) => void ouvertes.push(args.slice(0, 2)));
let bascules = 0;
const perdus = (texte: string) => poserPerdus(doc, PROJETS, lectures(texte), () => "un titre", false, () => void bascules++);
const alertes = (bloc: Faux) => bloc.dessous("p").filter((p) => p.className.startsWith("alerte-cout"));

describe("les seuils que `station` écrit", () => {
  test("un seuil posé se lit ; un seuil « non posée » ne se lit pas", () => {
    assert.deepEqual(seuilsDe(station("800000", "50 000")), { ticket: 800_000, perdus: 50_000 });
    assert.deepEqual(seuilsDe(station(null, "1")), { ticket: null, perdus: 1 });
    assert.deepEqual(seuilsDe("station  x"), { ticket: null, perdus: null });
  });
});

describe("le ticket le plus cher", () => {
  test("au-dessus du seuil : son bloc est mis en évidence, une ligne dit le geste", () => {
    const bloc = chers(station("800000", null));
    assert.deepEqual(bloc.dessous("button").map((b: Faux) => b.className), ["ticket-cher depasse", "ticket-cher", "alerte-geste"]);
    const [alerte, ...autres] = alertes(bloc);
    assert.equal(autres.length, 0);
    assert.equal(alerte?.className, "alerte-cout");
    assert.equal(alerte?.textContent, `parade · over its ceiling of 800,000${alerte?.dessous("button")[0]?.textContent}`);
    // Le geste est un bouton, sur la ligne même : il ouvre la fiche du ticket le plus cher.
    const [geste] = alerte?.dessous("button") ?? [];
    assert.equal(geste?.textContent, "open the sheet of #7");
    geste?.click();
    assert.deepEqual(ouvertes.at(-1), ["parade", 7]);
  });

  test("sous le seuil : ni mise en évidence, ni ligne", () => {
    const bloc = chers(station("900000", null));
    assert.deepEqual(bloc.dessous("button").map((b: Faux) => b.className), ["ticket-cher", "ticket-cher"]);
    assert.deepEqual(alertes(bloc), []);
  });

  test("seuil absent : « not communicated », aucune alerte inventée", () => {
    const bloc = chers(station(null, "1"));
    assert.deepEqual(bloc.dessous("button").map((b: Faux) => b.className), ["ticket-cher", "ticket-cher"]);
    assert.deepEqual(alertes(bloc).map((p) => [p.className, p.textContent]), [["alerte-cout sans", `ceiling: ${NON_COMMUNIQUE}`]]);
  });
});

describe("les tokens perdus", () => {
  test("au-dessus du seuil : le chiffre est mis en évidence, une ligne dit le geste", () => {
    const bloc = perdus(station(null, "100000"));
    assert.equal(bloc.dessous("button")[0]?.className, "perdus-total depasse");
    const [alerte, ...autres] = alertes(bloc);
    assert.equal(autres.length, 0);
    assert.equal(alerte?.className, "alerte-cout");
    assert.equal(alerte?.textContent, `parade · over its ceiling of 100,000${alerte?.dessous("button")[0]?.textContent}`);
    // Le geste est un bouton, sur la ligne même : il déploie la liste.
    const [geste] = alerte?.dessous("button") ?? [];
    assert.equal(geste?.textContent, OUVRIR_LA_LISTE);
    geste?.click();
    assert.equal(bascules, 1);
  });

  test("sous le seuil : ni mise en évidence, ni ligne", () => {
    const bloc = perdus(station(null, "300000"));
    assert.equal(bloc.dessous("button")[0]?.className, "perdus-total");
    assert.deepEqual(alertes(bloc), []);
  });

  test("seuil absent : « not communicated », aucune alerte inventée", () => {
    const bloc = perdus(station("1", null));
    assert.equal(bloc.dessous("button")[0]?.className, "perdus-total");
    assert.deepEqual(alertes(bloc).map((p) => [p.className, p.textContent]), [["alerte-cout sans", `ceiling: ${NON_COMMUNIQUE}`]]);
  });
});

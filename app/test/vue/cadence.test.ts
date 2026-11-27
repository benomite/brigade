// Sur le rail (#1811) : l'âge des cartes de Taken et de Pass, et leurs essais — l'histogramme des 24 heures a quitté la
// tête du rail avec la bande de chiffres (#3013). La vue jouée telle qu'elle est, devant un faux
// document (helpers/false-vue.ts), sur ce que le process principal range des faits de la box (facts.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { HOURS, type CadenceRead } from "../../src/cadence.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { setAge, setTrials } from "../../src/vue/cadence.js";
import { Fake, type Played, playTheVue, openTab, repos } from "../helpers/false-vue.ts";

const A = "2026-10-21T12:20:01.000Z";
const READ = "2026-10-21T12:20:00.000Z";
const PARADE = "parade";
const start = (rank: number) => new Date(Date.parse("2026-10-20T13:00:00.000Z") + rank * 3_600_000).toISOString();
const CADENCE: CadenceRead = {
  hours: Array.from({ length: HOURS }, (_, rank) => ({ at: start(rank), served: rank === 20 ? 3 : rank === 23 ? 1 : 0, failed: rank === 20 ? 1 : 0 })),
  medianSeconds: { taken: 1800, pass: 600 },
};

const FACTS: Facts = {
  etat: "ouverte",
  lu: READ,
  dernierTick: READ,
  compteurs: { rail: 0, auTravail: 2, aLaPass: 1, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Ticket 14", url: "https://exemple.test/14", depuis: "2026-10-21T10:00:00.000Z", activite: null },
    { ticket: 15, etat: "pris", titre: "Ticket 15", url: "https://exemple.test/15", depuis: "2026-10-21T12:05:00.000Z", activite: null },
    { ticket: 16, etat: "en pass", titre: "Ticket 16", url: "https://exemple.test/16", depuis: "2026-10-21T12:15:00.000Z", activite: null },
  ],
  cooks: [],
  attend: [],
  cadence: CADENCE,
};

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

async function open(): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
function receive(vue: Played, facts: unknown = FACTS) {
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
}
const slip = (vue: Played, ticket: number) => vue.element("rail").dessous("li").find((pose) => pose.className === "bon" && pose.textContent.includes(`#${ticket}`));
const age = (pose: Fake | undefined) => pose?.dessous("span").find((setOne) => setOne.className === "age");

describe("l'âge des cartes de Taken et de Pass", () => {
  test("chaque carte dit depuis combien de temps elle y est ; son âge exact au survol", async () => {
    const vue = await open();
    receive(vue);
    await openTab(vue, "Rail");
    const taken = age(slip(vue, 15)) ?? assert.fail("pas d'âge sur #15");
    assert.equal(taken.textContent, "15 min");
    assert.match(taken.title, /^in Taken for 15 min, since \d\d:\d\d — usually 30 min/);
    const enPass = age(slip(vue, 16)) ?? assert.fail("pas d'âge sur #16");
    assert.equal(enPass.textContent, "5 min");
    assert.match(enPass.title, /^in Pass for 5 min/);
  });

  test("bien plus longtemps que d'ordinaire — plus de deux fois la médiane —, la carte tranche par sa couleur", async () => {
    const vue = await open();
    receive(vue);
    await openTab(vue, "Rail");
    const lingers = slip(vue, 14) ?? assert.fail("pas de carte #14");
    assert.equal(lingers.dataset.traine, "");
    assert.equal(age(lingers)?.dataset.longue, "");
    assert.equal(age(lingers)?.textContent, "2 h");
    for (const ticket of [15, 16]) {
      assert.equal(slip(vue, ticket)?.dataset.traine, undefined);
      assert.equal(age(slip(vue, ticket))?.dataset.longue, undefined);
    }
  });
});

describe("les essais d'une carte, un point chacun", () => {
  const trial = (since: string, until: string | null, stop: string | null) => ({ depuis: since, jusqua: until, arret: stop, enCours: until === null });
  const THREE = [
    trial("2026-10-21T11:30:00.000Z", "2026-10-21T11:47:00.000Z", "tokens"),
    trial("2026-10-21T11:47:10.000Z", "2026-10-21T12:02:00.000Z", "idle"),
    trial("2026-10-21T12:02:10.000Z", null, null),
  ];
  const facts = (rail: unknown[]) => ({ ...FACTS, rail, cadence: { ...CADENCE, medianSeconds: { taken: 1200, pass: 600 } } });
  const points = (pose: Fake | undefined) => pose?.dessous("span").filter((setOne) => setOne.className === "essai") ?? [];

  test("un ticket pris depuis cinquante minutes sur trois essais : `50 min` et la couleur lente, trois points", async () => {
    const vue = await open();
    receive(vue, facts([{ ticket: 34, etat: "pris", titre: "Ticket 34", url: "https://exemple.test/34", depuis: "2026-10-21T11:30:00.000Z", essais: THREE, activite: null }]));
    await openTab(vue, "Rail");
    const card = slip(vue, 34) ?? assert.fail("pas de carte #34");
    assert.equal(age(card)?.textContent, "50 min");
    assert.equal(age(card)?.dataset.longue, "");
    const rounds = points(card);
    assert.equal(rounds.length, 3);
    assert.deepEqual(rounds.map((round) => round.dataset.enCours), [undefined, undefined, ""]);
    assert.equal(rounds[0]?.title, "attempt 1 of 3 — stopped after 17 min: tokens");
    assert.equal(rounds[1]?.title, "attempt 2 of 3 — stopped after 14 min: idle");
    assert.equal(rounds[2]?.title, "attempt 3 of 3 — cooking now");
  });

  test("un seul essai : aucun point, mais l'âge", async () => {
    const vue = await open();
    receive(vue, facts([{ ticket: 35, etat: "pris", titre: "Ticket 35", url: "https://exemple.test/35", depuis: "2026-10-21T12:05:00.000Z", essais: [trial("2026-10-21T12:05:00.000Z", null, null)], activite: null }]));
    await openTab(vue, "Rail");
    const card = slip(vue, 35) ?? assert.fail("pas de carte #35");
    assert.equal(age(card)?.textContent, "15 min");
    assert.equal(points(card).length, 0);
  });

  test("la même chose sur une carte de Pass", async () => {
    const vue = await open();
    receive(vue, facts([{ ticket: 36, etat: "en pass", titre: "Ticket 36", url: "https://exemple.test/36", depuis: "2026-10-21T12:15:00.000Z", essais: THREE.slice(0, 2).map((e, i) => (i === 1 ? { ...e, enCours: true, jusqua: null, arret: null } : e)), activite: null }]));
    await openTab(vue, "Rail");
    const card = slip(vue, 36) ?? assert.fail("pas de carte #36");
    assert.equal(age(card)?.textContent, "5 min");
    assert.equal(points(card).length, 2);
  });

  test("un runtime d'avant `essais` : l'âge seul", async () => {
    const vue = await open();
    receive(vue);
    await openTab(vue, "Rail");
    assert.equal(points(slip(vue, 15)).length, 0);
  });
});

test("le module se lit seul, sur un faux document", () => {
  const doc = { createElement: (balise: string) => new Fake(balise) };
  const setOne = setAge(doc as never, { court: "3 h", dit: "in Taken for 3 h 02", longue: true }) as Fake;
  assert.deepEqual([setOne.textContent, setOne.title, setOne.dataset.longue], ["3 h", "in Taken for 3 h 02", ""]);
  const trials = setTrials(doc as never, [{ enCours: false, dit: "attempt 1 of 2 — stopped after 3 min: turns" }, { enCours: true, dit: "attempt 2 of 2 — cooking now" }]) as Fake;
  assert.deepEqual(trials.dessous("span").map((round) => round.title), ["attempt 1 of 2 — stopped after 3 min: turns", "attempt 2 of 2 — cooking now"]);
});

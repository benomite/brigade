// À quelle allure la cuisine sert (#1811) : ce que l'app lit de `cadence` dans `facts`, et l'âge de chaque carte de Taken et de Pass — qui tranche au-delà de deux fois l'ordinaire.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { seniority, cadenceRead, durationShort, HOURS, type CadenceRead } from "../src/cadence.ts";
import { understand, rail, type Facts } from "../src/facts.ts";
import { hourHM } from "../src/format.ts";

const READ = "2026-10-21T12:20:00.000Z";
const start = (rank: number) => new Date(Date.parse("2026-10-20T13:00:00.000Z") + rank * 3_600_000).toISOString();
const empty = () => Array.from({ length: HOURS }, (_, rank) => ({ at: start(rank), served: 0, failed: 0 }));
const CADENCE: CadenceRead = {
  hours: empty().map((hour, rank) => (rank === 20 ? { ...hour, served: 3, failed: 1 } : rank === 23 ? { ...hour, served: 1 } : hour)),
  medianSeconds: { taken: 1800, pass: 600 },
};

describe("la lecture de `cadence`", () => {
  test("vingt-quatre heures et deux médianes : lues telles quelles, ce que le runtime y ajouterait laissé de côté", () => {
    assert.deepEqual(cadenceRead(CADENCE), CADENCE);
    assert.deepEqual(cadenceRead({ ...CADENCE, autre: 1, hours: CADENCE.hours.map((hour) => ({ ...hour, en: "plus" })) }), CADENCE);
    assert.deepEqual(cadenceRead({ ...CADENCE, medianSeconds: { taken: null, pass: null } })?.medianSeconds, { taken: null, pass: null });
  });

  test("une autre forme n'est pas lue : le rail se dessine sans, comme d'un runtime d'avant ce champ", () => {
    for (const bad of [
      undefined,
      null,
      [],
      { hours: CADENCE.hours },
      { ...CADENCE, hours: CADENCE.hours.slice(1) },
      { ...CADENCE, hours: [...CADENCE.hours.slice(1), { at: "hier", served: 0, failed: 0 }] },
      { ...CADENCE, hours: [...CADENCE.hours.slice(1), { at: READ, served: -1, failed: 0 }] },
      { ...CADENCE, hours: [...CADENCE.hours.slice(1), { at: READ, served: 0, failed: 0.5 }] },
      { ...CADENCE, medianSeconds: { taken: "1800", pass: null } },
    ]) {
      assert.equal(cadenceRead(bad), undefined, JSON.stringify(bad)?.slice(0, 80));
    }
  });
});

describe("l'âge d'une carte de Taken et de Pass", () => {
  test("court sur la carte, exact au survol, entre l'entrée dans la colonne et la lecture — deux heures de la box", () => {
    const age = seniority("pris", "2026-10-21T11:58:00.000Z", READ, CADENCE.medianSeconds);
    assert.deepEqual(age, { court: "22 min", dit: `in Taken for 22 min, since ${hourHM("2026-10-21T11:58:00.000Z")} — usually 30 min (the median of the last 7 days)`, longue: false });
  });

  test("plus de deux fois la médiane de sa colonne : elle tranche — deux fois pile, pas encore", () => {
    assert.equal(seniority("en pass", "2026-10-21T11:59:00.000Z", READ, CADENCE.medianSeconds)?.longue, true);
    assert.equal(seniority("en pass", "2026-10-21T11:59:00.000Z", READ, CADENCE.medianSeconds)?.dit, `in Pass for 21 min, since ${hourHM("2026-10-21T11:59:00.000Z")} — usually 10 min (the median of the last 7 days) — more than twice that`);
    assert.equal(seniority("en pass", "2026-10-21T12:00:00.000Z", "2026-10-21T12:20:00.000Z", { taken: null, pass: 599 })?.longue, true);
    assert.equal(seniority("en pass", "2026-10-21T12:00:00.000Z", "2026-10-21T12:20:00.000Z", { taken: null, pass: 600 })?.longue, false);
    // C'est la médiane de sa colonne qui compte : 20 min pris, sous les 30 ordinaires.
    assert.equal(seniority("pris", "2026-10-21T12:00:00.000Z", READ, CADENCE.medianSeconds)?.longue, false);
  });

  test("sans médiane, rien ne tranche, et le survol dit pourquoi ; ni âge pour un autre état, ni sans entrée connue", () => {
    const age = seniority("pris", "2026-10-20T12:20:00.000Z", READ, { taken: null, pass: null });
    assert.equal(age?.longue, false);
    assert.equal(age?.court, "1 d");
    assert.match(age?.dit ?? "", /no usual time yet/);
    assert.equal(seniority("pris", "2026-10-21T12:00:00.000Z", READ, undefined)?.longue, false);
    assert.equal(seniority("en attente", "2026-10-21T12:00:00.000Z", READ, CADENCE.medianSeconds), undefined);
    assert.equal(seniority("servi", "2026-10-21T12:00:00.000Z", READ, CADENCE.medianSeconds), undefined);
    assert.equal(seniority("pris", undefined, READ, CADENCE.medianSeconds), undefined);
  });

  test("une durée courte : minutes, heures, jours", () => {
    assert.deepEqual([0, 59_999, 60_000, 3_599_999, 3_600_000, 86_399_999, 86_400_000, 3 * 86_400_000].map(durationShort), ["0 min", "0 min", "1 min", "59 min", "1 h", "23 h", "1 d", "3 d"]);
  });
});

describe("de `facts` au rail", () => {
  const FACTS = {
    etat: "ouverte",
    lu: READ,
    dernierTick: READ,
    compteurs: { rail: 1, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 0 },
    dernierEvenement: null,
    rail: [
      { ticket: 14, etat: "pris", titre: "Ticket 14", url: "https://exemple.test/14", depuis: "2026-10-21T10:00:00.000Z", activite: null },
      { ticket: 15, etat: "en pass", titre: "Ticket 15", url: "https://exemple.test/15", depuis: "2026-10-21T12:15:00.000Z", activite: null },
      { ticket: 16, etat: "en attente", titre: "Ticket 16", url: "https://exemple.test/16", depuis: "2026-10-21T09:00:00.000Z", activite: null },
    ],
    cooks: [],
    attend: [],
    cadence: CADENCE,
  };
  const readOnes = (raw: unknown) => {
    const facts = understand(JSON.stringify(raw));
    assert.ok(!("informe" in facts), JSON.stringify(facts));
    return rail(facts as Facts);
  };
  const card = (readOne: ReturnType<typeof rail>, ticket: number) => readOne.colonnes.flatMap(({ cartes: cards }) => cards).find((setOne) => setOne.ticket === ticket);

  test("chaque carte de Taken et de Pass porte son âge — celle qui traîne tranche", () => {
    const readOne = readOnes(FACTS);
    assert.deepEqual(card(readOne, 14)?.age, seniority("pris", "2026-10-21T10:00:00.000Z", READ, CADENCE.medianSeconds));
    assert.equal(card(readOne, 14)?.age?.longue, true);
    assert.equal(card(readOne, 15)?.age?.longue, false);
    assert.equal(card(readOne, 16)?.age, undefined);
  });

  test("une carte de TODO n'en porte pas, même d'un ticket pris ou en pass : elle n'est ni dans Taken ni dans Pass", () => {
    const readOne = readOnes({ ...FACTS, attend: [{ ticket: 15, titre: "Ticket 15", url: "https://exemple.test/15" }] });
    assert.equal(readOne.colonnes.find(({ cartes: cards }) => cards.some(({ ticket }) => ticket === 15))?.nom, "Awaiting you");
    assert.equal(card(readOne, 15)?.age, undefined);
    assert.notEqual(card(readOne, 14)?.age, undefined);
  });

  test("d'un runtime d'avant ces champs : ni âge — le rail se dessine sans", () => {
    const { cadence: _, ...without } = FACTS;
    const readOne = readOnes({ ...without, rail: FACTS.rail.map(({ depuis: __, ...ticket }) => ticket) });
    assert.equal(card(readOne, 14)?.age, undefined);
    // Sans cadence lue, l'âge se dit encore, sans trancher.
    const withoutMedian = readOnes(without);
    assert.equal(card(withoutMedian, 14)?.age?.longue, false);
  });

  test("une entrée `depuis` qui n'est pas une heure rend le ticket illisible, comme tout champ mal formé", () => {
    const facts = understand(JSON.stringify({ ...FACTS, rail: [{ ...FACTS.rail[0], depuis: "hier" }] }));
    assert.ok(!("informe" in facts));
    assert.equal((facts as Facts).rail[0]?.illisible !== undefined, true);
  });
});

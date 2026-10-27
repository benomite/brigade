// À quelle allure la cuisine sert (#1811) : ce que l'app lit de `cadence` dans `facts`, l'histogramme qu'elle en range
// pour la vue, et l'âge de chaque carte de Taken et de Pass — qui tranche au-delà de deux fois l'ordinaire.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { anciennete, cadenceLue, dureeCourte, ECHELLE_MIN, HEURES, histogramme, NOM, type CadenceLue } from "../src/cadence.ts";
import { comprendre, rail, type Faits } from "../src/faits.ts";
import { heureHM } from "../src/format.ts";

const LU = "2026-10-21T12:20:00.000Z";
const debut = (rang: number) => new Date(Date.parse("2026-10-20T13:00:00.000Z") + rang * 3_600_000).toISOString();
const vides = () => Array.from({ length: HEURES }, (_, rang) => ({ at: debut(rang), served: 0, failed: 0 }));
const CADENCE: CadenceLue = {
  hours: vides().map((heure, rang) => (rang === 20 ? { ...heure, served: 3, failed: 1 } : rang === 23 ? { ...heure, served: 1 } : heure)),
  medianSeconds: { taken: 1800, pass: 600 },
};

describe("la lecture de `cadence`", () => {
  test("vingt-quatre heures et deux médianes : lues telles quelles, ce que le runtime y ajouterait laissé de côté", () => {
    assert.deepEqual(cadenceLue(CADENCE), CADENCE);
    assert.deepEqual(cadenceLue({ ...CADENCE, autre: 1, hours: CADENCE.hours.map((heure) => ({ ...heure, en: "plus" })) }), CADENCE);
    assert.deepEqual(cadenceLue({ ...CADENCE, medianSeconds: { taken: null, pass: null } })?.medianSeconds, { taken: null, pass: null });
  });

  test("une autre forme n'est pas lue : le rail se dessine sans, comme d'un runtime d'avant ce champ", () => {
    for (const mauvais of [
      undefined,
      null,
      [],
      { hours: CADENCE.hours },
      { ...CADENCE, hours: CADENCE.hours.slice(1) },
      { ...CADENCE, hours: [...CADENCE.hours.slice(1), { at: "hier", served: 0, failed: 0 }] },
      { ...CADENCE, hours: [...CADENCE.hours.slice(1), { at: LU, served: -1, failed: 0 }] },
      { ...CADENCE, hours: [...CADENCE.hours.slice(1), { at: LU, served: 0, failed: 0.5 }] },
      { ...CADENCE, medianSeconds: { taken: "1800", pass: null } },
    ]) {
      assert.equal(cadenceLue(mauvais), undefined, JSON.stringify(mauvais)?.slice(0, 80));
    }
  });
});

describe("l'histogramme", () => {
  test("vingt-quatre barres, l'heure en cours la dernière ; chacune dit son heure et ses deux comptes — le seul texte", () => {
    const { barres, nom } = histogramme(CADENCE);
    assert.equal(nom, NOM);
    assert.equal(barres.length, HEURES);
    assert.deepEqual(barres.map(({ enCours }) => enCours).lastIndexOf(true), HEURES - 1);
    assert.equal(barres.filter(({ enCours }) => enCours).length, 1);
    assert.equal(barres[20]?.dit, `${heureHM(debut(20))}–${heureHM(debut(21))} · 3 served · 1 failed`);
    assert.equal(barres[23]?.dit, `${heureHM(debut(23))}–now · 1 served · 0 failed`);
  });

  test("une heure sans rien est une case vide, à hauteur nulle — une suite de cases vides se voit", () => {
    const { barres } = histogramme(CADENCE);
    assert.deepEqual(barres.filter(({ vide }) => vide).length, HEURES - 2);
    assert.deepEqual(barres[0], { debut: debut(0), servis: 0, rates: 0, hautServis: 0, hautRates: 0, dit: `${heureHM(debut(0))}–${heureHM(debut(1))} · 0 served · 0 failed`, vide: true, enCours: false });
    assert.ok(histogramme({ ...CADENCE, hours: vides() }).barres.every(({ vide, hautServis, hautRates }) => vide && hautServis === 0 && hautRates === 0));
  });

  test("à l'échelle de l'heure la plus chargée — quatre au moins : servis en bas, ratés dessus", () => {
    const { barres } = histogramme(CADENCE);
    assert.equal(ECHELLE_MIN, 4);
    // L'heure la plus chargée compte quatre : pleine, trois quarts servis, un quart ratés.
    assert.deepEqual([barres[20]?.hautServis, barres[20]?.hautRates], [75, 25]);
    assert.deepEqual([barres[23]?.hautServis, barres[23]?.hautRates], [25, 0]);
    // Un seul ticket dans le jour ne fait pas un pic.
    const seul = histogramme({ ...CADENCE, hours: vides().map((heure, rang) => (rang === 5 ? { ...heure, served: 1 } : heure)) });
    assert.equal(seul.barres[5]?.hautServis, 25);
    // Plus chargé, l'échelle suit.
    const charge = histogramme({ ...CADENCE, hours: vides().map((heure, rang) => (rang === 5 ? { ...heure, served: 6, failed: 2 } : rang === 6 ? { ...heure, served: 2 } : heure)) });
    assert.deepEqual([charge.barres[5]?.hautServis, charge.barres[5]?.hautRates, charge.barres[6]?.hautServis], [75, 25, 25]);
  });
});

describe("l'âge d'une carte de Taken et de Pass", () => {
  test("court sur la carte, exact au survol, entre l'entrée dans la colonne et la lecture — deux heures de la box", () => {
    const age = anciennete("pris", "2026-10-21T11:58:00.000Z", LU, CADENCE.medianSeconds);
    assert.deepEqual(age, { court: "22 min", dit: `in Taken for 22 min, since ${heureHM("2026-10-21T11:58:00.000Z")} — usually 30 min (the median of the last 7 days)`, longue: false });
  });

  test("plus de deux fois la médiane de sa colonne : elle tranche — deux fois pile, pas encore", () => {
    assert.equal(anciennete("en pass", "2026-10-21T11:59:00.000Z", LU, CADENCE.medianSeconds)?.longue, true);
    assert.equal(anciennete("en pass", "2026-10-21T11:59:00.000Z", LU, CADENCE.medianSeconds)?.dit, `in Pass for 21 min, since ${heureHM("2026-10-21T11:59:00.000Z")} — usually 10 min (the median of the last 7 days) — more than twice that`);
    assert.equal(anciennete("en pass", "2026-10-21T12:00:00.000Z", "2026-10-21T12:20:00.000Z", { taken: null, pass: 599 })?.longue, true);
    assert.equal(anciennete("en pass", "2026-10-21T12:00:00.000Z", "2026-10-21T12:20:00.000Z", { taken: null, pass: 600 })?.longue, false);
    // C'est la médiane de sa colonne qui compte : 20 min pris, sous les 30 ordinaires.
    assert.equal(anciennete("pris", "2026-10-21T12:00:00.000Z", LU, CADENCE.medianSeconds)?.longue, false);
  });

  test("sans médiane, rien ne tranche, et le survol dit pourquoi ; ni âge pour un autre état, ni sans entrée connue", () => {
    const age = anciennete("pris", "2026-10-20T12:20:00.000Z", LU, { taken: null, pass: null });
    assert.equal(age?.longue, false);
    assert.equal(age?.court, "1 d");
    assert.match(age?.dit ?? "", /no usual time yet/);
    assert.equal(anciennete("pris", "2026-10-21T12:00:00.000Z", LU, undefined)?.longue, false);
    assert.equal(anciennete("en attente", "2026-10-21T12:00:00.000Z", LU, CADENCE.medianSeconds), undefined);
    assert.equal(anciennete("servi", "2026-10-21T12:00:00.000Z", LU, CADENCE.medianSeconds), undefined);
    assert.equal(anciennete("pris", undefined, LU, CADENCE.medianSeconds), undefined);
  });

  test("une durée courte : minutes, heures, jours", () => {
    assert.deepEqual([0, 59_999, 60_000, 3_599_999, 3_600_000, 86_399_999, 86_400_000, 3 * 86_400_000].map(dureeCourte), ["0 min", "0 min", "1 min", "59 min", "1 h", "23 h", "1 d", "3 d"]);
  });
});

describe("de `facts` au rail", () => {
  const FAITS = {
    etat: "ouverte",
    lu: LU,
    dernierTick: LU,
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
  const lus = (brut: unknown) => {
    const faits = comprendre(JSON.stringify(brut));
    assert.ok(!("informe" in faits), JSON.stringify(faits));
    return rail(faits as Faits);
  };
  const carte = (lu: ReturnType<typeof rail>, ticket: number) => lu.colonnes.flatMap(({ cartes }) => cartes).find((posee) => posee.ticket === ticket);

  test("le rail porte l'histogramme, et chaque carte de Taken et de Pass son âge — celle qui traîne tranche", () => {
    const lu = lus(FAITS);
    assert.deepEqual(lu.cadence, histogramme(CADENCE));
    assert.deepEqual(carte(lu, 14)?.age, anciennete("pris", "2026-10-21T10:00:00.000Z", LU, CADENCE.medianSeconds));
    assert.equal(carte(lu, 14)?.age?.longue, true);
    assert.equal(carte(lu, 15)?.age?.longue, false);
    assert.equal(carte(lu, 16)?.age, undefined);
  });

  test("une carte de TODO n'en porte pas, même d'un ticket pris ou en pass : elle n'est ni dans Taken ni dans Pass", () => {
    const lu = lus({ ...FAITS, attend: [{ ticket: 15, titre: "Ticket 15", url: "https://exemple.test/15" }] });
    assert.equal(lu.colonnes.find(({ cartes }) => cartes.some(({ ticket }) => ticket === 15))?.nom, "TODO");
    assert.equal(carte(lu, 15)?.age, undefined);
    assert.notEqual(carte(lu, 14)?.age, undefined);
  });

  test("d'un runtime d'avant ces champs : ni histogramme, ni âge — le rail se dessine sans", () => {
    const { cadence: _, ...sans } = FAITS;
    const lu = lus({ ...sans, rail: FAITS.rail.map(({ depuis: __, ...ticket }) => ticket) });
    assert.equal(lu.cadence, undefined);
    assert.equal(carte(lu, 14)?.age, undefined);
    // Sans cadence lue, l'âge se dit encore, sans trancher.
    const sansMediane = lus(sans);
    assert.equal(sansMediane.cadence, undefined);
    assert.equal(carte(sansMediane, 14)?.age?.longue, false);
  });

  test("une entrée `depuis` qui n'est pas une heure rend le ticket illisible, comme tout champ mal formé", () => {
    const faits = comprendre(JSON.stringify({ ...FAITS, rail: [{ ...FAITS.rail[0], depuis: "hier" }] }));
    assert.ok(!("informe" in faits));
    assert.equal((faits as Faits).rail[0]?.illisible !== undefined, true);
  });
});

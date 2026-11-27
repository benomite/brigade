// L'app hors ligne (#1818) : sans réseau, tout ce qu'elle lit du tableau de la cuisine rate d'un coup. Une seule cause,
// qui n'est pas une panne : la bande se tait — ni « not verified », ni signal —, le dernier état lu n'est pas jeté, et ce
// qui est à venir ne dit pas qu'il n'a pas été lu. GitHub joint de nouveau, tout se relit ; une vraie panne — le tableau
// illisible — revient dans la bande comme avant.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { holdBands } from "../src/alerts.ts";
import { see as seeUpstream } from "../src/upstream.ts";
import { putAside } from "../src/awaiting.ts";
import type { Reading } from "../src/box.ts";
import { isOutsideLine, holdFacts, type Facts } from "../src/facts.ts";

const PARADE = "parade";
const a = (minute: number) => `2026-10-27T13:${String(minute).padStart(2, "0")}:00.000Z`;
const FACTS: Facts = {
  etat: "ouverte",
  lu: a(0),
  dernierTick: a(0),
  compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: null }],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
};
const STATUS = ["projet     parade", "cuisine    ouverte", "", "rail       1 pris", "  #14  pris  prio:1  par box/claude depuis 12 min  Le journal en ajout seul", ""].join("\n");
const readEntry = (command: string, text: string, minute: number): Reading => ({ projet: PARADE, demande: 1, a: a(minute), sorties: [{ commande: command, texte: text }] });
// Ce que la veille du tableau rend sans réseau (board/rail.ts), et ce qu'elle rend d'un tableau joint mais illisible.
const outsideLine = (minute: number): Reading => ({ projet: PARADE, demande: 1, a: a(minute), erreur: "GitHub could not be reached to read the Kitchen board of benomite/parade: fetch failed.", atteinte: true, cas: null, duTableau: true, horsLigne: true });
const unreadable = (minute: number): Reading => ({ projet: PARADE, demande: 1, a: a(minute), erreur: "The Kitchen board of benomite/parade (issue 7) cannot be read: no machine block.", atteinte: true, cas: null, duTableau: true });

// Un tour de veille : `faits` et `status`, d'une même lecture du tableau.
function tour(bands: ReturnType<typeof holdBands>, reading: (command: string) => Reading) {
  bands.faits(reading("facts"));
  return bands.status(putAside(reading("status")));
}
const inLine = (minute: number) => (command: string) => readEntry(command, command === "facts" ? JSON.stringify(FACTS) : STATUS, minute);

describe("la bande, hors ligne (#1818)", () => {
  test("ni « not verified », ni signal, ni « open Settings » : la bande se tait et dit depuis quand", () => {
    const bands = holdBands({ minimum: 0 });
    bands.ouvrir([PARADE]);
    assert.deepEqual(tour(bands, inLine(0)).alertes, []);
    // Trois tours sans réseau : avant #1818, deux suffisaient à poser trois lignes « not verified ».
    for (const minute of [1, 2, 3]) {
      const band = tour(bands, () => outsideLine(minute));
      assert.deepEqual(band.alertes, []);
      assert.equal(band.signal, undefined);
      assert.equal(band.horsLigne, a(1));
    }
  });

  test("le réseau revenu, une vraie panne se dit comme avant ; le tableau relu, la bande redevient vide", () => {
    const bands = holdBands({ minimum: 0 });
    bands.ouvrir([PARADE]);
    tour(bands, inLine(0));
    tour(bands, () => outsideLine(1));
    tour(bands, () => outsideLine(2));
    // GitHub répond, mais le tableau ne se lit pas : c'est une panne, établie en deux lectures.
    tour(bands, () => unreadable(3));
    const outage = tour(bands, () => unreadable(4));
    assert.equal(outage.horsLigne, undefined);
    assert.deepEqual(outage.alertes.map(({ dit: said }) => said).sort(), ["kitchen state not verified"]);
    assert.equal(outage.signal?.etat, "non-verifie");
    const back = tour(bands, inLine(5));
    assert.deepEqual(back.alertes, []);
    assert.equal(back.horsLigne, undefined);
  });

  test("une lecture qui n'a pas atteint la station ne dit rien du réseau : l'app reste hors ligne", () => {
    const bands = holdBands({ minimum: 0 });
    tour(bands, () => outsideLine(1));
    const band = bands.status({ projet: PARADE, demande: 1, a: a(2), erreur: "$ brigade parade status\nconnect to host box port 22: Network is unreachable\n→ exit code 255", atteinte: false, cas: null });
    assert.equal(band.horsLigne, a(1));
    assert.deepEqual(band.alertes, []);
  });
});

describe("les faits, hors ligne (#1818)", () => {
  test("le dernier état lu n'est pas jeté : ni ses faits, ni son `status` ; la lecture hors ligne se dit comme telle", () => {
    const facts = holdFacts();
    facts.recevoir(readEntry("facts", JSON.stringify(FACTS), 0));
    assert.ok(facts.attendre(putAside(readEntry("status", STATUS, 0))) !== undefined);
    const receivedOne = facts.recevoir(outsideLine(1));
    assert.ok(isOutsideLine(receivedOne));
    assert.equal(facts.attendre(putAside(outsideLine(1))), undefined);
    const keptOne = facts.redessiner(PARADE);
    assert.ok(keptOne !== undefined && "tableau" in keptOne);
    assert.equal(keptOne.a, a(0));
    assert.equal(facts.adresse(PARADE, 14), "https://github.com/benomite/brigade/issues/14");
    // Une vraie panne du tableau ne retire rien non plus (#2151) : GitHub tient encore ce qui était lu.
    facts.recevoir(unreadable(2));
    assert.equal(facts.attendre(putAside(unreadable(2))), undefined);
    const always = facts.redessiner(PARADE);
    assert.ok(always !== undefined && "tableau" in always);
    assert.equal(facts.adresse(PARADE, 14), "https://github.com/benomite/brigade/issues/14");
  });

  test("ce qui est à venir ne dit pas « not read » hors ligne", () => {
    const seenOne = seeUpstream(outsideLine(1));
    assert.ok("nonPublie" in seenOne);
    assert.ok(!("sans" in seenOne));
  });
});

// L'app hors ligne (#1818) : sans réseau, tout ce qu'elle lit du tableau de la cuisine rate d'un coup. Une seule cause,
// qui n'est pas une panne : la bande se tait — ni « not verified », ni signal —, le dernier état lu n'est pas jeté, et ce
// qui est à venir ne dit pas qu'il n'a pas été lu. GitHub joint de nouveau, tout se relit ; une vraie panne — le tableau
// illisible — revient dans la bande comme avant.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tenirBandes } from "../src/alertes.ts";
import { voir as voirAmont } from "../src/amont.ts";
import { mettreAPart } from "../src/attend.ts";
import type { Lecture } from "../src/box.ts";
import { estHorsLigne, tenirFaits, type Faits } from "../src/faits.ts";

const PARADE = "parade";
const a = (minute: number) => `2026-10-27T13:${String(minute).padStart(2, "0")}:00.000Z`;
const FAITS: Faits = {
  etat: "ouverte",
  lu: a(0),
  dernierTick: a(0),
  compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: null }],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
};
const STATUS = ["projet     parade", "cuisine    ouverte", "", "rail       1 pris", "  #14  pris  prio:1  par box/claude depuis 12 min  Le journal en ajout seul", ""].join("\n");
const lue = (commande: string, texte: string, minute: number): Lecture => ({ projet: PARADE, demande: 1, a: a(minute), sorties: [{ commande, texte }] });
// Ce que la veille du tableau rend sans réseau (tableau/rail.ts), et ce qu'elle rend d'un tableau joint mais illisible.
const horsLigne = (minute: number): Lecture => ({ projet: PARADE, demande: 1, a: a(minute), erreur: "GitHub could not be reached to read the Kitchen board of benomite/parade: fetch failed.", atteinte: true, cas: null, duTableau: true, horsLigne: true });
const illisible = (minute: number): Lecture => ({ projet: PARADE, demande: 1, a: a(minute), erreur: "The Kitchen board of benomite/parade (issue 7) cannot be read: no machine block.", atteinte: true, cas: null, duTableau: true });

// Un tour de veille : `faits`, le manager et `status`, d'une même lecture du tableau.
function tour(bandes: ReturnType<typeof tenirBandes>, lecture: (commande: string) => Lecture) {
  bandes.faits(lecture("facts"));
  bandes.manager(lecture("manager"));
  return bandes.status(mettreAPart(lecture("status")));
}
const enLigne = (minute: number) => (commande: string) => lue(commande, commande === "facts" ? JSON.stringify(FAITS) : commande === "manager" ? "manager    ON — new tickets are taken\n" : STATUS, minute);

describe("la bande, hors ligne (#1818)", () => {
  test("ni « not verified », ni signal, ni « open Settings » : la bande se tait, dit depuis quand, et garde l'interrupteur lu", () => {
    const bandes = tenirBandes({ minimum: 0 });
    bandes.ouvrir([PARADE]);
    assert.deepEqual(tour(bandes, enLigne(0)).alertes, []);
    // Trois tours sans réseau : avant #1818, deux suffisaient à poser trois lignes « not verified ».
    for (const minute of [1, 2, 3]) {
      const bande = tour(bandes, () => horsLigne(minute));
      assert.deepEqual(bande.alertes, []);
      assert.equal(bande.signal, undefined);
      assert.equal(bande.horsLigne, a(1));
      assert.ok(bande.manager !== undefined && "allume" in bande.manager && bande.manager.allume, JSON.stringify(bande.manager));
    }
  });

  test("le réseau revenu, une vraie panne se dit comme avant ; le tableau relu, la bande redevient vide", () => {
    const bandes = tenirBandes({ minimum: 0 });
    bandes.ouvrir([PARADE]);
    tour(bandes, enLigne(0));
    tour(bandes, () => horsLigne(1));
    tour(bandes, () => horsLigne(2));
    // GitHub répond, mais le tableau ne se lit pas : c'est une panne, établie en deux lectures.
    tour(bandes, () => illisible(3));
    const panne = tour(bandes, () => illisible(4));
    assert.equal(panne.horsLigne, undefined);
    assert.deepEqual(panne.alertes.map(({ dit }) => dit).sort(), ["grant state not verified", "kitchen state not verified", "project switch not verified"]);
    assert.equal(panne.signal?.etat, "non-verifie");
    const revenue = tour(bandes, enLigne(5));
    assert.deepEqual(revenue.alertes, []);
    assert.equal(revenue.horsLigne, undefined);
  });

  test("une lecture qui n'a pas atteint la station ne dit rien du réseau : l'app reste hors ligne", () => {
    const bandes = tenirBandes({ minimum: 0 });
    tour(bandes, () => horsLigne(1));
    const bande = bandes.manager({ projet: PARADE, demande: 1, a: a(2), erreur: "$ brigade parade manager\nconnect to host box port 22: Network is unreachable\n→ exit code 255", atteinte: false, cas: null });
    assert.equal(bande.horsLigne, a(1));
    assert.deepEqual(bande.alertes, []);
  });
});

describe("les faits, hors ligne (#1818)", () => {
  test("le dernier état lu n'est pas jeté : ni ses faits, ni son `status` ; la lecture hors ligne se dit comme telle", () => {
    const faits = tenirFaits();
    faits.recevoir(lue("facts", JSON.stringify(FAITS), 0));
    assert.ok(faits.attendre(mettreAPart(lue("status", STATUS, 0))) !== undefined);
    const recue = faits.recevoir(horsLigne(1));
    assert.ok(estHorsLigne(recue));
    assert.equal(faits.attendre(mettreAPart(horsLigne(1))), undefined);
    const gardee = faits.redessiner(PARADE);
    assert.ok(gardee !== undefined && "tableau" in gardee);
    assert.equal(gardee.a, a(0));
    assert.equal(faits.adresse(PARADE, 14), "https://github.com/benomite/brigade/issues/14");
    // Une vraie panne, elle, retire ce qui était lu, comme avant.
    faits.recevoir(illisible(2));
    assert.equal(faits.redessiner(PARADE), undefined);
  });

  test("ce qui est à venir ne dit pas « not read » hors ligne", () => {
    const vu = voirAmont(horsLigne(1));
    assert.ok("nonPublie" in vu);
    assert.ok(!("sans" in vu));
  });
});

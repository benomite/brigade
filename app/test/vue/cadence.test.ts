// Sur le rail (#1811) : l'âge des cartes de Taken et de Pass, et leurs essais — l'histogramme des 24 heures a quitté la
// tête du rail avec la bande de chiffres (#3013). La vue jouée telle qu'elle est, devant un faux
// document (aides/fausse-vue.ts), sur ce que le process principal range des faits de la box (faits.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { HEURES, type CadenceLue } from "../../src/cadence.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { poserAge, poserEssais } from "../../src/vue/cadence.js";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T12:20:01.000Z";
const LU = "2026-10-21T12:20:00.000Z";
const PARADE = "parade";
const debut = (rang: number) => new Date(Date.parse("2026-10-20T13:00:00.000Z") + rang * 3_600_000).toISOString();
const CADENCE: CadenceLue = {
  hours: Array.from({ length: HEURES }, (_, rang) => ({ at: debut(rang), served: rang === 20 ? 3 : rang === 23 ? 1 : 0, failed: rang === 20 ? 1 : 0 })),
  medianSeconds: { taken: 1800, pass: 600 },
};

const FAITS: Faits = {
  etat: "ouverte",
  lu: LU,
  dernierTick: LU,
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

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
function recevoir(vue: Jouee, faits: unknown = FAITS) {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}
const bon = (vue: Jouee, ticket: number) => vue.element("rail").dessous("li").find((pose) => pose.className === "bon" && pose.textContent.includes(`#${ticket}`));
const age = (pose: Faux | undefined) => pose?.dessous("span").find((posee) => posee.className === "age");

describe("l'âge des cartes de Taken et de Pass", () => {
  test("chaque carte dit depuis combien de temps elle y est ; son âge exact au survol", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    await ouvrirOnglet(vue, "Rail");
    const pris = age(bon(vue, 15)) ?? assert.fail("pas d'âge sur #15");
    assert.equal(pris.textContent, "15 min");
    assert.match(pris.title, /^in Taken for 15 min, since \d\d:\d\d — usually 30 min/);
    const enPass = age(bon(vue, 16)) ?? assert.fail("pas d'âge sur #16");
    assert.equal(enPass.textContent, "5 min");
    assert.match(enPass.title, /^in Pass for 5 min/);
  });

  test("bien plus longtemps que d'ordinaire — plus de deux fois la médiane —, la carte tranche par sa couleur", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    await ouvrirOnglet(vue, "Rail");
    const traine = bon(vue, 14) ?? assert.fail("pas de carte #14");
    assert.equal(traine.dataset.traine, "");
    assert.equal(age(traine)?.dataset.longue, "");
    assert.equal(age(traine)?.textContent, "2 h");
    for (const ticket of [15, 16]) {
      assert.equal(bon(vue, ticket)?.dataset.traine, undefined);
      assert.equal(age(bon(vue, ticket))?.dataset.longue, undefined);
    }
  });
});

describe("les essais d'une carte, un point chacun", () => {
  const essai = (depuis: string, jusqua: string | null, arret: string | null) => ({ depuis, jusqua, arret, enCours: jusqua === null });
  const TROIS = [
    essai("2026-10-21T11:30:00.000Z", "2026-10-21T11:47:00.000Z", "tokens"),
    essai("2026-10-21T11:47:10.000Z", "2026-10-21T12:02:00.000Z", "idle"),
    essai("2026-10-21T12:02:10.000Z", null, null),
  ];
  const faits = (rail: unknown[]) => ({ ...FAITS, rail, cadence: { ...CADENCE, medianSeconds: { taken: 1200, pass: 600 } } });
  const points = (pose: Faux | undefined) => pose?.dessous("span").filter((posee) => posee.className === "essai") ?? [];

  test("un ticket pris depuis cinquante minutes sur trois essais : `50 min` et la couleur lente, trois points", async () => {
    const vue = await ouvrir();
    recevoir(vue, faits([{ ticket: 34, etat: "pris", titre: "Ticket 34", url: "https://exemple.test/34", depuis: "2026-10-21T11:30:00.000Z", essais: TROIS, activite: null }]));
    await ouvrirOnglet(vue, "Rail");
    const carte = bon(vue, 34) ?? assert.fail("pas de carte #34");
    assert.equal(age(carte)?.textContent, "50 min");
    assert.equal(age(carte)?.dataset.longue, "");
    const ronds = points(carte);
    assert.equal(ronds.length, 3);
    assert.deepEqual(ronds.map((rond) => rond.dataset.enCours), [undefined, undefined, ""]);
    assert.equal(ronds[0]?.title, "attempt 1 of 3 — stopped after 17 min: tokens");
    assert.equal(ronds[1]?.title, "attempt 2 of 3 — stopped after 14 min: idle");
    assert.equal(ronds[2]?.title, "attempt 3 of 3 — cooking now");
  });

  test("un seul essai : aucun point, mais l'âge", async () => {
    const vue = await ouvrir();
    recevoir(vue, faits([{ ticket: 35, etat: "pris", titre: "Ticket 35", url: "https://exemple.test/35", depuis: "2026-10-21T12:05:00.000Z", essais: [essai("2026-10-21T12:05:00.000Z", null, null)], activite: null }]));
    await ouvrirOnglet(vue, "Rail");
    const carte = bon(vue, 35) ?? assert.fail("pas de carte #35");
    assert.equal(age(carte)?.textContent, "15 min");
    assert.equal(points(carte).length, 0);
  });

  test("la même chose sur une carte de Pass", async () => {
    const vue = await ouvrir();
    recevoir(vue, faits([{ ticket: 36, etat: "en pass", titre: "Ticket 36", url: "https://exemple.test/36", depuis: "2026-10-21T12:15:00.000Z", essais: TROIS.slice(0, 2).map((e, i) => (i === 1 ? { ...e, enCours: true, jusqua: null, arret: null } : e)), activite: null }]));
    await ouvrirOnglet(vue, "Rail");
    const carte = bon(vue, 36) ?? assert.fail("pas de carte #36");
    assert.equal(age(carte)?.textContent, "5 min");
    assert.equal(points(carte).length, 2);
  });

  test("un runtime d'avant `essais` : l'âge seul", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    await ouvrirOnglet(vue, "Rail");
    assert.equal(points(bon(vue, 15)).length, 0);
  });
});

test("le module se lit seul, sur un faux document", () => {
  const doc = { createElement: (balise: string) => new Faux(balise) };
  const posee = poserAge(doc as never, { court: "3 h", dit: "in Taken for 3 h 02", longue: true }) as Faux;
  assert.deepEqual([posee.textContent, posee.title, posee.dataset.longue], ["3 h", "in Taken for 3 h 02", ""]);
  const essais = poserEssais(doc as never, [{ enCours: false, dit: "attempt 1 of 2 — stopped after 3 min: turns" }, { enCours: true, dit: "attempt 2 of 2 — cooking now" }]) as Faux;
  assert.deepEqual(essais.dessous("span").map((rond) => rond.title), ["attempt 1 of 2 — stopped after 3 min: turns", "attempt 2 of 2 — cooking now"]);
});

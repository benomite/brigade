// En tête de l'onglet Cooks (#1272) : les tickets du projet servis, renvoyés et remontés au chef, dans la dernière
// heure et le dernier jour. La vue jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts), sur ce que
// le process principal range des faits de la box (faits.ts). Six nombres ; sans activité, six « 0 », jamais un blanc.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { activiteCuisineLue, BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { COMPTES, FENETRES, poserLActivite, TITRE } from "../../src/vue/activite-cuisine.js";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const ZERO = { served: 0, sentBack: 0, escalated: 0 };
const ACTIVITE = { lastHour: { served: 1, sentBack: 2, escalated: 0 }, lastDay: { served: 3, sentBack: 4, escalated: 1 } };

const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 3 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
  activiteCuisine: ACTIVITE,
};

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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
// Les faits que la box rend, en JSON, passés par le process principal tel qu'il est : la vue reçoit ce qu'il range.
function recevoir(vue: Jouee, faits: unknown = FAITS) {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}
const activite = (vue: Jouee) => vue.element("rail").dessous("section").find((pose) => pose.className === "activite-cuisine");
// Le tableau tel qu'il se lit : la tête de ses colonnes, puis chaque ligne — sa fenêtre et ses trois nombres.
const lu = (pose: Faux) => pose.dessous("tr").map((ligne) => ligne.children.map((cellule) => cellule.textContent));

describe("l'activité de la cuisine, en tête de l'onglet Cooks", () => {
  test("six nombres : servis, renvoyés, remontés — pour la dernière heure et le dernier jour", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    await ouvrirOnglet(vue, "Cooks");
    const pose = activite(vue) ?? assert.fail("pas d'activité sur Cooks");
    assert.deepEqual(lu(pose), [
      ["", "served", "sent back", "escalated"],
      ["last hour", "1", "2", "0"],
      ["last day", "3", "4", "1"],
    ]);
    assert.equal(pose.dessous("h4")[0]?.textContent?.startsWith(TITRE), true);
    // En tête de l'onglet : au-dessus de la carte du projet et de ses stations — entre les deux, ses gates (#1318).
    const rail = vue.element("rail");
    assert.equal(rail.children[0]?.id, "activite-du-projet");
    assert.ok(rail.children.findIndex((pose) => pose.className === "carte") > 0);
  });

  test("sans activité, les six nombres disent 0, jamais un blanc", async () => {
    const vue = await ouvrir();
    recevoir(vue, { ...FAITS, activiteCuisine: { lastHour: ZERO, lastDay: ZERO } });
    await ouvrirOnglet(vue, "Cooks");
    const pose = activite(vue) ?? assert.fail("pas d'activité sur Cooks");
    assert.deepEqual(lu(pose).slice(1), [
      ["last hour", "0", "0", "0"],
      ["last day", "0", "0", "0"],
    ]);
  });

  test("elle est sur Cooks seulement : l'onglet Rail n'en pose rien", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    await ouvrirOnglet(vue, "Rail");
    assert.equal(activite(vue), undefined);
    await ouvrirOnglet(vue, "Cooks");
    assert.notEqual(activite(vue), undefined);
  });

  test("un runtime qui ne la donne pas, ou la donne sous une autre forme, n'en fait rien poser — le reste de Cooks se dessine", async () => {
    const vue = await ouvrir();
    const { activiteCuisine: _, ...sans } = FAITS;
    recevoir(vue, sans);
    await ouvrirOnglet(vue, "Cooks");
    assert.equal(activite(vue), undefined);
    assert.equal(vue.element("rail").children.some((pose) => pose.className === "carte"), true);
    recevoir(vue, { ...FAITS, activiteCuisine: { lastHour: { served: "1", sentBack: 0, escalated: 0 }, lastDay: ZERO } });
    assert.equal(activite(vue), undefined);
  });

  test("la lecture du champ : deux fenêtres de trois nombres entiers, positifs — sinon rien", () => {
    assert.deepEqual(activiteCuisineLue(ACTIVITE), ACTIVITE);
    // Ce que le runtime pourrait y ajouter n'est pas repris.
    assert.deepEqual(activiteCuisineLue({ ...ACTIVITE, lastWeek: ZERO, lastHour: { ...ACTIVITE.lastHour, other: 3 } }), ACTIVITE);
    for (const mauvais of [undefined, null, 3, [], { lastHour: ZERO }, { lastHour: ZERO, lastDay: { ...ZERO, escalated: -1 } }, { lastHour: { ...ZERO, served: 1.5 }, lastDay: ZERO }]) {
      assert.equal(activiteCuisineLue(mauvais), undefined, JSON.stringify(mauvais));
    }
  });

  test("le module se lit seul, sur un faux document : un titre, une tête de trois colonnes, deux lignes", () => {
    const doc = { createElement: (balise: string) => new Faux(balise) };
    const pose = poserLActivite(doc as never, { lastHour: ZERO, lastDay: ZERO }) as Faux | null;
    assert.equal(pose?.dessous("th").length, COMPTES.length + FENETRES.length);
    assert.deepEqual(pose?.dessous("tr").map((ligne) => ligne.dataset.fenetre), [undefined, "lastHour", "lastDay"]);
    assert.equal(poserLActivite(doc as never, undefined), null);
  });
});

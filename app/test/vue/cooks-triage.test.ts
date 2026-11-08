// Le triage, jour par jour, sur l'onglet Cooks (#1457) : en détail, et en une ligne quand il n'a rien à dire
// (docs/revue-page-cooks.md). La vue jouée devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { RIEN, SANS_JOUR, TITRE } from "../../src/vue/triage.js";
import { jouerLaVue, ouvrirOnglet, repos, type Faux, type Jouee } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";

const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};
const JOURS = [
  { day: "2026-10-20", decidedAlone: 5, sentToTodo: 2 },
  { day: "2026-10-21", decidedAlone: 2, sentToTodo: 1 },
];
const ZEROS = JOURS.map(({ day }) => ({ day, decidedAlone: 0, sentToTodo: 0 }));

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
async function cooks(faits: Record<string, unknown>) {
  const vue = await ouvrir();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, ...faits }) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Cooks");
  return vue;
}
const ancre = (vue: Jouee, id: string) => vue.element(id);

describe("le triage, sur l'onglet Cooks", () => {
  test("triage : replié sous le plafond de calibrage, fermé, une ligne avec les deux nombres du jour — l'ouvrir montre les jours", async () => {
    const vue = await cooks({ triage: JOURS });
    const ids = vue.element("rail").children.map(({ id }) => id);
    assert.ok(ids.indexOf("triage-du-projet") > ids.indexOf("plafond-du-projet"), ids.join(", "));
    assert.ok(ids.indexOf("triage-du-projet") < ids.indexOf("appris-du-projet"), ids.join(", "));
    const replie = ancre(vue, "triage-du-projet").children[0] ?? assert.fail("pas de bloc replié");
    assert.deepEqual([replie.balise, replie.className, Reflect.get(replie, "open")], ["details", "replie", false]);
    assert.equal(replie.dessous("summary")[0]?.textContent, `${TITRE}today: 2 decided alone · 1 sent to TODO`);
    assert.deepEqual(replie.dessous("li").map((ligne) => ligne.children[0]?.textContent), ["today", "yesterday"]);
  });

  test("triage tout à zéro, ou sans jour : une ligne, rien à ouvrir", async () => {
    for (const [triage, dit] of [[ZEROS, RIEN], [undefined, SANS_JOUR]] as const) {
      const vue = await cooks(triage === undefined ? {} : { triage });
      const bloc = ancre(vue, "triage-du-projet");
      assert.equal(bloc.dessous("details").length, 0);
      assert.equal(bloc.dessous("li").length, 0);
      assert.match(bloc.dessous("p")[0]?.textContent ?? "", new RegExp(dit));
    }
  });
});

describe("l'onglet Rail, sans rien qui retienne les tickets", () => {
  async function rail(faits: Record<string, unknown>) {
    const vue = await cooks(faits);
    await ouvrirOnglet(vue, "Rail");
    return vue;
  }
  const blocs = (vue: Jouee) => vue.element("rail").dessous("section").map(({ className }) => className);

  test("rien ne retient les tickets : ni ligne d'alerte, ni triage — le kanban seul", async () => {
    const vue = await rail({ triage: JOURS });
    assert.equal(vue.element("rail").dessous("p").some(({ className }) => className === "alerte-de-cuisine"), false);
    assert.equal(blocs(vue).includes("triage"), false);
    assert.ok(blocs(vue).includes("colonne"));
  });
});

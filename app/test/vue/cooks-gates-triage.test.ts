// Le budget des gates et le triage, jour par jour, sur l'onglet Cooks (#1457) : chaque bloc en détail, et en une ligne
// quand il n'a rien à dire (docs/revue-page-cooks.md). La vue jouée devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { HORS_BUDGET, TITRE_FILE, TITRE_JOUR } from "../../src/vue/cout-des-gates.js";
import { RIEN, SANS_JOUR, TITRE } from "../../src/vue/triage.js";
import { jouerLaVue, ouvrirOnglet, repos, type Faux, type Jouee } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";

const LATEST = { project: PARADE, ticket: 30, runner: "pass", outcome: "green", durationSeconds: 62.4, cpuSeconds: 180.5, at: "2026-10-21T09:58:40.000Z" };
const SOUS_LE_BUDGET = {
  budget: { durationSeconds: 100, cpuSeconds: 400, parLeChef: { durationSeconds: false, cpuSeconds: false } },
  latest: LATEST,
  overBudget: false,
  lastDay: { runs: 3, durationSeconds: 190.2, cpuSeconds: 560.7 },
  ticket: null,
};
const HORS_DU_BUDGET = { ...SOUS_LE_BUDGET, latest: { ...LATEST, durationSeconds: 214.6 }, overBudget: true, ticket: { number: 31, openedAt: A, exceeded: ["duration"] } };
const SANS_PASSAGE = { ...SOUS_LE_BUDGET, latest: null, lastDay: { runs: 0, durationSeconds: 0, cpuSeconds: 0 } };

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
async function cooks(faits: Record<string, unknown>) {
  const vue = await ouvrir();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, ...faits }) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Cooks");
  return vue;
}
const ancre = (vue: Jouee, id: string) => vue.element(id);

describe("le budget des gates et le triage, sur l'onglet Cooks", () => {
  test("gates hors budget : le bloc entier — passage face au budget, ticket ouvert seul, tableau de l'heure et du jour", async () => {
    const vue = await cooks({ coutDesGates: HORS_DU_BUDGET });
    const bloc = ancre(vue, "gates-du-projet");
    const file = bloc.dessous("section").find(({ className }) => className === "gates-de-la-file") ?? assert.fail("pas de gates");
    assert.equal(file.dessous("h4")[0]?.textContent?.startsWith(TITRE_FILE), true);
    assert.match(file.textContent, new RegExp(HORS_BUDGET));
    assert.match(file.textContent, /215 s/);
    assert.match(file.textContent, /the kitchen opened/);
    assert.equal(file.dessous("button").some(({ textContent }) => textContent === "#31"), true);
    assert.ok(bloc.dessous("section").some(({ className }) => className === "jour-des-gates"));
    assert.equal(bloc.dessous("h4").some(({ textContent }) => textContent.startsWith(TITRE_JOUR)), true);
  });

  test("gates sous le budget, sans ticket : une ligne, pas de tableau ni de marque", async () => {
    const vue = await cooks({ coutDesGates: SOUS_LE_BUDGET });
    const file = ancre(vue, "gates-du-projet").dessous("section").find(({ className }) => className === "gates-de-la-file") ?? assert.fail("pas de gates");
    assert.equal(file.dessous("p").filter(({ className }) => className === "une-ligne").length, 1);
    assert.equal(file.dessous("h4").length, 0);
    assert.equal(file.dessous("table").length, 0);
    assert.match(file.textContent, /within budget · time 62 s \/ 100 s, CPU 181 s \/ 400 s/);
  });

  test("gates sans passage : une ligne qui le dit", async () => {
    const vue = await cooks({ coutDesGates: SANS_PASSAGE });
    const file = ancre(vue, "gates-du-projet").dessous("section").find(({ className }) => className === "gates-de-la-file") ?? assert.fail("pas de gates");
    assert.match(file.textContent, /no run yet/);
    assert.equal(file.dessous("table").length, 0);
  });

  test("triage : replié sous les rôles, fermé, une ligne avec les deux nombres du jour — l'ouvrir montre les jours", async () => {
    const vue = await cooks({ triage: JOURS });
    const ids = vue.element("rail").children.map(({ id }) => id);
    assert.ok(ids.indexOf("triage-du-projet") > ids.indexOf("roles-du-projet"), ids.join(", "));
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

describe("la ligne d'alerte de Rail, quand les gates retiennent les tickets (#1458)", () => {
  async function rail(faits: Record<string, unknown>) {
    const vue = await cooks(faits);
    await ouvrirOnglet(vue, "Rail");
    return vue;
  }
  const blocs = (vue: Jouee) => vue.element("rail").dessous("section").map(({ className }) => className);

  test("rien ne retient les tickets : ni ligne d'alerte, ni bloc des gates, ni triage — le kanban seul", async () => {
    const vue = await rail({ coutDesGates: SOUS_LE_BUDGET, triage: JOURS });
    assert.equal(vue.element("rail").dessous("p").some(({ className }) => className === "alerte-de-cuisine"), false);
    assert.equal(blocs(vue).includes("gates-de-la-file"), false);
    assert.equal(blocs(vue).includes("triage"), false);
    assert.ok(blocs(vue).includes("colonne"));
  });

  test("gates hors budget : une seule ligne en tête, avec le ticket, et aucun bloc de gates ni de triage", async () => {
    const vue = await rail({ coutDesGates: HORS_DU_BUDGET, triage: JOURS });
    const lignes = vue.element("rail").dessous("p").filter(({ className }) => className === "alerte-de-cuisine");
    assert.equal(lignes.length, 1);
    assert.match(lignes[0]?.textContent ?? "", /gates over budget — #31/);
    assert.equal(vue.element("rail").children[0]?.id, "alerte-de-cuisine");
    assert.equal(blocs(vue).includes("gates-de-la-file"), false);
    assert.equal(blocs(vue).includes("triage"), false);
  });

  test("le clic ouvre Cooks, sur le bloc des gates entier", async () => {
    const vue = await rail({ coutDesGates: HORS_DU_BUDGET });
    const lien = vue.element("rail").dessous("button").find(({ className }) => className === "lien") ?? assert.fail("pas de lien");
    lien.click();
    await repos();
    assert.equal(vue.element("rail").dataset.onglet, "cooks");
    assert.ok(ancre(vue, "gates-du-projet").dessous("section").some(({ className }) => className === "gates-de-la-file"));
    assert.match(ancre(vue, "gates-du-projet").textContent, new RegExp(HORS_BUDGET));
  });
});

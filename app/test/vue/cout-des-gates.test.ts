// Ce que coûtent les gates du projet face à leur budget (#1318, épique #1313) : en tête de la file, le dernier passage
// face au budget d'un passage, en durée et en processeur, marqué hors budget, et le ticket que la cuisine a ouvert
// seule ; sur l'onglet Cooks, les passages des dernières 24 h. La vue jouée telle qu'elle est, devant un faux document
// (aides/fausse-vue.ts), sur ce que le process principal range des faits de la box (faits.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, coutDesGatesLu, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { COLONNES, duree, HORS_BUDGET, poserLeJourDesGates, poserLesGatesDeLaFile, TITRE_FILE, TITRE_JOUR } from "../../src/vue/cout-des-gates.js";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";

// Tel que `facts` le rend (runtime/src/faits.ts) : sous un budget par défaut, sans ticket.
const SOUS_LE_BUDGET = {
  budget: { durationSeconds: 100, cpuSeconds: 400, parLeChef: { durationSeconds: false, cpuSeconds: false } },
  latest: { project: PARADE, ticket: 30, runner: "pass", outcome: "green", durationSeconds: 62.4, cpuSeconds: 180.5, at: "2026-10-21T09:58:40.000Z" },
  overBudget: false,
  lastDay: { runs: 3, durationSeconds: 190.2, cpuSeconds: 560.7 },
  ticket: null,
};
// Hors d'un budget posé par le chef, et le ticket que la cuisine a ouvert seule.
const HORS_DU_BUDGET = {
  budget: { durationSeconds: 120, cpuSeconds: 480, parLeChef: { durationSeconds: true, cpuSeconds: true } },
  latest: { ...SOUS_LE_BUDGET.latest, durationSeconds: 214.6, cpuSeconds: 990.2 },
  overBudget: true,
  lastDay: { runs: 7, durationSeconds: 1402.3, cpuSeconds: 6410.8 },
  ticket: { number: 31, openedAt: "2026-10-21T09:58:52.000Z", exceeded: ["duration", "cpu"] },
};
const SANS_PASSAGE = { ...SOUS_LE_BUDGET, latest: null, lastDay: { runs: 0, durationSeconds: 0, cpuSeconds: 0 } };

const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 3 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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
function recevoir(vue: Jouee, cout: unknown) {
  const faits = cout === undefined ? FAITS : { ...FAITS, coutDesGates: cout };
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}
const section = (vue: Jouee, classe: string) => vue.element("rail").dessous("section").find((pose) => pose.className === classe);
const file = (vue: Jouee) => section(vue, "gates-de-la-file");
const jour = (vue: Jouee) => section(vue, "jour-des-gates");
// Une mesure de la file telle qu'elle se lit : « time 62 s / 100 s (default) ».
const mesures = (pose: Faux) => pose.dessous("span").filter(({ className }) => className === "mesure-des-gates").map((mesure) => mesure.children.map(({ textContent }) => textContent).join(" "));
// Le tableau des 24 h tel qu'il se lit : la tête de ses colonnes, puis chaque ligne.
const lu = (pose: Faux) => pose.dessous("tr").map((ligne) => ligne.children.map((cellule) => cellule.textContent));

describe("les gates face à leur budget, en tête de la file", () => {
  test("sous le budget : le dernier passage face au budget, en durée et en processeur — le défaut se dit défaut, sans marque ni ticket", async () => {
    const vue = await ouvrir();
    recevoir(vue, SOUS_LE_BUDGET);
    await repos();
    const pose = file(vue) ?? assert.fail("pas de gates sur la file");
    assert.equal(pose.dessous("h4")[0]?.textContent?.startsWith(TITRE_FILE), true);
    assert.deepEqual(mesures(pose), ["time 62 s / 100 s (default)", "CPU 181 s / 400 s (default)"]);
    assert.equal("horsBudget" in pose.dataset, false);
    assert.doesNotMatch(pose.textContent, new RegExp(HORS_BUDGET));
    assert.doesNotMatch(pose.textContent, /the kitchen opened/);
  });

  test("hors budget : la file le marque, et dit que la cuisine a ouvert un ticket seule — son numéro ouvre sa fiche", async () => {
    const vue = await ouvrir();
    recevoir(vue, HORS_DU_BUDGET);
    await repos();
    const pose = file(vue) ?? assert.fail("pas de gates sur la file");
    // Un budget posé par le chef ne se dit pas défaut.
    assert.deepEqual(mesures(pose), ["time 215 s / 120 s", "CPU 990 s / 480 s"]);
    assert.equal("horsBudget" in pose.dataset, true);
    assert.equal(pose.dessous("span").find(({ className }) => className === "hors-budget")?.textContent, HORS_BUDGET);
    const ligne = pose.dessous("p").find(({ className }) => className === "ticket-du-budget") ?? assert.fail("pas de ligne du ticket");
    assert.equal(ligne.textContent, "the kitchen opened#31on its own to bring the gates back under budget");
    (ligne.dessous("button").find(({ textContent }) => textContent === "#31") ?? assert.fail("pas de lien vers #31")).click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    assert.match(vue.element("fiche").textContent, /#31/);
  });

  test("sans passage encore : pas de chiffre inventé, le budget est dit", async () => {
    const vue = await ouvrir();
    recevoir(vue, SANS_PASSAGE);
    await repos();
    const pose = file(vue) ?? assert.fail("pas de gates sur la file");
    assert.deepEqual(mesures(pose), ["time – / 100 s (default)", "CPU – / 400 s (default)"]);
    assert.match(pose.textContent, /no run yet/);
  });

  test("un processeur que le runtime n'a pas dit — gates coupées — se dit « not measured »", async () => {
    const vue = await ouvrir();
    recevoir(vue, { ...HORS_DU_BUDGET, latest: { ...HORS_DU_BUDGET.latest, cpuSeconds: null } });
    await repos();
    assert.deepEqual(mesures(file(vue) ?? assert.fail("pas de gates sur la file")), ["time 215 s / 120 s", "CPU not measured / 480 s"]);
  });

  test("elles sont sur la file seulement : l'onglet Cooks n'en pose que les 24 h", async () => {
    const vue = await ouvrir();
    recevoir(vue, HORS_DU_BUDGET);
    await repos();
    assert.notEqual(file(vue), undefined);
    assert.equal(jour(vue), undefined);
    await ouvrirOnglet(vue, "Cooks");
    assert.equal(file(vue), undefined);
    assert.notEqual(jour(vue), undefined);
  });
});

describe("les gates des dernières 24 h, sur l'onglet Cooks", () => {
  test("le nombre de passages, leur temps et leur processeur au total, tels que le runtime les donne, à côté du budget d'un passage", async () => {
    const vue = await ouvrir();
    recevoir(vue, HORS_DU_BUDGET);
    await ouvrirOnglet(vue, "Cooks");
    const pose = jour(vue) ?? assert.fail("pas de gates sur Cooks");
    assert.equal(pose.dessous("h4")[0]?.textContent?.startsWith(TITRE_JOUR), true);
    assert.deepEqual(lu(pose), [
      ["", ...COLONNES],
      ["all runs", "7", "23 min", "1 h 47 min"],
      ["budget, one run", "", "120 s", "480 s"],
    ]);
    // Le total exact, au survol.
    assert.deepEqual(pose.dessous("td").filter(({ className }) => className === "chiffre").map(({ title }) => title), ["", "1402.3 s", "6410.8 s"]);
    // Sous les tickets de la dernière heure et du dernier jour, au-dessus de la carte du projet.
    const rail = vue.element("rail");
    assert.equal(rail.children[1]?.id, "gates-du-projet");
    assert.equal(rail.children[2]?.className, "carte");
  });

  test("sans passage dans les 24 h : 0, 0 s et 0 s, jamais un blanc — et le budget par défaut", async () => {
    const vue = await ouvrir();
    recevoir(vue, SANS_PASSAGE);
    await ouvrirOnglet(vue, "Cooks");
    assert.deepEqual(lu(jour(vue) ?? assert.fail("pas de gates sur Cooks")).slice(1), [
      ["all runs", "0", "0 s", "0 s"],
      ["budget, one run", "", "100 s (default)", "400 s (default)"],
    ]);
  });

  test("un runtime qui ne les donne pas, ou sous une autre forme, n'en fait rien poser — ni la file, ni Cooks", async () => {
    const vue = await ouvrir();
    recevoir(vue, undefined);
    await repos();
    assert.equal(file(vue), undefined);
    await ouvrirOnglet(vue, "Cooks");
    assert.equal(jour(vue), undefined);
    assert.equal(vue.element("rail").children.some((pose) => pose.className === "carte"), true);
    recevoir(vue, { ...SOUS_LE_BUDGET, lastDay: { runs: "3", durationSeconds: 0, cpuSeconds: 0 } });
    assert.equal(jour(vue), undefined);
  });
});

describe("la lecture du champ et ses mots", () => {
  test("coutDesGatesLu : la forme du runtime, sans ce qu'il y ajoute — sinon rien", () => {
    assert.deepEqual(coutDesGatesLu(HORS_DU_BUDGET), {
      budget: HORS_DU_BUDGET.budget,
      latest: { durationSeconds: 214.6, cpuSeconds: 990.2, at: "2026-10-21T09:58:40.000Z" },
      overBudget: true,
      lastDay: HORS_DU_BUDGET.lastDay,
      ticket: { number: 31, openedAt: "2026-10-21T09:58:52.000Z" },
    });
    assert.equal(coutDesGatesLu(SANS_PASSAGE)?.latest, null);
    // Un runtime d'avant le ticket auto-ouvert (#1315) ne donne pas `ticket` : il n'y en a pas.
    const { ticket: _, ...sansTicket } = SOUS_LE_BUDGET;
    assert.equal(coutDesGatesLu(sansTicket)?.ticket, null);
    for (const mauvais of [
      undefined,
      null,
      [],
      { ...SOUS_LE_BUDGET, budget: { durationSeconds: 100, cpuSeconds: 400 } },
      { ...SOUS_LE_BUDGET, overBudget: "no" },
      { ...SOUS_LE_BUDGET, latest: undefined },
      { ...SOUS_LE_BUDGET, latest: { ...SOUS_LE_BUDGET.latest, at: "hier" } },
      { ...SOUS_LE_BUDGET, lastDay: { runs: 1.5, durationSeconds: 0, cpuSeconds: 0 } },
      { ...SOUS_LE_BUDGET, lastDay: { runs: 1, durationSeconds: -1, cpuSeconds: 0 } },
      { ...SOUS_LE_BUDGET, ticket: { number: 0, openedAt: A } },
    ]) {
      assert.equal(coutDesGatesLu(mauvais), undefined, JSON.stringify(mauvais));
    }
  });

  test("un total se dit en secondes jusqu'à dix minutes, puis en minutes, puis en heures", () => {
    assert.deepEqual([0, 62.4, 599.4, 600, 1402.3, 3599, 6410.8, 36000].map(duree), ["0 s", "62 s", "599 s", "10 min", "23 min", "1 h 00 min", "1 h 47 min", "10 h 00 min"]);
  });

  test("les modules se lisent seuls, sur un faux document — rien d'un runtime qui ne donne rien", () => {
    const doc = { createElement: (balise: string) => new Faux(balise) };
    const lue = coutDesGatesLu(SOUS_LE_BUDGET) ?? assert.fail("illisible");
    assert.equal(poserLesGatesDeLaFile(doc as never, lue, () => {}).length, 1);
    assert.deepEqual(poserLesGatesDeLaFile(doc as never, undefined, () => {}), []);
    assert.equal((poserLeJourDesGates(doc as never, lue) as Faux | null)?.dessous("tr").length, 3);
    assert.equal(poserLeJourDesGates(doc as never, undefined), null);
  });
});

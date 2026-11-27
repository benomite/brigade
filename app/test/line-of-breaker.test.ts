// La ligne du disjoncteur (#2140, #3523) : une information, sans bouton — le chef ne referme plus le disjoncteur, la station
// le referme d'elle-même (#3911) ; sans geste, elle n'est pas posée sur le rail (#4238). Elle vient de la ligne `kitchen` de `status`, telle que le runtime
// l'écrit ; la vue est jouée devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { holdBands, type Band } from "../src/alerts.ts";
import { putAside } from "../src/awaiting.ts";
import { forTheBar } from "../src/bar.ts";
import type { Reading } from "../src/box.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../src/facts.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { type Fake, FakeScreen, type Played, playTheVue, openTab, repos } from "./helpers/false-vue.ts";


const PARADE = "parade";
const REPOSITORY = "chef/parade";
const A = "2026-11-03T10:00:01.000Z";

// --- La vue -----------------------------------------------------------------------------------------------------------

const FACTS: Facts = {
  etat: "retenue",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null }],
  cooks: [],
  attend: [],
};
// La ligne `kitchen` de `status`, telle que le runtime l'écrit (runtime/src/etat.ts) : le disjoncteur ouvert.
const OPEN = ["project    parade", "kitchen    held · breaker OPEN for 1 h 00 (3 failures in a row)", "", "rail       1 queued", "  #21  queued  -  since 2 h 05  L'export du journal", ""].join("\n");
const CLOSES_AGAIN = ["project    parade", "kitchen    open", "", "rail       1 queued", "  #21  queued  -  since 2 h 05  L'export du journal", ""].join("\n");
const reading = (command: string, text: string): Reading => ({ projet: PARADE, demande: 1, a: A, sorties: [{ commande: command, texte: text }] });

// La bande que le process principal dirait, `facts` et `status` lus.
function bandRead(status: string, state: Facts["etat"] = "retenue", readOnly = false): Band {
  const bands = holdBands({ etablir: 1, minimum: 0 });
  bands.ouvrir([PARADE]);
  bands.faits(reading("facts", JSON.stringify({ ...FACTS, etat: state, ...(readOnly ? { lectureSeule: { depot: REPOSITORY } } : {}) })));
  return bands.status(putAside(reading("status", status)));
}

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", depot: REPOSITORY }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

// L'espace de « parade » ouvert, son rail lu, sa bande dite.
async function open(status = OPEN, state: Facts["etat"] = "retenue", readOnly = false): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [] });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const receivedOne = holdFacts().recevoir(reading("facts", JSON.stringify({ ...FACTS, ...(readOnly ? { lectureSeule: { depot: REPOSITORY } } : {}) })));
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  vue.dire("surAlertes", bandRead(status, state, readOnly));
  await repos();
  return vue;
}


// La ligne du disjoncteur n'offre aucun geste : elle n'est plus posée sur le rail, dont aucun message n'est sans geste (#4238).
// La bande de l'espace la dit, comme sur Stations.
const lineOf = (vue: Played): Fake | undefined => vue.element("rail").dessous("div").find(({ className }) => className === "ligne-disjoncteur");
const buttons = (or: Fake) => or.dessous("button").filter(({ className }) => className !== "aide" && className !== "detail");
const inTheBand = (vue: Played): Fake | undefined => vue.element("alertes").children.find((pose) => pose.textContent.includes("breaker open"));

describe("la ligne du disjoncteur, hors du rail : elle n'offre aucun geste (#3523, #4238)", () => {
  test("le disjoncteur ouvert : aucune ligne sur le rail — la bande de l'espace le dit, sans bouton", async () => {
    const vue = await open();
    assert.equal(lineOf(vue), undefined);
    assert.doesNotMatch(vue.element("rail").textContent, /breaker open/);
    const band = inTheBand(vue) ?? assert.fail("la bande ne dit pas le disjoncteur");
    assert.match(band.textContent, /breaker open: 3 launches failed in a row/);
    assert.deepEqual(buttons(band), []);
  });

  test("le disjoncteur refermé : la bande ne le dit plus ; rouvert, elle le redit — jamais sur le rail", async () => {
    const vue = await open();
    assert.ok(inTheBand(vue) !== undefined, "la bande ne dit pas le disjoncteur");
    vue.dire("surAlertes", bandRead(CLOSES_AGAIN, "ouverte"));
    await repos();
    assert.equal(inTheBand(vue), undefined);
    vue.dire("surAlertes", bandRead(OPEN));
    await repos();
    assert.ok(inTheBand(vue) !== undefined, "la bande ne redit pas le disjoncteur");
    assert.equal(lineOf(vue), undefined);
  });

  test("sur Stations, sans TODO : la bande porte la ligne, elle aussi sans bouton", async () => {
    const vue = await open();
    await openTab(vue, "Stations");
    const band = vue.element("alertes").children.find((pose) => pose.textContent.includes("breaker open")) ?? assert.fail("la bande ne dit pas le disjoncteur");
    assert.deepEqual(buttons(band), []);
    assert.doesNotMatch(band.textContent, /resume/i);
  });

  test("à la largeur d'un téléphone : la ligne est en tête de la liste des cartes, avec ce que la station en écrit sous son nom", async () => {
    const vue = await playTheVue({ demarrage: startup, espace: () => [] } as never, { ecran: new FakeScreen(true) });
    const receivedOne = holdFacts().recevoir(reading("facts", JSON.stringify(FACTS)));
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    vue.dire("surAlertes", bandRead(OPEN));
    await repos();
    const setOne = vue.element("cartes-du-chef").dessous("div").find(({ className }) => className === "ligne-disjoncteur") ?? assert.fail("pas de ligne du disjoncteur dans la liste");
    assert.deepEqual(buttons(setOne), []);
    assert.equal(setOne.dessous("p").find(({ className }) => className === "pourquoi")?.textContent, "breaker OPEN for 1 h 00 (3 failures in a row)");
  });
});

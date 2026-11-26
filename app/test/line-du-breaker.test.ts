// La ligne du disjoncteur (#2140, #3523) : une information, sans bouton — le chef ne referme plus le disjoncteur, la station
// le referme d'elle-même (#3911) ; sans geste, elle n'est pas posée sur le rail (#4238). Elle vient de la ligne `kitchen` de `status`, telle que le runtime
// l'écrit ; la vue est jouée devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { holdBandes, type Bande } from "../src/alerts.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/awaiting.ts";
import { pourLaBar } from "../src/bar.ts";
import type { Read } from "../src/box.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { type Faux, FauxScreen, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "./aides/fausse-vue.ts";


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
const OUVERT = ["project    parade", "kitchen    held · breaker OPEN for 1 h 00 (3 failures in a row)", "", "rail       1 queued", "  #21  queued  -  since 2 h 05  L'export du journal", ""].join("\n");
const REFERME = ["project    parade", "kitchen    open", "", "rail       1 queued", "  #21  queued  -  since 2 h 05  L'export du journal", ""].join("\n");
const read = (command: string, texte: string): Read => ({ projet: PARADE, demande: 1, a: A, sorties: [{ commande: command, texte }] });

// La bande que le process principal dirait, `facts` et `status` lus.
function bandeLue(status: string, state: Facts["etat"] = "retenue", readOnly = false): Bande {
  const bandes = holdBandes({ etablir: 1, minimum: 0 });
  bandes.ouvrir([PARADE]);
  bandes.faits(read("facts", JSON.stringify({ ...FACTS, etat: state, ...(readOnly ? { lectureSeule: { depot: REPOSITORY } } : {}) })));
  bandes.status(mettreAPart(read("status", status)));
  return bandes.manager(read("manager", "manager               ALLUMÉ depuis le 2026-11-03T09:25:21.838Z (par chef) — il juge les issues ouvertes\n"));
}

const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", depot: REPOSITORY }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// L'espace de « parade » ouvert, son rail lu, sa bande dite.
async function ouvrir(status = OUVERT, state: Facts["etat"] = "retenue", readOnly = false): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], geste: () => undefined });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = holdFacts().recevoir(read("facts", JSON.stringify({ ...FACTS, ...(readOnly ? { lectureSeule: { depot: REPOSITORY } } : {}) })));
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  vue.dire("surAlertes", bandeLue(status, state, readOnly));
  await repos();
  return vue;
}


// La ligne du disjoncteur n'offre aucun geste : elle n'est plus posée sur le rail, dont aucun message n'est sans geste (#4238).
// La bande de l'espace la dit, comme sur Stations.
const lineDe = (vue: Jouee): Faux | undefined => vue.element("rail").dessous("div").find(({ className }) => className === "ligne-disjoncteur");
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide" && className !== "detail");
const dansLaBande = (vue: Jouee): Faux | undefined => vue.element("alertes").children.find((pose) => pose.textContent.includes("breaker open"));

describe("la ligne du disjoncteur, hors du rail : elle n'offre aucun geste (#3523, #4238)", () => {
  test("le disjoncteur ouvert : aucune ligne sur le rail — la bande de l'espace le dit, sans bouton", async () => {
    const vue = await ouvrir();
    assert.equal(lineDe(vue), undefined);
    assert.doesNotMatch(vue.element("rail").textContent, /breaker open/);
    const bande = dansLaBande(vue) ?? assert.fail("la bande ne dit pas le disjoncteur");
    assert.match(bande.textContent, /breaker open: 3 launches failed in a row/);
    assert.deepEqual(boutons(bande), []);
  });

  test("le disjoncteur refermé : la bande ne le dit plus ; rouvert, elle le redit — jamais sur le rail", async () => {
    const vue = await ouvrir();
    assert.ok(dansLaBande(vue) !== undefined, "la bande ne dit pas le disjoncteur");
    vue.dire("surAlertes", bandeLue(REFERME, "ouverte"));
    await repos();
    assert.equal(dansLaBande(vue), undefined);
    vue.dire("surAlertes", bandeLue(OUVERT));
    await repos();
    assert.ok(dansLaBande(vue) !== undefined, "la bande ne redit pas le disjoncteur");
    assert.equal(lineDe(vue), undefined);
  });

  test("sur Stations, sans TODO : la bande porte la ligne, elle aussi sans bouton", async () => {
    const vue = await ouvrir();
    await ouvrirOnglet(vue, "Stations");
    const bande = vue.element("alertes").children.find((pose) => pose.textContent.includes("breaker open")) ?? assert.fail("la bande ne dit pas le disjoncteur");
    assert.deepEqual(boutons(bande), []);
    assert.doesNotMatch(bande.textContent, /resume/i);
  });

  test("à la largeur d'un téléphone : la ligne est en tête de la liste des cartes, avec ce que la station en écrit sous son nom", async () => {
    const vue = await jouerLaVue({ demarrage, espace: () => [], geste: () => undefined } as never, { ecran: new FauxScreen(true) });
    const recue = holdFacts().recevoir(read("facts", JSON.stringify(FACTS)));
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    vue.dire("surAlertes", bandeLue(OUVERT));
    await repos();
    const posee = vue.element("cartes-du-chef").dessous("div").find(({ className }) => className === "ligne-disjoncteur") ?? assert.fail("pas de ligne du disjoncteur dans la liste");
    assert.deepEqual(boutons(posee), []);
    assert.equal(posee.dessous("p").find(({ className }) => className === "pourquoi")?.textContent, "breaker OPEN for 1 h 00 (3 failures in a row)");
  });

  test("le geste d'une autre ligne reste offert : « resume » de la cuisine arrêtée se presse sur un projet ordinaire, pas en lecture seule", async () => {
    const ordinaire = await ouvrir(REFERME, "arrêtée");
    assert.ok(boutons(ordinaire.element("alertes")).some(({ textContent }) => /resume/i.test(textContent)), "pas de bouton « resume » sur la ligne de la cuisine arrêtée");
    const only = await ouvrir(REFERME, "arrêtée", true);
    assert.ok(!boutons(only.element("alertes")).some(({ textContent }) => /resume/i.test(textContent)), "« resume » offert en lecture seule");
  });
});

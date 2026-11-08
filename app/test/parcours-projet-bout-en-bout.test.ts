// Le parcours d'un projet neuf, de bout en bout (#2479, épique #2473) : sur un ordinateur qui n'a jamais vu Brigade — ni
// projet, ni station appairée, `gh` connecté —, la première ouverture lit le compte, le projet s'ajoute, cet ordinateur
// est choisi comme station, et le récap dit le projet servi par lui. La vue est jouée telle qu'elle est (aides/fausse-vue.ts) :
// jamais un login tapé, jamais la page d'une station. Un second cas sans compte connecté part du bouton « connect to GitHub ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { connecteEnTantQue, SE_CONNECTER } from "../src/vue/parcours-projet/compte.js";
import { CUIT_PAR } from "../src/vue/parcours-projet/etape-station.js";
import { ENSUITE } from "../src/vue/parcours-projet/etape-recap.js";
import { BIENVENUE } from "../src/vue/parcours-projet/parcours.js";
import { Faux, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const CHEMIN = "/home/chef/.config/brigade/app.json";
const DEPOT = "chef/parade";
const PARADE: Projet = { nom: "parade", dossier: "/home/chef/code/parade", depot: DEPOT, base: "main" };
const ICI = "this PC";
const AUCUNE = { state: "listed" as const, stations: [], unreadable: [], reason: "No station is paired with this GitHub account yet." };

// Un ordinateur neuf : le fichier des projets est vide.
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: CHEMIN, projets: [] }),
  poste: { nom: ICI, mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

const parcoursDans = (racine: Faux) => [...racine.descendants()].find((pose) => pose.className === "parcours-projet carte") ?? assert.fail("pas de parcours");
const etape = (parcours: Faux, id: string) => parcours.dessous("li").find((ligne) => ligne.dataset.etape === id) ?? assert.fail(`pas d'étape « ${id} »`);
const bouton = (ou: Faux, texte: string) => ou.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const textes = (ou: Faux) => [...ou.descendants()].map((pose) => pose.textContent);

describe("le parcours d'un projet neuf, de la première ouverture au récap", () => {
  test("compte lu, projet ajouté, cet ordinateur choisi : le récap dit le projet qu'il sert — sans login tapé ni page de station", async () => {
    const servis: Array<[string, boolean]> = [];
    const vue = await jouerLaVue({
      demarrage,
      stationsDuChef: () => AUCUNE,
      compteGitHub: () => ({ login: "octo-chef" }),
      stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
      ajouter: () => ({ etat: "ajoute", nom: PARADE.nom }),
      servirUnProjet: (depot, servi) => (servis.push([depot, servi]), { projets: [] }) as never,
      espace: () => [],
    });

    // La première ouverture : le compte est lu, jamais demandé ; la station attend le projet.
    const premier = parcoursDans(vue.element("tous"));
    assert.equal(premier.children[0]?.textContent, BIENVENUE);
    assert.deepEqual([etape(premier, "compte").dataset.etat, etape(premier, "station").dataset.etat, etape(premier, "recap").dataset.etat], ["faite", "courante", "a-venir"]);
    assert.ok(etape(premier, "compte").dessous("p").some((pose) => pose.textContent === connecteEnTantQue("octo-chef")));
    assert.equal(vue.appels.filter(({ geste }) => geste === "compteGitHub").length, 1);

    // Le projet est ajouté ; le fichier des projets le rend à la vue, comme le process principal.
    vue.poses().find((pose) => pose.id === "entree-ajout")?.click();
    await repos();
    vue.element("depot").value = DEPOT;
    vue.element("base").value = "main";
    vue.element("formulaire").declencher("submit");
    vue.dire("surConfiguration", pourLaBarre({ chemin: CHEMIN, projets: [PARADE] }), []);
    await repos();
    const ajout = parcoursDans(vue.element("parcours-de-l-ajout"));
    assert.equal(etape(ajout, "station").dataset.etat, "courante");
    assert.equal(etape(ajout, "recap").dataset.etat, "a-venir");

    // Cet ordinateur est choisi : sa station sert le dépôt, et le parcours finit sur le récap.
    bouton(etape(ajout, "station"), ICI).click();
    await repos();
    assert.deepEqual(servis, [[DEPOT, true]]);
    const fin = parcoursDans(vue.element("parcours-de-l-ajout"));
    assert.deepEqual(["compte", "station", "recap"].map((id) => etape(fin, id).dataset.etat), ["faite", "faite", "courante"]);
    assert.ok(textes(etape(fin, "station")).includes(CUIT_PAR(ICI, DEPOT)));
    const recap = etape(fin, "recap");
    assert.deepEqual(recap.dessous("p").filter((pose) => pose.className === "ligne-recap").map((pose) => [pose.dataset.recap, pose.dessous("strong")[0]?.textContent]), [["projet", DEPOT], ["station", ICI]]);
    assert.equal(recap.dessous("code")[0]?.textContent, "fire");
    assert.ok(ENSUITE.includes("`fire`"));

    // Jamais un login tapé ni une page de station.
    for (const racine of [vue.element("tous"), vue.element("parcours-de-l-ajout")]) assert.deepEqual([...racine.dessous("label")].filter((pose) => /account|login/i.test(pose.textContent)), []);
    assert.equal(vue.appels.some(({ geste }) => geste === "seConnecterAGitHub"), false);
    assert.equal(vue.element("ajout").hidden, false, "l'écran d'ajout est resté : aucune page de projet ni de station ne s'est ouverte");
  });

  test("sans compte connecté, le parcours part du bouton « connect to GitHub » — et rien n'est tapé", async () => {
    const vue = await jouerLaVue({ demarrage, stationsDuChef: () => AUCUNE, compteGitHub: () => ({ nonConnecte: true }), espace: () => [] });
    const premier = parcoursDans(vue.element("tous"));
    assert.deepEqual([etape(premier, "compte").dataset.etat, etape(premier, "station").dataset.etat, etape(premier, "recap").dataset.etat], ["courante", "a-venir", "a-venir"]);
    const compte = etape(premier, "compte");
    assert.deepEqual(compte.dessous("button").map((pose) => pose.textContent), [SE_CONNECTER]);
    assert.equal(compte.dessous("input").length + compte.dessous("label").length, 0);
  });
});

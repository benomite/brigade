// Les pannes d'une station, la vue jouée : sur sa page — ouverte d'un clic sur sa ligne de l'accueil —,
// chacune en une ligne, avec son bouton ; un clic le fait jouer au process principal, et ce qu'il rend
// se lit à la suite.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { EFFORTS, MODELES } from "../../src/installation.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { RenduDePanne } from "../../src/pannes/gestes.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-15T12:00:00.000Z";
const CONNEXION: Panne = { cle: "connexion-max:2026-10-15T11:48:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 12 min ago — nothing cooks on box until you log in", bouton: { libelle: "log in", geste: "login" } };
const MISE_A_JOUR: Panne = { cle: "mise-a-jour:2026-10-15T11:56:00.000Z", sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed — stayed on version 1.4.0", bouton: { libelle: "dismiss", geste: "ecarter" } };
const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [MISE_A_JOUR, CONNEXION], dit: "online", version: "1.4.0", projets: [], max: "perdue" };
const ACCUEIL: Accueil = { projets: [], stations: [{ id: "g1", nom: "box", ton: "rouge", dit: "online · Max connection lost · update failed · no project", phrase: "online · no cook running", survol: "Linux 6.1.0 · version 1.4.0" }], sante: { ton: "rouge", dit: "Max: connection lost on box  ·  GitHub ✓", survol: "" } };

const demarrage = (stations: VuDesStations) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations,
  accueil: ACCUEIL,
});

// Les lignes de la page de la station, sous son en-tête : ses pannes.
const lignes = (page: Faux) => page.children[2]?.children ?? [];

test("chaque panne est une ligne sur la page de sa station, avec son bouton ; le clic le joue, et son rendu se lit à la suite", async () => {
  let rendu: RenduDePanne = { fait: "the login page opens in your browser: once you are signed in, cooking resumes by itself within the minute" };
  const jouee = await jouerLaVue({ demarrage: () => demarrage({ a: A, stations: [BOX] }), panne: () => rendu, espace: () => [] });
  (jouee.element("projets").children.at(0) ?? assert.fail("pas d'entrée « Tous les projets »")).click();
  await repos();
  // Sur l'accueil, la ligne de la station ne porte aucun bouton de panne : sa page les porte.
  assert.equal(jouee.element("accueil-stations").dessous("button").some(({ textContent }) => textContent === "log in"), false);
  (jouee.element("accueil-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
  await repos();
  const section = () => jouee.element("station");
  // En tête, son état en une phrase (#877) : ce qui casse est dessous, sa machine au survol de l'aide.
  const tete = section().children[1];
  assert.equal(tete?.children[2]?.textContent, "online · no cook running");
  assert.equal(tete?.dessous("button").find(({ className }) => className === "aide")?.ariaLabel, "Linux 6.1.0 · version 1.4.0");
  const [miseAJour, connexion] = lignes(section());
  assert.equal(miseAJour?.className, "panne");
  assert.equal(miseAJour?.textContent, "update to version 1.5.0 failed — stayed on version 1.4.0dismiss");
  assert.equal(connexion?.dataset.sujet, "connexion-max");
  const bouton = connexion?.dessous("button")[0] ?? assert.fail("pas de bouton sur la panne");
  assert.equal(bouton.textContent, "log in");
  bouton.click();
  await repos();
  await repos();
  assert.deepEqual(jouee.dernier("panne"), ["g1", CONNEXION.cle]);
  assert.equal(lignes(section())[1]?.children.at(-1)?.textContent, rendu.fait);

  // Relue, la ligne redit ce que le bouton a rendu ; un refus se lit de même.
  jouee.dire("surStations", { a: A, stations: [BOX] });
  await repos();
  assert.equal(lignes(section())[1]?.children.at(-1)?.textContent, rendu.fait);
  rendu = { refus: "box is not this computer: its login is not launched from this app yet — it is done on box itself" };
  (lignes(section())[1]?.dessous("button")[0] ?? assert.fail()).click();
  await repos();
  await repos();
  assert.equal(lignes(section())[1]?.children.at(-1)?.textContent, rendu.refus);
});

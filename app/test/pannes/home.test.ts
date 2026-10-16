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
const CONNEXION: Panne = { cle: "connexion-max:2026-10-15T11:48:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 12 min ago", survol: "nothing cooks on box until you log in", bouton: { libelle: "log in", geste: "login" } };
const MISE_A_JOUR: Panne = { cle: "mise-a-jour:2026-10-15T11:56:00.000Z", sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed", survol: "box stayed on version 1.4.0; the next version will be tried on its own", bouton: { libelle: "dismiss", geste: "ecarter" } };
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
const lignes = (page: Faux) => page.children[3]?.children ?? [];
// Ce que le survol de la ligne dit : son nom accessible, jamais du texte posé dans la page.
const survolDe = (ligne: Faux | undefined) => ligne?.dessous("button").find(({ className }) => className === "aide")?.ariaLabel ?? assert.fail("pas de survol sur la panne");

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
  assert.equal(miseAJour?.textContent, "update to version 1.5.0 faileddismiss?");
  assert.equal(connexion?.dataset.sujet, "connexion-max");
  const bouton = connexion?.dessous("button")[0] ?? assert.fail("pas de bouton sur la panne");
  assert.equal(bouton.textContent, "log in");
  bouton.click();
  await repos();
  await repos();
  assert.deepEqual(jouee.dernier("panne"), ["g1", CONNEXION.cle]);
  assert.match(survolDe(lignes(section())[1]), new RegExp(rendu.fait));

  // Relue, la ligne redit ce que le bouton a rendu ; un refus se lit de même.
  jouee.dire("surStations", { a: A, stations: [BOX] });
  await repos();
  assert.match(survolDe(lignes(section())[1]), new RegExp(rendu.fait));
  rendu = { refus: "box is not this computer: its login is not launched from this app yet — it is done on box itself" };
  (lignes(section())[1]?.dessous("button")[0] ?? assert.fail()).click();
  await repos();
  await repos();
  assert.match(survolDe(lignes(section())[1]), new RegExp(rendu.refus));
});

// Une panne, une ligne, un bouton : ni la commande, ni le doublon de l'en-tête.
const HORS_LIGNE: StationVue = {
  ...BOX,
  etat: "hors-ligne",
  ligne: "offline for 12 min · version 1.4.0 · no project",
  dit: "offline for 12 min",
  max: null,
  pannes: [{ cle: "injoignable", sujet: "injoignable", ligne: "offline for 12 min", survol: "box has given no sign of life for 12 min", bouton: { libelle: "check again", geste: "relire" } }],
};

async function pageDe(station: StationVue, phrase: string) {
  const accueil: Accueil = { ...ACCUEIL, stations: [{ id: station.id, nom: station.nom, ton: "gris", dit: phrase, phrase, survol: "Linux 6.1.0" }] };
  const jouee = await jouerLaVue({ demarrage: () => ({ ...demarrage({ a: A, stations: [station] }), accueil }), panne: () => ({ fait: "dismissed" }), espace: () => [] });
  (jouee.element("projets").children.at(0) ?? assert.fail("pas d'entrée « Tous les projets »")).click();
  await repos();
  (jouee.element("accueil-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
  await repos();
  return jouee.element("station");
}

// Rien de la page ne tient du texte brut : ni commande, ni code de sortie.
const sansTexteBrut = (page: Faux) => {
  for (const motif of [/`/, /\$ /, /\bssh\b/, /\bsudo\b/, /\bclaude\b/, /\/login/, /exit code/i, /Error:/]) assert.doesNotMatch(page.textContent, motif);
};
const boutonsDePanne = (page: Faux) => lignes(page).flatMap((ligne) => ligne.dessous("button").filter(({ className }) => className !== "aide"));

test("hors ligne : une seule ligne « offline for … » avec « check again », et l'en-tête ne la redit pas", async () => {
  const page = await pageDe(HORS_LIGNE, "offline for 12 min");
  assert.equal(lignes(page).length, 1);
  assert.equal(lignes(page)[0]?.dessous("span").find(({ className }) => className === "survol") === undefined, false);
  assert.deepEqual(boutonsDePanne(page).map(({ textContent }) => textContent), ["check again"]);
  assert.equal(page.textContent.split("offline for 12 min").length - 1, 1);
  assert.equal(page.textContent.includes("no sign of life"), false);
  assert.equal(survolDe(lignes(page)[0]), "box has given no sign of life for 12 min");
  sansTexteBrut(page);
});

test("mise à jour échouée : une seule ligne avec « dismiss », une seule fois sur la page", async () => {
  const page = await pageDe({ ...BOX, pannes: [BOX.pannes[0] as Panne] }, "online · no cook running");
  assert.equal(lignes(page).length, 1);
  assert.deepEqual(boutonsDePanne(page).map(({ textContent }) => textContent), ["dismiss"]);
  assert.equal(page.textContent.split("update to version 1.5.0 failed").length - 1, 1);
  assert.equal(survolDe(lignes(page)[0]), "box stayed on version 1.4.0; the next version will be tried on its own");
  sansTexteBrut(page);
});

test("connexion Max perdue : une seule ligne avec « log in », une seule fois sur la page", async () => {
  const page = await pageDe({ ...BOX, pannes: [BOX.pannes[1] as Panne] }, "online · no cook running");
  assert.equal(lignes(page).length, 1);
  assert.deepEqual(boutonsDePanne(page).map(({ textContent }) => textContent), ["log in"]);
  assert.equal(page.textContent.split("Max connection lost").length - 1, 1);
  assert.equal(survolDe(lignes(page)[0]), "nothing cooks on box until you log in");
  sansTexteBrut(page);
});

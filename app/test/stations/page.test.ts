// La page d'une station, la vue jouée (#877) : ouverte d'un clic sur sa ligne de l'accueil, elle dit
// en tête son nom, sa pastille et son état en une phrase — en ligne et ses cooks, hors ligne depuis
// quand —, et un geste visible ramène à l'accueil. Sa machine et sa version ne se lisent
// qu'au survol de l'icône d'aide, jamais dans la page. La phrase se calcule dans home.ts
// (home.test.ts) : ici, ce que la vue en pose.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lineDeStation, type Home } from "../../src/home.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { type Faux, jouerLaVue, ouvrirToutesLesStations, type Answers, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-16T12:00:00.000Z";
const EN_LINE: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0-47-amd64", etat: "en-ligne", ligne: "online · version 1.4.0 · 1 project: parade", pannes: [], dit: "online", version: "1.4.0", projets: ["parade"], max: "connectee" };
const OUTSIDE_LINE: StationVue = { ...EN_LINE, id: "g2", nom: "mac", machine: "macOS 25.0.0", etat: "hors-ligne", ligne: "offline for 12 min · version 1.4.0 · 1 project: parade", dit: "offline for 12 min", max: null };
const ATELIER: StationVue = { ...EN_LINE, id: "g3", nom: "atelier", machine: "Debian 12 · 8 cores" };
const STATIONS = [EN_LINE, OUTSIDE_LINE, ATELIER];
// Les lignes de l'accueil telles que le process principal les dit : deux cooks sur « box », « atelier » un.
const HOME: Home = {
  projets: [],
  stations: [lineDeStation(EN_LINE, 2), lineDeStation(OUTSIDE_LINE, 0), lineDeStation(ATELIER, 1)],
  sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" },
};

const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: { a: A, stations: STATIONS },
  accueil: HOME,
});

// L'en-tête de la page, tel qu'il se lit : son nom, la couleur de sa pastille, sa phrase.
const enTete = (page: Faux) => {
  const tete = page.dessous("header")[0] ?? assert.fail("pas d'en-tête");
  const [name, pill, phrase] = tete.children;
  return { nom: name?.textContent, ton: pill?.dataset.ton, phrase: phrase?.textContent };
};

// L'app ouverte sur l'accueil, puis la page de la station `nom` ouverte d'un clic sur sa ligne.
async function laPage(name: string, answers: Answers = {}) {
  const jouee = await jouerLaVue({ demarrage, espace: () => [], ...answers });
  await ouvrirToutesLesStations(jouee);
  const line = jouee.element("toutes-les-stations").dessous("button").find(({ className, textContent }) => className === "ligne" && textContent.startsWith(name)) ?? assert.fail(`pas de ligne « ${name} »`);
  line.click();
  await repos();
  return { jouee, page: jouee.element("station") };
}

test("un clic sur une station ouvre sa page : son nom, sa pastille et son état en une phrase — en ligne, hors ligne, un seul cook", async () => {
  const vues = [];
  for (const name of ["box", "mac", "atelier"]) {
    const { jouee, page } = await laPage(name);
    assert.equal(jouee.element("tous").children[0], page, "la page prend la place de l'accueil");
    vues.push(enTete(page));
  }
  assert.deepEqual(vues, [
    { nom: "box", ton: "vert", phrase: "online · 2 cooks running" },
    { nom: "mac", ton: "gris", phrase: "offline for 12 min" },
    { nom: "atelier", ton: "vert", phrase: "online · 1 cook running" },
  ]);
});

test("le système, le noyau et la version ne s'écrivent pas dans la page : ils se lisent au survol de l'icône d'aide", async () => {
  for (const [name, machine] of [["box", "Linux 6.1.0-47-amd64"], ["mac", "macOS 25.0.0"], ["atelier", "Debian 12 · 8 cores"]] as const) {
    const { page } = await laPage(name);
    assert.doesNotMatch(page.textContent, /Linux|macOS|Debian|6\.1\.0|version|1\.4\.0/, `${name} : rien de sa machine à plat`);
    const aide = page.dessous("header")[0]?.dessous("button").find(({ className }) => className === "aide") ?? assert.fail(`${name} : pas d'icône d'aide`);
    assert.equal(aide.ariaLabel, `${machine} · version 1.4.0`);
    aide.declencher("mouseenter");
    assert.match(page.textContent, new RegExp(`${machine} · version 1\\.4\\.0`), "au survol, elle se lit");
    aide.declencher("mouseleave");
    assert.doesNotMatch(page.textContent, /version/);
  }
});

test("un geste visible, « ‹ All projects », ramène à l'accueil", async () => {
  const { jouee, page } = await laPage("mac");
  const retour = page.dessous("button")[0] ?? assert.fail("pas de bouton");
  assert.equal(retour.textContent, "‹ All projects", "le retour est le premier geste de la page");
  assert.equal(retour.hidden, false);
  retour.click();
  await repos();
  assert.ok(jouee.element("tous").children.some(({ id }) => id === "accueil-bloc-projets"));
  assert.ok(!jouee.element("tous").children.includes(page));
});

test("relue, la page suit : une station qui passe hors ligne le dit dans sa phrase, et sa pastille grisit", async () => {
  const { jouee, page } = await laPage("box");
  jouee.dire("surAccueil", { ...HOME, stations: [lineDeStation({ ...EN_LINE, etat: "hors-ligne", dit: "offline for 3 min", max: null }, 0)] });
  await repos();
  assert.deepEqual(enTete(page), { nom: "box", ton: "gris", phrase: "offline for 3 min" });
});

// Les boutons de la page, par leur libellé.
const button = (page: Faux, libelle: string) => page.dessous("button").find(({ textContent }) => textContent === libelle);
// Ceux de la confirmation du retrait, qui ne se confondent pas avec le « cancel » de l'ajout d'un projet.
const dansLaConfirmation = (page: Faux, libelle: string) => page.dessous("section").find(({ className }) => className === "confirmation")?.dessous("button").find(({ textContent }) => textContent === libelle);
// « remove the station », puis le « remove » de la confirmation.
async function retirer(page: Faux) {
  button(page, "remove the station")?.click();
  await repos();
  dansLaConfirmation(page, "remove")?.click();
  await repos();
}

test("la ligne de mise à jour, sous l'en-tête : « up to date · on this version for 3 days » ; vide, elle ne se pose pas", async () => {
  const dite = { ...EN_LINE, versionDit: "up to date · on this version for 3 days" };
  const jouee = await jouerLaVue({ demarrage: () => ({ ...demarrage(), stations: { a: A, stations: [dite, OUTSIDE_LINE] } }), espace: () => [] });
  await ouvrirToutesLesStations(jouee);
  const ouvrir = async (name: string) => {
    jouee.element("toutes-les-stations").dessous("button").find(({ className, textContent }) => className === "ligne" && textContent.startsWith(name))?.click();
    await repos();
    return jouee.element("station");
  };
  const page = await ouvrir("box");
  const line = page.dessous("p").find(({ className }) => className === "version-de-station") ?? assert.fail("pas de ligne de mise à jour");
  assert.equal(line.textContent, "up to date · on this version for 3 days");
  page.dessous("button").find(({ className }) => className === "retour")?.click();
  await repos();
  assert.equal((await ouvrir("mac")).dessous("p").find(({ className }) => className === "version-de-station")?.textContent, "", "une station sans rien à dire n'a pas de ligne");
});

test("« remove the station » : un clic ouvre la confirmation ; « cancel » la referme et la station reste en place", async () => {
  const { jouee, page } = await laPage("box");
  assert.ok(button(page, "remove the station"), "le bouton est sur la page");
  assert.doesNotMatch(page.textContent, /Remove box from this app/);
  button(page, "remove the station")?.click();
  await repos();
  assert.match(page.textContent, /Remove box from this app\?/);
  assert.match(page.textContent, /it keeps running, and pairs again with a new code/, "la confirmation dit ce que ça change, en une ligne");
  assert.equal(jouee.appels.filter(({ geste: action }) => action === "retirerLaStation").length, 0, "rien ne part avant le « remove »");
  dansLaConfirmation(page, "Cancel")?.click();
  await repos();
  assert.doesNotMatch(page.textContent, /Remove box from this app/);
  assert.ok(button(page, "remove the station"), "le bouton revient");
  assert.equal(jouee.appels.filter(({ geste: action }) => action === "retirerLaStation").length, 0, "annuler ne retire rien");
  assert.equal(jouee.element("tous").children[0], page, "la page reste ouverte");
});

test("confirmer retire la station et ramène à l'accueil", async () => {
  const retirees: string[] = [];
  const { jouee, page } = await laPage("box", { retirerLaStation: (id) => (retirees.push(id), { retiree: "box" }) });
  await retirer(page);
  assert.deepEqual(retirees, ["g1"]);
  assert.ok(jouee.element("tous").children.some(({ id }) => id === "accueil-bloc-projets"), "l'accueil est là");
  assert.ok(!jouee.element("tous").children.includes(page));
  // La lecture suivante ne la contient plus : elle n'est plus dans la liste de l'accueil.
  jouee.dire("surStations", { a: A, stations: [OUTSIDE_LINE, ATELIER] });
  jouee.dire("surAccueil", { ...HOME, stations: HOME.stations?.filter(({ id }) => id !== "g1") });
  await repos();
  const lines = jouee.element("toutes-les-stations").dessous("button").filter(({ className }) => className === "ligne");
  assert.deepEqual(lines.map(({ textContent }) => textContent.startsWith("mac") ? "mac" : "atelier"), ["mac", "atelier"]);
});

test("le retrait refusé : la station reste, la page le dit en une ligne et reste ouverte", async () => {
  const { jouee, page } = await laPage("box", { retirerLaStation: () => ({ refus: "box was not removed: GitHub could not be written" }) });
  await retirer(page);
  assert.match(page.textContent, /box was not removed: GitHub could not be written/);
  assert.equal(jouee.element("tous").children[0], page, "pas ramené à l'accueil");
});

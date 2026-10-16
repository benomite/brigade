// La page d'une station, la vue jouée (#877) : ouverte d'un clic sur sa ligne de l'accueil, elle dit
// en tête son nom, sa pastille et son état en une phrase — en ligne et ses cooks, hors ligne depuis
// quand, saturée —, et un geste visible ramène à l'accueil. Sa machine et sa version ne se lisent
// qu'au survol de l'icône d'aide, jamais dans la page. La phrase se calcule dans accueil.ts
// (accueil.test.ts) : ici, ce que la vue en pose.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ligneDeStation, type Accueil } from "../../src/accueil.ts";
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
import type { StationVue } from "../../src/stations/stations.ts";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-16T12:00:00.000Z";
const EN_LIGNE: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0-47-amd64", etat: "en-ligne", ligne: "online · version 1.4.0 · 1 project: parade", pannes: [], dit: "online", version: "1.4.0", projets: ["parade"], max: "connectee" };
const HORS_LIGNE: StationVue = { ...EN_LIGNE, id: "g2", nom: "mac", machine: "macOS 25.0.0", etat: "hors-ligne", ligne: "offline for 12 min · version 1.4.0 · 1 project: parade", dit: "offline for 12 min", max: null };
const SATUREE: StationVue = { ...EN_LIGNE, id: "g3", nom: "atelier", machine: "Debian 12 · 8 cores" };
const STATIONS = [EN_LIGNE, HORS_LIGNE, SATUREE];
// Les lignes de l'accueil telles que le process principal les dit : deux cooks sur « box », « atelier » saturée.
const ACCUEIL: Accueil = {
  projets: [],
  stations: [ligneDeStation(EN_LIGNE, 2, false), ligneDeStation(HORS_LIGNE, 0, false), ligneDeStation(SATUREE, 1, true)],
  sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" },
};

const demarrage = () => ({
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
  stations: { a: A, stations: STATIONS },
  accueil: ACCUEIL,
});

// L'en-tête de la page, tel qu'il se lit : son nom, la couleur de sa pastille, sa phrase.
const enTete = (page: Faux) => {
  const tete = page.dessous("header")[0] ?? assert.fail("pas d'en-tête");
  const [nom, pastille, phrase] = tete.children;
  return { nom: nom?.textContent, ton: pastille?.dataset.ton, phrase: phrase?.textContent };
};

// L'app ouverte sur l'accueil, puis la page de la station `nom` ouverte d'un clic sur sa ligne.
async function laPage(nom: string) {
  const jouee = await jouerLaVue({ demarrage, espace: () => [] });
  (jouee.element("projets").children.at(0) ?? assert.fail("pas d'entrée « Tous les projets »")).click();
  await repos();
  const ligne = jouee.element("accueil-stations").dessous("button").find(({ className, textContent }) => className === "ligne" && textContent.startsWith(nom)) ?? assert.fail(`pas de ligne « ${nom} »`);
  ligne.click();
  await repos();
  return { jouee, page: jouee.element("station") };
}

test("un clic sur une station ouvre sa page : son nom, sa pastille et son état en une phrase — en ligne, hors ligne, saturée", async () => {
  const vues = [];
  for (const nom of ["box", "mac", "atelier"]) {
    const { jouee, page } = await laPage(nom);
    assert.equal(jouee.element("tous").children[0], page, "la page prend la place de l'accueil");
    vues.push(enTete(page));
  }
  assert.deepEqual(vues, [
    { nom: "box", ton: "vert", phrase: "online · 2 cooks running" },
    { nom: "mac", ton: "gris", phrase: "offline for 12 min" },
    { nom: "atelier", ton: "jaune", phrase: "saturated" },
  ]);
});

test("le système, le noyau et la version ne s'écrivent pas dans la page : ils se lisent au survol de l'icône d'aide", async () => {
  for (const [nom, machine] of [["box", "Linux 6.1.0-47-amd64"], ["mac", "macOS 25.0.0"], ["atelier", "Debian 12 · 8 cores"]] as const) {
    const { page } = await laPage(nom);
    assert.doesNotMatch(page.textContent, /Linux|macOS|Debian|6\.1\.0|version|1\.4\.0/, `${nom} : rien de sa machine à plat`);
    const aide = page.dessous("header")[0]?.dessous("button").find(({ className }) => className === "aide") ?? assert.fail(`${nom} : pas d'icône d'aide`);
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
  assert.ok(jouee.element("tous").children.some(({ id }) => id === "accueil-stations"));
  assert.ok(!jouee.element("tous").children.includes(page));
});

test("relue, la page suit : une station qui passe hors ligne le dit dans sa phrase, et sa pastille grisit", async () => {
  const { jouee, page } = await laPage("box");
  jouee.dire("surAccueil", { ...ACCUEIL, stations: [ligneDeStation({ ...EN_LIGNE, etat: "hors-ligne", dit: "offline for 3 min", max: null }, 0, false)] });
  await repos();
  assert.deepEqual(enTete(page), { nom: "box", ton: "gris", phrase: "offline for 3 min" });
});

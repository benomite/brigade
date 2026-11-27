// Les pannes d'une station, la vue jouée : sur sa page — ouverte d'un clic sur sa ligne de l'accueil —,
// chacune en une ligne, avec son bouton ; un clic le fait jouer au process principal, et ce qu'il rend
// se lit à la suite.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Home } from "../../src/home.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { RenderedOfOutage } from "../../src/outages/actions.ts";
import type { Outage } from "../../src/outages/outages.ts";
import type { StationVue, SeenOfStations } from "../../src/stations/stations.ts";
import { type Fake, playTheVue, openAllTheStations, repos } from "../helpers/false-vue.ts";

const A = "2026-10-15T12:00:00.000Z";
const CONNECTION: Outage = { cle: "connexion-max:2026-10-15T11:48:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 12 min ago", survol: "nothing cooks on box until you log in", bouton: { libelle: "log in", geste: "login" } };
const UPDATE: Outage = { cle: "mise-a-jour:2026-10-15T11:56:00.000Z", sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed", survol: "box stayed on version 1.4.0; the next version will be tried on its own", bouton: { libelle: "dismiss", geste: "ecarter" } };
const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [UPDATE, CONNECTION], dit: "online", version: "1.4.0", projets: [], max: "perdue" };
const HOME: Home = { projets: [], stations: [{ id: "g1", nom: "box", ton: "rouge", dit: "online · Max connection lost · update failed · no project", phrase: "online · no cook running", survol: "Linux 6.1.0 · version 1.4.0" }], sante: { ton: "rouge", dit: "Max: connection lost on box  ·  GitHub ✓", survol: "" } };

const startup = (stations: SeenOfStations) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations,
  accueil: HOME,
});

// Les lignes de la page de la station, sous son en-tête : ses pannes.
const lines = (page: Fake) => page.children[4]?.children ?? [];
// Ce que le survol de la ligne dit : son nom accessible, jamais du texte posé dans la page.
const hoverOf = (line: Fake | undefined) => line?.dessous("button").find(({ className }) => className === "aide")?.ariaLabel ?? assert.fail("pas de survol sur la panne");

test("chaque panne est une ligne sur la page de sa station, avec son bouton ; le clic le joue, et son rendu se lit à la suite", async () => {
  let rendered: RenderedOfOutage = { fait: "the login page opens in your browser: once you are signed in, cooking resumes by itself within the minute" };
  const played = await playTheVue({ demarrage: () => startup({ a: A, stations: [BOX] }), panne: () => rendered, espace: () => [] });
  await openAllTheStations(played);
  // Sur l'accueil, la ligne de la station ne porte aucun bouton de panne : sa page les porte.
  assert.equal(played.element("toutes-les-stations").dessous("button").some(({ textContent }) => textContent === "log in"), false);
  (played.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
  await repos();
  const section = () => played.element("station");
  // En tête, son état en une phrase (#877) : ce qui casse est dessous, sa machine au survol de l'aide.
  const head = section().children[1];
  assert.equal(head?.children[2]?.textContent, "online · no cook running");
  assert.equal(head?.dessous("button").find(({ className }) => className === "aide")?.ariaLabel, "Linux 6.1.0 · version 1.4.0");
  const [update, connection] = lines(section());
  assert.equal(update?.className, "panne");
  // Et, à la suite, « report to brigade » (ticket 1977, report/opening/).
  assert.equal(update?.textContent, "update to version 1.5.0 faileddismiss?report to brigade");
  assert.equal(connection?.dataset.sujet, "connexion-max");
  const button = connection?.dessous("button")[0] ?? assert.fail("pas de bouton sur la panne");
  assert.equal(button.textContent, "log in");
  button.click();
  await repos();
  await repos();
  assert.deepEqual(played.dernier("panne"), ["g1", CONNECTION.cle]);
  assert.match(hoverOf(lines(section())[1]), new RegExp(rendered.fait));

  // Relue, la ligne redit ce que le bouton a rendu ; un refus se lit de même.
  played.dire("surStations", { a: A, stations: [BOX] });
  await repos();
  assert.match(hoverOf(lines(section())[1]), new RegExp(rendered.fait));
  rendered = { refus: "box is not this computer: its login is not launched from this app yet — it is done on box itself" };
  (lines(section())[1]?.dessous("button")[0] ?? assert.fail()).click();
  await repos();
  await repos();
  assert.match(hoverOf(lines(section())[1]), new RegExp(rendered.refus));
});

// Une panne, une ligne, un bouton : ni la commande, ni le doublon de l'en-tête.
const OUTSIDE_LINE: StationVue = {
  ...BOX,
  etat: "hors-ligne",
  ligne: "offline for 12 min · version 1.4.0 · no project",
  dit: "offline for 12 min",
  max: null,
  pannes: [{ cle: "injoignable", sujet: "injoignable", ligne: "offline for 12 min", survol: "box has given no sign of life for 12 min", bouton: { libelle: "check again", geste: "relire" } }],
};

async function pageOf(station: StationVue, sentence: string) {
  const home: Home = { ...HOME, stations: [{ id: station.id, nom: station.nom, ton: "gris", dit: sentence, phrase: sentence, survol: "Linux 6.1.0" }] };
  const played = await playTheVue({ demarrage: () => ({ ...startup({ a: A, stations: [station] }), accueil: home }), panne: () => ({ fait: "dismissed" }), espace: () => [] });
  await openAllTheStations(played);
  (played.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
  await repos();
  return played.element("station");
}

// Rien de la page ne tient du texte brut : ni commande, ni code de sortie.
const withoutTextRaw = (page: Fake) => {
  for (const motive of [/`/, /\$ /, /\bsudo\b/, /\bclaude\b/, /\/login/, /exit code/i, /Error:/]) assert.doesNotMatch(page.textContent, motive);
};
// Le bouton de la panne — pas « report to brigade », qui suit chaque panne (ticket 1977, report/opening/).
const buttonsOfOutage = (page: Fake) => lines(page).flatMap((line) => line.dessous("button").filter(({ className }) => className !== "aide" && className !== "signaler-a-brigade"));

test("hors ligne : une seule ligne « offline for … » avec « check again », et l'en-tête ne la redit pas", async () => {
  const page = await pageOf(OUTSIDE_LINE, "offline for 12 min");
  assert.equal(lines(page).length, 1);
  assert.equal(lines(page)[0]?.dessous("span").find(({ className }) => className === "survol") === undefined, false);
  assert.deepEqual(buttonsOfOutage(page).map(({ textContent }) => textContent), ["check again"]);
  assert.equal(page.textContent.split("offline for 12 min").length - 1, 1);
  assert.equal(page.textContent.includes("no sign of life"), false);
  assert.equal(hoverOf(lines(page)[0]), "box has given no sign of life for 12 min");
  withoutTextRaw(page);
});

test("mise à jour échouée : une seule ligne avec « dismiss », une seule fois sur la page", async () => {
  const page = await pageOf({ ...BOX, pannes: [BOX.pannes[0] as Outage] }, "online · no cook running");
  assert.equal(lines(page).length, 1);
  assert.deepEqual(buttonsOfOutage(page).map(({ textContent }) => textContent), ["dismiss"]);
  assert.equal(page.textContent.split("update to version 1.5.0 failed").length - 1, 1);
  assert.equal(hoverOf(lines(page)[0]), "box stayed on version 1.4.0; the next version will be tried on its own");
  withoutTextRaw(page);
});

test("connexion Max perdue : une seule ligne avec « log in », une seule fois sur la page", async () => {
  const page = await pageOf({ ...BOX, pannes: [BOX.pannes[1] as Outage] }, "online · no cook running");
  assert.equal(lines(page).length, 1);
  assert.deepEqual(buttonsOfOutage(page).map(({ textContent }) => textContent), ["log in"]);
  assert.equal(page.textContent.split("Max connection lost").length - 1, 1);
  assert.equal(hoverOf(lines(page)[0]), "nothing cooks on box until you log in");
  withoutTextRaw(page);
});

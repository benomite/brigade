// « report to brigade », côté vue (vue/report/action.js, ticket 1977) : sur chaque panne que l'app montre — une
// station en panne, une carte mise de côté, une ligne d'erreur, la panne en tête du rail —, un bouton à la suite ; nulle part ailleurs. Un clic passe la panne au process principal, joué ici par
// le vrai module (vue/report/opening.ts) : le navigateur reçoit l'adresse de l'issue préremplie, et rien d'autre.
// La vue est jouée telle qu'elle est, devant un faux document et un faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../../src/home.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { BANNER, holdFacts, type Drawable, type Facts } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import type { Outage } from "../../../src/outages/outages.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type SeenOfProjects } from "../../../src/projects/projects.ts";
import { MARKER } from "../../../src/report/report/report.ts";
import type { StationVue, SeenOfStations } from "../../../src/stations/stations.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { IN_PROGRESS, OPEN, REPORT, HOVER } from "../../../src/vue/report/action.js";
import { openTheReport, type Request } from "../../../src/vue/report/opening.ts";
import { cardOfTicket, type Fake, type Played, playTheVue, openAllTheStations, openRead, type Answers, repos } from "../../helpers/false-vue.ts";

const A = "2026-11-02T09:00:00.000Z";
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };

type With = { stations?: SeenOfStations; accueil?: Home; projetsDesStations?: SeenOfProjects };
const startup = (withIt: With = {}) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  ...withIt,
});

// Le process principal joué par le vrai module : ce que le navigateur reçoit est gardé, et le journal est celui-ci.
function browser() {
  const openOnes: string[] = [];
  const report = (request: Request) => openTheReport(request, { appVersion: "1.6.0", runtimeVersion: () => "2.9.1", ouvrir: async (url) => void openOnes.push(url) });
  return { ouverts: openOnes, signaler: report };
}

async function openParade(answers: Answers = {}, withIt: With = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: () => startup(withIt), espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  return vue;
}

// Les boutons « report to brigade » posés sous `ou`.
const report = (or: Fake) => or.dessous("button").filter(({ className }) => className === "signaler-a-brigade");

// Le rail de parade, tel que la box l'écrit, passé par le process principal (facts.ts) : #14 au travail, #21 dans la
// file, #22 mis de côté, #12 et #30 qui attendent le chef dans Pass.
const ISSUE = (ticket: number) => `https://github.com/benomite/parade/issues/${ticket}`;
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-11-02T08:59:59.000Z",
  dernierTick: "2026-11-02T08:59:50.000Z",
  compteurs: { rail: 5, auTravail: 1, aLaPass: 0, attend: 3, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal", url: ISSUE(14), activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export", url: ISSUE(21), activite: null, attente: null },
    { ticket: 22, etat: "86", titre: "Un ticket libre", url: ISSUE(22), activite: null, attente: { raison: "the cook failed three times", colonne: "86", retour: null } },
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: ISSUE(12), activite: null },
    { ticket: 30, etat: "en pass", titre: "La pass rouge", url: ISSUE(30), activite: null },
  ],
  cooks: [{ ticket: 14, titre: "Le journal", station: "box/claude" }],
  attend: [
    { ticket: 22, titre: "Un ticket libre", url: ISSUE(22) },
    { ticket: 12, titre: "Validation SIRET", url: ISSUE(12) },
    { ticket: 30, titre: "La pass rouge", url: ISSUE(30) },
  ],
};
const receive = (vue: Played, facts: Facts) => {
  const receivedOne: Drawable = holdFacts().recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
};
const card = (vue: Played, ticket: number) => cardOfTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);

describe("les cartes du rail", () => {
  test("une carte mise de côté porte « report to brigade » ; les autres, non", async () => {
    const vue = await openParade();
    receive(vue, FACTS);
    await repos();
    assert.equal(report(card(vue, 22)).length, 1);
    // Une livraison qui attend le chef est l'affaire du projet ; une carte en cuisine ou dans la file n'a pas failli.
    for (const ticket of [12, 30, 14, 21]) assert.deepEqual(report(card(vue, ticket)), [], `#${ticket}`);
    const [button] = report(card(vue, 22));
    assert.equal(button?.textContent, REPORT);
    assert.equal(button?.title, HOVER);
  });

  test("rien n'a failli : aucun bouton sur le rail", async () => {
    const vue = await openParade();
    receive(vue, { ...FACTS, rail: FACTS.rail.filter(({ etat: state }) => state !== "86"), attend: [] });
    await repos();
    assert.deepEqual(report(vue.element("rail")), []);
  });

  test("un clic ouvre dans le navigateur l'issue préremplie de la panne — masquée — et la carte dit qu'elle est ouverte", async () => {
    const { ouverts: openOnes, signaler: open } = browser();
    let render: () => void = () => {};
    const vue = await openParade({ signaler: (request) => new Promise((done) => (render = () => done(open(request)))) });
    receive(vue, FACTS);
    await repos();
    const button = report(card(vue, 22))[0] ?? assert.fail("pas de bouton");
    button.click();
    await repos();
    // Le temps que le navigateur s'ouvre, le bouton le dit et ne se reclique pas.
    assert.equal(button.textContent, IN_PROGRESS);
    assert.equal(button.disabled, true);
    render();
    await repos();
    await repos();

    const [request] = vue.dernier("signaler") as [Request];
    assert.equal(request.projet, "parade");
    assert.deepEqual(request.reference, { ticket: 22 });
    assert.match(request.panne, /^parade, ticket 22: set aside/);
    assert.equal(openOnes.length, 1);
    const address = new URL(openOnes[0] ?? "");
    assert.equal(`${address.origin}${address.pathname}`, "https://github.com/benomite/brigade/issues/new");
    assert.equal(address.searchParams.get("labels"), "field-report");
    const body = address.searchParams.get("body") ?? "";
    assert.ok(body.startsWith(MARKER));
    assert.match(body, /- App: 1\.6\.0\n- Runtime: 2\.9\.1/);
    assert.match(body, /## Failure\nparade, ticket 22: set aside/);
    assert.ok(!body.includes("ghp_") && !body.includes("alice"));
    // La carte redessinée garde ce que le clic a rendu.
    receive(vue, FACTS);
    await repos();
    const pose = card(vue, 22).dessous("span").find(({ className }) => className === "signaler") ?? assert.fail("pas de signalement");
    assert.equal(pose.textContent, `${REPORT}${OPEN}`);
    assert.equal(report(pose)[0]?.disabled, false);
  });

  test("le navigateur qui ne s'ouvre pas : une ligne le dit, le détail au survol", async () => {
    const vue = await openParade({ signaler: () => ({ refus: "the browser did not open: nothing was sent", detail: "no default browser" }) });
    receive(vue, FACTS);
    await repos();
    (report(card(vue, 22))[0] ?? assert.fail("pas de bouton")).click();
    await repos();
    const refusal = card(vue, 22).dessous("p").find(({ className }) => className === "indisponible") ?? assert.fail("pas de refus");
    assert.equal(refusal.textContent, "the browser did not open: nothing was sent?");
    assert.equal(refusal.dessous("button").find(({ className }) => className === "aide")?.ariaLabel, "no default browser");
  });
});

describe("une station en panne", () => {
  const UPDATE: Outage = { cle: "mise-a-jour:2026-11-02T08:56:00.000Z", sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed", survol: "box stayed on version 1.4.0", bouton: { libelle: "dismiss", geste: "ecarter" } };
  const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · parade", pannes: [UPDATE], dit: "online", version: "1.4.0", projets: ["parade"], max: "connectee" };
  const home = (station: StationVue): Home => ({ ...HOME, stations: [{ id: station.id, nom: station.nom, ton: station.pannes.length > 0 ? "rouge" : "vert", dit: "online", phrase: "online · no cook running", survol: "Linux 6.1.0" }] });
  async function pageOf(station: StationVue, answers: Answers = {}) {
    const vue = await playTheVue({ demarrage: () => startup({ stations: { a: A, stations: [station] }, accueil: home(station) }), espace: () => [], ...answers });
    await openAllTheStations(vue);
    (vue.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
    await repos();
    return vue;
  }

  test("sa page porte le bouton à la suite de chaque panne ; le clic nomme la station et un projet qu'elle sert", async () => {
    const vue = await pageOf(BOX);
    const outage = vue.element("station").dessous("p").find(({ className }) => className === "panne") ?? assert.fail("pas de panne");
    (report(outage)[0] ?? assert.fail("pas de bouton sur la panne")).click();
    await repos();
    assert.deepEqual(vue.dernier("signaler"), [{ projet: "parade", reference: { station: "box" }, panne: "station box: update to version 1.5.0 failed" }]);
  });

  test("sans panne, sa page n'en porte aucun", async () => {
    const vue = await pageOf({ ...BOX, pannes: [] });
    assert.deepEqual(report(vue.element("station")), []);
  });

  // La station du projet, refusée : la barre « Cooks on » n'existe plus, le geste reste sur la page de la station (pannes).
  const projects = (state: "refuse" | "servi"): SeenOfProjects => ({
    a: A,
    projets: [{ nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: state, dit: state === "refuse" ? "box cannot clone benomite/parade" : "", autoriser: [] }], servi: null, acces: null, refus: null, worktree: null }],
    recommandee: "g1",
    avertissements: {},
    machines: { g1: machineProposed({ nom: BOX.nom, machine: BOX.machine, coeurs: 8 }) },
    calibrage: calibrationRecommended([]),
  });
  const withIt = (state: "refuse" | "servi"): With => ({ stations: { a: A, stations: [{ ...BOX, pannes: [], projets: [] }] }, accueil: HOME, projetsDesStations: projects(state) });

  test("la barre « Cooks on » est partie (#3523) : une station refusée n'y porte plus de bouton, le projet n'a plus de ligne des stations au-dessus du rail", async () => {
    const red = await openParade({}, withIt("refuse"));
    assert.deepEqual(report(red.element("stations-du-projet")), []);
    assert.equal(red.element("stations-du-projet").hidden, true);
  });
});

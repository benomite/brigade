// « report to brigade », côté vue (vue/report/action.js, ticket 1977) : sur chaque panne que l'app montre — une
// station en panne, une carte mise de côté, une livraison que la pass n'a pas pu juger, une ligne d'erreur, la panne en
// tête du rail —, un bouton à la suite ; nulle part ailleurs. Un clic passe la panne au process principal, joué ici par
// le vrai module (vue/report/ouverture.ts) : le navigateur reçoit l'adresse de l'issue préremplie, et rien d'autre.
// La vue est jouée telle qu'elle est, devant un faux document et un faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../../src/home.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Dessinable, type Facts } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { Outage } from "../../../src/outages/outages.ts";
import { calibrationRecommande, EFFORTS, machineProposee, MODELES, type VuDesProjects } from "../../../src/projects/projects.ts";
import { MARQUEUR } from "../../../src/report/rapport/rapport.ts";
import type { StationVue, VuDesStations } from "../../../src/stations/stations.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { EN_COURS, OUVERT, SIGNALER, SURVOL } from "../../../src/vue/report/action.js";
import { ouvrirLeReport, type Request } from "../../../src/vue/report/ouverture.ts";
import { cardDuTicket, type Faux, type Jouee, jouerLaVue, ouvrirToutesLesStations, ouvrirRead, type Answers, repos } from "../../aides/fausse-vue.ts";

const A = "2026-11-02T09:00:00.000Z";
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };

type Avec = { stations?: VuDesStations; accueil?: Home; projetsDesStations?: VuDesProjects };
const demarrage = (avec: Avec = {}) => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  ...avec,
});

// Le process principal joué par le vrai module : ce que le navigateur reçoit est gardé, et le journal est celui-ci.
const JETON = "ghp_Zq8Xw3Lk9Pm2Nb7Vc4Rt6Yh1Ju5Ig0Of3Ea2";
const LOG = [
  ["1", "2026-11-02T08:50:00.000Z", "parade", "#22", "cook.exited", "runtime", JSON.stringify({ error: `push refused with ${JETON} from /home/alice/parade` })].join("  "),
  ["2", "2026-11-02T08:51:00.000Z", "parade", "#22", "ticket.86", "runtime", JSON.stringify({ reason: "failed three times" })].join("  "),
].join("\n");
function navigateur() {
  const ouverts: string[] = [];
  const signaler = (request: Request) => ouvrirLeReport(request, { appVersion: "1.6.0", runtimeVersion: () => "2.9.1", journal: () => LOG, ouvrir: async (url) => void ouverts.push(url) });
  return { ouverts, signaler };
}

async function ouvrirParade(answers: Answers = {}, avec: Avec = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: () => demarrage(avec), espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  return vue;
}

// Les boutons « report to brigade » posés sous `ou`.
const signaler = (ou: Faux) => ou.dessous("button").filter(({ className }) => className === "signaler-a-brigade");

// Le rail de parade, tel que la box l'écrit, passé par le process principal (facts.ts) : #14 au travail, #21 dans la
// file, #22 mis de côté, #12 remonté parce que la pass n'a pas pu le juger, #30 remonté encore rouge.
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
    { ticket: 12, titre: "Validation SIRET", url: ISSUE(12), decision: { quoi: "remontee", motif: "unjudged", cause: null, pr: "https://github.com/benomite/parade/pull/40" } },
    { ticket: 30, titre: "La pass rouge", url: ISSUE(30), decision: { quoi: "remontee", motif: "still-red", cause: null, pr: "https://github.com/benomite/parade/pull/41" } },
  ],
};
const recevoir = (vue: Jouee, facts: Facts) => {
  const recue: Dessinable = holdFacts().recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
};
const card = (vue: Jouee, ticket: number) => cardDuTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);

describe("les cartes du rail", () => {
  test("une carte mise de côté et une livraison que la pass n'a pas pu juger portent « report to brigade » ; les autres, non", async () => {
    const vue = await ouvrirParade();
    recevoir(vue, FACTS);
    await repos();
    assert.equal(signaler(card(vue, 22)).length, 1);
    assert.equal(signaler(card(vue, 12)).length, 1);
    // Une livraison rouge est l'affaire du projet ; une carte en cuisine ou dans la file n'a pas failli.
    for (const ticket of [30, 14, 21]) assert.deepEqual(signaler(card(vue, ticket)), [], `#${ticket}`);
    const [button] = signaler(card(vue, 22));
    assert.equal(button?.textContent, SIGNALER);
    assert.equal(button?.title, SURVOL);
  });

  test("rien n'a failli : aucun bouton sur le rail", async () => {
    const vue = await ouvrirParade();
    recevoir(vue, { ...FACTS, rail: FACTS.rail.filter(({ etat: state }) => state !== "86"), attend: [] });
    await repos();
    assert.deepEqual(signaler(vue.element("rail")), []);
  });

  test("un clic ouvre dans le navigateur l'issue préremplie de la panne — masquée — et la carte dit qu'elle est ouverte", async () => {
    const { ouverts, signaler: ouvrir } = navigateur();
    let rendre: () => void = () => {};
    const vue = await ouvrirParade({ signaler: (request) => new Promise((fait) => (rendre = () => fait(ouvrir(request)))) });
    recevoir(vue, FACTS);
    await repos();
    const button = signaler(card(vue, 22))[0] ?? assert.fail("pas de bouton");
    button.click();
    await repos();
    // Le temps que le navigateur s'ouvre, le bouton le dit et ne se reclique pas.
    assert.equal(button.textContent, EN_COURS);
    assert.equal(button.disabled, true);
    rendre();
    await repos();
    await repos();

    const [request] = vue.dernier("signaler") as [Request];
    assert.equal(request.projet, "parade");
    assert.deepEqual(request.reference, { ticket: 22 });
    assert.match(request.panne, /^parade, ticket 22: set aside/);
    assert.equal(ouverts.length, 1);
    const adresse = new URL(ouverts[0] ?? "");
    assert.equal(`${adresse.origin}${adresse.pathname}`, "https://github.com/benomite/brigade/issues/new");
    assert.equal(adresse.searchParams.get("labels"), "field-report");
    const corps = adresse.searchParams.get("body") ?? "";
    assert.ok(corps.startsWith(MARQUEUR));
    assert.match(corps, /- App: 1\.6\.0\n- Runtime: 2\.9\.1/);
    assert.match(corps, /## Failure\nparade, ticket 22: set aside/);
    assert.ok(corps.includes("ticket.86"));
    assert.ok(!corps.includes("ghp_") && !corps.includes("alice"));
    // La carte redessinée garde ce que le clic a rendu.
    recevoir(vue, FACTS);
    await repos();
    const pose = card(vue, 22).dessous("span").find(({ className }) => className === "signaler") ?? assert.fail("pas de signalement");
    assert.equal(pose.textContent, `${SIGNALER}${OUVERT}`);
    assert.equal(signaler(pose)[0]?.disabled, false);
  });

  test("le navigateur qui ne s'ouvre pas : une ligne le dit, le détail au survol", async () => {
    const vue = await ouvrirParade({ signaler: () => ({ refus: "the browser did not open: nothing was sent", detail: "no default browser" }) });
    recevoir(vue, FACTS);
    await repos();
    (signaler(card(vue, 12))[0] ?? assert.fail("pas de bouton")).click();
    await repos();
    const refusal = card(vue, 12).dessous("p").find(({ className }) => className === "indisponible") ?? assert.fail("pas de refus");
    assert.equal(refusal.textContent, "the browser did not open: nothing was sent?");
    assert.equal(refusal.dessous("button").find(({ className }) => className === "aide")?.ariaLabel, "no default browser");
  });

  test("la panne en tête du rail porte le bouton ; sans panne, rien", async () => {
    const vue = await ouvrirParade();
    recevoir(vue, { ...FACTS, rail: FACTS.rail.filter(({ etat: state }) => state === "en attente"), attend: [], cooks: [], cuisineOisive: { depuis: "2026-11-02T08:18:00.000Z", cartes: [21] } });
    await repos();
    const outage = vue.element("rail").children.find(({ className }) => className === "panne-du-rail") ?? assert.fail("pas de panne en tête du rail");
    assert.equal(signaler(outage).length, 1);
    assert.equal(signaler(vue.element("rail")).length, 1);
    recevoir(vue, { ...FACTS, rail: FACTS.rail.filter(({ etat: state }) => state === "en attente"), attend: [], cooks: [], cuisineOisive: null });
    await repos();
    assert.deepEqual(signaler(vue.element("rail")), []);
  });
});

describe("une station en panne", () => {
  const UPDATE: Outage = { cle: "mise-a-jour:2026-11-02T08:56:00.000Z", sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed", survol: "box stayed on version 1.4.0", bouton: { libelle: "dismiss", geste: "ecarter" } };
  const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · parade", pannes: [UPDATE], dit: "online", version: "1.4.0", projets: ["parade"], max: "connectee" };
  const home = (station: StationVue): Home => ({ ...HOME, stations: [{ id: station.id, nom: station.nom, ton: station.pannes.length > 0 ? "rouge" : "vert", dit: "online", phrase: "online · no cook running", survol: "Linux 6.1.0" }] });
  async function pageDe(station: StationVue, answers: Answers = {}) {
    const vue = await jouerLaVue({ demarrage: () => demarrage({ stations: { a: A, stations: [station] }, accueil: home(station) }), espace: () => [], ...answers });
    await ouvrirToutesLesStations(vue);
    (vue.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
    await repos();
    return vue;
  }

  test("sa page porte le bouton à la suite de chaque panne ; le clic nomme la station et un projet qu'elle sert", async () => {
    const vue = await pageDe(BOX);
    const outage = vue.element("station").dessous("p").find(({ className }) => className === "panne") ?? assert.fail("pas de panne");
    (signaler(outage)[0] ?? assert.fail("pas de bouton sur la panne")).click();
    await repos();
    assert.deepEqual(vue.dernier("signaler"), [{ projet: "parade", reference: { station: "box" }, panne: "station box: update to version 1.5.0 failed" }]);
  });

  test("sans panne, sa page n'en porte aucun", async () => {
    const vue = await pageDe({ ...BOX, pannes: [] });
    assert.deepEqual(signaler(vue.element("station")), []);
  });

  // La station du projet, refusée : la barre « Cooks on » n'existe plus, le geste reste sur la page de la station (pannes).
  const projects = (state: "refuse" | "servi"): VuDesProjects => ({
    a: A,
    projets: [{ nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: state, dit: state === "refuse" ? "box cannot clone benomite/parade" : "", autoriser: [] }], servi: null, acces: null, refus: null, worktree: null }],
    recommandee: "g1",
    avertissements: {},
    machines: { g1: machineProposee({ nom: BOX.nom, machine: BOX.machine, coeurs: 8 }) },
    calibrage: calibrationRecommande([]),
  });
  const avec = (state: "refuse" | "servi"): Avec => ({ stations: { a: A, stations: [{ ...BOX, pannes: [], projets: [] }] }, accueil: HOME, projetsDesStations: projects(state) });

  test("la barre « Cooks on » est partie (#3523) : une station refusée n'y porte plus de bouton, le projet n'a plus de ligne des stations au-dessus du rail", async () => {
    const red = await ouvrirParade({}, avec("refuse"));
    assert.deepEqual(signaler(red.element("stations-du-projet")), []);
    assert.equal(red.element("stations-du-projet").hidden, true);
  });
});

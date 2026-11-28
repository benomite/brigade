// Les gestes de la file sur le téléphone (ticket 1164) : trancher une carte (merger se fait sur la PR, sur GitHub), arrêter
// ou relancer la cuisine d'un projet. La vue est celle du desktop, sur un écran étroit (#1186), et ses gestes appellent
// les mêmes actions du pont que sur le desktop : `gesteDeFiche` — le geste, le ticket, jamais une commande — et
// `cuireSurLaStation`. Sur le téléphone, il n'y a pas de second où écrire la commande : le pont rend ce que la station
// a fait (`fait`), comme pour une station sur Cooks. La fiche le dit, la box est relue tout de suite, et la carte quitte
// la file à la lecture qui suit. Un geste refusé, ou un pont qui lève, le dit en une ligne, son détail au survol, et la
// file reste ce qu'elle était.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Facts as FactsOfRuntime } from "../../src/facts.ts"; // the app's own Facts (the old runtime's etat.ts is gone)
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { actionsOfCard } from "../../src/card-actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { type Fake, FakeScreen, type Played, playTheVue, type Answers, repos } from "../helpers/false-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const PROJECTS = [{ nom: PARADE, dossier: "/tmp/parade" }];
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const PR_12 = "https://github.com/chef/parade/pull/40";

// Le démarrage tel que le pont de l'app Android le rend (app/android/web/pont.js) : les constantes de l'app, le
// téléphone appairé, ni code ni stations lus — et le projet que sa station sert.
const startup = () => ({
  configuration: forTheBar({ chemin: "no projects file on this phone", projets: PROJECTS }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  telephone: { github: { compte: "chef" } },
});

type Station = FactsOfRuntime["stations"][number];
const station = (name: string, more: Partial<Station> = {}): Station => ({
  station: name,
  distante: false,
  plafond: 2,
  ordinaires: true,
  bacASable: null,
  prendOrdinaires: true,
  cuisson: "cooking",
  arreteeDepuis: null,
  refus: null,
  cooks: [],
  ...more,
});
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
// Dans TODO, deux cartes : #12, en pass ; #31, en attente sur le rail — la table du chef propose de l'en sortir. #21 est
// sur le rail ; #14 cuit sur la box.
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 1, aLaPass: 2, attend: 2, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: COOK_14.titre, url: issue(14), activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: issue(21), activite: null },
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: issue(12), activite: null },
    { ticket: 31, etat: "en attente", titre: "Le tri des fournisseurs", url: issue(31), activite: null },
  ],
  cooks: [COOK_14],
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: issue(12) },
    { ticket: 31, titre: "Le tri des fournisseurs", url: issue(31) },
  ],
  stations: [station("box/claude", { cooks: [COOK_14] })],
};
// La lecture qui suit le retrait de #31 : il a quitté le rail.
const REMOVED: Facts = { ...FACTS, compteurs: { ...FACTS.compteurs, aLaPass: 1, attend: 1 }, rail: FACTS.rail.filter(({ ticket }) => ticket !== 31), attend: (FACTS.attend ?? []).filter(({ ticket }) => ticket !== 31) };

const drawable = (facts: Facts) => holdFacts(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
// Ce que la box rend à la lecture que la vue a demandée en dernier — la relecture qu'un geste fait demande comprise.
function read(vue: Played, facts: Facts): void {
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...drawable(facts), demande: requests.at(-1)?.args[0] as number });
}

// L'espace de parade ouvert sur le téléphone, ses faits lus. Les gestes de la fiche sont ceux du process principal
// (card-actions.ts), pour la carte que la vue lui donne.
async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [], gestesDeFiche: (cardItem) => actionsOfCard(cardItem), ...answers }, { ecran: new FakeScreen(true) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  read(vue, FACTS);
  await repos();
  return vue;
}

const rail = (vue: Played) => vue.element("rail");
// Les tickets de chaque colonne de Rail, par son nom.
const file = (vue: Played) =>
  Object.fromEntries(
    rail(vue)
      .dessous("section")
      .filter((pose) => pose.className === "colonne")
      .map((column) => [column.children[0]?.children[0]?.textContent, column.dessous("li").filter((li) => li.className.split(" ").includes("bon")).map((li) => li.children[0]?.children[0]?.textContent)]),
  );
const card = (vue: Played) => vue.element("fiche");
async function touchTheCard(vue: Played, number: number): Promise<void> {
  const cardItem = rail(vue).dessous("li").find((li) => li.className.split(" ").includes("bon") && li.children[0]?.children[0]?.textContent === `#${number}`) ?? assert.fail(`pas de carte #${number}`);
  cardItem.click();
  await repos();
}
const actions = (vue: Played) => card(vue).dessous("section").find((pose) => pose.className === "gestes-fiche") ?? assert.fail("pas de gestes sur la fiche");
// Le bouton d'un geste de la fiche — pas l'icône de son survol.
const action = (vue: Played, id: string): Fake => actions(vue).dessous("li").find((line) => line.dataset.geste === id)?.dessous("button").filter((pose) => pose.className !== "aide").at(-1) ?? assert.fail(`pas de geste « ${id} »`);
// Toucher un geste qui coûte, puis son « oui » : la confirmation dit son prix d'abord.
async function confirm(vue: Played, id: string): Promise<void> {
  action(vue, id).click();
  await repos();
  const confirmation = actions(vue).dessous("section").find((pose) => pose.className === "confirmation") ?? assert.fail("pas de confirmation");
  (confirmation.dessous("button").find((pose) => pose.className === "recommande") ?? assert.fail("pas de « oui »")).click();
  await repos();
}
// Ce que la fiche dit sous ses gestes : sa ligne, sa classe, et son survol.
// Une ligne d'erreur dit sa phrase dans son premier `span` et garde son détail au survol de son « ? » ; une autre ligne, dans son `title`.
const issueOfAction = (vue: Played) =>
  actions(vue)
    .children.filter((pose) => pose.balise === "p")
    .map((pose) => {
      const error = pose.dataset.ligne === "erreur";
      return { classe: pose.className, dit: error ? (pose.children[0]?.textContent ?? "") : pose.textContent, survol: error ? (pose.dessous("button")[0]?.ariaLabel ?? "") : pose.title };
    });

describe("depuis le téléphone, un geste en vol", () => {
  test("tant que la station n'a pas répondu, la fiche le dit et ses gestes attendent : rien ne part deux fois", async () => {
    let render: (rendered: { fait: string }) => void = () => {};
    const vue = await open({ gesteDeFiche: () => new Promise((resolve) => (render = resolve)) as never });
    await touchTheCard(vue, 31);
    await confirm(vue, "retirer");
    assert.deepEqual(issueOfAction(vue).map(({ dit: said }) => said), ["remove from the rail: sent, waiting for the answer…"]);
    assert.equal(action(vue, "retirer").disabled, true);
    assert.equal(action(vue, "issue").disabled, true);
    render({ fait: "#31 left the rail" });
    await repos();
    assert.deepEqual(issueOfAction(vue).map(({ dit: said }) => said), ["#31 left the rail"]);
    assert.equal(action(vue, "retirer").disabled, false);
    assert.equal(vue.appels.filter(({ geste: name }) => name === "gesteDeFiche").length, 1);
  });
});

describe("depuis le téléphone, trancher une carte", () => {
  test("TODO : #31 — « remove from the rail », confirmé : la carte quitte la file à la lecture qui suit", async () => {
    const vue = await open({ gesteDeFiche: () => ({ fait: "#31 left the rail" }) });
    await touchTheCard(vue, 31);
    await confirm(vue, "retirer");
    assert.deepEqual(vue.dernier("gesteDeFiche"), [PARADE, "retirer", 31, undefined]);
    assert.deepEqual(issueOfAction(vue), [{ classe: "dit", dit: "#31 left the rail", survol: "" }]);
    read(vue, REMOVED);
    await repos();
    // #12 attend toujours le chef : rouge, dans Pass, son étape (#3458).
    assert.deepEqual(file(vue)["Pass"], ["#12"]);
    assert.equal(rail(vue).dessous("li").find((li) => li.dataset.ticket === "12")?.dataset.carte, "attente");
    assert.ok(!Object.values(file(vue)).flat().includes("#31"), "#31 n'est plus nulle part dans la file");
  });
});

describe("depuis le téléphone, un geste qui échoue le dit et laisse la file telle quelle", () => {
  for (const [theCase, actionOfCard, said, hover] of [
    ["refusé par la station", () => ({ refus: "#31 was not removed: GitHub refused the change", detail: "brigade : #31: remove refused — label not found" }), "#31 was not removed: GitHub refused the change", "brigade : #31: remove refused — label not found"],
    ["la station injoignable : le pont lève", () => Promise.reject(new Error("connect ETIMEDOUT 192.168.1.20:7010")), "nothing was sent — nothing was changed", "connect ETIMEDOUT 192.168.1.20:7010"],
    // Le pont Android d'aujourd'hui (app/android/web/pont.js) : un geste qu'il ne connaît pas ne rend rien.
    ["le pont ne porte pas l'action : il ne rend rien", () => undefined, "nothing was sent — nothing was changed", "this app does not carry this action to the station yet"],
  ] as const) {
    test(`${theCase} : une ligne, son détail au survol seulement ; la box n'est pas relue, et #31 reste dans TODO`, async () => {
      const vue = await open({ gesteDeFiche: actionOfCard as Answers["gesteDeFiche"] });
      const before = file(vue);
      await touchTheCard(vue, 31);
      const reread = vue.appels.filter(({ geste: name }) => name === "relireBox").length;
      await confirm(vue, "retirer");
      assert.deepEqual(issueOfAction(vue), [{ classe: "refus", dit: said, survol: hover }]);
      assert.doesNotMatch(actions(vue).textContent, /ETIMEDOUT|brigade :/, "le détail n'est qu'au survol");
      assert.equal(vue.appels.filter(({ geste: name }) => name === "relireBox").length, reread);
      assert.deepEqual(file(vue), before);
      assert.equal(action(vue, "retirer").disabled, false, "le geste se rejoue");
    });
  }
});

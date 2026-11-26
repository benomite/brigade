// Les gestes de la file sur le téléphone (ticket 1164) : trancher une carte (merger se fait sur la PR, sur GitHub), arrêter
// ou relancer la cuisine d'un projet. La vue est celle du desktop, sur un écran étroit (#1186), et ses gestes appellent
// les mêmes actions du pont que sur le desktop : `gesteDeFiche` — le geste, le ticket, jamais une commande — et
// `cuireSurLaStation`. Sur le téléphone, il n'y a pas de second où écrire la commande : le pont rend ce que la station
// a fait (`fait`), comme pour une station sur Cooks. La fiche le dit, la box est relue tout de suite, et la carte quitte
// la file à la lecture qui suit. Un geste refusé, ou un pont qui lève, le dit en une ligne, son détail au survol, et la
// file reste ce qu'elle était.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FactsDuRuntime } from "../../../runtime/src/etat.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../../src/facts.ts";
import { actionsDeCard } from "../../src/card-actions.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { type Faux, FauxScreen, type Jouee, jouerLaVue, type Answers, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const PROJECTS = [{ nom: PARADE, dossier: "/tmp/parade" }];
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const PR_12 = "https://github.com/chef/parade/pull/40";

// Le démarrage tel que le pont de l'app Android le rend (app/android/web/pont.js) : les constantes de l'app, le
// téléphone appairé, ni code ni stations lus — et le projet que sa station sert.
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "no projects file on this phone", projets: PROJECTS }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  telephone: { github: { compte: "chef" } },
});

type Station = FactsDuRuntime["stations"][number];
const station = (name: string, plus: Partial<Station> = {}): Station => ({
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
  ...plus,
});
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
// Dans TODO, deux décisions : #12, verte, que la pass ne merge pas elle-même — à merger sur sa PR ; #31, dont la PR a été
// fermée sans merge — la sortir du rail. #21 est sur le rail ; #14 cuit sur la box.
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
    { ticket: 31, etat: "en pass", titre: "Le tri des fournisseurs", url: issue(31), activite: null },
  ],
  cooks: [COOK_14],
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: issue(12), decision: { quoi: "merge", motif: "review-required", cause: null, pr: PR_12 } },
    { ticket: 31, titre: "Le tri des fournisseurs", url: issue(31), decision: { quoi: "fermee", motif: null, cause: null, pr: null } },
  ],
  stations: [station("box/claude", { cooks: [COOK_14] })],
};
// La lecture qui suit le retrait de #31 : il a quitté le rail.
const RETIREE: Facts = { ...FACTS, compteurs: { ...FACTS.compteurs, aLaPass: 1, attend: 1 }, rail: FACTS.rail.filter(({ ticket }) => ticket !== 31), attend: (FACTS.attend ?? []).filter(({ ticket }) => ticket !== 31) };

const dessinable = (facts: Facts) => holdFacts(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
// Ce que la box rend à la lecture que la vue a demandée en dernier — la relecture qu'un geste fait demande comprise.
function lire(vue: Jouee, facts: Facts): void {
  const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...dessinable(facts), demande: demandes.at(-1)?.args[0] as number });
}

// L'espace de parade ouvert sur le téléphone, ses faits lus. Les gestes de la fiche sont ceux du process principal
// (card-actions.ts), pour la carte que la vue lui donne.
async function ouvrir(answers: Answers = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [], gestesDeFiche: (cardItem) => actionsDeCard(cardItem), ...answers }, { ecran: new FauxScreen(true) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  lire(vue, FACTS);
  await repos();
  return vue;
}

const rail = (vue: Jouee) => vue.element("rail");
// Les tickets de chaque colonne de Rail, par son nom.
const file = (vue: Jouee) =>
  Object.fromEntries(
    rail(vue)
      .dessous("section")
      .filter((pose) => pose.className === "colonne")
      .map((colonne) => [colonne.children[0]?.children[0]?.textContent, colonne.dessous("li").filter((li) => li.className.split(" ").includes("bon")).map((li) => li.children[0]?.children[0]?.textContent)]),
  );
const card = (vue: Jouee) => vue.element("fiche");
async function toucherLaCard(vue: Jouee, numero: number): Promise<void> {
  const cardItem = rail(vue).dessous("li").find((li) => li.className.split(" ").includes("bon") && li.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de carte #${numero}`);
  cardItem.click();
  await repos();
}
const actions = (vue: Jouee) => card(vue).dessous("section").find((pose) => pose.className === "gestes-fiche") ?? assert.fail("pas de gestes sur la fiche");
// Le bouton d'un geste de la fiche — pas l'icône de son survol.
const action = (vue: Jouee, id: string): Faux => actions(vue).dessous("li").find((line) => line.dataset.geste === id)?.dessous("button").filter((pose) => pose.className !== "aide").at(-1) ?? assert.fail(`pas de geste « ${id} »`);
// Toucher un geste qui coûte, puis son « oui » : la confirmation dit son prix d'abord.
async function confirmer(vue: Jouee, id: string): Promise<void> {
  action(vue, id).click();
  await repos();
  const confirmation = actions(vue).dessous("section").find((pose) => pose.className === "confirmation") ?? assert.fail("pas de confirmation");
  (confirmation.dessous("button").find((pose) => pose.className === "recommande") ?? assert.fail("pas de « oui »")).click();
  await repos();
}
// Ce que la fiche dit sous ses gestes : sa ligne, sa classe, et son survol.
// Une ligne d'erreur dit sa phrase dans son premier `span` et garde son détail au survol de son « ? » ; une autre ligne, dans son `title`.
const issueDuAction = (vue: Jouee) =>
  actions(vue)
    .children.filter((pose) => pose.balise === "p")
    .map((pose) => {
      const error = pose.dataset.ligne === "erreur";
      return { classe: pose.className, dit: error ? (pose.children[0]?.textContent ?? "") : pose.textContent, survol: error ? (pose.dessous("button")[0]?.ariaLabel ?? "") : pose.title };
    });

describe("depuis le téléphone, un geste en vol", () => {
  test("tant que la station n'a pas répondu, la fiche le dit et ses gestes attendent : rien ne part deux fois", async () => {
    let rendre: (rendu: { fait: string }) => void = () => {};
    const vue = await ouvrir({ gesteDeFiche: () => new Promise((resoudre) => (rendre = resoudre)) as never });
    await toucherLaCard(vue, 31);
    await confirmer(vue, "retirer");
    assert.deepEqual(issueDuAction(vue).map(({ dit }) => dit), ["remove from the rail: sent, waiting for the answer…"]);
    assert.equal(action(vue, "retirer").disabled, true);
    assert.equal(action(vue, "issue").disabled, true);
    rendre({ fait: "#31 left the rail" });
    await repos();
    assert.deepEqual(issueDuAction(vue).map(({ dit }) => dit), ["#31 left the rail"]);
    assert.equal(action(vue, "retirer").disabled, false);
    assert.equal(vue.appels.filter(({ geste: name }) => name === "gesteDeFiche").length, 1);
  });
});

describe("depuis le téléphone, trancher une carte", () => {
  test("TODO : #31, sa PR fermée sans merge — « remove from the rail », recommandé, confirmé : la carte quitte la file à la lecture qui suit", async () => {
    const vue = await ouvrir({ gesteDeFiche: () => ({ fait: "#31 left the rail" }) });
    await toucherLaCard(vue, 31);
    assert.equal(action(vue, "retirer").className, "recommande");
    await confirmer(vue, "retirer");
    assert.deepEqual(vue.dernier("gesteDeFiche"), [PARADE, "retirer", 31, undefined]);
    assert.deepEqual(issueDuAction(vue), [{ classe: "dit", dit: "#31 left the rail", survol: "" }]);
    lire(vue, RETIREE);
    await repos();
    // #12 attend toujours le chef : rouge, dans Pass, son étape (#3458).
    assert.deepEqual(file(vue)["Pass"], ["#12"]);
    assert.equal(rail(vue).dessous("li").find((li) => li.dataset.ticket === "12")?.dataset.carte, "attente");
    assert.ok(!Object.values(file(vue)).flat().includes("#31"), "#31 n'est plus nulle part dans la file");
  });
});

describe("depuis le téléphone, un geste qui échoue le dit et laisse la file telle quelle", () => {
  for (const [cas, actionDeCard, dit, survol] of [
    ["refusé par la station", () => ({ refus: "#31 was not removed: GitHub refused the change", detail: "brigade : #31: remove refused — label not found" }), "#31 was not removed: GitHub refused the change", "brigade : #31: remove refused — label not found"],
    ["la station injoignable : le pont lève", () => Promise.reject(new Error("connect ETIMEDOUT 192.168.1.20:7010")), "nothing was sent — nothing was changed", "connect ETIMEDOUT 192.168.1.20:7010"],
    // Le pont Android d'aujourd'hui (app/android/web/pont.js) : un geste qu'il ne connaît pas ne rend rien.
    ["le pont ne porte pas l'action : il ne rend rien", () => undefined, "nothing was sent — nothing was changed", "this app does not carry this action to the station yet"],
  ] as const) {
    test(`${cas} : une ligne, son détail au survol seulement ; la box n'est pas relue, et #31 reste dans TODO`, async () => {
      const vue = await ouvrir({ gesteDeFiche: actionDeCard as Answers["gesteDeFiche"] });
      const avant = file(vue);
      await toucherLaCard(vue, 31);
      const relues = vue.appels.filter(({ geste: name }) => name === "relireBox").length;
      await confirmer(vue, "retirer");
      assert.deepEqual(issueDuAction(vue), [{ classe: "refus", dit, survol }]);
      assert.doesNotMatch(actions(vue).textContent, /ETIMEDOUT|brigade :/, "le détail n'est qu'au survol");
      assert.equal(vue.appels.filter(({ geste: name }) => name === "relireBox").length, relues);
      assert.deepEqual(file(vue), avant);
      assert.equal(action(vue, "retirer").disabled, false, "le geste se rejoue");
    });
  }
});

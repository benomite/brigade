// Le plan de la cuisine dans la vue jouée (ticket 4238) : `facts` tel que le process principal le range, puis ce que la vue
// en pose — la carte parked dans la colonne où elle attend, ce qu'elle dit, le TODO qui ouvre la carte d'un clic, la bande
// du haut que l'équipe lue remplit, et chaque message du haut avec le geste qu'il offre au chef.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { holdBands } from "../../../src/alerts.ts";
import { putAside } from "../../../src/awaiting.ts";
import { BANNER, holdFacts, type Facts } from "../../../src/facts.ts";
import { actionsOfCard } from "../../../src/card-actions.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { holdTheTeam } from "../../../src/vue/autonomy/team.js";
import { source } from "../../../src/vue/autonomy/source.js";
import { linesOfRefusal } from "../../../src/vue/project/rail/refusal-of-station.js";
import { isRed } from "../../../src/vue/todo/todo.js";
import { type Fake, Fake as Element, type Played, playTheVue, repos } from "../../helpers/false-vue.ts";
import { TEAM } from "../../autonomy/team-fixture.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const doc = { createElement: (balise: string) => new Element(balise) };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER, calibrage: { modeles: MODELS, efforts: EFFORTS }, code: undefined,
});
async function open(answers: Record<string, unknown> = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsOfCard(card), ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const entry = (ticket: number, state: string, more: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...more });
const facts = (more: Partial<Facts> & { rail: Facts["rail"] }): Facts => ({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...more });
async function show(vue: Played, more: Partial<Facts> & { rail: Facts["rail"] }, a = new Date().toISOString()): Promise<Fake> {
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a, sorties: [{ commande: "facts", texte: JSON.stringify(facts(more)) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue.element("rail");
}
const column = (rail: Fake, name: string): Fake => rail.dessous("section").find(({ dataset }) => dataset.colonne === name) ?? assert.fail(`pas de colonne ${name}`);
const slip = (or: Fake, ticket: number): Fake => or.dessous("li").find(({ className, dataset }) => className.split(" ").includes("bon") && dataset.ticket === String(ticket)) ?? assert.fail(`pas de carte #${ticket}`);
const parked = (card: Fake) => card.dessous("p").find(({ className }) => className === "parque")?.textContent;
const buttonNamed = (or: Fake, text: string): Fake => or.dessous("button").find(({ textContent }) => textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
// Le TODO, une ligne au-dessus des colonnes (#4354) : un clic la déplie et montre ses entrées.
const theTodo = (rail: Fake): Fake => {
  const opinion = rail.children.find(({ className }) => className === "avis-du-todo") ?? assert.fail("pas de TODO");
  opinion.dessous("button")[0]?.click();
  return opinion.children.find(({ className }) => className === "todo-du-rail") ?? assert.fail("TODO pas déplié");
};
const THIRD = { quoi: "your call", qui: "the chef", depuis: "2026-11-24T10:00:00Z", relance: "2026-11-28T09:00:00Z", aLArrivee: "goes on" };

describe("la carte parked, dans la colonne où elle attend", () => {
  test("parked pour le chef : dans Cooks, rouge, et dans son TODO ; parked pour un tiers : ni rouge, ni dans le TODO", async () => {
    const vue = await open();
    const rail = await show(vue, {
      rail: [entry(51, "pris", { tiers: THIRD }), entry(52, "pris", { tiers: { ...THIRD, qui: "Stripe support" } }), entry(53, "pris")],
      attend: [{ ticket: 51, titre: "Ticket 51", url: url(51) }],
    });
    const cooks = column(rail, "Cooks");
    assert.equal(parked(slip(cooks, 51)), "parked — waits for the chef, until 28 Nov, 09:00 UTC");
    assert.equal(slip(cooks, 51).dataset.parque, "");
    assert.equal(slip(cooks, 51).dataset.carte, "attente");
    assert.equal(parked(slip(cooks, 52)), "parked — waits for Stripe support, until 28 Nov, 09:00 UTC");
    assert.notEqual(slip(cooks, 52).dataset.carte, "attente");
    assert.equal(parked(slip(cooks, 53)), undefined);
    assert.equal(slip(cooks, 53).dataset.parque, undefined);
    const todo = theTodo(rail);
    assert.deepEqual(todo.dessous("li").map(({ dataset }) => dataset.ticket), ["51"]);
  });

  test("mis de côté par le runtime : parked dans la colonne où il attend, jusqu'à son retour", async () => {
    const vue = await open();
    const rail = await show(vue, { rail: [entry(40, "86", { attente: { raison: "the project setup", colonne: "en pass", retour: "2026-11-26T12:00:00Z" } }), entry(41, "86", { attente: { raison: "a free place", colonne: "pris", retour: null } })] });
    assert.equal(parked(slip(column(rail, "Pass"), 40)), "parked — waits for the project setup, until 26 Nov, 12:00 UTC");
    assert.equal(parked(slip(column(rail, "Cooks"), 41)), "parked — waits for a free place, no date set");
  });

  test("une entrée du TODO ouvre la fiche de sa carte, d'un clic", async () => {
    const vue = await open();
    const rail = await show(vue, { rail: [entry(51, "pris", { tiers: THIRD })], attend: [{ ticket: 51, titre: "Ticket 51", url: url(51) }] });
    assert.equal(vue.element("fiche").hidden, true);
    const todo = theTodo(rail);
    buttonNamed(todo, "#51 Ticket 51").click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    assert.equal(vue.element("fiche").dessous("header")[0]?.children[0]?.textContent, "#51");
  });

  test("la carte parked pour le chef est rouge ; parked pour un autre, non", () => {
    const card = { ticket: 1, ouvrable: true, attendu: false, attend: [], dit: [], fiche: {} } as unknown as Parameters<typeof isRed>[0];
    assert.equal(isRed({ ...card, parque: { qui: "the chef", jusqua: null, chef: true } }), true);
    assert.equal(isRed({ ...card, parque: { qui: "Camille", jusqua: null } }), false);
  });
});

describe("le process principal pose `parque`", () => {
  // Qui il attend décide s'il attend le chef — plus d'être nommé par `attend` (#4261).
  test("un ticket qui attend un tiers est parked ; parked pour « the chef », il attend le chef ; mis de côté, jusqu'à son retour", () => {
    const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts({ rail: [entry(51, "pris", { tiers: THIRD }), entry(52, "WAITING", { tiers: THIRD }), entry(40, "86", { attente: { raison: "the setup", colonne: "en pass", retour: null } }), entry(53, "pris")], attend: [{ ticket: 51, titre: "Ticket 51", url: url(51) }] })) }] });
    assert.ok("tableau" in receivedOne);
    const cards = receivedOne.tableau.rail.colonnes.flatMap(({ cartes: itsOwn }) => itsOwn);
    const of = (ticket: number) => cards.find((one) => one.ticket === ticket)?.parque;
    assert.deepEqual(of(51), { qui: "the chef", quoi: "your call", jusqua: "2026-11-28T09:00:00Z", chef: true });
    assert.deepEqual(of(52), { qui: "the chef", quoi: "your call", jusqua: "2026-11-28T09:00:00Z", chef: true });
    assert.deepEqual(of(40), { qui: "the setup", jusqua: null });
    assert.equal(of(53), undefined);
  });

});

describe("chaque message du haut offre un geste", () => {
  test("une lecture vieille offre de relire : le bouton relit la box", async () => {
    const vue = await open();
    const rail = await show(vue, { rail: [entry(41, "pris")] }, "2026-10-01T00:00:00.000Z");
    const line = rail.children.find(({ className }) => className === "relisible") ?? assert.fail("pas de lecture à relire");
    assert.equal(line.children[0]?.className, "fraicheur");
    const before = vue.appels.filter(({ geste: action }) => action === "relireBox").length;
    buttonNamed(line, "read again").click();
    assert.equal(vue.appels.filter(({ geste: action }) => action === "relireBox").length, before + 1);
  });

  test("une station qui refuse le projet : sa ligne ouvre Stations", () => {
    let openEntries = 0;
    const [line] = linesOfRefusal(doc, [{ station: "box/claude", etat: "refused", dit: "No access.", survol: "Give it access." }], () => void openEntries++) as unknown as Fake[];
    buttonNamed(line ?? assert.fail("pas de ligne"), "open Cooks").click();
    assert.equal(openEntries, 1);
    const [without] = linesOfRefusal(doc, [{ station: "box/claude", etat: "refused", dit: "No access.", survol: "Give it access." }]) as unknown as Fake[];
    assert.deepEqual(without?.dessous("button"), []);
  });
});

describe("la bande du haut et l'équipe (#4354)", () => {
  test("l'équipe lue montre le supervisor et le closer dans ses badges : la bande n'en repose pas de carte", async () => {
    const vue = await open({ lireLesAgents: () => structuredClone(TEAM) });
    const rail = await show(vue, { rail: [entry(41, "pris")] });
    await repos();
    const band = rail.children.find(({ className }) => className === "bande-du-haut") ?? assert.fail("pas de bande du haut");
    assert.deepEqual(band.dessous("button"), []);
    const badges = vue.element("equipe-du-projet").dessous("button").filter(({ className }) => className.split(" ").includes("badge"));
    assert.deepEqual(badges.slice(0, 2).map(({ dataset }) => dataset.agent), ["supervisor", "closer"]);
  });

  test("le bloc de l'équipe : l'agent du projet lu, rien d'un autre ; une lecture qui change l'équipe le dit, une qui ne change rien, non", async () => {
    const readOne: string[] = [];
    const before = { ...source };
    let renderedOnes: unknown[] = structuredClone(TEAM);
    Object.assign(source, { lire: async () => renderedOnes });
    try {
      const team = holdTheTeam(doc, new Element("section"), (project) => void readOne.push(project));
      team.lire(PARADE);
      await repos();
      assert.deepEqual(readOne, [PARADE]);
      assert.equal(team.agent(PARADE, "closer")?.nextRun.text, "closer: next pass in 3 h");
      assert.equal(team.agent("cantine", "closer"), undefined);
      assert.equal(team.agent(PARADE, "personne"), undefined);
      team.lire(PARADE);
      await repos();
      assert.deepEqual(readOne, [PARADE]);
      renderedOnes = [];
      team.lire(PARADE);
      await repos();
      assert.deepEqual(readOne, [PARADE, PARADE]);
    } finally {
      Object.assign(source, before);
    }
  });
});

describe("le plan, colonne par colonne", () => {
  test("le rail vide le dit en tête du backlog ; un rail sans ticket prêt le dit aussi ; sans rien d'autre, pas de « Not ready yet »", async () => {
    const vue = await open();
    let rail = await show(vue, { rail: [] });
    const ofRail = () => column(rail, "Backlog").dessous("div").find(({ className }) => className === "du-rail") ?? assert.fail("pas de rail en tête du backlog");
    assert.match(ofRail().children[1]?.textContent ?? "", /^No ticket on the rail yet\./);
    rail = await show(vue, { rail: [entry(33, "BLOQUÉ")] });
    assert.equal(ofRail().children[1]?.textContent, "no ticket is ready on the rail");
    assert.ok(column(rail, "Backlog").dessous("div").some(({ className }) => className === "pas-prets"));
    rail = await show(vue, { rail: [entry(31, "en attente")] });
    assert.equal(column(rail, "Backlog").dessous("div").some(({ className }) => className === "pas-prets"), false);
  });

  test("la station d'une carte s'étiquette dans Cooks et Pass, pas dans le backlog", async () => {
    const vue = await open();
    const rail = await show(vue, { rail: [entry(31, "en attente", { station: "box/claude" }), entry(32, "pris", { station: "box/claude" }), entry(33, "en pass", { station: "mac/claude" })] });
    const label = (card: Fake) => card.dessous("span").find(({ className }) => className.includes("etiquette-station"))?.textContent;
    assert.equal(label(slip(column(rail, "Backlog"), 31)), undefined);
    assert.equal(label(slip(column(rail, "Cooks"), 32)), "box");
    assert.equal(label(slip(column(rail, "Pass"), 33)), "mac");
  });

});

describe("le haut du rail, sous la bande", () => {
  test("l'équipe lue après le rail : la bande se repose, ses cartes cèdent la place aux badges", async () => {
    let read: (team: unknown) => void = () => {};
    const vue = await open({ lireLesAgents: () => new Promise((resolved) => (read = resolved)) });
    const rail = await show(vue, { rail: [entry(41, "pris")] });
    const cards = () => rail.dessous("button").filter(({ className }) => className.split(" ").includes("carte-d-agent")).map(({ dataset }) => dataset.agent);
    assert.deepEqual(cards(), ["supervisor", "closer"]);
    read(structuredClone(TEAM));
    await repos();
    assert.deepEqual(cards(), []);
  });

  test("le disjoncteur ouvert n'est plus sur le rail : la bande de l'espace le dit — pas la ligne du projet éteint, que son interrupteur dit", async () => {
    const vue = await open({ geste: () => undefined });
    await show(vue, { rail: [entry(21, "en attente")] });
    const readOne = (command: string, text: string) => ({ projet: PARADE, demande: 1, a: A, sorties: [{ commande: command, texte: text }] });
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir([PARADE]);
    bands.faits(readOne("facts", JSON.stringify(facts({ rail: [entry(21, "en attente")], etat: "retenue" }))));
    bands.status(putAside(readOne("status", ["project    parade", "kitchen    held · breaker OPEN for 1 h 00 (3 failures in a row)", ""].join("\n"))));
    vue.dire("surAlertes", bands.manager(readOne("manager", "manager               ÉTEINT depuis le 2026-11-03T09:25:21.838Z (par chef) — aucune issue n'est jugée, ce qu'il a posé reste posé\n")));
    await repos();
    assert.doesNotMatch(vue.element("alertes").textContent, /project off/);
    assert.match(vue.element("alertes").textContent, /breaker open/);
    assert.doesNotMatch(vue.element("rail").textContent, /breaker open/);
  });
});

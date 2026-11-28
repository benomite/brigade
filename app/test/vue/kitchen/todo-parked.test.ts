// Le TODO du chef est exactement les tickets parked pour lui (#4261, règle 13 de la spec du 2026-11-24) : qui un ticket
// attend décide, pas d'être nommé par la file, ni une date passée. Chaque entrée dit ce qui est demandé au chef et porte les
// boutons de sa carte ; un clic y répond. D'abord ce que le process principal pose (facts.ts), puis l'entrée seule devant un
// faux document (vue/kitchen/kitchen.js), puis la vue jouée.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import type { CardOfTodo } from "../../../src/card-todo.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { holdFacts, type Card, type Facts } from "../../../src/facts.ts";
import { HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { actionsOfTodo, setTheTodo } from "../../../src/vue/kitchen/kitchen.js";
import { Fake, type Played, playTheVue, repos } from "../../helpers/false-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const entry = (ticket: number, state: string, more: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...more });
const third = (who: string, relaunch: string) => ({ quoi: "the signed quote", qui: who, depuis: "2026-11-20T10:00:00Z", relance: relaunch, aLArrivee: "goes back to the kitchen" });
// La carte que le manager pose au chef, lue de GitHub : sa question, ses deux choix.
const QUESTION = { sorte: "product-question", texte: "Ship the export as CSV?\n- [resume] Yes, ship it\n- [close] No, drop it" };

function cardsOf(readOnes: Facts) {
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(readOnes) }] });
  assert.ok("tableau" in receivedOne);
  return receivedOne.tableau.rail.colonnes;
}

describe("le TODO est exactement les tickets parked pour le chef", () => {


});

const doc = { createElement: (balise: string) => new Fake(balise) };
const PARKED = { qui: "the chef", jusqua: null, chef: true };
const card = (ticket: number, more: Partial<Card> = {}): Card => ({ ticket, titre: `Ticket ${ticket}`, ouvrable: true, attendu: true, attend: [], dit: [], fiche: {} as Card["fiche"], parque: PARKED, ...more }) as Card;
const todo = (more: Partial<CardOfTodo> = {}): CardOfTodo => ({ sorte: "product-question", question: "Ship it?", choix: [{ texte: "Yes", prix: "" }, { texte: "No", prix: "" }], prixDuTexte: "", ...more });
type Plays = [number, string, unknown];
function actions(step: "repos" | "envoi" | "refus" = "repos") {
  const played: Plays[] = [];
  const state = step === "envoi" ? { etape: step, reponse: { question: "Ship it?", choix: 1 } } : step === "refus" ? { etape: step, dit: "no", detail: "" } : { etape: step };
  return { joues: played, gestes: { etat: () => state as never, jouer: (ticket: number, kind: string, answer?: unknown) => void played.push([ticket, kind, answer]) } };
}
const buttons = (or: Fake) => or.dessous("button").filter(({ dataset }) => dataset.bouton !== "discret");

describe("chaque entrée du TODO dit ce qui est demandé, avec ses boutons", () => {
  test("la question, puis un bouton par choix, le premier recommandé ; un clic y répond", () => {
    const { joues: played, gestes: itsOwn } = actions();
    const setOne = setTheTodo(doc, { deplie: { ouvert: true }, cartes: [card(50, { todo: todo(), parque: { ...PARKED, quoi: "Ship it?" } })], ouvrir: () => {}, gestes: itsOwn as never }) as unknown as Fake;
    const [li] = setOne.dessous("li");
    assert.ok(li !== undefined);
    assert.deepEqual(li.dessous("p").map(({ className, textContent }) => [className, textContent]), [["demande-du-todo", "Ship it?"]]);
    assert.deepEqual(buttons(li).map(({ textContent, className }) => [textContent, className]), [["Yes", "recommande"], ["No", ""]]);
    buttons(li)[1]?.click();
    assert.deepEqual(played, [[50, "repondre", { question: "Ship it?", choix: 2 }]]);
  });

  test("la recommandation de la carte est le bouton plein ; sans recommandation, aucun", () => {
    const { gestes: itsOwn } = actions();
    const texts = (one: CardOfTodo) => actionsOfTodo(card(50, { todo: one }), itsOwn as never).map(({ texte: text, recommande: recommended, reponse: answer }) => [text, recommended, answer]);
    assert.deepEqual(texts(todo({  })), [["Yes", false, { question: "Ship it?", choix: 1 }], ["No", true, { question: "Ship it?", choix: 2 }]]);
    assert.deepEqual(texts(todo({  })), [["Yes", false, { question: "Ship it?", choix: 1 }], ["No", false, { question: "Ship it?", choix: 2 }]]);
  });

  test("sa réponse en route, ses choix attendent ; refusée, ils reviennent", () => {
    assert.deepEqual(actionsOfTodo(card(50, { todo: todo() }), actions("envoi").gestes as never), []);
    assert.equal(actionsOfTodo(card(50, { todo: todo() }), actions("refus").gestes as never).length, 2);
  });

  test("une carte de WAITING sans question n'a aucun bouton : ni « resume », ni « it arrived »", () => {
    const { gestes: itsOwn } = actions();
    const setOne = setTheTodo(doc, { deplie: { ouvert: true }, cartes: [card(51, { attendu: false }), card(52)], ouvrir: () => {}, gestes: itsOwn as never }) as unknown as Fake;
    const [first, second] = setOne.dessous("li");
    assert.deepEqual(buttons(first as Fake), []);
    assert.deepEqual(buttons(second as Fake), []);
  });

  test("sans gestes — un projet en lecture seule —, la question se lit, aucun bouton ; sans question, aucune ligne", () => {
    const setOne = setTheTodo(doc, { deplie: { ouvert: true }, cartes: [card(50, { todo: todo(), parque: { ...PARKED, quoi: "Ship it?" } }), card(53, { titre: undefined })], ouvrir: () => {} }) as unknown as Fake;
    const [first, second] = setOne.dessous("li");
    assert.deepEqual(buttons(first as Fake), []);
    assert.equal((first as Fake).dessous("p")[0]?.textContent, "Ship it?");
    assert.deepEqual((second as Fake).dessous("p"), []);
    // Son numéro, son titre s'il en a un, et ce qui la tient parked au survol.
    const numbers = setOne.dessous("li").flatMap((li) => li.dessous("button"));
    assert.deepEqual(numbers.map(({ textContent }) => textContent), ["#50 Ticket 50", "#53"]);
    assert.equal(numbers[1]?.title, "open #53's card — parked — waits for the chef, no date set");
  });
});

// La vue jouée : le TODO pose les boutons de chaque carte, et un clic part comme depuis la carte.
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, rubriques: HEADINGS,
  calibrage: { modeles: MODELS, efforts: EFFORTS }, });
async function show(readOnes: Facts): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], ouvrirIssue: () => true, repondreCarte: () => ({ repondue: true, dit: "posted", commentaire: 7 }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(readOnes) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
// Le TODO est une ligne au-dessus des colonnes (#4354) : un clic la déplie, s'il ne l'est pas déjà.
const theTodo = (vue: Played): Fake => {
  const opinion = vue.element("rail").children.find(({ className }) => className === "avis-du-todo") ?? assert.fail("pas de TODO");
  const [line] = opinion.dessous("button");
  if (line?.ariaExpanded !== "true") line?.click();
  return opinion.children.find(({ className }) => className === "todo-du-rail") ?? assert.fail("TODO pas déplié");
};
const entryOf = (vue: Played, ticket: number): Fake => theTodo(vue).dessous("li").find(({ dataset }) => dataset.ticket === String(ticket)) ?? assert.fail(`pas d'entrée #${ticket}`);
const callsOf = (vue: Played, action: string) => vue.appels.filter((call) => call.geste === action).map(({ args }) => args);
const slip = (vue: Played, ticket: number): Fake => vue.element("rail").dessous("li").find(({ className, dataset }) => className.split(" ").includes("bon") && dataset.ticket === String(ticket)) ?? assert.fail(`pas de carte #${ticket}`);

describe("la vue : le TODO, ses questions et ses boutons", () => {


});

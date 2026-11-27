// Le TODO du chef est exactement les tickets parked pour lui (#4261, règle 13 de la spec du 2026-11-24) : qui un ticket
// attend décide, pas d'être nommé par la file, ni une date passée. Chaque entrée dit ce qui est demandé au chef et porte les
// boutons de sa carte ; un clic y répond. D'abord ce que le process principal pose (facts.ts), puis l'entrée seule devant un
// faux document (vue/kitchen/kitchen.js), puis la vue jouée.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { ACTIONS_OF_WAIT } from "../../../src/wait.ts";
import { forTheBar } from "../../../src/bar.ts";
import type { CardOfTodo } from "../../../src/card-todo.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER, holdFacts, type Card, type Facts } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { whatAwaitingYou, actionsOfTodo, planOfTheKitchen, setTheTodo } from "../../../src/vue/kitchen/kitchen.js";
import { tidyTheRail } from "../../../src/vue/todo/todo.js";
import { Fake, type Played, playTheVue, repos } from "../../helpers/false-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const entry = (ticket: number, state: string, more: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...more });
const facts = (more: Partial<Facts> & { rail: Facts["rail"] }): Facts => ({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...more });
const third = (who: string, relaunch: string) => ({ quoi: "the signed quote", qui: who, depuis: "2026-11-20T10:00:00Z", relance: relaunch, aLArrivee: "goes back to the kitchen" });
// La carte que le manager pose au chef, lue de GitHub : sa question, ses deux choix.
const QUESTION = { sorte: "product-question", texte: "Ship the export as CSV?\n- [resume] Yes, ship it\n- [close] No, drop it" };

// #50 attend le chef (sa carte) ; #51 est parked pour le chef ; #52 est nommé par la file mais parked pour Stripe ; #53 est
// parked pour le client jusqu'à une date passée ; #54 cuit ; #70 attend bob.
const WORLD = facts({
  rail: [
    entry(51, "pris", { tiers: third("the chef", "2026-11-28T09:00:00Z") }),
    entry(52, "pris", { tiers: third("Stripe support", "2026-11-28T09:00:00Z") }),
    entry(53, "WAITING", { tiers: third("the client", "2026-11-24T09:00:00Z") }),
    entry(54, "pris"),
  ],
  attend: [
    { ticket: 50, titre: "Ticket 50", url: url(50), chef: QUESTION },
    { ticket: 52, titre: "Ticket 52", url: url(52) },
  ],
  attendAutres: [{ ticket: 70, titre: "Ticket 70", url: url(70), chef: QUESTION, qui: ["bob"] }],
});
function cardsOf(readOnes: Facts) {
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(readOnes) }] });
  assert.ok("tableau" in receivedOne);
  return receivedOne.tableau.rail.colonnes;
}

describe("le TODO est exactement les tickets parked pour le chef", () => {
  test("ce qui attend le chef est parked pour lui, pour sa question ; ce qui attend un autre humain, pour lui", () => {
    const columns = cardsOf(WORLD);
    const of = (ticket: number) => columns.flatMap(({ cartes: cards, autres: others }) => [...cards, ...(others ?? [])]).find((one) => one.ticket === ticket)?.parque;
    assert.deepEqual(of(50), { qui: "the chef", quoi: "Ship the export as CSV?", jusqua: null, chef: true });
    assert.deepEqual(of(70), { qui: "bob", quoi: "Ship the export as CSV?", jusqua: null });
    assert.deepEqual(of(51), { qui: "the chef", quoi: "the signed quote", jusqua: "2026-11-28T09:00:00Z", chef: true });
    assert.deepEqual(of(52), { qui: "Stripe support", quoi: "the signed quote", jusqua: "2026-11-28T09:00:00Z" });
    assert.equal(of(54), undefined);
  });

  test("le TODO : parked pour le chef, oui ; parked pour un autre, nommé par la file ou non, ou jusqu'à une date passée, non", () => {
    const plan = planOfTheKitchen(tidyTheRail(cardsOf(WORLD)).colonnes);
    assert.deepEqual(whatAwaitingYou(plan).map(({ ticket }) => ticket).sort(), [50, 51]);
  });

  test("ce que sa carte attend, faute de question, est ce qui est demandé au chef", () => {
    const columns = cardsOf(facts({ rail: [entry(55, "en attente")], attend: [{ ticket: 55, titre: "Ticket 55", url: url(55) }] }));
    const parked = columns.flatMap(({ cartes: cards }) => cards).find(({ ticket }) => ticket === 55)?.parque;
    assert.deepEqual(parked, { qui: "the chef", quoi: "no question found on #55", jusqua: null, chef: true });
  });
});

const doc = { createElement: (balise: string) => new Fake(balise) };
const PARKED = { qui: "the chef", jusqua: null, chef: true };
const card = (ticket: number, more: Partial<Card> = {}): Card => ({ ticket, titre: `Ticket ${ticket}`, ouvrable: true, attendu: true, attend: [], dit: [], fiche: {} as Card["fiche"], parque: PARKED, ...more }) as Card;
const todo = (more: Partial<CardOfTodo> = {}): CardOfTodo => ({ sorte: "product-question", question: "Ship it?", choix: [{ texte: "Yes", prix: "" }, { texte: "No", prix: "" }], prixDuTexte: "", ...more });
type Plays = [number, string, unknown];
function actions(step: "repos" | "envoi" | "refus" = "repos") {
  const played: Plays[] = [];
  const state = step === "envoi" ? { etape: step, reponse: { question: "Ship it?", choix: 1 } } : step === "refus" ? { etape: step, dit: "no", detail: "" } : { etape: step };
  return { joues: played, gestes: { etat: () => state as never, attente: ACTIONS_OF_WAIT, jouer: (ticket: number, kind: string, answer?: unknown) => void played.push([ticket, kind, answer]) } };
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
    assert.deepEqual(texts(todo({ recommandation: { rang: 2, pourquoi: null } as never })), [["Yes", false, { question: "Ship it?", choix: 1 }], ["No", true, { question: "Ship it?", choix: 2 }]]);
    assert.deepEqual(texts(todo({ recommandation: null })), [["Yes", false, { question: "Ship it?", choix: 1 }], ["No", false, { question: "Ship it?", choix: 2 }]]);
  });

  test("sa réponse en route, ses choix attendent ; refusée, ils reviennent", () => {
    assert.deepEqual(actionsOfTodo(card(50, { todo: todo() }), actions("envoi").gestes as never), []);
    assert.equal(actionsOfTodo(card(50, { todo: todo() }), actions("refus").gestes as never).length, 2);
  });

  test("un écran à valider : « Validate », qui joue le sien", () => {
    const { joues: played, gestes: itsOwn } = actions();
    const validation = card(60, { todo: todo({ sorte: "design-validation", choix: [], validation: { pr: 9, ticket: 60 } }) });
    const setOne = setTheTodo(doc, { deplie: { ouvert: true }, cartes: [validation], ouvrir: () => {}, gestes: itsOwn as never }) as unknown as Fake;
    const [first] = setOne.dessous("li");
    assert.deepEqual(buttons(first as Fake).map(({ textContent, className }) => [textContent, className]), [["Validate", "recommande"]]);
    buttons(first as Fake)[0]?.click();
    assert.deepEqual(played, [[60, "valider", undefined]]);
    // Une carte qui ne dit pas sa PR n'a pas de bouton, comme sur la carte : elle se tranche sur GitHub.
    assert.deepEqual(actionsOfTodo(card(63, { todo: todo({ sorte: "design-validation", choix: [], validation: { illisible: "no PR named" } }) }), itsOwn as never), []);
  });

  test("une carte de WAITING parked pour le chef : « resume » et « it arrived » ; « waiting for… » n'y répond pas", () => {
    const { joues: played, gestes: itsOwn } = actions();
    const wait = card(51, { attendu: false, gestes: ["attente-reprendre", "attente-arrivee"] });
    const setOne = setTheTodo(doc, { deplie: { ouvert: true }, cartes: [wait, card(52, { gestes: ["attente-poser"] })], ouvrir: () => {}, gestes: itsOwn as never }) as unknown as Fake;
    const [first, second] = setOne.dessous("li");
    assert.deepEqual(buttons(first as Fake).map(({ textContent }) => textContent), ["resume", "it arrived, back to the kitchen"]);
    assert.deepEqual(buttons(second as Fake), []);
    assert.deepEqual((second as Fake).dessous("div"), []);
    buttons(first as Fake)[1]?.click();
    assert.deepEqual(played, [[51, "attente-arrivee", undefined]]);
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
  palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED, attente: ACTIONS_OF_WAIT },
  banniere: BANNER, calibrage: { modeles: MODELS, efforts: EFFORTS }, code: undefined,
});
async function show(readOnes: Facts): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], ouvrirIssue: () => true, repondreCarte: () => ({ repondue: true, dit: "posted", commentaire: 7 }), attente: () => ({ fait: "done", detail: "" }) });
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
  test("seuls #50 et #51 sont dans le TODO, rouges ; #52 et #53, parked pour un autre, ne le sont pas", async () => {
    const vue = await show(WORLD);
    assert.deepEqual(theTodo(vue).dessous("li").map(({ dataset }) => Number(dataset.ticket)).sort(), [50, 51]);
    assert.equal(theTodo(vue).children[0]?.textContent, "TODO (2)");
    assert.deepEqual([50, 51, 52, 53].map((ticket) => slip(vue, ticket).dataset.carte === "attente"), [true, true, false, false]);
    // Chacune dit qu'elle t'attend, en mots.
    assert.deepEqual([50, 51].map((ticket) => slip(vue, ticket).dessous("span").some(({ dataset }) => dataset.pastille === "awaiting")), [true, true]);
    assert.equal(entryOf(vue, 50).dessous("p")[0]?.textContent, "Ship the export as CSV?");
    assert.equal(entryOf(vue, 51).dessous("p")[0]?.textContent, "the signed quote");
  });

  test("un choix cliqué dans le TODO part comme depuis la carte : la réponse, avec sa question", async () => {
    const vue = await show(WORLD);
    (buttons(entryOf(vue, 50)).find(({ textContent }) => textContent === "No, drop it") ?? assert.fail("pas de « No, drop it »")).click();
    await repos();
    assert.deepEqual(callsOf(vue, "repondreCarte"), [[PARADE, 50, { question: "Ship the export as CSV?", choix: 2 }]]);
  });

  test("« resume » et « it arrived » d'une carte de WAITING parked pour le chef partent comme depuis sa carte", async () => {
    const vue = await show(WORLD);
    (buttons(entryOf(vue, 51)).find(({ textContent }) => textContent === "resume") ?? assert.fail("pas de « resume »")).click();
    await repos();
    (buttons(entryOf(vue, 51)).find(({ textContent }) => textContent === "it arrived, back to the kitchen") ?? assert.fail("pas de « it arrived »")).click();
    await repos();
    assert.deepEqual(callsOf(vue, "attente").map(([project, id, ticket]) => [project, id, ticket]), [[PARADE, "attente-reprendre", 51], [PARADE, "attente-arrivee", 51]]);
  });

  test("un projet en lecture seule : le TODO dit ses questions, sans un bouton", async () => {
    const vue = await show({ ...WORLD, lectureSeule: { depot: "chef/parade" } });
    assert.equal(entryOf(vue, 50).dessous("p")[0]?.textContent, "Ship the export as CSV?");
    assert.deepEqual(buttons(entryOf(vue, 50)), []);
    assert.deepEqual(buttons(entryOf(vue, 51)), []);
  });
});

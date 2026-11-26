// Le TODO du chef est exactement les tickets parked pour lui (#4261, règle 13 de la spec du 2026-11-24) : qui un ticket
// attend décide, pas d'être nommé par la file, ni une date passée. Chaque entrée dit ce qui est demandé au chef et porte les
// boutons de sa carte ; un clic y répond. D'abord ce que le process principal pose (facts.ts), puis l'entrée seule devant un
// faux document (vue/kitchen/kitchen.js), puis la vue jouée.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { ACTIONS_D_WAIT } from "../../../src/wait.ts";
import { pourLaBar } from "../../../src/bar.ts";
import type { CardDeTodo } from "../../../src/card-todo.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Card, type Facts } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import { ceQuiAwaitingYou, actionsDuTodo, planDeLaKitchen, poserLeTodo } from "../../../src/vue/kitchen/kitchen.js";
import { rangerLeRail } from "../../../src/vue/todo/todo.js";
import { Faux, type Jouee, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const entree = (ticket: number, state: string, plus: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...plus });
const facts = (plus: Partial<Facts> & { rail: Facts["rail"] }): Facts => ({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], ...plus });
const tiers = (qui: string, relance: string) => ({ quoi: "the signed quote", qui, depuis: "2026-11-20T10:00:00Z", relance, aLArrivee: "goes back to the kitchen" });
// La carte que le manager pose au chef, lue de GitHub : sa question, ses deux choix.
const QUESTION = { sorte: "product-question", texte: "Ship the export as CSV?\n- [resume] Yes, ship it\n- [close] No, drop it" };

// #50 attend le chef (sa carte) ; #51 est parked pour le chef ; #52 est nommé par la file mais parked pour Stripe ; #53 est
// parked pour le client jusqu'à une date passée ; #54 cuit ; #70 attend bob.
const MONDE = facts({
  rail: [
    entree(51, "pris", { tiers: tiers("the chef", "2026-11-28T09:00:00Z") }),
    entree(52, "pris", { tiers: tiers("Stripe support", "2026-11-28T09:00:00Z") }),
    entree(53, "WAITING", { tiers: tiers("the client", "2026-11-24T09:00:00Z") }),
    entree(54, "pris"),
  ],
  attend: [
    { ticket: 50, titre: "Ticket 50", url: url(50), chef: QUESTION },
    { ticket: 52, titre: "Ticket 52", url: url(52) },
  ],
  attendAutres: [{ ticket: 70, titre: "Ticket 70", url: url(70), chef: QUESTION, qui: ["bob"] }],
});
function cardsDe(lus: Facts) {
  const recue = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(lus) }] });
  assert.ok("tableau" in recue);
  return recue.tableau.rail.colonnes;
}

describe("le TODO est exactement les tickets parked pour le chef", () => {
  test("ce qui attend le chef est parked pour lui, pour sa question ; ce qui attend un autre humain, pour lui", () => {
    const colonnes = cardsDe(MONDE);
    const de = (ticket: number) => colonnes.flatMap(({ cartes: cards, autres }) => [...cards, ...(autres ?? [])]).find((une) => une.ticket === ticket)?.parque;
    assert.deepEqual(de(50), { qui: "the chef", quoi: "Ship the export as CSV?", jusqua: null, chef: true });
    assert.deepEqual(de(70), { qui: "bob", quoi: "Ship the export as CSV?", jusqua: null });
    assert.deepEqual(de(51), { qui: "the chef", quoi: "the signed quote", jusqua: "2026-11-28T09:00:00Z", chef: true });
    assert.deepEqual(de(52), { qui: "Stripe support", quoi: "the signed quote", jusqua: "2026-11-28T09:00:00Z" });
    assert.equal(de(54), undefined);
  });

  test("le TODO : parked pour le chef, oui ; parked pour un autre, nommé par la file ou non, ou jusqu'à une date passée, non", () => {
    const plan = planDeLaKitchen(rangerLeRail(cardsDe(MONDE)).colonnes);
    assert.deepEqual(ceQuiAwaitingYou(plan).map(({ ticket }) => ticket).sort(), [50, 51]);
  });

  test("ce que sa carte attend, faute de question, est ce qui est demandé au chef", () => {
    const colonnes = cardsDe(facts({ rail: [entree(55, "en attente")], attend: [{ ticket: 55, titre: "Ticket 55", url: url(55) }] }));
    const parque = colonnes.flatMap(({ cartes: cards }) => cards).find(({ ticket }) => ticket === 55)?.parque;
    assert.deepEqual(parque, { qui: "the chef", quoi: "no question found on #55", jusqua: null, chef: true });
  });
});

const doc = { createElement: (balise: string) => new Faux(balise) };
const PARKED = { qui: "the chef", jusqua: null, chef: true };
const card = (ticket: number, plus: Partial<Card> = {}): Card => ({ ticket, titre: `Ticket ${ticket}`, ouvrable: true, attendu: true, attend: [], dit: [], fiche: {} as Card["fiche"], parque: PARKED, ...plus }) as Card;
const todo = (plus: Partial<CardDeTodo> = {}): CardDeTodo => ({ sorte: "product-question", question: "Ship it?", choix: [{ texte: "Yes", prix: "" }, { texte: "No", prix: "" }], prixDuTexte: "", ...plus });
type Joue = [number, string, unknown];
function actions(step: "repos" | "envoi" | "refus" = "repos") {
  const joues: Joue[] = [];
  const state = step === "envoi" ? { etape: step, reponse: { question: "Ship it?", choix: 1 } } : step === "refus" ? { etape: step, dit: "no", detail: "" } : { etape: step };
  return { joues, gestes: { etat: () => state as never, attente: ACTIONS_D_WAIT, jouer: (ticket: number, sorte: string, answer?: unknown) => void joues.push([ticket, sorte, answer]) } };
}
const boutons = (ou: Faux) => ou.dessous("button").filter(({ dataset }) => dataset.bouton !== "discret");

describe("chaque entrée du TODO dit ce qui est demandé, avec ses boutons", () => {
  test("la question, puis un bouton par choix, le premier recommandé ; un clic y répond", () => {
    const { joues, gestes: siens } = actions();
    const posee = poserLeTodo(doc, { deplie: { ouvert: true }, cartes: [card(50, { todo: todo(), parque: { ...PARKED, quoi: "Ship it?" } })], ouvrir: () => {}, gestes: siens as never }) as unknown as Faux;
    const [li] = posee.dessous("li");
    assert.ok(li !== undefined);
    assert.deepEqual(li.dessous("p").map(({ className, textContent }) => [className, textContent]), [["demande-du-todo", "Ship it?"]]);
    assert.deepEqual(boutons(li).map(({ textContent, className }) => [textContent, className]), [["Yes", "recommande"], ["No", ""]]);
    boutons(li)[1]?.click();
    assert.deepEqual(joues, [[50, "repondre", { question: "Ship it?", choix: 2 }]]);
  });

  test("la recommandation de la carte est le bouton plein ; sans recommandation, aucun", () => {
    const { gestes: siens } = actions();
    const textes = (une: CardDeTodo) => actionsDuTodo(card(50, { todo: une }), siens as never).map(({ texte, recommande, reponse: answer }) => [texte, recommande, answer]);
    assert.deepEqual(textes(todo({ recommandation: { rang: 2, pourquoi: null } as never })), [["Yes", false, { question: "Ship it?", choix: 1 }], ["No", true, { question: "Ship it?", choix: 2 }]]);
    assert.deepEqual(textes(todo({ recommandation: null })), [["Yes", false, { question: "Ship it?", choix: 1 }], ["No", false, { question: "Ship it?", choix: 2 }]]);
  });

  test("sa réponse en route, ses choix attendent ; refusée, ils reviennent", () => {
    assert.deepEqual(actionsDuTodo(card(50, { todo: todo() }), actions("envoi").gestes as never), []);
    assert.equal(actionsDuTodo(card(50, { todo: todo() }), actions("refus").gestes as never).length, 2);
  });

  test("un écran à valider : « Validate » ; une revue : « Merge » — chacun joue le sien", () => {
    const { joues, gestes: siens } = actions();
    const validation = card(60, { todo: todo({ sorte: "design-validation", choix: [], validation: { pr: 9, ticket: 60 } }) });
    const revue = card(62, { todo: todo({ sorte: "sensitive-review", choix: [], revue: { pr: 8, ticket: 62 } }) });
    const posee = poserLeTodo(doc, { deplie: { ouvert: true }, cartes: [validation, revue], ouvrir: () => {}, gestes: siens as never }) as unknown as Faux;
    const [first, seconde] = posee.dessous("li");
    assert.deepEqual(boutons(first as Faux).map(({ textContent, className }) => [textContent, className]), [["Validate", "recommande"]]);
    assert.deepEqual(boutons(seconde as Faux).map(({ textContent, className }) => [textContent, className]), [["Merge", "recommande"]]);
    boutons(first as Faux)[0]?.click();
    boutons(seconde as Faux)[0]?.click();
    assert.deepEqual(joues, [[60, "valider", undefined], [62, "merger", undefined]]);
    // Une carte qui ne dit pas sa PR n'a pas de bouton, comme sur la carte : elle se tranche sur GitHub.
    assert.deepEqual(actionsDuTodo(card(63, { todo: todo({ sorte: "design-validation", choix: [], validation: { illisible: "no PR named" } }) }), siens as never), []);
    assert.deepEqual(actionsDuTodo(card(64, { todo: todo({ sorte: "sensitive-review", choix: [], revue: { illisible: "no PR named" } }) }), siens as never), []);
  });

  test("une carte de WAITING parked pour le chef : « resume » et « it arrived » ; « waiting for… » n'y répond pas", () => {
    const { joues, gestes: siens } = actions();
    const wait = card(51, { attendu: false, gestes: ["attente-reprendre", "attente-arrivee"] });
    const posee = poserLeTodo(doc, { deplie: { ouvert: true }, cartes: [wait, card(52, { gestes: ["attente-poser"] })], ouvrir: () => {}, gestes: siens as never }) as unknown as Faux;
    const [first, seconde] = posee.dessous("li");
    assert.deepEqual(boutons(first as Faux).map(({ textContent }) => textContent), ["resume", "it arrived, back to the kitchen"]);
    assert.deepEqual(boutons(seconde as Faux), []);
    assert.deepEqual((seconde as Faux).dessous("div"), []);
    boutons(first as Faux)[1]?.click();
    assert.deepEqual(joues, [[51, "attente-arrivee", undefined]]);
  });

  test("sans gestes — un projet en lecture seule —, la question se lit, aucun bouton ; sans question, aucune ligne", () => {
    const posee = poserLeTodo(doc, { deplie: { ouvert: true }, cartes: [card(50, { todo: todo(), parque: { ...PARKED, quoi: "Ship it?" } }), card(53, { titre: undefined })], ouvrir: () => {} }) as unknown as Faux;
    const [first, seconde] = posee.dessous("li");
    assert.deepEqual(boutons(first as Faux), []);
    assert.equal((first as Faux).dessous("p")[0]?.textContent, "Ship it?");
    assert.deepEqual((seconde as Faux).dessous("p"), []);
    // Son numéro, son titre s'il en a un, et ce qui la tient parked au survol.
    const numeros = posee.dessous("li").flatMap((li) => li.dessous("button"));
    assert.deepEqual(numeros.map(({ textContent }) => textContent), ["#50 Ticket 50", "#53"]);
    assert.equal(numeros[1]?.title, "open #53's card — parked — waits for the chef, no date set");
  });
});

// La vue jouée : le TODO pose les boutons de chaque carte, et un clic part comme depuis la carte.
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES, attente: ACTIONS_D_WAIT },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
});
async function show(lus: Facts): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], ouvrirIssue: () => true, repondreCarte: () => ({ repondue: true, dit: "posted", commentaire: 7 }), attente: () => ({ fait: "done", detail: "" }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(lus) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
// Le TODO est une ligne au-dessus des colonnes (#4354) : un clic la déplie, s'il ne l'est pas déjà.
const leTodo = (vue: Jouee): Faux => {
  const opinion = vue.element("rail").children.find(({ className }) => className === "avis-du-todo") ?? assert.fail("pas de TODO");
  const [line] = opinion.dessous("button");
  if (line?.ariaExpanded !== "true") line?.click();
  return opinion.children.find(({ className }) => className === "todo-du-rail") ?? assert.fail("TODO pas déplié");
};
const entreeDe = (vue: Jouee, ticket: number): Faux => leTodo(vue).dessous("li").find(({ dataset }) => dataset.ticket === String(ticket)) ?? assert.fail(`pas d'entrée #${ticket}`);
const callsDe = (vue: Jouee, action: string) => vue.appels.filter((call) => call.geste === action).map(({ args }) => args);
const slip = (vue: Jouee, ticket: number): Faux => vue.element("rail").dessous("li").find(({ className, dataset }) => className.split(" ").includes("bon") && dataset.ticket === String(ticket)) ?? assert.fail(`pas de carte #${ticket}`);

describe("la vue : le TODO, ses questions et ses boutons", () => {
  test("seuls #50 et #51 sont dans le TODO, rouges ; #52 et #53, parked pour un autre, ne le sont pas", async () => {
    const vue = await show(MONDE);
    assert.deepEqual(leTodo(vue).dessous("li").map(({ dataset }) => Number(dataset.ticket)).sort(), [50, 51]);
    assert.equal(leTodo(vue).children[0]?.textContent, "TODO (2)");
    assert.deepEqual([50, 51, 52, 53].map((ticket) => slip(vue, ticket).dataset.carte === "attente"), [true, true, false, false]);
    // Chacune dit qu'elle t'attend, en mots.
    assert.deepEqual([50, 51].map((ticket) => slip(vue, ticket).dessous("span").some(({ dataset }) => dataset.pastille === "awaiting")), [true, true]);
    assert.equal(entreeDe(vue, 50).dessous("p")[0]?.textContent, "Ship the export as CSV?");
    assert.equal(entreeDe(vue, 51).dessous("p")[0]?.textContent, "the signed quote");
  });

  test("un choix cliqué dans le TODO part comme depuis la carte : la réponse, avec sa question", async () => {
    const vue = await show(MONDE);
    (boutons(entreeDe(vue, 50)).find(({ textContent }) => textContent === "No, drop it") ?? assert.fail("pas de « No, drop it »")).click();
    await repos();
    assert.deepEqual(callsDe(vue, "repondreCarte"), [[PARADE, 50, { question: "Ship the export as CSV?", choix: 2 }]]);
  });

  test("« resume » et « it arrived » d'une carte de WAITING parked pour le chef partent comme depuis sa carte", async () => {
    const vue = await show(MONDE);
    (boutons(entreeDe(vue, 51)).find(({ textContent }) => textContent === "resume") ?? assert.fail("pas de « resume »")).click();
    await repos();
    (boutons(entreeDe(vue, 51)).find(({ textContent }) => textContent === "it arrived, back to the kitchen") ?? assert.fail("pas de « it arrived »")).click();
    await repos();
    assert.deepEqual(callsDe(vue, "attente").map(([project, id, ticket]) => [project, id, ticket]), [[PARADE, "attente-reprendre", 51], [PARADE, "attente-arrivee", 51]]);
  });

  test("un projet en lecture seule : le TODO dit ses questions, sans un bouton", async () => {
    const vue = await show({ ...MONDE, lectureSeule: { depot: "chef/parade" } });
    assert.equal(entreeDe(vue, 50).dessous("p")[0]?.textContent, "Ship the export as CSV?");
    assert.deepEqual(boutons(entreeDe(vue, 50)), []);
    assert.deepEqual(boutons(entreeDe(vue, 51)), []);
  });
});

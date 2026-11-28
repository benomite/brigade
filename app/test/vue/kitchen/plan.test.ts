// Le plan de la cuisine (ticket 4238), le module seul (vue/kitchen/kitchen.js) devant un faux document : chaque carte dans la
// colonne de son étape — backlog, le rail en tête, manager, cooks, pass, served —, la carte parked qui dit qui elle attend et
// jusqu'à quand, le TODO — une ligne, puis exactement ce qui attend le chef —, la bande du haut, et le message qui n'existe qu'avec un geste.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Card, Column } from "../../../src/facts.ts";
import { aOneAction, lineParked, setTheTodo } from "../../../src/vue/kitchen/kitchen.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const card = (ticket: number, state: string, more: Partial<Card> = {}): Card => ({ ticket, etat: state, titre: `Ticket ${ticket}`, ouvrable: true, attendu: false, attend: [], dit: [], fiche: {} as Card["fiche"], ...more }) as Card;
const column = (name: string, cards: Card[], more: Partial<Column> = {}): Column => ({ nom: name, ton: "gris", compte: String(cards.length), cartes: cards, vide: `no ticket in ${name}`, ...more });
const numbers = (cards: readonly Card[] | undefined) => (cards ?? []).map(({ ticket }) => ticket);
const PARKED = { qui: "Camille", jusqua: "2026-11-28T09:00:00Z" };

describe("chaque carte dans la colonne de son étape", () => {




});

describe("la carte parked dit qui elle attend et jusqu'à quand", () => {
  test("qui, puis la date, en UTC ; sans date, elle le dit ; une date illisible est dite telle quelle", () => {
    const said = (parked: { qui: string; jusqua: string | null }) => (lineParked(doc, parked) as unknown as Fake).textContent;
    assert.equal(said({ qui: "the chef", jusqua: null }), "parked — waits for the chef, no date set");
    assert.equal(said({ qui: "Camille", jusqua: "2026-01-05T17:30:00Z" }), "parked — waits for Camille, until 5 Jan, 17:30 UTC");
    assert.equal(said({ qui: "Camille", jusqua: "next week" }), "parked — waits for Camille, until next week");
    const line = lineParked(doc, PARKED) as unknown as Fake;
    assert.deepEqual([line.balise, line.className, line.textContent], ["p", "parque", "parked — waits for Camille, until 28 Nov, 09:00 UTC"]);
  });
});

describe("le TODO liste exactement ce qui attend le chef", () => {

  test("une ligne, « 2 wait for you » ; rien quand rien n'attend le chef (#4354)", () => {
    assert.equal(setTheTodo(doc, { cartes: [], ouvrir: () => {}, deplie: { ouvert: false } }), undefined);
    const oneOf = setTheTodo(doc, { cartes: [card(50, "en attente", { attendu: true })], ouvrir: () => {}, deplie: { ouvert: false } }) as unknown as Fake;
    assert.deepEqual(oneOf.dessous("button").map(({ textContent }) => textContent), ["1 waits for you"]);
    const two = setTheTodo(doc, { cartes: [card(50, "en attente", { attendu: true }), card(53, "pris", { parque: { ...PARKED, chef: true } })], ouvrir: () => {}, deplie: { ouvert: false } }) as unknown as Fake;
    assert.equal(two.className, "avis-du-todo");
    assert.deepEqual(two.dessous("button").map(({ textContent }) => textContent), ["2 wait for you"]);
    // Ni question, ni bouton, ni entrée tant que le chef ne l'a pas ouvert.
    assert.deepEqual(two.dessous("li"), []);
    assert.deepEqual(two.dessous("p"), []);
  });

  test("un clic montre une entrée par ticket, qui ouvre sa carte d'un clic ; un second les replie ; le dépli se garde (#4354)", () => {
    const openEntries: number[] = [];
    const unfolded = { ouvert: false };
    const todo = setTheTodo(doc, { cartes: [card(50, "en attente", { attendu: true }), card(53, "pris", { parque: { ...PARKED, chef: true }, titre: undefined })], ouvrir: ({ ticket }) => void openEntries.push(ticket), deplie: unfolded }) as unknown as Fake;
    const [line] = todo.dessous("button");
    assert.equal(line?.ariaExpanded, "false");
    line?.click();
    assert.equal(unfolded.ouvert, true);
    assert.equal(line?.ariaExpanded, "true");
    const list = todo.children[1] ?? assert.fail("pas de liste");
    assert.deepEqual([list.className, list.ariaLabel], ["todo-du-rail", "What awaits you"]);
    const entries = todo.dessous("li");
    assert.deepEqual(entries.map(({ dataset }) => dataset.ticket), ["50", "53"]);
    // Son numéro et son titre ; sous ce qui est demandé, qui il attend et jusqu'à quand (ticket 4281).
    assert.deepEqual(entries.map((entry) => entry.dessous("button")[0]?.textContent), ["#50 Ticket 50", "#53"]);
    assert.equal(entries[1]?.dessous("button")[0]?.title, "open #53's card — parked — waits for Camille, until 28 Nov, 09:00 UTC");
    entries[1]?.dessous("button")[0]?.click();
    assert.deepEqual(openEntries, [53]);
    line?.click();
    assert.equal(unfolded.ouvert, false);
    assert.deepEqual(todo.dessous("li"), []);
    // Le rendu suivant le garde comme le chef l'a laissé.
    const reopened = setTheTodo(doc, { cartes: [card(50, "en attente", { attendu: true })], ouvrir: () => {}, deplie: { ouvert: true } }) as unknown as Fake;
    assert.deepEqual(reopened.dessous("li").map(({ dataset }) => dataset.ticket), ["50"]);
  });
});


describe("un message porte un geste", () => {
  test("un bouton, à lui ou à ce qui le suit", () => {
    const line = new Fake("p");
    line.append(new Fake("button"));
    assert.equal(aOneAction([new Fake("p")] as unknown as HTMLElement[]), false);
    assert.equal(aOneAction([new Fake("p"), line] as unknown as HTMLElement[]), true);
  });
});

// Le plan de la cuisine dans la vue jouée (ticket 4238) : `facts` tel que le process principal le range, puis ce que la vue
// en pose — la carte parked dans la colonne où elle attend, ce qu'elle dit, le TODO qui ouvre la carte d'un clic, la bande
// du haut que l'équipe lue remplit, et chaque message du haut avec le geste qu'il offre au chef.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Terminal } from "../../../src/terminals.ts";
import { isRed } from "../../../src/vue/todo/todo.js";
import { type Fake, Fake as Element } from "../../helpers/false-vue.ts";

const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const doc = { createElement: (balise: string) => new Element(balise) };
const entry = (ticket: number, state: string, more: object = {}) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, ...more });
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



  test("la carte parked pour le chef est rouge ; parked pour un autre, non", () => {
    const card = { ticket: 1, ouvrable: true, attendu: false, attend: [], dit: [], fiche: {} } as unknown as Parameters<typeof isRed>[0];
    assert.equal(isRed({ ...card, parque: { qui: "the chef", jusqua: null, chef: true } }), true);
    assert.equal(isRed({ ...card, parque: { qui: "Camille", jusqua: null } }), false);
  });
});

describe("le process principal pose `parque`", () => {

});

describe("chaque message du haut offre un geste", () => {

});

describe("le plan, colonne par colonne", () => {


});

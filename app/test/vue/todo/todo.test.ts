// TODO n'est pas une colonne (#3458) : ce qui attend le chef est rangé, rouge et en tête, dans la colonne de son étape ;
// l'entrée « TODO (N) » les compte et les filtre. D'abord le rangement tel que todo/todo.js le fait, sur les colonnes que le
// process principal rend (facts.ts) ; puis la vue jouée telle qu'elle est (helpers/false-vue.ts) : l'entrée, son filtre, le
// téléphone, et l'accueil, qui dit le même compte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type Card, type Column } from "../../../src/facts.ts";
import { columnOf, LIST_OF_CHEF, tidyTheRail } from "../../../src/vue/todo/todo.js";
import { Fake, type Played } from "../../helpers/false-vue.ts";

const A = "2026-11-13T10:04:12.000Z";
const PARADE = "parade";
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const THIRD = { quoi: "the signed quote", qui: "the client", depuis: "2026-11-01T10:00:00.000Z", aLArrivee: "it goes back to the kitchen" };

const cards = (columns: readonly Column[]) => columns.map(({ nom: name, compte: account, cartes: itsOwn }) => [name, account, itsOwn.map(({ ticket: number }) => number)]);

describe("le rangement : chaque carte qui attend le chef dans la colonne de son étape, en tête", () => {




  test("une carte du chef n'est jamais perdue faute de colonne : une étape inconnue, ou un rail sans On the rail, la pose sur le rail", () => {
    const card = (number: number, step?: string): Card => ({ ticket: number, ouvrable: false, attendu: true, attend: [], dit: [], fiche: {}, ...(step === undefined ? {} : { etape: step }) }) as unknown as Card;
    assert.equal(columnOf(card(1, "Backlog"), ["On the rail", "Pass"]), "On the rail");
    assert.equal(columnOf(card(1, "Pass"), ["On the rail", "Pass"]), "Pass");
    const only = tidyTheRail([{ nom: LIST_OF_CHEF, ton: "rouge", compte: "1", cartes: [card(12)], vide: "" }]);
    assert.deepEqual(cards(only.colonnes), [["On the rail", "1", [12]]]);
    assert.equal(only.compte, "1");
  });

});

// Plus d'entrée « TODO (N) » ni de filtre sur le rail (#3523) : le compte est celui des cartes rouges, que l'accueil dit aussi.
const entry = (vue: Played): Fake | undefined => vue.element("rail").dessous("button").find(({ className }) => className === "entree-todo");
const theColumns = (vue: Played) => vue.element("rail").dessous("section").filter(({ className }) => className === "colonne");
const slipsOf = (column: Fake) => column.dessous("li").filter(({ className }) => className.split(" ").includes("bon")).map(({ dataset }) => [Number(dataset.ticket), dataset.carte === "attente"]);

describe("la vue du projet, sur un écran large et sur un téléphone", () => {
  for (const narrow of [false, true]) {
  }


});

describe("l'accueil dit le compte des cartes rouges du rail", () => {
});

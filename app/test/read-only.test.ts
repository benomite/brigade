// Un projet dont le compte GitHub de cet ordinateur ne peut pas écrire le dépôt s'ouvre en lecture seule (ticket 3163) : le
// rail, les cartes, TODO, les stations et les cooks se voient ; aucun geste n'est offert — ni choix ni champ sur une carte
// de TODO, ni « Relaunch », ni « Add a station » —, absents, pas grisés ; une ligne en tête du projet le dit, avec ses deux
// liens. L'accès gagné, la lecture suivante rend la vue ordinaire, sans rouvrir le projet. La vue est jouée telle qu'elle
// est, devant un faux document et un faux pont ; les faits sont ceux que `facts` porte (board/read.ts, `lectureSeule`).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ACCESS_IN_WRITING, pageOfTheReadOnly } from "../src/read-only.ts";
import type { Terminal } from "../src/terminals.ts";
import { cardOfTicket, type Fake, type Played } from "./helpers/false-vue.ts";

const PARADE = "parade";
const REPOSITORY = "chef/parade";
const A = "2026-11-11T10:04:12.000Z";
const ISSUE = (ticket: number) => `https://github.com/${REPOSITORY}/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "", arrete: false };

// Le rail : #21 attend le chef d'une question à deux choix ; #22 n'est plus pris par aucun cook (Relaunch) ; #23, pris par
// box/claude, son cook au travail.
const PRODUCT = {
  type: "product",
  question: "One journal export per project, or a single one?",
  choix: [
    { texte: "One per project.", suite: "resume" },
    { texte: "A single export.", suite: "resume" },
  ],
};
// Sa carte du chef, telle que son issue la pose sur GitHub (board/todo-github.ts).
const CHEF = { sorte: PRODUCT.type, texte: [PRODUCT.question, ...PRODUCT.choix.map(({ texte: text, suite }) => `- [${suite}] ${text}`)].join("\n") };

const slip = (vue: Played, ticket: number): Fake => cardOfTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const texts = (or: Fake) => or.dessous("button").map(({ textContent }) => textContent);
const line = (vue: Played) => vue.element("alertes").children.find(({ className }) => className === "lecture-seule");

describe("un projet en lecture seule", () => {



});


describe("les pages que la ligne ouvre", () => {
  test("comment obtenir l'écriture, ou le fork du dépôt ; rien pour un dépôt ou une page qui ne se lit pas", () => {
    assert.equal(pageOfTheReadOnly(REPOSITORY, "acces"), ACCESS_IN_WRITING);
    assert.match(ACCESS_IN_WRITING, /^https:\/\/docs\.github\.com\/.*inviting-collaborators/);
    assert.equal(pageOfTheReadOnly(REPOSITORY, "fork"), "https://github.com/chef/parade/fork");
    assert.equal(pageOfTheReadOnly(undefined, "fork"), undefined);
    assert.equal(pageOfTheReadOnly("../evil", "fork"), undefined);
    assert.equal(pageOfTheReadOnly(REPOSITORY, "https://evil.example"), undefined);
  });
});

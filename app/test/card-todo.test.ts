// La carte de TODO, côté process principal (#1281, épique #1277) : une carte du chef lue de GitHub, rangée pour la carte du
// rail, et la réponse du chef lue avant de partir sur son issue.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CHANGED, cardOfChefOfTodo, UNKNOWN, answerRead, EMPTY, type CardRead } from "../src/card-todo.ts";

const DESIGN: CardRead = {
  type: "design",
  question: "Does the SIRET field read as the mockup draws it?",
  choix: [
    { texte: "Yes, merge it as delivered.", suite: "merge" },
    { texte: "No: the error line goes under the field.", suite: "resume" },
  ],
};
const PRODUCT: CardRead = {
  type: "product",
  question: "One journal export per project, or a single one?",
  choix: [
    { texte: "One per project.", suite: "resume" },
    { texte: "A single export.", suite: "resume" },
  ],
};

// --- La réponse lue ---------------------------------------------------------------------

describe("la réponse du chef, lue avant de partir", () => {
  test("un choix garde son rang ; le texte libre ses blancs autour retirés et ses retours à la ligne de GitHub", () => {
    assert.deepEqual(answerRead(PRODUCT, 21, { question: PRODUCT.question, choix: 2 }), { ticket: 21, choix: 2 });
    assert.deepEqual(answerRead(DESIGN, 12, { question: DESIGN.question, texte: "  Merge it; don't touch the label.\r\n" }), { ticket: 12, texte: "Merge it; don't touch the label." });
  });

  test("rien ne part pour une carte que les faits ne portent pas, une autre question, un choix hors de la carte, un texte vide", () => {
    assert.deepEqual(answerRead(undefined, 21, { question: PRODUCT.question, choix: 1 }), { refus: UNKNOWN, detail: "" });
    assert.deepEqual(answerRead(PRODUCT, "21", { question: PRODUCT.question, choix: 1 }), { refus: UNKNOWN, detail: "" });
    assert.deepEqual(answerRead(PRODUCT, 21, { question: "Another question?", choix: 1 }), { refus: CHANGED, detail: "" });
    for (const choice of [0, 3, 1.5, "1"]) assert.match((answerRead(PRODUCT, 21, { question: PRODUCT.question, choix: choice }) as { refus: string }).refus, /choices 1 to 2/);
    for (const text of ["", "   ", undefined]) assert.deepEqual(answerRead(PRODUCT, 21, { question: PRODUCT.question, texte: text }), { refus: EMPTY, detail: "" });
  });
});

describe("la situation d'une carte du chef (#3086)", () => {
  test("c'est la première phrase de ce que le commentaire dit après la question, entière ; le commentaire entier reste en `contexte`", () => {
    const text = "Retry the release?\n- [resume] Retry it\n\nThe release run of app 1.0.185 failed. A second sentence.\n\nTriage: more.";
    const card = cardOfChefOfTodo({ sorte: "blocked", texte: text });
    assert.equal(card?.resume, "The release run of app 1.0.185 failed.");
    assert.equal(card?.contexte, "The release run of app 1.0.185 failed. A second sentence.\n\nTriage: more.");
  });

  test("sans rien après la question, pas de situation : la ligne de sa sorte parle", () => {
    const card = cardOfChefOfTodo({ sorte: "blocked", texte: "Retry the release?\n- [resume] Retry it" });
    assert.equal(card?.resume, undefined);
    assert.equal(card?.contexte, undefined);
  });
});

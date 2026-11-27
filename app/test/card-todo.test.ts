// La carte de TODO, côté process principal (#1281, épique #1277) : ce que `facts` donne dans
// `attend[].carte` (runtime/src/etat.ts, `CarteVue`) est lu — ou laissé de côté s'il n'en a pas la
// forme —, rangé pour la carte du rail, et la réponse du chef part sur la box par une seule commande du
// runtime : `rail choose <ticket> <n>` ou `rail answer <ticket> <texte>`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CarteVue } from "../../runtime/src/etat.ts";
import { CHANGED, cardOfTodo, cardOfChefOfTodo, cardRead, UNKNOWN, PRICE_OF_TEXT, answerRead, EMPTY } from "../src/card-todo.ts";
import { understand, holdFacts, type Facts } from "../src/facts.ts";

const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const CAPTURE = (moment: string) => `https://github.com/chef/parade/blob/5d41402abc4b2a76b9719d911017c592/docs/captures/12/formulaire-${moment}.png?raw=true`;

// Une carte telle qu'un runtime d'avant la forme unique (#1766) la donnait : sans résumé, sans
// réponse libre ni « ask the second » dits.
type CardOfBefore = Omit<CarteVue, "resume" | "reponseLibre" | "secondaire">;

const DESIGN = {
  type: "design",
  question: "Does the SIRET field read as the mockup draws it?",
  choix: [
    { texte: "Yes, merge it as delivered.", suite: "merge" },
    { texte: "No: the error line goes under the field.", suite: "resume" },
  ],
  captures: { complet: true, ecrans: [{ ecran: "formulaire", avant: CAPTURE("avant"), apres: CAPTURE("apres") }] },
} satisfies CardOfBefore;
const PRODUCT = {
  type: "product",
  question: "One journal export per project, or a single one?",
  choix: [
    { texte: "One per project.", suite: "resume" },
    { texte: "A single export.", suite: "resume" },
  ],
  captures: null,
} satisfies CardOfBefore;

const FACTS = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: null,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 1, attend: 2, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: ISSUE(12) },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21) },
  ],
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: ISSUE(12), decision: { quoi: "carte", motif: "design", cause: DESIGN.question, pr: null }, carte: DESIGN },
    { ticket: 21, titre: "L'export du journal", url: ISSUE(21), decision: { quoi: "carte", motif: "product", cause: PRODUCT.question, pr: null }, carte: PRODUCT },
  ],
};

describe("la carte de TODO, lue dans `facts`", () => {
  test("`attend[].carte` est lue telle que le runtime la donne : sa sorte, sa question, ses choix, ses captures", () => {
    const readOnes = understand(JSON.stringify(FACTS));
    assert.ok(!("informe" in readOnes));
    assert.deepEqual(readOnes.attend?.[0]?.carte, DESIGN);
    assert.deepEqual(readOnes.attend?.[1]?.carte, PRODUCT);
  });

  test("une carte qui n'en a pas la forme est laissée de côté — le reste de `facts` est lu", () => {
    for (const card of [{}, { ...PRODUCT, question: "" }, { ...PRODUCT, choix: "1. One" }, { ...PRODUCT, choix: [{ texte: "One" }, PRODUCT.choix[1]] }, "product"]) {
      const readOnes = understand(JSON.stringify({ ...FACTS, attend: [{ ...FACTS.attend[1], carte: card }] }));
      assert.ok(!("informe" in readOnes));
      assert.equal(readOnes.attend?.[0]?.ticket, 21);
      assert.equal(readOnes.attend?.[0]?.carte, undefined);
    }
    assert.equal(cardRead({ ...DESIGN, captures: "two screens" })?.captures, null);
  });

  test("dans la forme unique (épique #1764) : son résumé est lu ; une carte à un seul geste se lit sans question, plusieurs choix jamais", () => {
    const resume = "The delivery of #31 is green. The pass does not merge it itself.";
    const oneAction = { type: "product", resume, question: null, choix: [{ texte: "Merge the PR", suite: "merge" }], captures: null };
    assert.deepEqual(cardRead(oneAction), oneAction);
    assert.deepEqual(cardRead({ ...PRODUCT, resume }), { ...PRODUCT, resume });
    const { question: _, ...withoutQuestion } = oneAction;
    assert.equal(cardRead(withoutQuestion)?.question, null);
    // Plusieurs choix sans question, aucun choix, ou un résumé qui n'est pas un texte : la carte se pose sans ce qui manque, ou pas du tout.
    assert.equal(cardRead({ ...PRODUCT, question: null }), undefined);
    assert.equal(cardRead({ ...oneAction, choix: [] }), undefined);
    assert.ok(!("resume" in (cardRead({ ...PRODUCT, resume: 3 }) ?? {})));
    assert.ok(!("resume" in (cardRead({ ...PRODUCT, resume: "  " }) ?? {})));
    const setOne = cardOfTodo(cardRead(oneAction) ?? assert.fail("carte illisible"));
    assert.equal(setOne.resume, resume);
    assert.equal(setOne.question, null);
    assert.match(setOne.choix[0]?.prix ?? "", /merged .* not undone/);
    assert.ok(!("resume" in cardOfTodo(PRODUCT)));
    // La réponse à une carte sans question porte une question nulle : la même que la carte.
    assert.deepEqual(answerRead(cardRead(oneAction), 31, { question: null, choix: 1 }), { ticket: 31, choix: 1 });
    assert.deepEqual(answerRead(cardRead(oneAction), 31, { question: "Merge it?", choix: 1 }), { refus: CHANGED, detail: "" });
  });

  test("rangée pour la carte du rail : chaque choix porte son prix, celui d'un merge dit qu'il ne se défait pas ; sans écran, aucune capture", () => {
    const design = cardOfTodo(DESIGN);
    assert.equal(design.sorte, "design");
    assert.deepEqual(
      design.choix.map(({ texte: text }) => text),
      DESIGN.choix.map(({ texte: text }) => text),
    );
    assert.match(design.choix[0]?.prix ?? "", /merged .* not undone/);
    assert.equal(design.choix[1]?.prix, PRICE_OF_TEXT);
    assert.deepEqual(design.captures?.ecrans.map(({ avant: before, apres: after }) => [before.livree, after.livree]), [[true, true]]);
    assert.equal(design.captures?.incomplete, undefined);
    assert.ok(!("captures" in cardOfTodo(PRODUCT)));
  });

  test("un ticket que la cuisine a sorti du rail (#2118) : « dev session » le laisse dehors, « Close it » ferme son issue — aucun prix ne dit qu'un cook repart", () => {
    const output = cardOfTodo({
      type: "abandon",
      resume: "The kitchen took #2056 off the rail without serving it. Its delivery stayed blocked (manager-escalated) after everything the kitchen could try, up to the highest calibration it sets.",
      question: "What becomes of #2056?",
      choix: [
        { texte: "Put it back on the rail", suite: "resume" },
        { texte: "I take it in a dev session", suite: "drop" },
        { texte: "Close it", suite: "close" },
      ],
      captures: null,
    });
    const [putBack, keep, close] = output.choix.map(({ prix: price }) => price);
    assert.equal(putBack, PRICE_OF_TEXT);
    assert.match(keep ?? "", /the ticket is off the rail: no cook takes it, its issue stays open$/);
    assert.match(close ?? "", /its issue is closed: the ticket is not cooked$/);
    for (const price of [keep, close]) assert.doesNotMatch(price ?? "", /takes the ticket up again|cook may be launched/);
  });

  test("le rail porte la carte sur le bon de TODO, et le process principal en garde la carte et les captures", () => {
    const facts = holdFacts();
    const receivedOne = facts.recevoir({ projet: "parade", demande: 0, a: FACTS.lu, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    assert.ok("tableau" in receivedOne);
    const todo = receivedOne.tableau.rail.colonnes.find(({ nom: name }) => name === "Awaiting you");
    assert.deepEqual(
      todo?.cartes.map(({ ticket, todo: card }) => [ticket, card?.question]),
      [
        [12, DESIGN.question],
        [21, PRODUCT.question],
      ],
    );
    assert.deepEqual(facts.carte("parade", 21), PRODUCT);
    assert.equal(facts.carte("parade", 30), undefined);
    assert.equal(facts.capture("parade", 12, "formulaire", "apres"), CAPTURE("apres"));
  });
});

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

// Les faits d'un runtime qui porte des cartes de TODO : le type de la forme les tient.
void (FACTS satisfies Facts);

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

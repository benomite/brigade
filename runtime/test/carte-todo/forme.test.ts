// La forme unique d'une carte de TODO : un résumé de deux phrases simples au
// plus, une question, des choix qui nomment chacun le geste qu'ils jouent, une
// réponse libre, et « ask the second » en action secondaire, hors des choix.
// Une carte à un seul geste n'a que ce choix, et pas de question. La règle
// refuse, en clair, toute carte qui ne la respecte pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Captures } from "../../src/captures.ts";
import { jugerCarte, type Proposition } from "../../src/carte-todo.ts";
import { carteDeLaPorte, DEMANDER_AU_SECOND, phrases, validerCarte, type CarteProposee, type CarteTodo, type Validation } from "../../src/carte-todo/forme.ts";

const valide = (validation: Validation): CarteTodo => {
  assert.equal(validation.valide, true, validation.valide ? "" : validation.raison);
  return (validation as { carte: CarteTodo }).carte;
};
const refusee = (validation: Validation): string => {
  assert.equal(validation.valide, false, "the card should be refused");
  return (validation as { raison: string }).raison;
};

const QUESTION: CarteProposee = {
  resume: "The review refused the delivery twice for the same finding. The manager sends it up to you.",
  question: "Raise the calibration, or split the ticket?",
  choix: [
    { texte: "Raise it to opus / high.", suite: "resume" },
    { texte: "Split the ticket in two.", suite: "resume" },
  ],
};

const UN_GESTE: CarteProposee = {
  resume: "The delivery is green but touches the workflows. Only you can merge it.",
  choix: [{ texte: "Merge the green delivery.", suite: "merge" }],
};

describe("a valid card", () => {
  test("a question and several choices: each choice is a button with its gesture", () => {
    const carte = valide(validerCarte(QUESTION));
    assert.equal(carte.resume, QUESTION.resume);
    assert.equal(carte.question, "Raise the calibration, or split the ticket?");
    assert.deepEqual(carte.choix, [
      { texte: "Raise it to opus / high.", suite: "resume" },
      { texte: "Split the ticket in two.", suite: "resume" },
    ]);
    assert.equal(carte.captures, null);
  });

  test("a single gesture: that one choice, and no question", () => {
    const carte = valide(validerCarte(UN_GESTE));
    assert.equal(carte.question, null);
    assert.deepEqual(carte.choix, [{ texte: "Merge the green delivery.", suite: "merge" }]);
  });

  test("an empty question on a single gesture is no question", () => {
    assert.equal(valide(validerCarte({ ...UN_GESTE, question: "  " })).question, null);
  });

  test("a free answer: offered by default, on a card with a question as on a single gesture", () => {
    assert.equal(valide(validerCarte(QUESTION)).reponseLibre, true);
    assert.equal(valide(validerCarte({ ...QUESTION, reponseLibre: true })).reponseLibre, true);
    assert.equal(valide(validerCarte(UN_GESTE)).reponseLibre, true);
  });

  test("a producer can withhold the free answer, and the free answer is never a choice", () => {
    const carte = valide(validerCarte({ ...UN_GESTE, reponseLibre: false }));
    assert.equal(carte.reponseLibre, false);
    assert.equal(carte.choix.length, 1);
    assert.equal(valide(validerCarte(QUESTION)).choix.length, 2);
  });

  test("every valid card carries “ask the second” as its secondary action, outside its choices", () => {
    for (const proposee of [QUESTION, UN_GESTE, { ...UN_GESTE, reponseLibre: false }]) {
      const carte = valide(validerCarte(proposee));
      assert.deepEqual(carte.secondaire, { action: "ask-second", texte: "ask the second" });
      assert.equal(carte.secondaire, DEMANDER_AU_SECOND);
      assert.ok(carte.choix.every(({ texte }) => !/second/i.test(texte)));
    }
    assert.ok(Object.isFrozen(DEMANDER_AU_SECOND));
  });

  test("texts are trimmed and gestures read in lower case", () => {
    const carte = valide(validerCarte({ resume: "  One sentence.  ", question: " Which way? ", choix: [{ texte: " This one. ", suite: " RESUME " }, { texte: "That one.", suite: "Merge" }] }));
    assert.equal(carte.resume, "One sentence.");
    assert.equal(carte.question, "Which way?");
    assert.deepEqual(carte.choix, [{ texte: "This one.", suite: "resume" }, { texte: "That one.", suite: "merge" }]);
  });

  test("a summary of two sentences passes; a dot inside a word cuts nothing", () => {
    assert.equal(phrases("The PR touches forme.ts in v2.1. It waits for you."), 2);
    assert.equal(phrases("No final dot"), 1);
    valide(validerCarte({ ...UN_GESTE, resume: "The PR touches forme.ts in v2.1. It waits for you." }));
  });

  test("the captures the ticket delivered stay on the card, each screen before and after", () => {
    const captures: Captures = { sha: "c0ffee", screens: [{ screen: "rail", before: "docs/captures/2/rail-avant.png", after: "docs/captures/2/rail-apres.png" }] };
    assert.deepEqual(valide(validerCarte({ ...QUESTION, captures })).captures, captures);
    assert.equal(valide(validerCarte({ ...QUESTION, captures: { sha: "c0ffee", screens: [] } })).captures, null);
  });
});

describe("the validation refuses an incomplete card, saying why", () => {
  test("a summary longer than two sentences", () => {
    const raison = refusee(validerCarte({ ...QUESTION, resume: "The review refused it. Twice. The manager sends it up." }));
    assert.match(raison, /summary of 3 sentences/);
    assert.match(raison, /at most 2 plain sentences/);
  });

  test("no summary, a summary on several lines, a summary in Markdown", () => {
    assert.match(refusee(validerCarte({ ...QUESTION, resume: " " })), /^no summary/);
    assert.match(refusee(validerCarte({ ...QUESTION, resume: null })), /^no summary/);
    assert.match(refusee(validerCarte({ ...QUESTION, resume: "One.\nTwo." })), /several lines/);
    for (const resume of ["The `gates` are red.", "The PR is **green**.", "See [the PR](https://example.com).", "# Red", "- red"]) {
      assert.match(refusee(validerCarte({ ...QUESTION, resume })), /plain sentences/, resume);
    }
  });

  test("a card with no choices", () => {
    assert.match(refusee(validerCarte({ ...QUESTION, choix: [] })), /^no choice/);
    assert.match(refusee(validerCarte({ ...QUESTION, choix: null })), /^no choice/);
    assert.match(refusee(validerCarte({ resume: "Nothing to do." })), /^no choice/);
  });

  test("several choices but no question", () => {
    const raison = refusee(validerCarte({ ...QUESTION, question: null }));
    assert.match(raison, /2 choices but no question/);
    assert.match(refusee(validerCarte({ ...QUESTION, question: "   " })), /no question/);
  });

  test("a single gesture that still carries a question", () => {
    const raison = refusee(validerCarte({ ...UN_GESTE, question: "Merge it?" }));
    assert.match(raison, /single gesture with a question/);
  });

  test("a choice without a gesture, or with a gesture nobody plays", () => {
    const sans = refusee(validerCarte({ ...QUESTION, choix: [{ texte: "Raise it.", suite: "resume" }, { texte: "Split it." }] }));
    assert.match(sans, /choice 2 \(“Split it\.”\) names no gesture/);
    assert.match(sans, /resume or merge/);
    assert.match(refusee(validerCarte({ ...UN_GESTE, choix: [{ texte: "Merge.", suite: " " }] })), /choice 1 .* names no gesture/);
    assert.match(refusee(validerCarte({ ...UN_GESTE, choix: [{ texte: "Merge.", suite: null }] })), /names no gesture/);
    assert.match(refusee(validerCarte({ ...UN_GESTE, choix: [{ texte: "Close it.", suite: "close" }] })), /unknown gesture “close”/);
  });

  test("“ask the second” offered as a choice", () => {
    assert.match(refusee(validerCarte({ ...QUESTION, choix: [...(QUESTION.choix ?? []), { texte: "Explain it to me.", suite: "ask-second" }] })), /choice 3 asks the second.*never one of its choices/);
    assert.match(refusee(validerCarte({ ...UN_GESTE, choix: [{ texte: "Ask the second", suite: "resume" }] })), /secondary action/);
  });

  test("an empty, multi-line or repeated choice", () => {
    assert.match(refusee(validerCarte({ ...UN_GESTE, choix: [{ texte: " ", suite: "merge" }] })), /choice 1 is empty/);
    assert.match(refusee(validerCarte({ ...UN_GESTE, choix: [{ texte: "Merge\nnow.", suite: "merge" }] })), /several lines/);
    assert.match(refusee(validerCarte({ ...QUESTION, choix: [{ texte: "Same.", suite: "resume" }, { texte: "Same.", suite: "merge" }] })), /choice 2 repeats another/);
  });

  test("a question on several lines, or more than one question", () => {
    assert.match(refusee(validerCarte({ ...QUESTION, question: "Raise it?\nOr split it?" })), /several lines/);
    assert.match(refusee(validerCarte({ ...QUESTION, question: "Raise it? Or split it?" })), /not exactly one question/);
    assert.match(refusee(validerCarte({ ...QUESTION, question: "Raise it or split it" })), /not exactly one question/);
  });

  test("a free answer that is neither offered nor withheld", () => {
    assert.match(refusee(validerCarte({ ...QUESTION, reponseLibre: "yes" as unknown as boolean })), /free answer/);
  });

  test("captures with a screen missing its before or after", () => {
    const captures: Captures = { sha: "c0ffee", screens: [{ screen: "rail", before: "docs/captures/2/rail-avant.png", after: null }] };
    assert.match(refusee(validerCarte({ ...QUESTION, captures })), /captures incomplete/);
  });
});

// La carte que le chef a reçue pour #1752 : une question produit, posée au nom
// du manager qui l'avait remonté, deux choix qui reprennent le ticket, et la
// réponse libre — c'est par elle que le chef a répondu.
const CARTE_1752: Proposition = {
  type: "product",
  enonce: "La carte d'un ticket en attente de station doit-elle dire au chef de brancher une station, alors que la règle de l'app veut qu'un geste soit un bouton ?",
  choix: [
    { texte: "Garder le geste « brancher une station » dans le libellé, en dérogeant à #830.", suite: "resume" },
    { texte: "Retirer le geste du libellé en attendant un bouton.", suite: "resume" },
  ],
};
const RESUME_1752 = "Le critère de #1752 veut le geste dans le libellé, et la relecture le refuse sans bouton (règle #830). Le manager te le remonte après deux renvois rouges.";

test("the product question card of #1752 is a valid card under the single shape", () => {
  const jugement = jugerCarte(CARTE_1752);
  assert.equal(jugement.admise, true, jugement.admise ? "" : jugement.raison);
  const admise = (jugement as { carte: Parameters<typeof carteDeLaPorte>[0] }).carte;

  const carte = valide(carteDeLaPorte(admise, RESUME_1752));
  assert.equal(carte.resume, RESUME_1752);
  assert.equal(carte.question, CARTE_1752.enonce);
  assert.deepEqual(carte.choix, admise.choix);
  assert.ok(carte.choix.every(({ suite }) => suite === "resume"));
  assert.equal(carte.reponseLibre, true);
  assert.equal(carte.secondaire, DEMANDER_AU_SECOND);
  assert.equal(carte.captures, null);
});

test("a card the gate of #1281 admits still needs its summary", () => {
  const jugement = jugerCarte(CARTE_1752);
  assert.equal(jugement.admise, true);
  const admise = (jugement as { carte: Parameters<typeof carteDeLaPorte>[0] }).carte;
  assert.match(refusee(carteDeLaPorte(admise, "")), /^no summary/);
});

// Ce qu'on attend du chef, en tête de la fiche d'une carte qui l'attend (#832) : une phrase dans les
// mots de l'app, d'après la décision que `faits` donne — jamais la ligne de la file —, et les gestes
// qui la tranchent, le recommandé en premier.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { expectedOf, decisionRead, readDelivery, firstSentence, withoutQuestion, headOf, type Decision } from "../src/decision.ts";

const PR = "https://github.com/benomite/brigade/pull/840";
const decision = (what: string, more: Partial<Decision> = {}): Decision => ({ quoi: what, motif: null, cause: null, pr: null, ...more });

describe("l'attendu d'une décision", () => {
  test("le cas de #824 : le manager a renoncé après des rouges, la livraison a sa PR — merge-la, ou sors-la du rail", () => {
    assert.deepEqual(expectedOf(decision("remontee", { motif: "still-red", cause: "manager-escalated", pr: PR }), 1), {
      phrase: "The manager gave up after repeated reds: merge it anyway, or take it off the rail.",
      gestes: ["retirer"],
    });
    // Sans PR, la phrase est autre.
    assert.deepEqual(expectedOf(decision("remontee", { motif: "still-red", cause: "returns-exhausted" }), 1), {
      phrase: "Still red after its returns, the pass gave up: take it off the rail, or close its issue.",
      gestes: ["retirer"],
    });
  });

  test("une livraison verte que la pass ne merge pas : chaque motif dit le sien, et aucun bouton ne merge", () => {
    for (const [motive, expected] of [
      ["review-required", /review it, then merge it/],
      ["merge-refused", /GitHub refused the merge/],
      ["un-motif-neuf", /^Green, but not merged: merge it yourself\.$/],
    ] as const) {
      const { phrase: sentence, gestes: actions } = expectedOf(decision("merge", { motif: motive, pr: PR }), 1);
      assert.match(sentence, expected, motive);
      assert.deepEqual(actions, [], motive);
    }
  });

  test("chaque sorte a sa phrase et ses gestes : renvoyer en cuisine, ouvrir l'issue où répondre ou corriger, retirer du rail", () => {
    assert.deepEqual(expectedOf(decision("repris"), 1).gestes, ["cuisine", "retirer"]);
    assert.deepEqual(expectedOf(decision("fermee", { motif: "still-red", pr: PR }), 1).gestes, ["retirer"]);
    assert.deepEqual(expectedOf(decision("86", { motif: "refused" }), 1).gestes, ["issue", "retirer"]);
    assert.deepEqual(expectedOf(decision("86", { motif: "no-calibration" }), 1).gestes, ["issue"]);
    assert.deepEqual(expectedOf(decision("ecartee", { motif: "question" }), 1).gestes, ["issue"]);
    assert.match(expectedOf(decision("illisible", { motif: "epic" }), 1).phrase, /split/);
    assert.match(expectedOf(decision("illisible", { motif: "issue" }), 1).phrase, /judgement/);
    // Une carte de TODO : sa question et ses choix sont sur la carte même, aucun geste n'est ajouté.
    assert.deepEqual(expectedOf(decision("carte", { motif: "design", cause: "Is this screen right?" }), 1), { phrase: "Is this screen right?", gestes: [] });
    assert.deepEqual(expectedOf(decision("carte", { motif: "product" }), 1), { phrase: "no question found on #1", gestes: [], sansQuestion: true });
    // Sorti du rail par la cuisine : ses trois gestes sont les choix de sa carte (#2118).
    assert.deepEqual(expectedOf(decision("abandon", { motif: "pass", cause: "manager-escalated" }), 1).gestes, []);
    assert.match(expectedOf(decision("abandon", { motif: "chain" }), 1).phrase, /^The kitchen took it off the rail without serving it: /);
  });

  test("aucune phrase ne cite une commande, un label entre backticks ni la ligne de la file : une phrase, en clair", () => {
    const kinds = ["merge", "remontee", "fermee", "86", "capacite", "absente", "bloque", "ecartee", "illisible", "question", "repris", "carte", "abandon"];
    const reasons = [null, "review-required", "merge-refused", "still-red", "unjudged", "manager-escalated", "no-calibration", "unreadable-card", "refused", "question", "decision", "epic", "issue", "product", "design"];
    for (const what of kinds) {
      for (const motive of reasons) {
        for (const pr of [null, PR]) {
          const { phrase: sentence } = expectedOf(decision(what, { motif: motive, pr }), 1);
          assert.doesNotMatch(sentence, /`|brigade |https?:|à trancher|remontée/, `${what} ${motive} ${pr}`);
          assert.match(sentence, /^([A-Z].*\.|no question found on #1)$/, `${what} ${motive}`);
        }
      }
    }
  });

  test("sans question trouvée : exactement « no question found on #N », le vrai numéro, et la carte marquée sans question", () => {
    assert.deepEqual(expectedOf(undefined, 3131), { phrase: "no question found on #3131", gestes: [], sansQuestion: true });
    assert.deepEqual(expectedOf(decision("une-sorte-neuve"), 42), { phrase: "no question found on #42", gestes: [], sansQuestion: true });
    assert.deepEqual(expectedOf(decision("86", { motif: "un-motif-neuf" }), 7), { phrase: "no question found on #7", gestes: ["issue"], sansQuestion: true });
    assert.deepEqual(expectedOf(decision("ecartee", { motif: "un-motif-neuf" }), 8), { phrase: "no question found on #8", gestes: ["issue"], sansQuestion: true });
    assert.equal(withoutQuestion(9), "no question found on #9");
    // Une carte qui a sa question n'est pas marquée.
    assert.equal(expectedOf(decision("repris"), 5).sansQuestion, undefined);
  });

  test("la question de la carte lue de l'issue : la carte en donne la première phrase, en clair, et garde ses gestes", () => {
    const question = "Should the journal export be CSV or JSON?\nThe second is richer.";
    assert.deepEqual(expectedOf(decision("86", { motif: "refused" }), 12, question), { phrase: "Should the journal export be CSV or JSON?", gestes: ["issue", "retirer"] });
    assert.deepEqual(expectedOf(decision("une-sorte-neuve"), 12, "Keep the old screen."), { phrase: "Keep the old screen.", gestes: [] });
    assert.deepEqual(expectedOf(undefined, 12, "Keep the old screen."), { phrase: "Keep the old screen.", gestes: [] });
    // Une question vide ou absente ne compte pas.
    assert.equal(expectedOf(decision("une-sorte-neuve"), 12, "  ").phrase, "no question found on #12");
    assert.equal(expectedOf(decision("une-sorte-neuve"), 12, null).sansQuestion, true);
  });

  test("aucune phrase rendue n'envoie le chef à l'issue pour apprendre ce qu'on lui demande", () => {
    const kinds = ["merge", "remontee", "fermee", "86", "capacite", "absente", "bloque", "ecartee", "illisible", "question", "repris", "carte", "abandon", "inconnue"];
    const reasons = [null, "review-required", "merge-refused", "still-red", "unjudged", "no-calibration", "unreadable-card", "refused", "question", "decision", "epic", "issue", "product", "design"];
    for (const what of kinds) {
      for (const motive of reasons) {
        const { phrase: sentence } = expectedOf(decision(what, { motif: motive }), 1);
        assert.doesNotMatch(sentence, /its issue says|what its issue|see what|open the issue to/i, `${what} ${motive}`);
      }
    }
    assert.doesNotMatch(expectedOf(decision("remontee", { motif: "unjudged" }), 1).phrase, /issue says/);
  });

  test("une décision venue d'ailleurs n'en est une que si elle en a la forme", () => {
    assert.deepEqual(decisionRead({ quoi: "merge", motif: "review-required", cause: null, pr: PR }), { quoi: "merge", motif: "review-required", cause: null, pr: PR });
    for (const raw of [undefined, null, "merge", { quoi: 1, motif: null, cause: null, pr: null }, { quoi: "merge", motif: null, cause: null, pr: 8 }, { quoi: "merge" }]) {
      assert.equal(decisionRead(raw), undefined, JSON.stringify(raw));
    }
  });
});

describe("la tête d'une livraison qui attend son merge (#731) : deux lignes, et les juges", () => {
  const RESUME = "Adds the merge button to the sheet. It also moves the confirmation.";
  const JUDGES = [{ fichier: ".github/workflows/ci.yml", ajoutees: 4, retirees: 1 }, { fichier: ".claude/brigade/gates.sh", ajoutees: 0, retirees: 12 }];

  test("verte mais elle touche aux juges : ce qu'elle fait (première phrase du résumé), pourquoi elle attend, et les fichiers un par ligne", () => {
    assert.deepEqual(headOf(decision("merge", { motif: "review-required", pr: PR }), { resume: RESUME, juges: JUDGES }), {
      fait: "Adds the merge button to the sheet.",
      pourquoi: "Green, but it touches the judges: review it.",
      juges: JUDGES,
    });
  });

  test("rouge après deux renvois : le premier constat bloquant, en une ligne ; le manager qui renonce se dit autrement", () => {
    const finding = "The button merges without asking. A second line follows.";
    assert.equal(headOf(decision("remontee", { motif: "still-red", cause: "returns-exhausted", pr: PR }), { resume: RESUME, constat: finding })?.pourquoi, "Red after 2 returns: The button merges without asking.");
    assert.equal(headOf(decision("remontee", { motif: "still-red", cause: "manager-escalated", pr: PR }), { constat: finding })?.pourquoi, "Red, the manager gave up: The button merges without asking.");
    assert.equal(headOf(decision("remontee", { motif: "still-red", cause: "returns-exhausted" }), { resume: RESUME })?.pourquoi, "Red after 2 returns");
  });

  test("verte, la CI n'a pas conclu", () => {
    assert.equal(headOf(decision("remontee", { motif: "unjudged", cause: "ci-silent" }), { resume: RESUME })?.pourquoi, "Green, the CI did not conclude.");
    assert.equal(headOf(decision("remontee", { motif: "unjudged", cause: "ci-silent" }), undefined), undefined, "la pass n'a rien consigné : la phrase d'`attenduDe` reste seule");
  });

  test("sans résumé, la ligne « ce qu'elle fait » n'existe pas — rien n'est inventé ; ailleurs, la phrase d'`attenduDe` reste seule", () => {
    assert.equal(headOf(decision("remontee", { motif: "unjudged", cause: "ci-silent" }), { constat: "x" })?.fait, undefined);
    assert.equal(headOf(decision("merge", { motif: "review-required", pr: PR }), { resume: RESUME }), undefined, "review-required sans juges : une déclaration du projet, pas un juge");
    assert.equal(headOf(undefined, { resume: RESUME }), undefined);
  });

  test("la première phrase, et la livraison venue de la box", () => {
    assert.equal(firstSentence("  One sentence\nover two lines.  Next. "), "One sentence over two lines.");
    assert.equal(firstSentence("No full stop"), "No full stop");
    assert.deepEqual(readDelivery({ resume: RESUME, juges: [...JUDGES, { fichier: 1 }] }), { resume: RESUME, juges: JUDGES });
    assert.equal(readDelivery("x"), undefined);
  });
});

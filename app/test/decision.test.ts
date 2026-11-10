// Ce qu'on attend du chef, en tête de la fiche d'une carte qui l'attend (#832) : une phrase dans les
// mots de l'app, d'après la décision que `faits` donne — jamais la ligne de la file —, et les gestes
// qui la tranchent, le recommandé en premier.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { attenduDe, decisionLue, livraisonLue, premierePhrase, sansQuestion, teteDe, type Decision } from "../src/decision.ts";

const PR = "https://github.com/benomite/brigade/pull/840";
const decision = (quoi: string, plus: Partial<Decision> = {}): Decision => ({ quoi, motif: null, cause: null, pr: null, ...plus });

describe("l'attendu d'une décision", () => {
  test("le cas de #824 : le manager a renoncé après des rouges, la livraison a sa PR — merge-la, ou sors-la du rail", () => {
    assert.deepEqual(attenduDe(decision("remontee", { motif: "still-red", cause: "manager-escalated", pr: PR }), 1), {
      phrase: "The manager gave up after repeated reds: merge it anyway, or take it off the rail.",
      gestes: ["retirer"],
    });
    // Sans PR, la phrase est autre.
    assert.deepEqual(attenduDe(decision("remontee", { motif: "still-red", cause: "returns-exhausted" }), 1), {
      phrase: "Still red after its returns, the pass gave up: take it off the rail, or close its issue.",
      gestes: ["retirer"],
    });
  });

  test("une livraison verte que la pass ne merge pas : chaque motif dit le sien, et aucun bouton ne merge", () => {
    for (const [motif, attendue] of [
      ["review-required", /review it, then merge it/],
      ["merge-refused", /GitHub refused the merge/],
      ["un-motif-neuf", /^Green, but not merged: merge it yourself\.$/],
    ] as const) {
      const { phrase, gestes } = attenduDe(decision("merge", { motif, pr: PR }), 1);
      assert.match(phrase, attendue, motif);
      assert.deepEqual(gestes, [], motif);
    }
  });

  test("chaque sorte a sa phrase et ses gestes : renvoyer en cuisine, ouvrir l'issue où répondre ou corriger, retirer du rail", () => {
    assert.deepEqual(attenduDe(decision("repris"), 1).gestes, ["cuisine", "retirer"]);
    assert.deepEqual(attenduDe(decision("fermee", { motif: "still-red", pr: PR }), 1).gestes, ["retirer"]);
    assert.deepEqual(attenduDe(decision("86", { motif: "refused" }), 1).gestes, ["issue", "retirer"]);
    assert.deepEqual(attenduDe(decision("86", { motif: "no-calibration" }), 1).gestes, ["issue"]);
    assert.deepEqual(attenduDe(decision("ecartee", { motif: "question" }), 1).gestes, ["issue"]);
    // Retenue : ses deux gestes à elle sont sur la fiche.
    assert.deepEqual(attenduDe(decision("ecartee", { motif: "blocked-on-human" }), 1).gestes, []);
    assert.match(attenduDe(decision("illisible", { motif: "epic" }), 1).phrase, /split/);
    assert.match(attenduDe(decision("illisible", { motif: "issue" }), 1).phrase, /judgement/);
    // Une carte de TODO : sa question et ses choix sont sur la carte même, aucun geste n'est ajouté.
    assert.deepEqual(attenduDe(decision("carte", { motif: "design" }), 1), { phrase: "Validate its screen: answer its question.", gestes: [] });
    assert.deepEqual(attenduDe(decision("carte", { motif: "product" }), 1), { phrase: "A product choice is yours: answer its question.", gestes: [] });
    // Sorti du rail par la cuisine : ses trois gestes sont les choix de sa carte (#2118).
    assert.deepEqual(attenduDe(decision("abandon", { motif: "pass", cause: "manager-escalated" }), 1).gestes, []);
    assert.match(attenduDe(decision("abandon", { motif: "chain" }), 1).phrase, /^The kitchen took it off the rail without serving it: /);
  });

  test("aucune phrase ne cite une commande, un label entre backticks ni la ligne de la file : une phrase, en clair", () => {
    const sortes = ["merge", "remontee", "fermee", "86", "capacite", "absente", "bloque", "ecartee", "illisible", "question", "repris", "carte", "abandon"];
    const motifs = [null, "review-required", "merge-refused", "still-red", "unjudged", "manager-escalated", "no-calibration", "unreadable-card", "refused", "question", "decision", "blocked-on-human", "epic", "issue", "product", "design"];
    for (const quoi of sortes) {
      for (const motif of motifs) {
        for (const pr of [null, PR]) {
          const { phrase } = attenduDe(decision(quoi, { motif, pr }), 1);
          assert.doesNotMatch(phrase, /`|brigade |https?:|à trancher|remontée/, `${quoi} ${motif} ${pr}`);
          assert.match(phrase, /^([A-Z].*\.|no question found on #1)$/, `${quoi} ${motif}`);
        }
      }
    }
  });

  test("sans question trouvée : exactement « no question found on #N », le vrai numéro, et la carte marquée sans question", () => {
    assert.deepEqual(attenduDe(undefined, 3131), { phrase: "no question found on #3131", gestes: [], sansQuestion: true });
    assert.deepEqual(attenduDe(decision("une-sorte-neuve"), 42), { phrase: "no question found on #42", gestes: [], sansQuestion: true });
    assert.deepEqual(attenduDe(decision("86", { motif: "un-motif-neuf" }), 7), { phrase: "no question found on #7", gestes: ["issue"], sansQuestion: true });
    assert.deepEqual(attenduDe(decision("ecartee", { motif: "un-motif-neuf" }), 8), { phrase: "no question found on #8", gestes: ["issue"], sansQuestion: true });
    assert.equal(sansQuestion(9), "no question found on #9");
    // Une carte qui a sa question n'est pas marquée.
    assert.equal(attenduDe(decision("repris"), 5).sansQuestion, undefined);
  });

  test("une demande de décision sur l'issue : la carte en donne la première phrase, en clair, et garde ses gestes", () => {
    const demande = "Should the journal export be CSV or JSON?\nThe second is richer.";
    assert.deepEqual(attenduDe(decision("86", { motif: "refused", demande }), 12), { phrase: "Should the journal export be CSV or JSON?", gestes: ["issue", "retirer"] });
    assert.deepEqual(attenduDe(decision("une-sorte-neuve", { demande: "Keep the old screen." }), 12), { phrase: "Keep the old screen.", gestes: [] });
    // Une demande vide ne compte pas.
    assert.equal(attenduDe(decision("une-sorte-neuve", { demande: "  " }), 12).phrase, "no question found on #12");
    assert.equal(decisionLue({ quoi: "86", motif: null, cause: null, pr: null, demande })?.demande, demande);
    assert.equal(decisionLue({ quoi: "86", motif: null, cause: null, pr: null, demande: 3 })?.demande, undefined);
  });

  test("aucune phrase rendue n'envoie le chef à l'issue pour apprendre ce qu'on lui demande", () => {
    const sortes = ["merge", "remontee", "fermee", "86", "capacite", "absente", "bloque", "ecartee", "illisible", "question", "repris", "carte", "abandon", "inconnue"];
    const motifs = [null, "review-required", "merge-refused", "still-red", "unjudged", "no-calibration", "unreadable-card", "refused", "question", "decision", "blocked-on-human", "epic", "issue", "product", "design"];
    for (const quoi of sortes) {
      for (const motif of motifs) {
        const { phrase } = attenduDe(decision(quoi, { motif }), 1);
        assert.doesNotMatch(phrase, /its issue says|what its issue|see what|open the issue to/i, `${quoi} ${motif}`);
      }
    }
    assert.doesNotMatch(attenduDe(decision("remontee", { motif: "unjudged" }), 1).phrase, /issue says/);
  });

  test("une décision venue d'ailleurs n'en est une que si elle en a la forme", () => {
    assert.deepEqual(decisionLue({ quoi: "merge", motif: "review-required", cause: null, pr: PR }), { quoi: "merge", motif: "review-required", cause: null, pr: PR });
    for (const brute of [undefined, null, "merge", { quoi: 1, motif: null, cause: null, pr: null }, { quoi: "merge", motif: null, cause: null, pr: 8 }, { quoi: "merge" }]) {
      assert.equal(decisionLue(brute), undefined, JSON.stringify(brute));
    }
  });
});

describe("la tête d'une livraison qui attend son merge (#731) : deux lignes, et les juges", () => {
  const RESUME = "Adds the merge button to the sheet. It also moves the confirmation.";
  const JUGES = [{ fichier: ".github/workflows/ci.yml", ajoutees: 4, retirees: 1 }, { fichier: ".claude/brigade/gates.sh", ajoutees: 0, retirees: 12 }];

  test("verte mais elle touche aux juges : ce qu'elle fait (première phrase du résumé), pourquoi elle attend, et les fichiers un par ligne", () => {
    assert.deepEqual(teteDe(decision("merge", { motif: "review-required", pr: PR }), { resume: RESUME, juges: JUGES }), {
      fait: "Adds the merge button to the sheet.",
      pourquoi: "Green, but it touches the judges: review it.",
      juges: JUGES,
    });
  });

  test("rouge après deux renvois : le premier constat bloquant, en une ligne ; le manager qui renonce se dit autrement", () => {
    const constat = "The button merges without asking. A second line follows.";
    assert.equal(teteDe(decision("remontee", { motif: "still-red", cause: "returns-exhausted", pr: PR }), { resume: RESUME, constat })?.pourquoi, "Red after 2 returns: The button merges without asking.");
    assert.equal(teteDe(decision("remontee", { motif: "still-red", cause: "manager-escalated", pr: PR }), { constat })?.pourquoi, "Red, the manager gave up: The button merges without asking.");
    assert.equal(teteDe(decision("remontee", { motif: "still-red", cause: "returns-exhausted" }), { resume: RESUME })?.pourquoi, "Red after 2 returns");
  });

  test("verte, la CI n'a pas conclu", () => {
    assert.equal(teteDe(decision("remontee", { motif: "unjudged", cause: "ci-silent" }), { resume: RESUME })?.pourquoi, "Green, the CI did not conclude.");
    assert.equal(teteDe(decision("remontee", { motif: "unjudged", cause: "ci-silent" }), undefined), undefined, "la pass n'a rien consigné : la phrase d'`attenduDe` reste seule");
  });

  test("sans résumé, la ligne « ce qu'elle fait » n'existe pas — rien n'est inventé ; ailleurs, la phrase d'`attenduDe` reste seule", () => {
    assert.equal(teteDe(decision("remontee", { motif: "unjudged", cause: "ci-silent" }), { constat: "x" })?.fait, undefined);
    assert.equal(teteDe(decision("merge", { motif: "review-required", pr: PR }), { resume: RESUME }), undefined, "review-required sans juges : une déclaration du projet, pas un juge");
    assert.equal(teteDe(undefined, { resume: RESUME }), undefined);
  });

  test("la première phrase, et la livraison venue de la box", () => {
    assert.equal(premierePhrase("  One sentence\nover two lines.  Next. "), "One sentence over two lines.");
    assert.equal(premierePhrase("No full stop"), "No full stop");
    assert.deepEqual(livraisonLue({ resume: RESUME, juges: [...JUGES, { fichier: 1 }] }), { resume: RESUME, juges: JUGES });
    assert.equal(livraisonLue("x"), undefined);
  });
});

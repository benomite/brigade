// Ce qu'on attend du chef, en tête de la fiche d'une carte qui l'attend (#832) : une phrase dans les
// mots de l'app, d'après la décision que `faits` donne — jamais la ligne de la file —, et les gestes
// qui la tranchent, le recommandé en premier.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { attenduDe, decisionLue, livraisonLue, premierePhrase, SANS_DECISION, teteDe, type Decision } from "../src/decision.ts";

const PR = "https://github.com/benomite/brigade/pull/840";
const decision = (quoi: string, plus: Partial<Decision> = {}): Decision => ({ quoi, motif: null, cause: null, pr: null, ...plus });

describe("l'attendu d'une décision", () => {
  test("le cas de #824 : le manager a renoncé après des rouges, la livraison a sa PR — merge-la, ou sors-la du rail", () => {
    assert.deepEqual(attenduDe(decision("remontee", { motif: "still-red", cause: "manager-escalated", pr: PR })), {
      phrase: "The manager gave up after repeated reds: merge it anyway, or take it off the rail.",
      gestes: ["merger", "retirer"],
    });
    // Sans PR, il n'y a rien à merger.
    assert.deepEqual(attenduDe(decision("remontee", { motif: "still-red", cause: "returns-exhausted" })), {
      phrase: "Still red after its returns, the pass gave up: take it off the rail, or close its issue.",
      gestes: ["retirer"],
    });
  });

  test("une livraison verte que la pass ne merge pas : la merger, chaque motif dit le sien", () => {
    for (const [motif, attendue] of [
      ["no-grant", /without the merge grant/],
      ["review-required", /review it, then merge it/],
      ["merge-refused", /GitHub refused the merge/],
      ["un-motif-neuf", /^Green, but not merged: merge it yourself\.$/],
    ] as const) {
      const { phrase, gestes } = attenduDe(decision("merge", { motif, pr: PR }));
      assert.match(phrase, attendue, motif);
      assert.deepEqual(gestes, ["merger"], motif);
    }
    assert.deepEqual(attenduDe(decision("merge", { motif: "no-grant" })).gestes, [], "sans PR, pas de merge");
  });

  test("chaque sorte a sa phrase et ses gestes : renvoyer en cuisine, ouvrir l'issue où répondre ou corriger, retirer du rail", () => {
    assert.deepEqual(attenduDe(decision("repris")).gestes, ["cuisine", "retirer"]);
    assert.deepEqual(attenduDe(decision("fermee", { motif: "still-red", pr: PR })).gestes, ["retirer"]);
    assert.deepEqual(attenduDe(decision("86", { motif: "refused" })).gestes, ["issue", "retirer"]);
    assert.deepEqual(attenduDe(decision("86", { motif: "no-calibration" })).gestes, ["issue"]);
    assert.deepEqual(attenduDe(decision("ecartee", { motif: "question" })).gestes, ["issue"]);
    // Retenue : ses deux gestes à elle sont sur la fiche.
    assert.deepEqual(attenduDe(decision("ecartee", { motif: "blocked-on-human" })).gestes, []);
    assert.match(attenduDe(decision("illisible", { motif: "epic" })).phrase, /split/);
    assert.match(attenduDe(decision("illisible", { motif: "issue" })).phrase, /judgement/);
    // Une carte de TODO : sa question et ses choix sont sur la carte même, aucun geste n'est ajouté.
    assert.deepEqual(attenduDe(decision("carte", { motif: "design" })), { phrase: "Validate its screen: answer its question.", gestes: [] });
    assert.deepEqual(attenduDe(decision("carte", { motif: "product" })), { phrase: "A product choice is yours: answer its question.", gestes: [] });
  });

  test("aucune phrase ne cite une commande, un label entre backticks ni la ligne de la file : une phrase, en clair", () => {
    const sortes = ["merge", "remontee", "fermee", "86", "capacite", "absente", "bloque", "ecartee", "illisible", "question", "repris", "carte"];
    const motifs = [null, "no-grant", "review-required", "merge-refused", "still-red", "unjudged", "manager-escalated", "no-calibration", "unreadable-card", "refused", "question", "decision", "blocked-on-human", "epic", "issue", "product", "design"];
    for (const quoi of sortes) {
      for (const motif of motifs) {
        for (const pr of [null, PR]) {
          const { phrase } = attenduDe(decision(quoi, { motif, pr }));
          assert.doesNotMatch(phrase, /`|ssh |brigade |https?:|à trancher|remontée/, `${quoi} ${motif} ${pr}`);
          assert.match(phrase, /^[A-Z].*\.$/, `${quoi} ${motif}`);
        }
      }
    }
  });

  test("une box d'avant la décision, ou une sorte inconnue : une phrase qui ne devine rien, et aucun geste", () => {
    assert.deepEqual(attenduDe(undefined), { phrase: SANS_DECISION, gestes: [] });
    assert.deepEqual(attenduDe(decision("une-sorte-neuve")), { phrase: SANS_DECISION, gestes: [] });
  });

  test("une décision venue d'ailleurs n'en est une que si elle en a la forme", () => {
    assert.deepEqual(decisionLue({ quoi: "merge", motif: "no-grant", cause: null, pr: PR }), { quoi: "merge", motif: "no-grant", cause: null, pr: PR });
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
    assert.equal(teteDe(decision("merge", { motif: "no-grant", pr: PR }), { resume: RESUME }), undefined);
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

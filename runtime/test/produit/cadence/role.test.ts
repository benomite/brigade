// Ce que le rôle produit lit, et ce que le code lit de sa réponse.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { IssueOuverte } from "../../../src/github.ts";
import { aDeposer, consigneDuRole, DEFINITION, lireReponse } from "../../../src/produit/cadence/role.ts";

const ouverte = (number: number, title: string, labels: string[] = [], autres: Partial<IssueOuverte> = {}): IssueOuverte => ({
  number,
  title,
  labels,
  state: "open",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  url: `https://github.com/acme/brigade/issues/${number}`,
  body: "",
  association: "OWNER",
  ...autres,
});

test("la définition que le runtime donne au rôle est celle d'`agents/product.md`", () => {
  assert.equal(readFileSync(DEFINITION, "utf8"), readFileSync(join(import.meta.dirname, "../../../../agents/product.md"), "utf8"));
});

describe("la consigne", () => {
  test("dit au rôle combien il peut déposer, les issues déjà ouvertes et celles des autres restées sans réponse", () => {
    const consigne = consigneDuRole({
      depot: "acme/brigade",
      reste: 2,
      ouvertes: [ouverte(12, "Onboarding is slow", ["product"]), ouverte(14, "Crash on start", [], { association: "NONE", body: "It crashes when I open it." })],
      enRetard: [ouverte(14, "Crash on start", [], { association: "NONE", body: "It crashes when I open it." })],
      sources: [{ titre: "Le digest d'usage", texte: "3 tickets 86 pour le même nettoyage." }],
    });
    assert.match(consigne, /^Tu es le \*\*rôle produit\*\*/);
    assert.match(consigne, /au plus 2 dépôts/);
    assert.match(consigne, /dépôt acme\/brigade/);
    assert.match(consigne, /^- #12 Onboarding is slow \[product\]$/m);
    assert.match(consigne, /^#### #14 Crash on start\n\nIt crashes when I open it\.$/m);
    assert.match(consigne, /^### Le digest d'usage\n\n3 tickets 86 pour le même nettoyage\.$/m);
    assert.doesNotMatch(consigne, /^---$/m, "sans l'en-tête de la définition");
  });

  test("sans rien à lire, chaque source le dit", () => {
    const consigne = consigneDuRole({ depot: "acme/brigade", reste: 1, ouvertes: [], enRetard: [], sources: [] });
    assert.match(consigne, /au plus 1 dépôt\*\*/);
    assert.equal(consigne.match(/^Aucune\.$/gm)?.length, 2);
  });
});

describe("la réponse", () => {
  test("chaque section `## Issue:` devient une issue labellisée `product`, `filed-by:product` et sa priorité, quels que soient les autres labels écrits", () => {
    const reponse = lireReponse(
      [
        "## Issue: Make onboarding shorter",
        "Labels: product, filed-by:product, prio:2, fire, model:opus",
        "Filed from usage: 3 tickets set aside (86) — #412, #418.",
        "",
        "## Context",
        "Users stop at step 2.",
        "",
        "## Issue: Explain the 86",
        "",
        "Labels: product, filed-by:product, prio:1",
        "Filed from usage: #431.",
      ].join("\n"),
    );
    assert.deepEqual(reponse.ecartees, []);
    assert.deepEqual(reponse.depots, [
      { issue: { titre: "Make onboarding shorter", labels: ["product", "filed-by:product", "prio:2"], corps: "Filed from usage: 3 tickets set aside (86) — #412, #418.\n\n## Context\nUsers stop at step 2." } },
      { issue: { titre: "Explain the 86", labels: ["product", "filed-by:product", "prio:1"], corps: "Filed from usage: #431." } },
    ]);
  });

  test("une section qui ne se dépose pas est écartée, avec sa raison, et les autres passent", () => {
    const reponse = lireReponse(
      [
        "## Issue: No labels",
        "Filed from usage: #1.",
        "## Issue: Two priorities",
        "Labels: product, prio:1, prio:2",
        "Body.",
        "## Issue: No body",
        "Labels: prio:3",
        "## TODO: Faut-il un mode hors ligne ?",
        "## TODO: Quel écran d'abord ?",
        "- L'accueil, que tout le monde voit",
        "- Les réglages",
        "## Issue: Good",
        "Labels: prio:3",
        "Filed from usage: #2.",
      ].join("\n"),
    );
    assert.deepEqual(reponse.ecartees, ["“No labels”: no `Labels:` line", "“Two priorities”: more than one `prio:` label", "“No body”: no body", "“Faut-il un mode hors ligne ?”: a question without a choice"]);
    assert.deepEqual(reponse.depots, [
      { todo: { question: "Quel écran d'abord ?", choix: ["L'accueil, que tout le monde voit", "Les réglages"] } },
      { issue: { titre: "Good", labels: ["product", "filed-by:product", "prio:3"], corps: "Filed from usage: #2." } },
    ]);
  });

  test("« Rien à déposer » se lit, et ne dépose rien", () => {
    const reponse = lireReponse("Rien à déposer : l'usage ne montre rien de neuf cette semaine.");
    assert.deepEqual(reponse, { depots: [], ecartees: [], rien: "l'usage ne montre rien de neuf cette semaine." });
    assert.deepEqual(lireReponse(null), { depots: [], ecartees: [], rien: null });
  });

  test("une question au chef se dépose en issue `decision`, que le manager laisse au chef, et que le plafond compte", () => {
    const depot = aDeposer({ todo: { question: "Quel écran d'abord ?", choix: ["L'accueil", "Les réglages"] } });
    assert.equal(depot.titre, "Quel écran d'abord ?");
    assert.deepEqual(depot.labels, ["filed-by:product", "decision"]);
    assert.match(depot.corps, /^Filed from usage: /);
    assert.match(depot.corps, /^- L'accueil\n- Les réglages$/m);
  });
});

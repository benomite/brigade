// La réponse du chef à une carte du chef lue de GitHub (#2434) : le commentaire marqué porte ses choix
// (`- [<geste>] <libellé>`), que la carte de Todo montre en boutons avec un champ libre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cardOfChefOfTodo } from "../../src/card-todo.ts";
import { shapeOfChef } from "../../src/board/todo-github.ts";

// La question du 2026-11-05, réécrite avec ses choix.
const QUESTION_2061 = [
  "<!-- brigade:todo kind=product-question -->",
  "Is every project on GitHub-only now, so the old path can go?",
  "- [resume] Yes, every project is on GitHub-only: remove the old path",
  "- [drop] No, keep it waiting",
  "",
  "The old path still runs the Kitchen board of two projects.",
].join("\n");

describe("le commentaire marqué porte ses choix", () => {
  test("la question, puis un choix par ligne `- [<geste>] <libellé>`, et le reste qui la précise", () => {
    assert.deepEqual(shapeOfChef(QUESTION_2061.split("\n").slice(1).join("\n")), {
      question: "Is every project on GitHub-only now, so the old path can go?",
      choix: [
        { texte: "Yes, every project is on GitHub-only: remove the old path", suite: "resume" },
        { texte: "No, keep it waiting", suite: "drop" },
      ],
      contexte: "The old path still runs the Kitchen board of two projects.",
    });
  });

  test("sans choix, il se lit comme avant : la question et son texte ; une case à cocher ou un geste inconnu n'est pas un choix", () => {
    assert.deepEqual(shapeOfChef("Which plan?\n\n- [ ] read the pricing\n- [x] ask legal\n- [ship] ship it"), { question: "Which plan?", choix: [], contexte: "- [ ] read the pricing\n- [x] ask legal\n- [ship] ship it" });
    assert.deepEqual(shapeOfChef(""), { question: null, choix: [], contexte: "" });
    // Sans choix, la carte garde son champ, dont la réponse joue `resume`.
    const card = cardOfChefOfTodo({ sorte: "product-question", texte: "Which plan?" });
    assert.deepEqual(card?.choix, []);
    assert.match(card?.prixDuTexte ?? "", /removes what holds the ticket \(`chef-todo`, `parked`, `served-elsewhere`\): it resumes exactly where it was/);
    // Un commentaire marqué sans texte n'a rien à quoi répondre.
    assert.equal(cardOfChefOfTodo({ sorte: "blocked", texte: "  " }), undefined);
  });
});

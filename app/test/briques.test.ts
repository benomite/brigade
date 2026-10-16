// Les briques communes de la vue (vue/briques.js) : un survol qui montre son texte au pointeur et au
// clavier seulement, une lecture indisponible qui garde son détail pour le survol, un bouton
// recommandé dont le prix n'est que dans le survol, une confirmation qui ne dit un prix que si elle coûte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { boutonAction, confirmationDeGeste, lectureIndisponible, survol } from "../src/vue/briques.js";
import { Faux } from "./aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const AIDE = "the pass merges what it judges green";

describe("le survol", () => {
  test("sans survol, rien du texte n'est visible ; au survol et au focus il l'est ; à la sortie il part", () => {
    const aide = survol(doc, AIDE) as Faux;
    const icone = aide.children[0]!;
    assert.doesNotMatch(aide.textContent, /pass/);
    icone.declencher("mouseenter");
    assert.ok(aide.textContent.includes(AIDE));
    icone.declencher("mouseleave");
    assert.equal(aide.textContent.includes(AIDE), false);
    icone.declencher("focus");
    assert.ok(aide.textContent.includes(AIDE));
    assert.equal((aide.children[1] as { role?: string }).role, "tooltip");
    icone.declencher("blur");
    assert.equal(aide.textContent.includes(AIDE), false);
  });

  test("le texte est le nom accessible de l'icône, et Échap le ferme", () => {
    const aide = survol(doc, AIDE) as Faux;
    assert.equal((aide.children[0] as { ariaLabel?: string }).ariaLabel, AIDE);
    aide.children[0]!.declencher("focus");
    aide.declencher("keydown", { key: "Escape" });
    assert.equal(aide.textContent.includes(AIDE), false);
  });
});

describe("la lecture indisponible", () => {
  test("une ligne courte en clair ; le détail technique n'est dans le texte visible que survolé", () => {
    const detail = "ssh: connect to host box port 22: Connection refused";
    const lecture = lectureIndisponible(doc, "historique indisponible", detail) as Faux;
    assert.equal(lecture.children[0]?.textContent, "historique indisponible");
    assert.equal(lecture.textContent.includes("Connection refused"), false);
    lecture.children[1]!.children[0]!.declencher("focus");
    assert.ok(lecture.textContent.includes(detail));
  });

  test("sans détail, pas de survol", () => {
    assert.equal((lectureIndisponible(doc, "historique indisponible", "") as Faux).childElementCount, 1);
  });
});

describe("le bouton d'action", () => {
  const rendu = (options?: Parameters<typeof boutonAction>[3]) => boutonAction(doc, "resume", () => {}, options) as Faux;

  test("recommandé, il se distingue des autres", () => {
    assert.equal(rendu({ recommande: true }).children[0]?.className, "recommande");
    assert.equal(rendu().children[0]?.className, "");
  });

  test("un prix nul ou absent ne rend ni survol ni icône", () => {
    for (const prix of [undefined, null, 0, "", "  "]) assert.equal(rendu({ prix }).childElementCount, 1, String(prix));
  });

  test("un prix est dans le survol, et nulle part en clair", () => {
    const action = rendu({ prix: "about 2 000 tokens" });
    assert.equal(action.childElementCount, 2);
    assert.equal(action.textContent.includes("tokens"), false);
    action.children[1]!.children[0]!.declencher("mouseenter");
    assert.ok(action.textContent.includes("about 2 000 tokens"));
  });
});

describe("la confirmation de geste", () => {
  const rendu = (prix?: string | number | null) => confirmationDeGeste(doc, { titre: "stop the kitchen", prix, oui: "yes", non: "no" }, { oui: () => {}, non: () => {} }) as Faux;
  const lignes = (confirmation: Faux) => confirmation.children.filter(({ className }) => className === "prix");

  test("un geste qui coûte affiche son prix, en une seule ligne", () => {
    const confirmation = rendu("3 cooks running\nand their work is lost");
    assert.equal(lignes(confirmation).length, 1);
    assert.equal(lignes(confirmation)[0]?.textContent, "3 cooks running and their work is lost");
  });

  test("un geste sans coût n'affiche aucune ligne de prix", () => {
    for (const prix of [undefined, null, 0, ""]) assert.equal(lignes(rendu(prix)).length, 0, String(prix));
  });

  test("les deux réponses y sont, « oui » en recommandé", () => {
    const [, oui, non] = rendu().children;
    assert.equal(oui?.className, "recommande");
    assert.equal(non?.textContent, "no");
  });
});

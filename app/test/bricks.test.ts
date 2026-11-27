// Les briques communes de la vue (vue/bricks.js) : un survol qui montre son texte au pointeur et au
// clavier seulement, une lecture indisponible qui garde son détail pour le survol, un bouton
// recommandé dont le prix n'est que dans le survol, une confirmation qui ne dit un prix que si elle coûte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buttonAction, hover } from "../src/vue/bricks.js";
import { confirmationOfAction } from "../src/vue/components/confirmation/confirmation.js";
import { lineError } from "../src/vue/components/line-error/line-error.js";
import { Fake } from "./helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const HELP = "the pass merges what it judges green";

describe("le survol", () => {
  test("sans survol, rien du texte n'est visible ; au survol et au focus il l'est ; à la sortie il part", () => {
    const help = hover(doc, HELP) as Fake;
    const icon = help.children[0]!;
    assert.doesNotMatch(help.textContent, /pass/);
    icon.declencher("mouseenter");
    assert.ok(help.textContent.includes(HELP));
    icon.declencher("mouseleave");
    assert.equal(help.textContent.includes(HELP), false);
    icon.declencher("focus");
    assert.ok(help.textContent.includes(HELP));
    assert.equal((help.children[1] as { role?: string }).role, "tooltip");
    icon.declencher("blur");
    assert.equal(help.textContent.includes(HELP), false);
  });

  test("le texte est le nom accessible de l'icône, et Échap le ferme", () => {
    const help = hover(doc, HELP) as Fake;
    assert.equal((help.children[0] as { ariaLabel?: string }).ariaLabel, HELP);
    help.children[0]!.declencher("focus");
    help.declencher("keydown", { key: "Escape" });
    assert.equal(help.textContent.includes(HELP), false);
  });
});

describe("la lecture indisponible", () => {
  test("une ligne courte en clair ; le détail technique n'est dans le texte visible que survolé", () => {
    const detail = "connect to host box port 22: Connection refused";
    const reading = lineError(doc, "historique indisponible", detail) as Fake;
    assert.equal(reading.children[0]?.textContent, "historique indisponible");
    assert.equal(reading.textContent.includes("Connection refused"), false);
    reading.children[1]!.children[0]!.declencher("focus");
    assert.ok(reading.textContent.includes(detail));
  });

  test("sans détail, pas de survol", () => {
    assert.equal((lineError(doc, "historique indisponible", "") as Fake).childElementCount, 1);
  });
});

describe("le bouton d'action", () => {
  const rendered = (options?: Parameters<typeof buttonAction>[3]) => buttonAction(doc, "resume", () => {}, options) as Fake;

  test("recommandé, il se distingue des autres", () => {
    assert.equal(rendered({ recommande: true }).children[0]?.className, "recommande");
    assert.equal(rendered().children[0]?.className, "");
  });

  test("un prix nul ou absent ne rend ni survol ni icône", () => {
    for (const price of [undefined, null, 0, "", "  "]) assert.equal(rendered({ prix: price }).childElementCount, 1, String(price));
  });

  test("un prix est dans le survol, et nulle part en clair", () => {
    const action = rendered({ prix: "about 2 000 tokens" });
    assert.equal(action.childElementCount, 2);
    assert.equal(action.textContent.includes("tokens"), false);
    action.children[1]!.children[0]!.declencher("mouseenter");
    assert.ok(action.textContent.includes("about 2 000 tokens"));
  });
});

describe("la confirmation de geste", () => {
  const rendered = (price?: string | number | null) => confirmationOfAction(doc, { titre: "stop the kitchen", prix: price, oui: "yes", non: "no" }, { oui: () => {}, non: () => {} }) as Fake;
  const lines = (confirmation: Fake) => confirmation.children.filter(({ className }) => className === "prix");

  test("un geste qui coûte affiche son prix, en une seule ligne", () => {
    const confirmation = rendered("3 cooks running\nand their work is lost");
    assert.equal(lines(confirmation).length, 1);
    assert.equal(lines(confirmation)[0]?.textContent, "3 cooks running and their work is lost");
  });

  test("un geste sans coût n'affiche aucune ligne de prix", () => {
    for (const price of [undefined, null, 0, ""]) assert.equal(lines(rendered(price)).length, 0, String(price));
  });

  test("les deux réponses y sont, « oui » en recommandé", () => {
    const [, yes, not] = rendered().children;
    assert.equal(yes?.className, "recommande");
    assert.equal(not?.textContent, "no");
  });
});

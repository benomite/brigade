// Les trois composants de #2919 : la ligne vide, la ligne d'erreur et la confirmation en ligne. Chacun se reconnaît à son
// attribut (`data-ligne`, pas à la classe de l'écran), tient en une ligne, et la confirmation n'ouvre aucune fenêtre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { confirmationOfAction } from "../src/vue/components/confirmation/confirmation.js";
import { lineError } from "../src/vue/components/line-error/line-error.js";
import { lineEmpty } from "../src/vue/components/line-empty/line-empty.js";
import { Fake } from "./helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

describe("la ligne vide", () => {
  test("une seule ligne de texte, marquée data-ligne=vide, sa classe d'écran gardée comme crochet", () => {
    const line = lineEmpty(doc, "nothing here") as Fake;
    assert.equal(line.dataset.ligne, "vide");
    assert.equal(line.className, "vide");
    assert.equal(line.textContent, "nothing here");
    assert.equal(line.balise, "p");
  });

  test("elle prend la balise et la classe que l'écran lui donne", () => {
    const line = lineEmpty(doc, "provides nothing", { balise: "li", classe: "aucun" }) as Fake;
    assert.deepEqual([line.balise, line.className, line.dataset.ligne], ["li", "aucun", "vide"]);
  });
});

describe("la ligne d'erreur", () => {
  test("une ligne en clair, marquée data-ligne=erreur ; le détail n'est visible qu'au survol", () => {
    const line = lineError(doc, "History not reached.", "ssh: connect to host box port 22: refused") as Fake;
    assert.equal(line.dataset.ligne, "erreur");
    assert.equal(line.children[0]?.textContent, "History not reached.");
    assert.equal(line.textContent.includes("ssh"), false);
    line.children[1]!.children[0]!.declencher("focus");
    assert.ok(line.textContent.includes("connect to host box port 22: refused"));
  });

  test("sans détail, pas de survol ; sans phrase, la place reste en attente d'un échec", () => {
    assert.equal((lineError(doc, "unavailable") as Fake).childElementCount, 1);
    assert.equal((lineError(doc, "", "") as Fake).childElementCount, 0);
  });

  test("après un geste, la ligne est une alerte", () => {
    assert.equal((lineError(doc, "refused", "", { alerte: true }) as Fake).role, "alert");
    assert.equal((lineError(doc, "refused") as Fake).role, "");
  });
});

describe("la confirmation en ligne", () => {
  test("c'est un bloc de la page, jamais une fenêtre : ni <dialog>, ni role=dialog", () => {
    const confirmation = confirmationOfAction(doc, { titre: "stop?", prix: "3 cooks", oui: "yes", non: "no" }, { oui: () => {}, non: () => {} }) as Fake;
    assert.equal(confirmation.balise, "section");
    assert.equal(confirmation.className, "confirmation");
    assert.equal(confirmation.role, "");
    assert.equal([confirmation, ...confirmation.descendants()].some(({ balise }) => balise === "dialog"), false);
  });
});

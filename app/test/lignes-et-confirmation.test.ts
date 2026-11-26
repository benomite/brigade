// Les trois composants de #2919 : la ligne vide, la ligne d'erreur et la confirmation en ligne. Chacun se reconnaît à son
// attribut (`data-ligne`, pas à la classe de l'écran), tient en une ligne, et la confirmation n'ouvre aucune fenêtre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { confirmationDeGeste } from "../src/vue/composants/confirmation/confirmation.js";
import { ligneErreur } from "../src/vue/composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../src/vue/composants/ligne-vide/ligne-vide.js";
import { Faux } from "./aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

describe("la ligne vide", () => {
  test("une seule ligne de texte, marquée data-ligne=vide, sa classe d'écran gardée comme crochet", () => {
    const ligne = ligneVide(doc, "nothing here") as Faux;
    assert.equal(ligne.dataset.ligne, "vide");
    assert.equal(ligne.className, "vide");
    assert.equal(ligne.textContent, "nothing here");
    assert.equal(ligne.balise, "p");
  });

  test("elle prend la balise et la classe que l'écran lui donne", () => {
    const ligne = ligneVide(doc, "provides nothing", { balise: "li", classe: "aucun" }) as Faux;
    assert.deepEqual([ligne.balise, ligne.className, ligne.dataset.ligne], ["li", "aucun", "vide"]);
  });
});

describe("la ligne d'erreur", () => {
  test("une ligne en clair, marquée data-ligne=erreur ; le détail n'est visible qu'au survol", () => {
    const ligne = ligneErreur(doc, "History not reached.", "ssh: connect to host box port 22: refused") as Faux;
    assert.equal(ligne.dataset.ligne, "erreur");
    assert.equal(ligne.children[0]?.textContent, "History not reached.");
    assert.equal(ligne.textContent.includes("ssh"), false);
    ligne.children[1]!.children[0]!.declencher("focus");
    assert.ok(ligne.textContent.includes("connect to host box port 22: refused"));
  });

  test("sans détail, pas de survol ; sans phrase, la place reste en attente d'un échec", () => {
    assert.equal((ligneErreur(doc, "unavailable") as Faux).childElementCount, 1);
    assert.equal((ligneErreur(doc, "", "") as Faux).childElementCount, 0);
  });

  test("après un geste, la ligne est une alerte", () => {
    assert.equal((ligneErreur(doc, "refused", "", { alerte: true }) as Faux).role, "alert");
    assert.equal((ligneErreur(doc, "refused") as Faux).role, "");
  });
});

describe("la confirmation en ligne", () => {
  test("c'est un bloc de la page, jamais une fenêtre : ni <dialog>, ni role=dialog", () => {
    const confirmation = confirmationDeGeste(doc, { titre: "stop?", prix: "3 cooks", oui: "yes", non: "no" }, { oui: () => {}, non: () => {} }) as Faux;
    assert.equal(confirmation.balise, "section");
    assert.equal(confirmation.className, "confirmation");
    assert.equal(confirmation.role, "");
    assert.equal([confirmation, ...confirmation.descendants()].some(({ balise }) => balise === "dialog"), false);
  });
});

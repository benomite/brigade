// Les cartes des gestes retenus (held/cards.js, #4273), hors des critères gelés : le bouton inerte le temps de la réponse,
// un refus qui remplace le précédent, le cadre du TODO et ce qu'il dit d'une lecture ratée, la phrase du rail vide quand
// elle n'a rien à dire, et la carte approuvée qui ne revient pas avant la lecture suivante.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setCardsHeld, setTheHeld } from "../../src/held/cards-held.ts";
import { sentenceOfRailEmpty } from "../../src/held/rail-empty.ts";
import { heldOf, withoutTheApproved } from "../../src/held/cards.js";
import { Fake, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const action = (id: string) => ({ id, kind: "manager", summary: `split #${id} into 3 tickets`, reason: "held for the chef", approveCommand: `brigade parade manager approve ${id}`, heldAt: "2026-11-25T08:00:00Z" });
const errors = (card: Fake) => card.children.filter(({ dataset }) => dataset.ligne === "erreur");

describe("une carte de geste retenu (#4273)", () => {
  test("le bouton est inerte le temps de la réponse, et se reclique après un refus, qui remplace le précédent", async () => {
    let refuse: (reason: Error) => void = () => {};
    const card = (setCardsHeld(doc, [action("1")], () => new Promise((_, not) => (refuse = not))) as Fake[])[0] ?? assert.fail("carte");
    const ok = card.dessous("button")[0] ?? assert.fail("bouton");
    ok.click();
    assert.equal(ok.disabled, true);
    refuse(new Error("first refusal"));
    await repos();
    assert.equal(ok.disabled, false);
    ok.click();
    refuse(new Error("second refusal"));
    await repos();
    assert.deepEqual(errors(card).map(({ textContent }) => textContent), ["second refusal"]);
    // Le refus d'un geste qu'on vient de faire se lit d'office aux lecteurs d'écran.
    assert.equal(errors(card)[0]?.role, "alert");
    assert.equal(card.dessous("p")[0]?.textContent, "split #1 into 3 tickets");
  });
});

describe("le cadre des gestes retenus dans le TODO (#4273)", () => {
  test("l'en-tête et une carte par geste ; rien quand aucun n'est retenu, ni quand ils ne sont pas lus ici", () => {
    const frame = setTheHeld(doc, { gestes: [action("1"), action("2")] }, async () => undefined) as Fake;
    assert.equal(frame.dessous("p")[0]?.textContent, "Held for your OK (2)");
    assert.equal(frame.dessous("li").length, 2);
    assert.equal(setTheHeld(doc, { gestes: [] }, async () => undefined), undefined);
    assert.equal(setTheHeld(doc, undefined, async () => undefined), undefined);
  });

  test("une lecture ratée se dit en une ligne d'erreur, jamais en « aucun »", () => {
    const line = setTheHeld(doc, { sans: "held gestures not read — broken", detail: "$ manager" }, async () => undefined) as Fake;
    assert.equal(line.dataset.ligne, "erreur");
    assert.ok(line.textContent.includes("held gestures not read — broken"));
  });
});

describe("le rail vide et les gestes retenus (#4273)", () => {
  test("rien à dire quand le rail porte un ticket, ou qu'aucun geste n'est retenu", () => {
    assert.equal(sentenceOfRailEmpty({ rail: 2, retenus: [action("1")] }), null);
    assert.equal(sentenceOfRailEmpty({ rail: 0, retenus: [] }), null);
  });

  test("les gestes lus, sans celui que le chef vient d'approuver ; aucun quand la lecture ne les donne pas", () => {
    assert.deepEqual(withoutTheApproved({ gestes: [action("1"), action("2")] }, "1"), { gestes: [action("2")] });
    assert.deepEqual(withoutTheApproved({ sans: "x", detail: "" }, "1"), { sans: "x", detail: "" });
    assert.equal(withoutTheApproved(undefined, "1"), undefined);
    assert.deepEqual(heldOf({ gestes: [action("1")] }), [action("1")]);
    assert.deepEqual(heldOf({ sans: "x", detail: "" }), []);
    assert.deepEqual(heldOf(undefined), []);
  });
});

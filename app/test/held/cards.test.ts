// Les cartes des gestes retenus (held/cards.js, #4273), hors des critères gelés : le bouton inerte le temps de la réponse,
// un refus qui remplace le précédent, le cadre du TODO et ce qu'il dit d'une lecture ratée, la phrase du rail vide quand
// elle n'a rien à dire, et la carte approuvée qui ne revient pas avant la lecture suivante.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserCardsRetenues, poserLesRetenus } from "../../src/held/cards-retenues.ts";
import { phraseDuRailEmpty } from "../../src/held/rail-empty.ts";
import { retenusDe, sansLApprouve } from "../../src/held/cards.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const action = (id: string) => ({ id, kind: "manager", summary: `split #${id} into 3 tickets`, reason: "held for the chef", approveCommand: `brigade parade manager approve ${id}`, heldAt: "2026-11-25T08:00:00Z" });
const erreurs = (card: Faux) => card.children.filter(({ dataset }) => dataset.ligne === "erreur");

describe("une carte de geste retenu (#4273)", () => {
  test("le bouton est inerte le temps de la réponse, et se reclique après un refus, qui remplace le précédent", async () => {
    let refuser: (raison: Error) => void = () => {};
    const card = (poserCardsRetenues(doc, [action("1")], () => new Promise((_, non) => (refuser = non))) as Faux[])[0] ?? assert.fail("carte");
    const ok = card.dessous("button")[0] ?? assert.fail("bouton");
    ok.click();
    assert.equal(ok.disabled, true);
    refuser(new Error("first refusal"));
    await repos();
    assert.equal(ok.disabled, false);
    ok.click();
    refuser(new Error("second refusal"));
    await repos();
    assert.deepEqual(erreurs(card).map(({ textContent }) => textContent), ["second refusal"]);
    // Le refus d'un geste qu'on vient de faire se lit d'office aux lecteurs d'écran.
    assert.equal(erreurs(card)[0]?.role, "alert");
    assert.equal(card.dessous("p")[0]?.textContent, "split #1 into 3 tickets");
  });
});

describe("le cadre des gestes retenus dans le TODO (#4273)", () => {
  test("l'en-tête et une carte par geste ; rien quand aucun n'est retenu, ni quand ils ne sont pas lus ici", () => {
    const cadre = poserLesRetenus(doc, { gestes: [action("1"), action("2")] }, async () => undefined) as Faux;
    assert.equal(cadre.dessous("p")[0]?.textContent, "Held for your OK (2)");
    assert.equal(cadre.dessous("li").length, 2);
    assert.equal(poserLesRetenus(doc, { gestes: [] }, async () => undefined), undefined);
    assert.equal(poserLesRetenus(doc, undefined, async () => undefined), undefined);
  });

  test("une lecture ratée se dit en une ligne d'erreur, jamais en « aucun »", () => {
    const line = poserLesRetenus(doc, { sans: "held gestures not read — broken", detail: "$ manager" }, async () => undefined) as Faux;
    assert.equal(line.dataset.ligne, "erreur");
    assert.ok(line.textContent.includes("held gestures not read — broken"));
  });
});

describe("le rail vide et les gestes retenus (#4273)", () => {
  test("rien à dire quand le rail porte un ticket, ou qu'aucun geste n'est retenu", () => {
    assert.equal(phraseDuRailEmpty({ rail: 2, retenus: [action("1")] }), null);
    assert.equal(phraseDuRailEmpty({ rail: 0, retenus: [] }), null);
  });

  test("les gestes lus, sans celui que le chef vient d'approuver ; aucun quand la lecture ne les donne pas", () => {
    assert.deepEqual(sansLApprouve({ gestes: [action("1"), action("2")] }, "1"), { gestes: [action("2")] });
    assert.deepEqual(sansLApprouve({ sans: "x", detail: "" }, "1"), { sans: "x", detail: "" });
    assert.equal(sansLApprouve(undefined, "1"), undefined);
    assert.deepEqual(retenusDe({ gestes: [action("1")] }), [action("1")]);
    assert.deepEqual(retenusDe({ sans: "x", detail: "" }), []);
    assert.deepEqual(retenusDe(undefined), []);
  });
});

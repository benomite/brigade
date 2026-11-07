// Une lacune technique (seuil, nom de fichier, essai à la main) est complétée
// par le manager avec sa décision et sa raison ; une lacune de produit ou de
// design devient une carte TODO qui porte une seule question.
import assert from "node:assert/strict";
import { test } from "node:test";
import { classerLacune, routerLacune, type Lacune } from "../../src/guerison/lacune.ts";

const TECHNIQUES: Lacune[] = [
  { sorte: "threshold", detail: "The ticket says the alert fires when the queue is long.", decision: "Fires at 20 queued tickets.", raison: "20 is the rail's existing alert size." },
  { sorte: "file-name", detail: "The ticket adds a module without naming it.", decision: "runtime/src/guerison/lacune.ts", raison: "Neighbouring modules are named in French after their topic." },
  { sorte: "manual-trial", detail: "The ticket checks the result by trying it by hand.", decision: "Add runtime/test/x.test.ts.", raison: "A test runs in the gates; a trial by hand does not." },
];

for (const lacune of TECHNIQUES) {
  test(`une lacune ${lacune.sorte} est technique et le manager la complète lui-même`, () => {
    assert.equal(classerLacune(lacune), "technical");
    const route = routerLacune(lacune);
    assert.equal(route.voie, "completer");
    if (route.voie !== "completer") return;
    assert.match(route.commentaire, new RegExp(lacune.decision!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(route.commentaire, /Reason: /);
    assert.match(route.commentaire, new RegExp(lacune.raison!.slice(0, 10)));
  });
}

test("une lacune technique sans décision ni raison ne se complète pas à vide", () => {
  assert.equal(routerLacune({ sorte: "threshold", detail: "x" }).voie, "incomplete");
  assert.equal(routerLacune({ sorte: "threshold", detail: "x", decision: "20" }).voie, "incomplete");
});

for (const sorte of ["product", "design"] as const) {
  test(`une lacune ${sorte} est produit ou design : une carte TODO avec une seule question`, () => {
    const lacune: Lacune = { sorte, detail: "The ticket does not say who sees the list.", question: "Should the list be per project?", choix: ["Per project.", "For all projects."] };
    assert.equal(classerLacune(lacune), "product-design");
    const route = routerLacune(lacune);
    assert.equal(route.voie, "todo");
    if (route.voie !== "todo") return;
    assert.equal(route.carte.type, sorte);
    assert.equal(route.carte.enonce, "Should the list be per project?");
    assert.equal(route.carte.enonce?.split("?").length, 2);
    assert.equal(route.carte.choix?.length, 2);
  });
}

test("une lacune de produit sans question, ou avec deux, ne devient pas une carte", () => {
  assert.equal(routerLacune({ sorte: "product", detail: "x", choix: ["A."] }).voie, "incomplete");
  assert.equal(routerLacune({ sorte: "product", detail: "x", question: "A? Or B?", choix: ["A."] }).voie, "incomplete");
  assert.equal(routerLacune({ sorte: "product", detail: "x", question: "A or B?" }).voie, "incomplete");
});

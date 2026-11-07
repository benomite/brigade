// Un ticket jugé `incomplete` ne reste jamais sur un commentaire seul (#2692) :
// le manager le complète lui-même et le qualifie, ou pose au chef une seule
// question produit, en carte TODO. Sur une cuisine dont le manager est allumé.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { empreinte, MARQUEUR_MANAGER } from "../../src/juger.ts";
import { lireCompletion, reecrireCriteres } from "../../src/manager/verdict-incomplet.ts";
import { issueDuManager } from "../../src/projections/manager.ts";
import { chef, cuisine, fauxGitHub, issue, montre } from "../aides/cuisine.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

const corpsDe = (numero: number) =>
  [`## Context`, "", `The breaker of ticket ${numero} opens too late.`, "", "## Acceptance criteria", "", "- The breaker opens sooner", "- Try it by hand", "", "## Notes", "", "Keep the log line."].join("\n");

describe("un verdict incomplet", { concurrency: 8 }, () => {
  test("le 2026-11-07 rejoué : #2672 (08:15) et #2689 (09:16), incomplets sans décision produit, sont complétés et qualifiés en un tour", async (t) => {
    const numeros = [2672, 2689];
    const gh = fauxGitHub(...numeros.map((numero) => issue(numero, [])));
    for (const numero of numeros) gh.decrire(numero, { body: corpsDe(numero), association: "OWNER" });
    // Le tour pendant lequel chaque label est posé.
    const poses: Array<[number, number]> = [];
    const labelliser = gh.github.labelliser.bind(gh.github);
    gh.github.labelliser = async (numero, labels) => {
      poses.push([numero, gh.sondages.ouvertes]);
      await labelliser(numero, labels);
    };
    const heure = montre("2026-11-07T08:15:00.000Z");
    const c = cuisine(t, { lieux: { repertoire: repertoireTemporaire(t), origine: "", clone: "", gh, heure }, manager: { suite: ["complete-criteres", "complete-criteres"] } });

    // Les deux verdicts du matin, et leur commentaire que personne n'a lu.
    for (const [numero, at] of [[2672, "2026-11-07T08:15:00.000Z"], [2689, "2026-11-07T09:16:00.000Z"]] as const) {
      heure.avancer(Date.parse(at) - heure.maintenant().getTime());
      const lue = { number: numero, title: `Ticket ${numero}`, body: corpsDe(numero), labels: [] };
      c.journal.ajouter({
        project: "brigade",
        ticket: numero,
        author: "manager",
        type: "manager.judged",
        payload: { run: `juge-${numero}-matin`, fingerprint: empreinte(lue, []), verdict: "refused", kind: "incomplete", reason: "No threshold, and a manual trial.", missing: "A threshold, and a test instead of the trial.", model: null, effort: null, calibration: null },
      });
      gh.repondre(numero, `${MARQUEUR_MANAGER}\n**Manager — pas un ticket exécutable : un ticket incomplet.**`);
      c.journal.ajouter({ project: "brigade", ticket: numero, author: "manager", type: "manager.commented", payload: {} });
    }
    assert.deepEqual(numeros.map((numero) => c.journal.duTicket(numero).find((e) => e.type === "manager.judged")?.at), ["2026-11-07T08:15:00.000Z", "2026-11-07T09:16:00.000Z"]);

    heure.avancer(2 * 3_600_000);
    chef(c.repertoire, "manager.enabled");
    await jusqua(() => numeros.every((numero) => gh.lire(numero)?.labels.includes("fire")));

    // Un seul tour : le premier sondage, et rien n'est rejugé.
    assert.deepEqual(poses, [[2672, 1], [2689, 1]]);
    assert.equal(c.lancements().length, 2);
    for (const numero of numeros) {
      assert.deepEqual(gh.lire(numero)?.labels, ["fire", "model:sonnet", "effort:medium"]);
      assert.equal(issueDuManager(c.journal.base, numero)?.decision, "fire");
      assert.equal((c.dernier("manager.completed", numero) as { outcome: string }).outcome, "completed");
      // Les critères sont réécrits, le contexte et les notes de l'auteur gardés.
      const corps = gh.corpsDe(numero);
      assert.match(corps, /## Acceptance criteria\n\n- Three failures in a row open the breaker\n- A test in runtime\/test\/disjoncteur\.test\.ts plays the three failures\n\n## Notes/);
      assert.match(corps, new RegExp(`The breaker of ticket ${numero} opens too late\\.`));
      assert.doesNotMatch(corps, /Try it by hand/);
      await jusqua(() => gh.commentaires.some(([n, dit]) => n === numero && /mis sur le rail/.test(dit)));
      assert.ok(gh.commentaires.some(([n, dit]) => n === numero && /complété par le manager/.test(dit)));
    }
    // Complété, il ne se rejuge pas au tour suivant.
    const depart = gh.sondages.ouvertes;
    await jusqua(() => gh.sondages.ouvertes >= depart + 3);
    assert.equal(c.lancements().length, 2);
  });

  test("quand le manque est une décision produit : une carte TODO à une seule question, le label product-question, pas qualifié", async (t) => {
    const c = cuisine(t, { manager: { suite: ["juge-incomplet", "complete-question"] }, issues: [issue(40, [])] });
    chef(c.repertoire, "manager.enabled");
    await jusqua(() => cartesEnTodo(c.journal.base).length === 1);

    const [carte] = cartesEnTodo(c.journal.base);
    assert.equal(carte?.ticket, 40);
    assert.equal(carte?.type, "product");
    assert.equal(carte?.question, "Le TODO montre-t-il les tickets fermés ?");
    assert.equal(carte?.question.split("?").length, 2);
    await jusqua(() => c.gh.lire(40)?.labels.includes("product-question") === true);
    assert.deepEqual(c.gh.lire(40)?.labels, ["product-question"]);
    assert.equal(issueDuManager(c.journal.base, 40)?.decision, "refused");
    assert.equal((c.dernier("manager.completed", 40) as { outcome: string }).outcome, "question");
    await jusqua(() => c.gh.commentaires.some(([n, dit]) => n === 40 && /une question est posée au chef/.test(dit)));

    // Le même verdict ne se suit pas deux fois.
    const depart = c.gh.sondages.ouvertes;
    await jusqua(() => c.gh.sondages.ouvertes >= depart + 3);
    assert.equal(c.journal.duTicket(40).filter((e) => e.type === "manager.completed").length, 1);
    assert.equal(cartesEnTodo(c.journal.base).length, 1);
  });
});

describe("la réécriture des critères", () => {
  test("remplace la section des critères et garde le reste ; sans section, l'ajoute", () => {
    assert.equal(reecrireCriteres("Intro\n\n## Critères d'acceptation\n\n- vague\n\n---\n\nPied", ["A", "B"]), "Intro\n\n## Critères d'acceptation\n\n- A\n- B\n\n---\n\nPied");
    assert.equal(reecrireCriteres("Just a wish.", ["A"]), "Just a wish.\n\n## Acceptance criteria\n\n- A");
  });

  test("une réponse sans critère, ou une question qui n'en est pas une, est illisible", () => {
    assert.ok("illisible" in lireCompletion('{"issue":"complete","motif":"m","criteres":[],"modele":"sonnet","effort":"low","calibrage":"c"}'));
    assert.ok("illisible" in lireCompletion('{"issue":"question","motif":"m","resume":"r","question":"A ? ou B ?","choix":["A","B"]}'));
    assert.ok("illisible" in lireCompletion('{"issue":"question","motif":"m","resume":"r","question":"A ou B ?","choix":["A"]}'));
    assert.ok("valeur" in lireCompletion('{"issue":"question","motif":"m","resume":"r","question":"A ou B ?","choix":["A","B"]}'));
  });
});

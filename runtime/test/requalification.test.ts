// Un ticket `blocked-on-human` qui ne dit pas la décision qu'il attend est
// requalifié par le manager : en carte proposée au chef, ou repris par la
// cuisine. Celui qui la dit reste retenu comme avant. Sur une cuisine dont le
// manager est allumé.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { cartesEnTodo, cartesRetenues } from "../src/carte-todo.ts";
import { MARQUEUR_MANAGER } from "../src/juger.ts";
import { chef, cuisine, issue, type Options } from "./aides/cuisine.ts";
import { jusqua } from "./outils.ts";

function brigade(t: TestContext, jugement: string | string[], options: Options = {}) {
  const c = cuisine(t, { manager: typeof jugement === "string" ? { jugement } : { suite: jugement }, issues: [issue(40, ["blocked-on-human"])], ...options });
  chef(c.repertoire, "manager.enabled");
  const requalifie = () => c.journal.duTicket(40).filter((e) => e.type === "manager.requalified");
  const dits = () => c.gh.commentaires.filter(([n, corps]) => n === 40 && corps.includes(MARQUEUR_MANAGER)).map(([, corps]) => corps);
  const laisserTourner = async () => {
    const depart = c.gh.sondages.ouvertes;
    await jusqua(() => c.gh.sondages.ouvertes >= depart + 3);
  };
  return { ...c, requalifie, dits, laisserTourner };
}

describe("un ticket blocked-on-human", { concurrency: 8 }, () => {
  test("sans décision écrite, une vraie question est dérivée : la carte est proposée, le journal le dit, le label reste", async (t) => {
    const c = brigade(t, "requalifie-carte");
    await jusqua(() => cartesRetenues(c.journal.base).length === 1);

    // Proposée par la requalification, sans question ni choix : la porte de
    // TODO la retient (`todo.held`).
    assert.equal(c.journal.duTicket(40).find((e) => e.type === "todo.held")?.payload.statement, "Choisir entre l'export CSV et l'export JSON.");
    assert.deepEqual(cartesRetenues(c.journal.base).map((carte) => [carte.ticket, carte.type, carte.auteur]), [[40, "product", "manager"]]);
    const [fait] = c.requalifie();
    assert.equal((fait?.payload as { outcome: string }).outcome, "card");
    assert.deepEqual(c.gh.lire(40)?.labels, ["blocked-on-human"]);
    await jusqua(() => c.dits().length === 1);
    assert.match(c.dits()[0] ?? "", /a card is proposed to the chef/);
    // #3033 : la carte garde l'énoncé français du chef ; l'issue cite l'anglais.
    assert.match(c.dits()[0] ?? "", /\(product\)\. Choose between the CSV export and the JSON export\./);
    assert.doesNotMatch(c.dits()[0] ?? "", /Choisir entre/);
    // Une fois lue, la même issue ne se relit pas, et la carte ne se repose pas.
    await c.laisserTourner();
    assert.equal(c.requalifie().length, 1);
    assert.equal(c.journal.tout().filter((e) => e.type === "todo.held").length, 1);
  });

  test("un geste git proposé en carte n'est pas une carte : aucun TODO, aucune retenue, un ticket fix ouvert sur la cuisine", async (t) => {
    const c = brigade(t, "requalifie-geste-git");
    await jusqua(() => c.dits().length === 1);

    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.deepEqual(cartesRetenues(c.journal.base), []);
    assert.equal(c.journal.duTicket(40).filter((e) => e.type === "todo.rerouted").length, 1);
    const fix = c.gh.lire(501);
    assert.ok(fix?.labels.includes("fix") && fix.labels.includes("fire"));
    assert.match(c.dits()[0] ?? "", /#501/);
    await c.laisserTourner();
    assert.equal(c.gh.lire(502), undefined);
  });

  test("la carte sort de TODO quand le chef retire le label", async (t) => {
    const c = brigade(t, "requalifie-carte");
    await jusqua(() => c.requalifie().length === 1);
    // La carte, réécrite en question, est entrée dans TODO — ce que le triage
    // des journaux d'avant écrivait.
    c.journal.ajouter({ project: "brigade", ticket: 40, author: "manager", type: "todo.entered", payload: { kind: "product", summary: "Deux voies s'opposent.", statement: "Export CSV ou export JSON ?", choices: [{ text: "CSV", then: "resume" }], captures: null } });
    await jusqua(() => cartesEnTodo(c.journal.base).length === 1);
    await c.gh.github.delabelliser(40, "blocked-on-human");
    await jusqua(() => cartesEnTodo(c.journal.base).length === 0);
  });

  test("sans rien d'attendu, la cuisine reprend le ticket : le label s'en va, le journal dit « taken-back », l'issue est jugée", async (t) => {
    const c = brigade(t, ["requalifie-reprise", "juge-ticket"]);
    await jusqua(() => c.requalifie().length === 1);

    assert.equal((c.requalifie()[0]?.payload as { outcome: string }).outcome, "taken-back");
    assert.ok(!c.gh.lire(40)?.labels.includes("blocked-on-human"));
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    await jusqua(() => c.journal.duTicket(40).some((e) => e.type === "manager.judged"));
    assert.ok(c.dits().some((dit) => /the kitchen takes the ticket back/.test(dit)));
  });

  test("quand elle dit la décision attendue, rien ne change : retenue, sans carte, label gardé, écartée comme avant", async (t) => {
    const c = brigade(t, "requalifie-enoncee");
    await jusqua(() => c.requalifie().length === 1);
    await c.laisserTourner();

    assert.equal((c.requalifie()[0]?.payload as { outcome: string }).outcome, "stated");
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.deepEqual(c.gh.lire(40)?.labels, ["blocked-on-human"]);
    assert.deepEqual(c.journal.duTicket(40).filter((e) => e.type === "manager.set-aside").map((e) => (e.payload as { reason: string }).reason), ["blocked-on-human"]);
    assert.equal(c.journal.duTicket(40).filter((e) => e.type === "manager.judged").length, 0);
    assert.equal(c.requalifie().length, 1);
  });

  test("une réponse illisible laisse l'issue retenue, sans la relire tant qu'elle ne change pas", async (t) => {
    const c = brigade(t, "juge-illisible");
    await jusqua(() => c.requalifie().length === 1);
    await c.laisserTourner();
    assert.equal((c.requalifie()[0]?.payload as { outcome: string }).outcome, "unreadable");
    assert.equal(c.requalifie().length, 1);
    assert.deepEqual(c.gh.lire(40)?.labels, ["blocked-on-human"]);
  });
});

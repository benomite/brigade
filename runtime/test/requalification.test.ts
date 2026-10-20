// Un ticket `blocked-on-human` qui ne dit pas la décision qu'il attend est
// requalifié par le manager : en carte typée, ou repris par la cuisine. Celui
// qui la dit reste retenu comme avant. Sur une cuisine complète.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { cartesEnTodo } from "../src/carte-todo.ts";
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
  test("sans décision écrite, une vraie question est dérivée : carte typée dans TODO, le journal le dit, le label reste", async (t) => {
    const c = brigade(t, "requalifie-carte");
    await jusqua(() => cartesEnTodo(c.journal.base).length === 1);

    const [carte] = cartesEnTodo(c.journal.base);
    assert.deepEqual([carte?.ticket, carte?.type, carte?.enonce], [40, "product", "Choisir entre l'export CSV et l'export JSON."]);
    const [fait] = c.requalifie();
    assert.equal((fait?.payload as { outcome: string }).outcome, "card");
    assert.deepEqual(c.gh.lire(40)?.labels, ["blocked-on-human"]);
    await jusqua(() => c.dits().length === 1);
    assert.match(c.dits()[0] ?? "", /une carte est posée devant le chef/);
    // Une fois lue, la même issue ne se relit pas, et la carte ne se repose pas.
    await c.laisserTourner();
    assert.equal(c.requalifie().length, 1);
    assert.equal(c.journal.tout().filter((e) => e.type === "todo.entered").length, 1);
  });

  test("la carte sort de TODO quand le chef retire le label", async (t) => {
    const c = brigade(t, "requalifie-carte");
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
    assert.ok(c.dits().some((dit) => /la cuisine reprend le ticket/.test(dit)));
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

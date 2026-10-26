// The automatic trigger of the writing closing: for a project whose closer is
// set, the runtime requests a pass on its own after twenty merges since the
// last pass that left, or as soon as a drift threshold is crossed — never two
// requests the same day. A project with no closer set is never touched, and
// the chef's gesture keeps working.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MERGES_PER_PASS, ONE_PASS_A_DAY_MS, trigger } from "../../src/closing/trigger.ts";
import { chef } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";
import { cuisineFermee, RETIRER_M1 } from "./kitchen.ts";

type Cuisine = ReturnType<typeof cuisineFermee>;

// The runtime has woken up `count` more times.
async function ticks({ types }: Cuisine, count: number): Promise<void> {
  const seen = types().filter((type) => type === "runtime.ticked").length;
  await jusqua(() => types().filter((type) => type === "runtime.ticked").length >= seen + count);
}

// `count` merges by the pass, as many tickets served.
let next = 100;
function merge({ journal }: Cuisine, count: number): void {
  for (let i = 0; i < count; i++) {
    const ticket = next++;
    journal.ajouter({ project: "brigade", ticket, author: "pass", type: "merge.done", payload: { pr: `https://exemple.test/pull/${ticket}`, sha: `sha-${ticket}`, by: "pass", reconciled: false } });
  }
}

function cross({ journal }: Cuisine): void {
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "drift.crossed", payload: { measure: "repo_mb", observed: 120, limit: 100 } });
}

// The requests in the log, by their author.
const requests = ({ journal }: Cuisine) => journal.tout().filter((e) => e.type === "closing.requested").map((e) => e.author);

describe("the automatic closing pass", { concurrency: 4 }, () => {
  test("with the closer set, 19 merges request nothing; the 20th requests a pass, which leaves with no gesture from the chef", async (t) => {
    const cuisine = cuisineFermee(t);
    const { closer, fin, avertissements } = cuisine;
    closer.gestes(RETIRER_M1);
    assert.equal(MERGES_PER_PASS, 20);

    merge(cuisine, 19);
    await ticks(cuisine, 10);
    assert.deepEqual(requests(cuisine), []);
    assert.deepEqual(closer.lancements(), []);

    merge(cuisine, 1);
    await jusqua(() => requests(cuisine).length > 0);
    assert.deepEqual(requests(cuisine), ["runtime"]);
    assert.equal((await fin()).outcome, "delivered");
    assert.equal(closer.lancements().length, 1);
    assert.match(avertissements.join("\n"), /passe de fermeture demandée par le runtime — 20 merges depuis la dernière passe/);
  });

  test("with the closer set, a crossed drift threshold requests a pass even under 20 merges", async (t) => {
    const cuisine = cuisineFermee(t);
    const { closer, fin, avertissements } = cuisine;
    closer.gestes(RETIRER_M1);
    merge(cuisine, 3);
    await ticks(cuisine, 5);
    assert.deepEqual(requests(cuisine), []);

    cross(cuisine);
    await jusqua(() => requests(cuisine).length > 0);
    assert.deepEqual(requests(cuisine), ["runtime"]);
    assert.equal((await fin()).outcome, "delivered");
    assert.match(avertissements.join("\n"), /passe de fermeture demandée par le runtime — seuil de dérive franchi — /);
  });

  test("once a pass is requested, no second one is requested the same day, whatever the merges or thresholds; a day later the runtime requests again, and the chef's gesture is never capped", async (t) => {
    const cuisine = cuisineFermee(t);
    const { fin, heure, demander, journal, types } = cuisine;
    // The closer removes nothing: the pass ends with no PR.
    merge(cuisine, 20);
    await jusqua(() => requests(cuisine).length > 0);
    assert.equal((await fin()).outcome, "nothing");

    // Twenty merges more and a threshold crossed since the pass that left, hours later.
    heure.avancer(ONE_PASS_A_DAY_MS - 60_000);
    merge(cuisine, 20);
    cross(cuisine);
    await ticks(cuisine, 10);
    assert.deepEqual(requests(cuisine), ["runtime"]);
    assert.deepEqual(trigger(journal.base, heure.maintenant()), null);

    // A day after the first request, the runtime requests again.
    heure.avancer(60_000);
    await jusqua(() => requests(cuisine).length === 2);
    assert.deepEqual(requests(cuisine), ["runtime", "runtime"]);
    await jusqua(() => types().filter((type) => type === "closing.ended").length === 2);

    // The chef's gesture is not capped: right after, it still requests a pass.
    const geste = await demander();
    assert.equal(geste.code, 0, geste.sortie);
    assert.match(geste.sortie, /^brigade : closing pass requested/);
    assert.deepEqual(requests(cuisine), ["runtime", "runtime", "chef"]);
    await jusqua(() => types().filter((type) => type === "closing.ended").length === 3);
  });

  test("a served project with no closer set never gets a pass requested, whatever the merges or thresholds", async (t) => {
    const cuisine = cuisineFermee(t, { reglages: { calibration: null } });
    const { closer, types } = cuisine;
    closer.gestes(RETIRER_M1);
    merge(cuisine, 45);
    cross(cuisine);
    await ticks(cuisine, 10);
    assert.deepEqual(types().filter((type) => type.startsWith("closing.")), []);
    assert.deepEqual(closer.lancements(), []);
  });

  test("under the chef's \"stop\", nothing is requested; the request comes once the kitchen resumes", async (t) => {
    const cuisine = cuisineFermee(t);
    const { repertoire, fin } = cuisine;
    chef(repertoire, "kitchen.stopped");
    merge(cuisine, 20);
    await ticks(cuisine, 10);
    assert.deepEqual(requests(cuisine), []);

    chef(repertoire, "kitchen.resumed");
    await jusqua(() => requests(cuisine).length > 0);
    assert.equal((await fin()).outcome, "nothing");
  });
});

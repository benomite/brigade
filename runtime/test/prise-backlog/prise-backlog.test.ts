// #4221 : ce que les tests d'acceptation ne tiennent pas — chaque état qui tient une issue hors du choix, l'ordre des
// issues sans priorité ou sans date lisible, le calibrage du chef qui l'emporte, et chaque étape qui échoue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirSuivante, prendreSuivante, type IssueDuBacklog } from "../../src/prise-backlog/prise-backlog.ts";

const issue = (number: number, labels: string[], createdAt = "2026-01-01T00:00:00Z"): IssueDuBacklog => ({ number, labels, createdAt });

test("an issue that waits, is set aside, is not a ticket, or is already on the rail is never chosen", () => {
  for (const label of ["parked", "waiting", "blocked-on-human", "decision", "question", "product-question", "chef-todo", "served-elsewhere", "set-aside:failures", "epic", "kitchen-board", "fire", "taken", "in-pass"]) {
    const backlog = [issue(1, [label, "prio:0"], "2020-01-01T00:00:00Z"), issue(2, ["prio:3"])];
    assert.equal(choisirSuivante({ backlog, freeRoom: 1 })?.number, 2, label);
  }
});

test("without a priority an issue goes after the others; without a readable date, after those of its priority; then by number", () => {
  assert.equal(choisirSuivante({ backlog: [issue(1, [], "2020-01-01T00:00:00Z"), issue(2, ["prio:3"])], freeRoom: 1 })?.number, 2);
  assert.equal(choisirSuivante({ backlog: [issue(1, ["prio:1"], "not a date"), issue(2, ["prio:1"])], freeRoom: 1 })?.number, 2);
  assert.equal(choisirSuivante({ backlog: [issue(5, ["prio:1"]), issue(4, ["prio:1"])], freeRoom: 1 })?.number, 4);
});

// Une prise dont chaque geste est noté ; `echoue` : le geste qui lève.
function prise(backlog: IssueDuBacklog[], calibre: unknown = { model: "sonnet", effort: "low" }, echoue: string | null = null) {
  const gestes: string[] = [];
  const avertis: string[] = [];
  const geste = (nom: string) => {
    gestes.push(nom);
    if (echoue === nom.split(":")[0]) throw new Error(`${nom} failed`);
  };
  return {
    gestes,
    avertis,
    lancer: () =>
      prendreSuivante({
        backlog,
        freeRoom: 1,
        calibrate: async (i) => (geste(`calibrate:${i.number}`), calibre as { model: string; effort: string }),
        storeCalibration: async (n, c) => geste(`store:${n}:${c.model}:${c.effort}`),
        addLabel: async (n, label) => geste(`label:${n}:${label}`),
        startCook: async (i) => geste(`cook:${i.number}`),
        avertir: (texte) => void avertis.push(texte),
      }),
  };
}

test("the chef's calibration wins: the manager calibrates only the dimension that lacks", async () => {
  const complete = prise([issue(3, ["prio:1", "model:haiku", "effort:high"])]);
  assert.equal((await complete.lancer())?.number, 3);
  assert.deepEqual(complete.gestes, ["label:3:fire", "cook:3"]);
  const partielle = prise([issue(3, ["prio:1", "model:haiku"])]);
  await partielle.lancer();
  assert.deepEqual(partielle.gestes, ["calibrate:3", "store:3:haiku:low", "label:3:fire", "cook:3"]);
});

test("an unreadable calibration is said, and the issue gets neither calibration nor fire nor cook", async () => {
  for (const calibre of [{ model: "gpt", effort: "low" }, { model: "opus", effort: "huge" }, null]) {
    const p = prise([issue(3, ["prio:1"])], calibre);
    assert.equal(await p.lancer(), null);
    assert.deepEqual(p.gestes, ["calibrate:3"]);
    assert.match(p.avertis.join("\n"), /#3 not taken from the backlog — the manager's calibration is not readable/);
  }
});

test("a step that fails is said, and nothing after it is done", async () => {
  for (const [echoue, gestes] of [
    ["calibrate", ["calibrate:3"]],
    ["store", ["calibrate:3", "store:3:sonnet:low"]],
    ["label", ["calibrate:3", "store:3:sonnet:low", "label:3:fire"]],
  ] as const) {
    const p = prise([issue(3, ["prio:1"])], undefined, echoue);
    assert.equal(await p.lancer(), null, echoue);
    assert.deepEqual(p.gestes, gestes);
    assert.match(p.avertis.join("\n"), new RegExp(`#3 not taken from the backlog — ${echoue}:3.* failed`));
  }
});

test("a cook that does not start leaves the issue taken: fire and calibration stay, the station takes it at its next round", async () => {
  const p = prise([issue(3, ["prio:1"])], undefined, "cook");
  assert.equal((await p.lancer())?.number, 3);
  assert.match(p.avertis.join("\n"), /#3 taken from the backlog, its cook did not start — cook:3 failed/);
});

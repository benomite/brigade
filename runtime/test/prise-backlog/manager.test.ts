// #4221 : le manager branché sur un runtime prend lui-même du backlog, à chaque tour, ce que la cuisine a de place
// pour : parmi les issues qu'il a jugées exécutables, la meilleure priorité puis la plus ancienne, relue avant d'écrire,
// calibrée de son jugement, puis lancée. Sans place, rien ; une place illisible ou une relecture qui échoue se disent.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { IssueOuverte } from "../../src/github.ts";
import { empreinte, MARQUEUR_MANAGER } from "../../src/juger.ts";
import { placeLibre } from "../../src/prise-backlog/prise-backlog.ts";
import { chef, cuisine, issue, type Options } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

// Une cuisine dont le manager est allumé ; `refusees` : des issues qu'il a déjà jugées non exécutables.
function brigade(t: TestContext, options: Options & { refusees?: number[] } = {}) {
  const c = cuisine(t, { ...options, manager: options.manager ?? {} });
  for (const numero of options.refusees ?? []) {
    const fingerprint = empreinte({ number: numero, title: `Ticket ${numero}`, body: "", labels: [] }, []);
    c.journal.ajouter({ project: "brigade", ticket: numero, author: "manager", type: "manager.judged", payload: { run: `juge-${numero}`, fingerprint, content: fingerprint, verdict: "refused", kind: "settled", reason: "Nothing to do.", missing: null, model: null, effort: null, calibration: null } });
  }
  chef(c.repertoire, "manager.enabled");
  const labels = (numero: number) => c.gh.lire(numero)?.labels ?? [];
  const faits = (numero: number) => c.journal.duTicket(numero).map((e) => e.type);
  const dits = (numero: number) => c.gh.commentaires.filter(([n, corps]) => n === numero && corps.includes(MARQUEUR_MANAGER)).map(([, corps]) => corps);
  const juges = (...numeros: number[]) => numeros.every((numero) => faits(numero).includes("manager.judged"));
  return { ...c, labels, faits, dits, juges };
}

test("with one place, the manager takes the best priority of what it judged, calibrates it, then puts `fire`; the others wait", async (t) => {
  const vues: number[][] = [];
  const { gh, labels, faits, dits, juges, laisserReveiller } = brigade(t, {
    // #29, refusée, a la meilleure priorité : elle n'est pas du backlog.
    issues: [issue(29, ["prio:0"]), issue(30, ["prio:2"]), issue(31, ["prio:1"])],
    refusees: [29],
    manager: { freeRoom: (ouvertes: readonly IssueOuverte[]) => (vues.push(ouvertes.map(({ number }) => number)), placeLibre({ places: 1, enCuisine: 0, ouvertes })) },
  });
  await jusqua(() => juges(30, 31) && dits(31).length === 1);
  await laisserReveiller(3);

  assert.deepEqual(labels(31), ["prio:1", "model:haiku", "effort:low", "fire"]);
  assert.deepEqual(labels(30), ["prio:2"]);
  assert.deepEqual(labels(29), ["prio:0"]);
  assert.deepEqual(gh.labellisations.filter(([numero]) => numero !== 29), [
    [31, ["model:haiku", "effort:low"]],
    [31, ["fire"]],
  ]);
  assert.deepEqual(faits(31).filter((type) => type !== "manager.judged"), ["manager.labeled", "manager.commented"]);
  assert.match(dits(31)[0] ?? "", /ticket put on the rail\.\*\* Set: `fire`, `model:haiku`, `effort:low`\./);
  // La place se lit des issues ouvertes du sondage.
  assert.deepEqual(vues[0], [29, 30, 31]);
});

test("with two places, the two best are taken; without a reader of the room, every judged issue is", async (t) => {
  const deux = brigade(t, { issues: [issue(30, ["prio:3"]), issue(31, ["prio:1"]), issue(32, ["prio:2"])], manager: { freeRoom: (ouvertes) => placeLibre({ places: 2, enCuisine: 0, ouvertes }) } });
  await jusqua(() => deux.juges(30, 31, 32) && deux.labels(32).includes("fire"));
  await deux.laisserReveiller(3);
  assert.ok(deux.labels(31).includes("fire"));
  assert.ok(!deux.labels(30).includes("fire"));

  const toutes = brigade(t, { issues: [issue(30, ["prio:3"]), issue(31, [])] });
  await jusqua(() => toutes.labels(30).includes("fire") && toutes.labels(31).includes("fire"));
});

test("no room: nothing is taken, and nothing is said on the judged issue", async (t) => {
  const { gh, dits, juges, laisserReveiller } = brigade(t, { issues: [issue(30, ["prio:1"])], manager: { freeRoom: () => 0 } });
  await jusqua(() => juges(30));
  await laisserReveiller(3);
  assert.deepEqual(gh.labellisations, []);
  assert.deepEqual(dits(30), []);
});

test("a room that cannot be read is said, and nothing is taken", async (t) => {
  const { gh, avertissements, juges } = brigade(t, {
    issues: [issue(30, ["prio:1"])],
    manager: {
      freeRoom: () => {
        throw new Error("journal illisible");
      },
    },
  });
  await jusqua(() => juges(30) && avertissements.some((m) => /le manager ne prend rien du backlog à ce tour — la place de la cuisine ne se lit pas — journal illisible/.test(m)));
  assert.deepEqual(gh.labellisations, []);
});

test("the chosen issue is read again before writing: parked since the poll, it is not taken, and the next one is", async (t) => {
  const { gh, labels, juges } = brigade(t, { issues: [issue(30, ["prio:2"]), issue(31, ["prio:1"])], manager: { freeRoom: () => 1 } });
  const lire = gh.github.issue.bind(gh.github);
  // Le chef y pose `question` après le sondage : la relecture le voit, le sondage du tour pas encore.
  gh.github.issue = async (numero) => {
    const lue = await lire(numero);
    return numero === 31 && lue ? { ...lue, labels: [...lue.labels, "question"] } : lue;
  };
  await jusqua(() => juges(30, 31) && labels(30).includes("fire"));
  assert.ok(!labels(31).includes("fire"));
});

test("a read again that fails is said, and nothing is written on the issue", async (t) => {
  const { gh, avertissements, juges } = brigade(t, { issues: [issue(30, ["prio:1"])], manager: { freeRoom: () => 1 } });
  gh.github.issue = async () => {
    throw new Error("gh en panne");
  };
  await jusqua(() => juges(30) && avertissements.some((m) => /#30 not taken from the backlog — its labels could not be read again — gh en panne/.test(m)));
  assert.deepEqual(gh.labellisations, []);
});

test("a dimension the chef calibrated is left as it is: only the other one is set, then `fire`", async (t) => {
  const { gh, labels, juges } = brigade(t, { issues: [issue(30, ["model:opus"])], manager: { freeRoom: () => 1 } });
  await jusqua(() => juges(30) && labels(30).includes("fire"));
  assert.deepEqual(gh.labellisations, [
    [30, ["effort:low"]],
    [30, ["fire"]],
  ]);
});

test("the free room: the places, less the cooks at work and the fired issues that wait for a cook", () => {
  const ouvertes = [
    { number: 1, labels: ["fire"], createdAt: "" },
    { number: 2, labels: ["fire", "taken"], createdAt: "" },
    { number: 3, labels: ["fire", "question"], createdAt: "" },
    { number: 4, labels: ["prio:1"], createdAt: "" },
  ];
  assert.equal(placeLibre({ places: 3, enCuisine: 1, ouvertes }), 1);
  assert.equal(placeLibre({ places: () => 4, enCuisine: 0, ouvertes }), 3);
});

test("a take that fails is said, and the turn goes on: nothing else fails with it", async (t) => {
  const { gh, avertissements, juges, laisserReveiller } = brigade(t, { issues: [issue(30, ["prio:1"])], manager: { freeRoom: () => 1 } });
  gh.pannes.label = true;
  await jusqua(() => juges(30) && avertissements.some((m) => /#30 not taken from the backlog — gh api : HTTP 502/.test(m)));
  await laisserReveiller(3);
  assert.deepEqual(avertissements.filter((m) => !/#30 not taken from the backlog — gh api : HTTP 502/.test(m)), []);
});

// Une issue rejugée pendant le tour — son corps a changé depuis son refus — se prend à la fin de ce même tour, dans la
// place que la prise du début du tour a laissée : celle qu'elle a prise n'a pas encore `fire` dans le sondage.
test("an issue judged again during the round is taken at its end, in the room the round's first take left", async (t) => {
  const rejugee = (places: number) => {
    const c = brigade(t, { issues: [issue(30, []), issue(31, [])], refusees: [30], manager: { freeRoom: (ouvertes) => placeLibre({ places, enCuisine: 0, ouvertes }) } });
    c.gh.decrire(30, { body: "The breaker opens too late." });
    // Le sondage pendant lequel chaque `fire` est posé.
    const feux: Array<[number, number]> = [];
    const labelliser = c.gh.github.labelliser.bind(c.gh.github);
    c.gh.github.labelliser = async (numero, labels) => {
      if (labels.includes("fire")) feux.push([numero, c.gh.sondages.ouvertes]);
      await labelliser(numero, labels);
    };
    return { ...c, feux };
  };

  const une = rejugee(1);
  await jusqua(() => une.faits(30).filter((type) => type === "manager.judged").length === 2 && une.labels(31).includes("fire"));
  await une.laisserReveiller(3);
  assert.deepEqual(une.feux, [[31, 1]]);
  assert.ok(!une.labels(30).includes("fire"));

  const deux = rejugee(2);
  await jusqua(() => deux.labels(30).includes("fire") && deux.labels(31).includes("fire"));
  assert.deepEqual(deux.feux, [[31, 1], [30, 1]]);
});

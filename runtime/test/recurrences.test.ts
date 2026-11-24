import assert from "node:assert/strict";
import { test } from "node:test";
import { brancherCalendrier, debutDesPeriodes, lireLesEntrees, marqueurDe, passerLeCalendrier, periodeDe } from "../src/recurrences/recurrences.ts";
import { validerReglagesProjet, texteDuFichier } from "../src/reglages-projet/reglages.ts";

type Brute = { number: number; state: "open" | "closed"; title: string; body: string; labels: string[] };
function faux(echecLecture = false) {
  const issues: Brute[] = [];
  const lectures: string[] = [];
  return {
    issues,
    lectures,
    github: {
      async issuesDepuis(instant: string) {
        lectures.push(instant);
        if (echecLecture) throw new Error("gh down\nsecond line");
        return issues.map((i) => ({ ...i }));
      },
      async creerIssue({ titre, corps, labels }: { titre: string; corps: string; labels: string[] }) {
        issues.push({ number: issues.length + 1, state: "open", title: titre, body: corps, labels });
        return issues.length;
      },
    },
  };
}

test("periods: the day, the ISO week (across a year end) and the month", () => {
  assert.equal(periodeDe("daily", new Date("2026-11-24T23:59:00Z")), "2026-11-24");
  assert.equal(periodeDe("weekly", new Date("2026-11-24T08:00:00Z")), "2026-W48");
  assert.equal(periodeDe("weekly", new Date("2026-11-23T00:00:00Z")), "2026-W48");
  assert.equal(periodeDe("weekly", new Date("2026-11-22T23:00:00Z")), "2026-W47");
  assert.equal(periodeDe("weekly", new Date("2027-01-01T08:00:00Z")), "2026-W53");
  assert.equal(periodeDe("weekly", new Date("2024-12-30T08:00:00Z")), "2025-W01");
  assert.equal(periodeDe("monthly", new Date("2026-11-30T23:00:00Z")), "2026-11");
});

test("the first instant read is the earlier of the month's start and the week's Monday", () => {
  assert.equal(debutDesPeriodes(new Date("2026-11-24T08:00:00Z")), "2026-11-01T00:00:00.000Z");
  assert.equal(debutDesPeriodes(new Date("2026-12-02T08:00:00Z")), "2026-11-30T00:00:00.000Z");
  assert.equal(debutDesPeriodes(new Date("2026-11-29T08:00:00Z")), "2026-11-01T00:00:00.000Z");
});

test("the marker never closes its comment, whatever the name", () => {
  const marqueur = marqueurDe("a --> b -- c", "2026-11");
  assert.equal(marqueur.indexOf("-->"), marqueur.length - 3);
  assert.notEqual(marqueurDe("A", "2026-11"), marqueurDe("A", "2026-12"));
});

test("entries: each refusal names the entry and the field; a bad priority or a duplicate name is refused too", () => {
  const { entrees, erreurs } = lireLesEntrees([
    { name: "Ok", frequency: "daily", priority: "prio:1" },
    { name: "Ok", frequency: "daily", priority: "prio:1" },
    { name: "Mauvaise", frequency: "daily", priority: "high" },
    { frequency: "daily", priority: "prio:1" },
    "pas un objet",
  ]);
  assert.deepEqual(entrees.map((e) => e.name), ["Ok"]);
  assert.deepEqual(erreurs.map((e) => [e.entree, e.champ]).sort(), [["#4", "name"], ["#5", "name"], ["#5", "frequency"], ["#5", "priority"], ["Mauvaise", "priority"], ["Ok", "name"]].sort());
});

test("the pass reads the issues since the periods' start, opens once, and says an issue that does not open", async () => {
  const { issues, lectures, github } = faux();
  const dit: string[] = [];
  const entrees = () => [{ name: "Closer", frequency: "daily", priority: "prio:3" }, { name: "Sans prio", frequency: "daily" }];
  const maintenant = () => new Date("2026-11-24T08:00:00Z");
  assert.deepEqual(await passerLeCalendrier({ entrees, github, avertir: (l) => dit.push(l), maintenant }), [1]);
  assert.deepEqual(await passerLeCalendrier({ entrees, github, avertir: (l) => dit.push(l), maintenant }), []);
  assert.equal(issues.length, 1);
  assert.deepEqual(lectures, ["2026-11-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"]);
  assert.ok(dit.some((l) => l.includes("#1 opened")));
  assert.ok(dit.some((l) => l.includes("Sans prio") && l.includes("priority")));
});

test("the pass does nothing when the sheet does not read or holds no entry", async () => {
  const { issues, lectures, github } = faux();
  assert.deepEqual(await passerLeCalendrier({ entrees: () => null, github, avertir: () => {} }), []);
  assert.deepEqual(await passerLeCalendrier({ entrees: () => [], github, avertir: () => {} }), []);
  assert.equal(lectures.length + issues.length, 0);
});

test("when the issues cannot be read, nothing is opened and the failure is said", async () => {
  const { issues, github } = faux(true);
  const dit: string[] = [];
  const entrees = () => [{ name: "Closer", frequency: "daily", priority: "prio:3" }];
  assert.deepEqual(await passerLeCalendrier({ entrees, github, avertir: (l) => dit.push(l), maintenant: () => new Date("2026-11-24T08:00:00Z") }), []);
  assert.equal(issues.length, 0);
  assert.deepEqual(dit, ["calendar — issues not read, nothing opened: gh down"]);
});

test("an issue that fails to open is said without stopping the others", async () => {
  const { issues, github } = faux();
  const rate = { ...github, async creerIssue(i: { titre: string; corps: string; labels: string[] }) { if (i.titre === "A") throw new Error("boom"); return github.creerIssue(i); } };
  const dit: string[] = [];
  const entrees = () => [{ name: "A", frequency: "daily", priority: "prio:1" }, { name: "B", frequency: "daily", priority: "prio:1" }];
  assert.deepEqual(await passerLeCalendrier({ entrees, github: rate, avertir: (l) => dit.push(l), maintenant: () => new Date("2026-11-24T08:00:00Z") }), [1]);
  assert.equal(issues[0]?.title, "B");
  assert.ok(dit.some((l) => l.includes("“A”") && l.includes("boom")));
});

test("project settings: `recurring` is read as written, written back, and refused when not a list", () => {
  const entrees = [{ name: "X", frequency: "weekly", priority: "prio:2" }, { name: "sans fréquence" }];
  const lus = validerReglagesProjet({ integrationBranch: "main", recurring: entrees });
  assert.deepEqual(lus.recurring, entrees);
  assert.deepEqual(JSON.parse(texteDuFichier(lus)).recurring, entrees);
  assert.equal(validerReglagesProjet({ integrationBranch: "main", recurring: [] }).recurring, undefined);
  assert.throws(() => validerReglagesProjet({ integrationBranch: "main", recurring: "daily" }), /recurring/);
});

test("the calendar runs on the tick only, one pass at a time, and repeats no line", async () => {
  let reveil: (cause: string) => void = () => {};
  const runtime = { surReveil: (f: (cause: string) => void) => { reveil = f; } } as unknown as Parameters<typeof brancherCalendrier>[0];
  const { issues, github } = faux();
  const dit: string[] = [];
  const entrees = () => [{ name: "Closer", frequency: "daily", priority: "prio:3" }, { name: "Sans prio", frequency: "daily" }];
  brancherCalendrier(runtime, { entrees, github, avertir: (l) => dit.push(l), maintenant: () => new Date("2026-11-24T08:00:00Z") });
  reveil("autre");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(issues.length, 0);
  reveil("tick");
  reveil("tick");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(issues.length, 1);
  reveil("tick");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(dit.filter((l) => l.includes("Sans prio")).length, 1);
});

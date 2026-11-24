import assert from "node:assert/strict";
import { test } from "node:test";
import { brancherCalendrier } from "../src/recurrences/calendrier.ts";
import { ouvrirRecurrences } from "../src/recurrences/recurrences.ts";
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

async function passer(entrees: unknown[], maintenant: string, avertir: (l: string) => void = () => {}, gh = faux()) {
  let reveil: (cause: string) => void = () => {};
  const runtime = { surReveil: (f: (cause: string) => void) => { reveil = f; } } as unknown as Parameters<typeof brancherCalendrier>[0];
  brancherCalendrier(runtime, { entrees: () => entrees, github: gh.github, avertir, maintenant: () => new Date(maintenant) });
  reveil("tick");
  await new Promise((r) => setTimeout(r, 20));
  return gh;
}

const periodeOuverte = async (frequency: string, maintenant: string) => {
  const { issues, github } = faux();
  const gh = { listerTickets: async () => [], ouvrirTicket: async (t: { titre: string; corps: string; etiquettes: string[] }) => github.creerIssue({ titre: t.titre, corps: t.corps, labels: t.etiquettes }) };
  await ouvrirRecurrences({ entrees: [{ name: "N", frequency, priority: "prio:1" }], maintenant: new Date(maintenant), github: gh });
  return /period=(\S+) -->/.exec(issues[0]?.body ?? "")?.[1];
};

test("periods: the day, the ISO week (across a year end) and the month", async () => {
  assert.equal(await periodeOuverte("daily", "2026-11-24T23:59:00Z"), "2026-11-24");
  assert.equal(await periodeOuverte("weekly", "2026-11-24T08:00:00Z"), "2026-W48");
  assert.equal(await periodeOuverte("weekly", "2026-11-23T00:00:00Z"), "2026-W48");
  assert.equal(await periodeOuverte("weekly", "2026-11-22T23:00:00Z"), "2026-W47");
  assert.equal(await periodeOuverte("weekly", "2027-01-01T08:00:00Z"), "2026-W53");
  assert.equal(await periodeOuverte("weekly", "2024-12-30T08:00:00Z"), "2025-W01");
  assert.equal(await periodeOuverte("monthly", "2026-11-30T23:00:00Z"), "2026-11");
});

test("the issues are read since the earlier of the month's start and the week's Monday", async () => {
  const lu = async (maintenant: string) => (await passer([{ name: "A", frequency: "daily", priority: "prio:1" }], maintenant)).lectures[0];
  assert.equal(await lu("2026-11-24T08:00:00Z"), "2026-11-01T00:00:00.000Z");
  assert.equal(await lu("2026-12-02T08:00:00Z"), "2026-11-30T00:00:00.000Z");
  assert.equal(await lu("2026-11-29T08:00:00Z"), "2026-11-01T00:00:00.000Z");
});

test("the marker never closes its comment, whatever the name, and tells two periods apart", async () => {
  const { issues, github } = faux();
  const gh = { listerTickets: async () => [], ouvrirTicket: async (t: { titre: string; corps: string; etiquettes: string[] }) => github.creerIssue({ titre: t.titre, corps: t.corps, labels: t.etiquettes }) };
  await ouvrirRecurrences({ entrees: [{ name: "a --> b -- c", frequency: "monthly", priority: "prio:1" }], maintenant: new Date("2026-11-24T08:00:00Z"), github: gh });
  const corps = issues[0]?.body ?? "";
  assert.equal(corps.indexOf("-->"), corps.indexOf(" -->") + 1);
  assert.equal(corps.match(/-->/g)?.length, 1);
});

test("entries: each refusal names the entry and the field; a bad priority or a duplicate name is refused too", async () => {
  const gh = { listerTickets: async () => [], ouvrirTicket: async () => 1 };
  const { ouverts, erreurs } = await ouvrirRecurrences({
    entrees: [
      { name: "Ok", frequency: "daily", priority: "prio:1" },
      { name: "Ok", frequency: "daily", priority: "prio:1" },
      { name: "Mauvaise", frequency: "daily", priority: "high" },
      { frequency: "daily", priority: "prio:1" },
      "pas un objet",
    ],
    maintenant: new Date("2026-11-24T08:00:00Z"),
    github: gh,
  });
  assert.deepEqual(ouverts, [1]);
  assert.deepEqual(erreurs.map((e) => [e.entree, e.champ]).sort(), [["#4", "name"], ["#5", "name"], ["#5", "frequency"], ["#5", "priority"], ["Mauvaise", "priority"], ["Ok", "name"]].sort());
});

test("a pass opens once, says what it opened and refused, and a second pass opens nothing", async () => {
  const dit: string[] = [];
  const entrees = [{ name: "Closer", frequency: "daily", priority: "prio:3" }, { name: "Sans prio", frequency: "daily" }];
  const gh = await passer(entrees, "2026-11-24T08:00:00Z", (l) => dit.push(l));
  await passer(entrees, "2026-11-24T09:00:00Z", (l) => dit.push(l), gh);
  assert.equal(gh.issues.length, 1);
  assert.deepEqual(dit.filter((l) => l.includes("#1 opened")).length, 1);
  assert.ok(dit.some((l) => l.includes("Sans prio") && l.includes("priority")));
});

test("nothing happens when the sheet does not read or holds no entry", async () => {
  for (const entrees of [null, []]) {
    const gh = faux();
    let reveil: (cause: string) => void = () => {};
    const runtime = { surReveil: (f: (cause: string) => void) => { reveil = f; } } as unknown as Parameters<typeof brancherCalendrier>[0];
    brancherCalendrier(runtime, { entrees: () => entrees, github: gh.github, avertir: () => {} });
    reveil("tick");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(gh.lectures.length + gh.issues.length, 0);
  }
});

test("when the issues cannot be read, nothing is opened and the failure is said", async () => {
  const dit: string[] = [];
  const gh = await passer([{ name: "Closer", frequency: "daily", priority: "prio:3" }], "2026-11-24T08:00:00Z", (l) => dit.push(l), faux(true));
  assert.equal(gh.issues.length, 0);
  assert.deepEqual(dit, ["calendar — issues not read, nothing opened: gh down"]);
});

test("an issue that fails to open is said without stopping the others", async () => {
  const base = faux();
  const gh = { ...base, github: { ...base.github, async creerIssue(i: { titre: string; corps: string; labels: string[] }) { if (i.titre === "A") throw new Error("boom"); return base.github.creerIssue(i); } } };
  const dit: string[] = [];
  await passer([{ name: "A", frequency: "daily", priority: "prio:1" }, { name: "B", frequency: "daily", priority: "prio:1" }], "2026-11-24T08:00:00Z", (l) => dit.push(l), gh);
  assert.deepEqual(base.issues.map((i) => i.title), ["B"]);
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
  const { issues, github, lectures } = faux();
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
  assert.equal(lectures.length, 1);
  reveil("tick");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(lectures.length, 2);
  assert.equal(dit.filter((l) => l.includes("Sans prio")).length, 1);
});

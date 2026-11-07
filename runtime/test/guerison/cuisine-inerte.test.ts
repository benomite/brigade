import assert from "node:assert/strict";
import { test } from "node:test";
import { INERTIE_MINUTES, LABEL_DU_BUG, signalerInertie, type PrisePourCuisiner, type TicketCuisinable } from "../../src/guerison/cuisine-inerte.ts";

const MAINTENANT = new Date("2026-11-07T12:00:00Z");
const ilYA = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();

// Un faux GitHub tenu en mémoire, lu seulement par son client.
function depot(etat: { dernierMerge?: string | null; cuisinables?: TicketCuisinable[]; prises?: PrisePourCuisiner[]; prsEnPasse?: number } = {}) {
  const e = { dernierMerge: ilYA(90) as string | null, cuisinables: [{ number: 7, title: "Seven", attend: [] }] as TicketCuisinable[], prises: [] as PrisePourCuisiner[], prsEnPasse: 1, ...etat };
  const issues: { number: number; titre: string; corps: string; labels: string[]; ouverte: boolean }[] = [];
  const github = {
    dernierMerge: async () => e.dernierMerge,
    cuisinables: async () => e.cuisinables,
    prises: async () => e.prises,
    prsEnPasse: async () => e.prsEnPasse,
    issuesOuvertes: async (label: string) => issues.filter((i) => i.ouverte && i.labels.includes(label)).map((i) => ({ number: i.number, body: i.corps })),
    creerIssue: async (issue: { titre: string; corps: string; labels: string[] }) => {
      const number = 200 + issues.length;
      issues.push({ number, ...issue, ouverte: true });
      return number;
    },
  };
  return { issues, appeler: () => signalerInertie({ github, maintenant: MAINTENANT }) };
}

test("aucun merge depuis 90 minutes et un ticket cuisinable : un seul bug, dont le corps nomme la cause probable", async () => {
  const d = depot({ prsEnPasse: 0 });
  const r = await d.appeler();
  assert.deepEqual(r, { fait: "bug", cause: "empty-rail", bug: 200 });
  assert.equal(d.issues.length, 1);
  assert.deepEqual(d.issues[0]?.labels, [LABEL_DU_BUG]);
  assert.match(d.issues[0]?.corps ?? "", /empty of in-pass PRs/);
});

test("tous les cuisinables attendent un ticket ouvert : la cause est nommée, avec les tickets qu'ils attendent", async () => {
  const d = depot({ cuisinables: [{ number: 7, title: "a", attend: [3] }, { number: 8, title: "b", attend: [3, 4] }] });
  assert.equal((await d.appeler()).fait, "bug");
  const corps = d.issues[0]?.corps ?? "";
  assert.match(corps, /`all-blocked`/);
  assert.match(corps, /#8 waits on #3, #4/);
});

test("une prise plus vieille que le seuil : la cause est une prise périmée", async () => {
  const d = depot({ prises: [{ number: 9, depuis: ilYA(INERTIE_MINUTES + 30) }] });
  assert.deepEqual(await d.appeler(), { fait: "bug", cause: "stale-claim", bug: 200 });
  assert.match(d.issues[0]?.corps ?? "", /#9 taken since/);
});

test("rien n'explique l'arrêt : la cause est dite inconnue, le bug est ouvert quand même", async () => {
  const d = depot({ dernierMerge: null });
  assert.deepEqual(await d.appeler(), { fait: "bug", cause: "unknown", bug: 200 });
});

test("un second appel, bug encore ouvert : aucun second bug", async () => {
  const d = depot();
  await d.appeler();
  assert.deepEqual(await d.appeler(), { fait: "deja-signale", bug: 200 });
  assert.equal(d.issues.length, 1);
});

test("le bug fermé puis l'inertie qui dure : un nouveau bug peut être ouvert", async () => {
  const d = depot();
  await d.appeler();
  d.issues[0]!.ouverte = false;
  assert.equal((await d.appeler()).fait, "bug");
  assert.equal(d.issues.length, 2);
});

test("un dernier merge il y a 89 minutes : rien", async () => {
  const d = depot({ dernierMerge: ilYA(89) });
  assert.equal((await d.appeler()).fait, "rien");
  assert.equal(d.issues.length, 0);
});

test("aucun ticket cuisinable : rien", async () => {
  const d = depot({ cuisinables: [] });
  assert.deepEqual(await d.appeler(), { fait: "rien", pourquoi: "no cookable ticket" });
  assert.equal(d.issues.length, 0);
});

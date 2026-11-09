import assert from "node:assert/strict";
import { test } from "node:test";
import { INERTIE_MINUTES, LABEL_DU_BUG, direLaZoneTenue, signalerInertie, type PrisePourCuisiner, type TenantDeZone, type TicketCuisinable } from "../../src/guerison/cuisine-inerte.ts";

const MAINTENANT = new Date("2026-11-07T12:00:00Z");
const ilYA = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();

// Un faux GitHub tenu en mémoire, lu seulement par son client.
function depot(etat: { dernierMerge?: string | null; cuisinables?: TicketCuisinable[]; prises?: PrisePourCuisiner[]; prsEnPasse?: number; zonesTenues?: { ticket: number; tenant: TenantDeZone }[] } = {}) {
  const e = { dernierMerge: ilYA(90) as string | null, cuisinables: [{ number: 7, title: "Seven" }] as TicketCuisinable[], prises: [] as PrisePourCuisiner[], prsEnPasse: 1, ...etat };
  const issues: { number: number; titre: string; corps: string; labels: string[]; ouverte: boolean }[] = [];
  const github = {
    dernierMerge: async () => e.dernierMerge,
    cuisinables: async () => e.cuisinables,
    prises: async () => e.prises,
    prsEnPasse: async () => e.prsEnPasse,
    zonesTenues: async () => e.zonesTenues ?? [],
    issuesOuvertes: async (label: string) => issues.filter((i) => i.ouverte && i.labels.includes(label)).map((i) => ({ number: i.number, body: i.corps })),
    creerIssue: async (issue: { titre: string; corps: string; labels: string[] }) => {
      const number = 200 + issues.length;
      issues.push({ number, ...issue, ouverte: true });
      return number;
    },
  };
  // La brigade : son propre faux dépôt, pour savoir où le bug est créé.
  const surLaBrigade: typeof issues = [];
  const brigade = {
    servi: "zeta/lab",
    marqueDuProjet: "<!-- brigade:projet=zeta/lab -->",
    issuesOuvertes: async () => surLaBrigade.filter((i) => i.ouverte).map((i) => ({ number: i.number, body: i.corps })),
    creerIssue: async (issue: { titre: string; corps: string; labels: string[] }) => {
      const number = 700 + surLaBrigade.length;
      surLaBrigade.push({ number, ...issue, ouverte: true });
      return number;
    },
  };
  return { issues, surLaBrigade, appeler: () => signalerInertie({ github, maintenant: MAINTENANT }), appelerAvecBrigade: () => signalerInertie({ github, maintenant: MAINTENANT, brigade }) };
}

const TENANT_FERME: TenantDeZone = { ticket: 412, branche: "cook/412-github", fermeLe: "2026-10-23", pr: 489 };
const TENANT_OUVERT: TenantDeZone = { ticket: 412, branche: "cook/412-github", fermeLe: null, pr: 489 };

test("aucun merge depuis 90 minutes et un ticket cuisinable : un seul bug, dont le corps nomme la cause probable", async () => {
  const d = depot({ prsEnPasse: 0 });
  const r = await d.appeler();
  assert.deepEqual(r, { fait: "bug", cause: "empty-rail", bug: 200 });
  assert.equal(d.issues.length, 1);
  assert.deepEqual(d.issues[0]?.labels, [LABEL_DU_BUG]);
  assert.ok(!d.issues[0]?.labels.includes("blocked-on-human"));
  assert.match(d.issues[0]?.corps ?? "", /empty of in-pass PRs/);
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

test("the sentence names the holder, its closing date when closed, and its PR", () => {
  assert.equal(direLaZoneTenue(TENANT_FERME), "zone held by #412, closed on 2026-10-23, through PR #489");
  assert.equal(direLaZoneTenue(TENANT_OUVERT), "zone held by #412, through PR #489");
});

test("a held zone: the alert names the holder, says no empty-rail, and is filed on the brigade, not on the served project", async () => {
  const d = depot({ prsEnPasse: 0, zonesTenues: [{ ticket: 7, tenant: TENANT_FERME }] });
  assert.deepEqual(await d.appelerAvecBrigade(), { fait: "bug", cause: "held-zone", bug: 700, sur: "brigade" });
  assert.equal(d.issues.length, 0);
  const bug = d.surLaBrigade[0];
  assert.match(bug?.corps ?? "", /zone held by #412, closed on 2026-10-23, through PR #489/);
  assert.match(bug?.corps ?? "", /brigade:projet=zeta\/lab/);
  assert.doesNotMatch(`${bug?.titre}\n${bug?.corps}`, /empty-rail|empty of in-pass/);
});

test("a held zone whose holder ticket is open: the same sentence without the closing part", async () => {
  const d = depot({ prsEnPasse: 0, zonesTenues: [{ ticket: 7, tenant: TENANT_OUVERT }] });
  await d.appelerAvecBrigade();
  assert.match(d.surLaBrigade[0]?.corps ?? "", /zone held by #412, through PR #489(\n|$)/);
  assert.doesNotMatch(d.surLaBrigade[0]?.corps ?? "", /closed on/);
});

test("a held zone, bug still open on the brigade for this project: no second bug; another project's bug masks nothing", async () => {
  const d = depot({ prsEnPasse: 0, zonesTenues: [{ ticket: 7, tenant: TENANT_OUVERT }] });
  await d.appelerAvecBrigade();
  assert.deepEqual(await d.appelerAvecBrigade(), { fait: "deja-signale", bug: 700, sur: "brigade" });
  assert.equal(d.surLaBrigade.length, 1);
  d.surLaBrigade[0]!.corps = d.surLaBrigade[0]!.corps.replace("zeta/lab", "autre/projet");
  assert.equal((await d.appelerAvecBrigade()).fait, "bug");
  assert.equal(d.surLaBrigade.length, 2);
});

test("a really empty rail keeps its bug on the served project, brigade known or not", async () => {
  const d = depot({ prsEnPasse: 0 });
  assert.deepEqual(await d.appelerAvecBrigade(), { fait: "bug", cause: "empty-rail", bug: 200 });
  assert.equal(d.surLaBrigade.length, 0);
  assert.equal(d.issues.length, 1);
});

test("a held zone with no brigade to file on (the brigade serving itself): the bug stays on the project", async () => {
  const d = depot({ prsEnPasse: 0, zonesTenues: [{ ticket: 7, tenant: TENANT_OUVERT }] });
  assert.deepEqual(await d.appeler(), { fait: "bug", cause: "held-zone", bug: 200 });
});

// La relance de la base avant l'alerte (#2283) : une base rouge relance ses
// jobs en échec une fois, et la retenue ne s'annonce — ligne de la file du
// chef, alerte Telegram, filles du même fait — que si la base reste rouge.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { brancherRetenue, type Transition } from "../../src/retenue/brancher.ts";
import { relanceDeLaRetenue, type GitHubDeLaRelanceDeLaBase } from "../../src/retenue/relance-base.ts";
import { type CauseDeRetenue, type Retenue } from "../../src/retenue/retenue.ts";
import type { CauseReveil, Runtime } from "../../src/runtime.ts";
import { repertoireTemporaire } from "../outils.ts";

const url = (run: number) => `https://github.com/o/r/actions/runs/${run}/job/${run * 10}`;
const retenue = (cause: CauseDeRetenue): Retenue => ({ since: "2026-11-04T00:00:00.000Z", tickets: [1], cause, gesture: null });
const BASE_ROUGE = retenue({ kind: "base-red", sha: "abc1234", checks: ["test (windows)"] });

// Un GitHub dicté : les checks de la base, et ce qu'une relance en fait.
function githubDicte(apresRelance: "verte" | "rouge") {
  const appels = { relances: [] as number[], lectures: 0 };
  let relance = false;
  const github: GitHubDeLaRelanceDeLaBase = {
    checksDeLaBase: async () => [{ outcome: relance && apresRelance === "verte" ? "green" : "red", name: "test (windows)", url: url(7) }],
    etatDuRun: async () => (appels.lectures++, { tentative: relance ? 2 : 1, termine: true }),
    relancerLesEchecs: async (run) => {
      relance = true;
      appels.relances.push(run);
    },
  };
  return { github, appels };
}

// Une porte dont chaque verdict se dit ; `fini()` attend celui de la relance.
function porte(github: GitHubDeLaRelanceDeLaBase) {
  let fin!: () => void;
  const verdict = new Promise<void>((resolve) => (fin = resolve));
  const filtre = relanceDeLaRetenue(github, { pause: async () => {}, surFin: () => fin() });
  return { filtre, fini: () => verdict };
}

test("le check passe à la relance : la retenue ne s'annonce pas, et ne relance pas deux fois", async () => {
  const { github, appels } = githubDicte("verte");
  const { filtre, fini } = porte(github);
  assert.equal(filtre.filtrer(BASE_ROUGE), null);
  await fini();
  assert.deepEqual(appels.relances, [7]);
  assert.equal(filtre.filtrer(BASE_ROUGE), null);
  assert.equal(filtre.filtrer(BASE_ROUGE), null);
  assert.deepEqual(appels.relances, [7]);
});

test("le check échoue encore après la relance : la retenue s'annonce, avec les noms des checks, sans seconde relance", async () => {
  const { github, appels } = githubDicte("rouge");
  const { filtre, fini } = porte(github);
  assert.equal(filtre.filtrer(BASE_ROUGE), null);
  await fini();
  assert.deepEqual(filtre.filtrer(BASE_ROUGE), BASE_ROUGE);
  assert.deepEqual(filtre.filtrer(BASE_ROUGE), BASE_ROUGE);
  assert.deepEqual(appels.relances, [7]);
});

test("les autres causes ne relancent rien", () => {
  const { github, appels } = githubDicte("rouge");
  const { filtre } = porte(github);
  const causes: CauseDeRetenue[] = [
    { kind: "write-pacer", writes: 80, nextAt: "2026-11-04T01:00:00.000Z" },
    { kind: "github-limit", limit: "primary", backAt: "2026-11-04T01:00:00.000Z" },
    { kind: "breaker", since: "2026-11-04T00:00:00.000Z" },
    { kind: "unknown" },
  ];
  for (const cause of causes) assert.deepEqual(filtre.filtrer(retenue(cause)), retenue(cause));
  assert.deepEqual(appels, { relances: [], lectures: 0 });
});

// La retenue branchée, une base rouge au journal, un ticket qui attend depuis 30 min.
function cuisineRouge(t: TestContext, github: GitHubDeLaRelanceDeLaBase) {
  let instant = "2026-11-04T00:00:00.000Z";
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null, author: string) => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box" } } as Fait, null, "runtime");
  noter({ type: "ticket.arrived", payload: { title: "Ticket 12", priority: null, createdAt: "2026-11-01T00:00:12Z", url: "https://exemple.test/12", card: { waitsFor: [], zone: ["zone-12"], problems: [] } } }, 12, "github");
  noter({ type: "base.checked", payload: { sha: "ba5e0006ffffffff", outcome: "red", gates: { outcome: "red", code: 1, failures: ["FAIL  test (windows-latest)"], tail: "" }, tickets: [] } }, null, "pass");
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const runtime: Runtime = { projet: "brigade", journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} };
  const transitions: Transition[] = [];
  let fin!: () => void;
  const verdict = new Promise<void>((resolve) => (fin = resolve));
  const relance = relanceDeLaRetenue(github, { pause: async () => {}, surFin: () => fin() });
  brancherRetenue(runtime, { relance, maintenant: () => new Date(instant), dire: () => {}, surTransition: (transition) => transitions.push(transition) });
  const passer = (hhmmss: string) => {
    instant = `2026-11-04T${hhmmss}.000Z`;
    for (const ecouter of ecouteurs) ecouter("tick");
  };
  const held = () => journal.base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'kitchen.held'").map(({ payload }) => JSON.parse(payload));
  return { passer, held, transitions, verdict };
}

test("branchée, le check passe à la relance : ni fait kitchen.held (donc ni ligne de TODO ni alerte), ni transition", async (t) => {
  const { github, appels } = githubDicte("verte");
  const c = cuisineRouge(t, github);
  c.passer("00:30:00");
  await c.verdict;
  c.passer("00:35:00");
  c.passer("00:40:00");
  assert.deepEqual(c.held(), []);
  assert.deepEqual(c.transitions, []);
  assert.deepEqual(appels.relances, [7]);
});

test("branchée, le check échoue encore : la retenue s'écrit une fois, avec le nom du check", async (t) => {
  const { github, appels } = githubDicte("rouge");
  const c = cuisineRouge(t, github);
  c.passer("00:30:00");
  assert.deepEqual(c.held(), []);
  await c.verdict;
  c.passer("00:35:00");
  c.passer("00:40:00");
  const [tenue, ...autres] = c.held();
  assert.deepEqual(autres, []);
  assert.deepEqual(tenue.cause, { kind: "base-red", sha: "ba5e0006ffffffff", checks: ["test (windows-latest)"] });
  assert.equal(c.transitions.length, 1);
  assert.deepEqual(appels.relances, [7]);
});

test("un run déjà relancé (tentative 2) et encore rouge : aucune relance, la retenue s'annonce", async () => {
  const appels: number[] = [];
  const github: GitHubDeLaRelanceDeLaBase = {
    checksDeLaBase: async () => [{ outcome: "red", name: "test (windows)", url: url(7) }],
    etatDuRun: async () => ({ tentative: 2, termine: true }),
    relancerLesEchecs: async (run) => void appels.push(run),
  };
  const { filtre, fini } = porte(github);
  assert.equal(filtre.filtrer(BASE_ROUGE), null);
  await fini();
  assert.deepEqual(filtre.filtrer(BASE_ROUGE), BASE_ROUGE);
  assert.deepEqual(appels, []);
});

test("un run encore en cours ne se relance pas ; il se relance une fois fini", async () => {
  const appels: number[] = [];
  let lectures = 0;
  let relance = false;
  const github: GitHubDeLaRelanceDeLaBase = {
    checksDeLaBase: async () => [{ outcome: relance ? "green" : "red", name: "test (windows)", url: url(7) }],
    etatDuRun: async () => (++lectures, { tentative: relance ? 2 : 1, termine: lectures > 2 || relance }),
    relancerLesEchecs: async (run) => {
      relance = true;
      appels.push(run);
      assert.ok(lectures > 2);
    },
  };
  const { filtre, fini } = porte(github);
  assert.equal(filtre.filtrer(BASE_ROUGE), null);
  await fini();
  assert.deepEqual(appels, [7]);
  assert.equal(filtre.filtrer(BASE_ROUGE), null);
});

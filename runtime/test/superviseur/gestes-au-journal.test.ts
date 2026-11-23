// #4037 : chaque geste que le superviseur fait entre à son journal des gestes (`superviseur.ts`) — une carte TODO
// remise au chef, tout autre geste réglé seul ; un geste refusé n'y entre pas —, et le dossier que le manager reçoit
// porte ses derniers gestes et ses compteurs (`dossier.ts`).
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { enregistrementDe, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import type { FaitsDuProjet } from "../../src/superviseur/declencheur.ts";
import { dossierDuManager } from "../../src/superviseur/dossier.ts";
import { superviseur } from "../../src/superviseur/superviseur.ts";
import { repertoireTemporaire } from "../outils.ts";
import { FauxDepot } from "./faux-depot.ts";

const FICHIER = "autonomy-gestures.json";
const PRIS: FaitsDuProjet = { dernierMerge: null, cuisinables: [], prises: [{ ticket: 40, prises: 3 }], mainRougeDepuis: null };
const A = (hhmm: string) => new Date(`2026-11-23T${hhmm}:00.000Z`);

// Un run du superviseur, réveillé par #40 pris trois fois, où le manager rend `gesture`.
async function unRun(t: TestContext, gesture: unknown, labels: string[] = ["fire"]) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const depot = new FauxDepot();
  depot.issue(40, labels);
  const run = superviseur({
    projet: `gestes-au-journal-${t.name}`,
    depot: "acme/shop",
    sources: { journal, github: depot.client(), branche: "main", repertoireEtat: repertoire },
    manager: async () => ({ saw: "#40 does not move", gesture }),
    maintenant: () => A("17:01"),
  })(PRIS);
  return { repertoire, journal, depot, run };
}

test("a TODO card the supervisor posts is logged as handed to the chef, at its clock's time, with its reason", async (t) => {
  const { repertoire, run } = await unRun(t, { gesture: "todo", ticket: 40, kind: "product", question: "Ship it?" });
  await run;
  const { gestures, counters, lastGesture } = enregistrementDe(repertoire, "supervisor");
  assert.equal(gestures.length, 1);
  assert.deepEqual(lastGesture, { at: A("17:01").toISOString(), line: "posted a TODO card for the chef on #40, a product question: Ship it?", reason: "#40 was taken 3 times without delivering", outcome: OUTCOME.HANDED_TO_CHEF });
  assert.deepEqual(counters, { fixedBySelf: 0, handedToChef: 1 });
});

test("a gesture the supervisor does by itself is logged as fixed by itself", async (t) => {
  const { repertoire, run } = await unRun(t, { gesture: "back-on-rail", ticket: 40, note: "the client answered" }, ["waiting"]);
  await run;
  const { lastGesture, counters } = enregistrementDe(repertoire, "supervisor");
  assert.match(lastGesture?.line ?? "", /^put #40 back on the rail/);
  assert.equal(lastGesture?.outcome, OUTCOME.FIXED_BY_SELF);
  assert.deepEqual(counters, { fixedBySelf: 1, handedToChef: 0 });
});

test("a logged gesture done on a ticket still leaves its trace on that ticket", async (t) => {
  const { repertoire, depot, run } = await unRun(t, { gesture: "back-on-rail", ticket: 40, note: "the client answered" }, ["waiting"]);
  await run;
  assert.equal(enregistrementDe(repertoire, "supervisor").gestures.length, 1);
  const commentaires = depot.commentaires.get(40) ?? [];
  assert.equal(commentaires.length, 1);
  assert.match(commentaires[0] ?? "", /put #40 back on the rail/);
});

test("a refused gesture is not logged: nothing was done", async (t) => {
  const { repertoire, run } = await unRun(t, { gesture: "merge", ticket: 40 });
  await run;
  assert.deepEqual(enregistrementDe(repertoire, "supervisor").gestures, []);
});

test("a gesture done on an unreadable log fails the run, and the log is not overwritten", async (t) => {
  const repertoire = repertoireTemporaire(t);
  writeFileSync(join(repertoire, FICHIER), "{not json");
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const depot = new FauxDepot();
  depot.issue(40, ["fire"]);
  const run = superviseur({
    projet: "gestes-au-journal-illisible",
    depot: "acme/shop",
    sources: { journal, github: depot.client(), branche: "main", repertoireEtat: repertoire },
    manager: async () => ({ saw: "x", gesture: { gesture: "todo", ticket: 40, kind: "product", question: "Ship it?" } }),
    maintenant: () => A("17:01"),
  })(PRIS);
  await assert.rejects(async () => run, /its gesture was done but not logged \(posted a TODO card/);
  assert.equal(readFileSync(join(repertoire, FICHIER), "utf8"), "{not json");
});

test("the manager's dossier carries the supervisor's last gestures and counters; unreadable, it says so", async (t) => {
  const { repertoire, journal, depot, run } = await unRun(t, { gesture: "todo", ticket: 40, kind: "product", question: "Ship it?" });
  await run;
  const github = { ...depot.client(), ciDeLaBase: async () => [] };
  const dossier = await dossierDuManager({ journal, github, branche: "main", repertoireEtat: repertoire }, { cause: "takes", takes: 3, ticket: 40 });
  assert.deepEqual(dossier.thread, { lu: { gestures: enregistrementDe(repertoire, "supervisor").gestures, counters: { fixedBySelf: 0, handedToChef: 1 } } });
  assert.equal((await dossierDuManager({ journal, github, branche: "main" }, { cause: "takes", takes: 3, ticket: 40 })).thread, null);
  writeFileSync(join(repertoire, FICHIER), "{not json");
  const illisible = (await dossierDuManager({ journal, github, branche: "main", repertoireEtat: repertoire }, { cause: "takes", takes: 3, ticket: 40 })).thread;
  assert.match(illisible !== null && "illisible" in illisible ? illisible.illisible : "", /cannot be read/);
});

// Le dossier que le superviseur remet au manager (#3943) : la file, la queue
// du journal, l'étape de CI en échec avec ses lignes de log, et l'historique du
// ticket en faute — et, quand une lecture échoue, sa raison, sans rien inventer.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Base } from "../../src/base.ts";
import type { Check } from "../../src/events/pass.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { dossierDuManager, type SourcesDuDossier } from "../../src/superviseur/dossier.ts";
import { aArreter, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const ROUGE: Check = { name: "tests (linux)", outcome: "red", conclusion: "failure", url: "https://exemple.test/run/1/job/2" };
const VERT: Check = { name: "types (runtime)", outcome: "green", conclusion: "success", url: "https://exemple.test/run/1/job/3" };
const LOG = [
  "2026-11-20T09:58:00.0000000Z ##[group]Run npm test",
  "2026-11-20T09:58:01.0000000Z not ok 3 - la file se lit",
  "2026-11-20T09:58:02.0000000Z ##[error]Process completed with exit code 1.",
  "2026-11-20T09:58:03.0000000Z Post job cleanup.",
].join("\n");

function journal(t: TestContext) {
  const ouvert = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  aArreter(t, () => ouvert.fermer());
  const noter = (ticket: number, fait: Fait) => ouvert.ajouter({ project: "brigade", ticket, author: "github", ...fait });
  for (const ticket of [17, 18]) noter(ticket, { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: 1, createdAt: "2026-10-01T00:00:00Z", url: `https://exemple.test/${ticket}` } });
  for (let n = 0; n < 60; n++) noter(n % 2 === 0 ? 17 : 18, { type: "ticket.changed", payload: { title: `Ticket ${n % 2 === 0 ? 17 : 18} v${n}`, priority: 1 } });
  return ouvert;
}

const github = (surcharge: Partial<SourcesDuDossier["github"]> = {}): SourcesDuDossier["github"] => ({
  ciDeLaBase: async (branche) => (branche === "main" ? [VERT, ROUGE] : []),
  journalDuCheck: async (check) => (check.name === ROUGE.name ? LOG : null),
  etapesEnEchec: async ({ name }) => (name === ROUGE.name ? ["Run npm test"] : []),
  ...surcharge,
});

test("le dossier porte la file, la queue du journal, l'étape de CI en échec et ses lignes de log, et l'historique du ticket en faute", async (t) => {
  const j = journal(t);
  const dossier = await dossierDuManager({ journal: j, github: github(), branche: "main" }, { cause: "takes", takes: 3, ticket: 18 });
  assert.deepEqual(dossier.reveil, { cause: "takes", takes: 3, ticket: 18 });
  assert.ok("lu" in dossier.queue);
  assert.deepEqual(dossier.queue.lu.map(({ ticket, title }) => [ticket, title]), [[17, "Ticket 17 v58"], [18, "Ticket 18 v59"]]);
  assert.ok("lu" in dossier.journal);
  const tout = j.tout();
  assert.deepEqual(dossier.journal.lu.map(({ seq }) => seq), tout.slice(-50).map(({ seq }) => seq));
  assert.deepEqual(dossier.ci, { lu: [{ check: "tests (linux)", url: ROUGE.url, steps: { lu: ["Run npm test"] }, log: { lu: "not ok 3 - la file se lit\n##[error]Process completed with exit code 1." } }] });
  assert.ok(dossier.history !== null && "lu" in dossier.history);
  assert.deepEqual(dossier.history.lu.map(({ seq }) => seq), tout.filter(({ ticket }) => ticket === 18).map(({ seq }) => seq));
  assert.equal(dossier.history.lu.length, 31);
});

test("main rouge ne nomme aucun ticket en faute : le dossier n'a pas d'historique", async (t) => {
  const dossier = await dossierDuManager({ journal: journal(t), github: github(), branche: "main" }, { cause: "main-red", since: "2026-11-20T09:50:00.000Z", ticket: null });
  assert.equal(dossier.history, null);
});

test("une lecture qui échoue est dite illisible avec sa raison, et le dossier part avec les autres", async (t) => {
  const j = journal(t);
  const base = { lire: () => { throw new Error("base fermée"); } } as unknown as Base;
  const casse: SourcesDuDossier["journal"] = { base, derniers: () => { throw new Error("journal illisible"); }, duTicket: () => { throw new Error("historique illisible"); } };
  const sansCi = await dossierDuManager({ journal: casse, github: github({ ciDeLaBase: async () => Promise.reject(new Error("GitHub limit")) }), branche: "main" }, { cause: "no-merge", since: "2026-11-20T09:00:00.000Z", ticket: 17 });
  assert.deepEqual([sansCi.queue, sansCi.journal, sansCi.ci, sansCi.history], [{ illisible: "base fermée" }, { illisible: "journal illisible" }, { illisible: "GitHub limit" }, { illisible: "historique illisible" }]);
  // Le check se lit, mais ni son log ni ses étapes : chacun le dit.
  const sansLog = await dossierDuManager({ journal: j, github: github({ journalDuCheck: async () => null, etapesEnEchec: async () => Promise.reject(new Error("job introuvable")) }), branche: "main" }, { cause: "no-merge", since: "2026-11-20T09:00:00.000Z", ticket: 17 });
  assert.deepEqual(sansLog.ci, { lu: [{ check: "tests (linux)", url: ROUGE.url, steps: { illisible: "job introuvable" }, log: { illisible: "GitHub returned no log for this check" } }] });
  const sansEtapes = await dossierDuManager({ journal: j, github: { ...github(), etapesEnEchec: undefined }, branche: "main" }, { cause: "no-merge", since: "2026-11-20T09:00:00.000Z", ticket: 17 });
  assert.ok("lu" in sansEtapes.ci);
  assert.deepEqual(sansEtapes.ci.lu[0]?.steps, { illisible: "this GitHub client does not read the failing steps" });
});

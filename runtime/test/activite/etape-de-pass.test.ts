// #3923 : une carte en pass dit l'étape où la pass en est — CI running, review, waiting for main, merging —, dans
// l'activité que `facts` donne de chaque ticket en pass (`rail[].activite.etape`).
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { avecEtape } from "../../src/activite/etape-de-pass.ts";
import type { ActiviteDeTicket } from "../../src/activites.ts";
import { faits, lireEtat } from "../../src/etat.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirRail } from "../aides/rail-du-journal.ts";
import { horloge, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const activite = (faitEn: string, depuis = "2026-11-19T12:00:00.000Z"): ActiviteDeTicket => ({ fait: "fr", faitEn, cible: null, depuis });
const EN_JUGEMENT = { phase: "judging" as const, reason: null };
const VERTE = { outcome: "green" as const, at: "2026-11-19T11:00:00.000Z", redSince: null };
const rouge = (redSince: string | null, at = "2026-11-19T11:00:00.000Z") => ({ outcome: "red" as const, at, redSince });

test("each thing the pass does is one of the four steps, or none", () => {
  assert.equal(avecEtape(activite("running the gates"), EN_JUGEMENT, VERTE)?.etape, "CI running");
  assert.equal(avecEtape(activite("judging"), EN_JUGEMENT, null)?.etape, "CI running");
  assert.equal(avecEtape(activite("review in progress"), EN_JUGEMENT, VERTE)?.etape, "review");
  assert.equal(avecEtape(activite("merging"), { phase: "merging", reason: null }, VERTE)?.etape, "merging");
  // La pass décide, attend, remonte : aucune des quatre étapes — l'activité reste telle quelle.
  assert.deepEqual(avecEtape(activite("judged green, the pass decides"), { phase: "green", reason: null }, VERTE), activite("judged green, the pass decides"));
  // La pass qui dit attendre la base rouge attend main, depuis son entrée dans cette phase.
  assert.deepEqual(avecEtape(activite("the pass waits"), { phase: "waiting", reason: "base-red" }, VERTE), { ...activite("the pass waits"), etape: "waiting for main" });
  assert.equal(avecEtape(activite("the pass waits"), { phase: "waiting", reason: "machine-saturated" }, VERTE)?.etape, undefined);
});

test("while main is red, a delivery waits for main from the later of its phase and the red", () => {
  // Le rouge est venu après : l'attente de main commence au rouge.
  assert.deepEqual(avecEtape(activite("judging", "2026-11-19T12:00:00.000Z"), EN_JUGEMENT, rouge("2026-11-19T12:03:00.000Z")), { ...activite("judging"), etape: "waiting for main", depuis: "2026-11-19T12:03:00.000Z" });
  // Le rouge était là avant : elle attend depuis qu'elle est entrée dans sa phase.
  assert.deepEqual(avecEtape(activite("judged green, the pass decides", "2026-11-19T12:00:00.000Z"), { phase: "green", reason: null }, rouge("2026-11-19T11:30:00.000Z")), {
    ...activite("judged green, the pass decides"),
    etape: "waiting for main",
    depuis: "2026-11-19T12:00:00.000Z",
  });
  // Sans début de rouge connu, le contrôle qui l'a vu rouge.
  assert.equal(avecEtape(activite("running the gates", "2026-11-19T12:00:00.000Z"), EN_JUGEMENT, rouge(null, "2026-11-19T12:05:00.000Z"))?.depuis, "2026-11-19T12:05:00.000Z");
  // Une livraison qui attend la pass attend main elle aussi.
  assert.equal(avecEtape(activite("waiting for the pass"), { phase: "delivered", reason: null }, rouge("2026-11-19T12:03:00.000Z"))?.etape, "waiting for main");
  // Une relecture ou un merge déjà partis vont à leur fin.
  assert.equal(avecEtape(activite("review in progress"), EN_JUGEMENT, rouge("2026-11-19T12:03:00.000Z"))?.etape, "review");
  assert.equal(avecEtape(activite("merging"), { phase: "merging", reason: null }, rouge("2026-11-19T12:03:00.000Z"))?.etape, "merging");
  // Arrêtée ou remontée, une livraison attend autre chose que main : son activité le dit, sans étape.
  assert.deepEqual(avecEtape(activite("held by the pass"), { phase: "held", reason: null }, rouge("2026-11-19T12:03:00.000Z")), activite("held by the pass"));
  assert.deepEqual(avecEtape(activite("escalated to the chef"), { phase: "escalated", reason: null }, rouge("2026-11-19T12:03:00.000Z")), activite("escalated to the chef"));
});

test("no known activity, or no delivery at the pass: nothing is made up", () => {
  assert.equal(avecEtape(null, EN_JUGEMENT, rouge("2026-11-19T12:03:00.000Z")), null);
  assert.deepEqual(avecEtape(activite("running the gates"), undefined, rouge("2026-11-19T12:03:00.000Z")), activite("running the gates"));
});

// La même étape, telle que `facts` la donne d'un ticket passé en pass dans le journal.
function enPass(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 3_600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } }); // 10:00:00
  noter({ type: "ticket.arrived", payload: { title: "Ticket 14", priority: 1, createdAt: "2026-10-01T00:00:14Z", url: "https://exemple.test/14" } }, 14, "github"); // 10:00:01
  rail.prendre("box/claude"); // 10:00:02
  noter({ type: "cook.launched", payload: { run: "14-a", limits: { durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/14-a.jsonl", station: "box/claude" } }, 14); // 10:00:03
  noter({ type: "cook.reported", payload: { run: "14-a", ending: "done", reason: null, summary: null, branch: "cook/14-a", pr: null } }, 14); // 10:00:04
  rail.envoyerEnPass(14, "box/claude"); // 10:00:05
  const lue = () => {
    const maintenant = new Date(`${JOUR_HORLOGE}T10:10:00.000Z`);
    return faits(lireEtat(journal, maintenant), maintenant).rail.find(({ ticket }) => ticket === 14)?.activite;
  };
  return { noter, lue };
}

test("facts gives the step of a card in pass, and main turning red makes it wait for main", (t) => {
  const { noter, lue } = enPass(t);
  noter({ type: "pass.started", payload: { run: "14-a", pr: "https://exemple.test/pr/1", number: 1, sha: "abc" } }, 14); // 10:00:06
  assert.deepEqual(lue(), { fait: "gates en cours", faitEn: "running the gates", cible: null, depuis: `${JOUR_HORLOGE}T10:00:06.000Z`, etape: "CI running" });
  noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: { outcome: "red", code: 1, failures: [], tail: "" }, tickets: [] } }); // 10:00:07
  assert.deepEqual(lue(), { fait: "gates en cours", faitEn: "running the gates", cible: null, depuis: `${JOUR_HORLOGE}T10:00:07.000Z`, etape: "waiting for main" });
});

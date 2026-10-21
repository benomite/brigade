// Ce que la cuisine d'un projet a fait de ses tickets dans la dernière heure et le dernier jour (#1272) :
// servis, renvoyés à un cook, remontés au chef — relus du journal, pour l'onglet Cooks de l'app.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { activiteDeLaCuisine, comptesEntre } from "../../src/activite-cuisine/comptes.ts";
import type { Ajout } from "../../src/evenements.ts";
import { REDECOUPE } from "../../src/events/pass.ts";
import { principal as faits } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, appeler, repertoireTemporaire } from "../outils.ts";

const PROJET = "parade";
const MAINTENANT = new Date("2026-10-21T12:00:00.000Z");
const MINUTE_MS = 60_000;
const ZERO = { served: 0, sentBack: 0, escalated: 0 };

type Fait = Pick<Ajout, "type" | "payload">;
const SERVI: Fait = { type: "ticket.served", payload: {} };
const MERGE: Fait = { type: "merge.done", payload: { pr: "https://github.com/chef/parade/pull/1", sha: "c0ffee", by: "pass", reconciled: false } };
const RENVOI: Fait = { type: "pass.returned", payload: { n: 1, findings: ["the test is missing"] } };
const REMONTEE: Fait = { type: "pass.escalated", payload: { reason: "still-red", cause: "returns-exhausted" } };

// Un journal où chaque fait s'écrit à l'heure qu'on lui donne, `minutes` avant MAINTENANT. Sans projection : seul
// le journal est lu.
function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  let horloge = MAINTENANT;
  const journal = ouvrirJournal(repertoire, { maintenant: () => horloge, projections: [] });
  aArreter(t, () => journal.fermer());
  const noter = (minutes: number, ticket: number | null, { type, payload }: Fait, project = PROJET) => {
    horloge = new Date(MAINTENANT.getTime() - minutes * MINUTE_MS);
    journal.ajouter({ project, ticket, author: "pass", type, payload } as Ajout);
  };
  return { repertoire, journal, noter, lire: () => activiteDeLaCuisine(journal.base, PROJET, MAINTENANT) };
}

test("un ticket servi il y a 30 minutes compte dans l'heure et dans le jour ; il y a 5 heures, dans le jour seul ; il y a 2 jours, nulle part", (t) => {
  const { noter, lire } = cuisine(t);
  noter(30, 11, SERVI);
  noter(5 * 60, 12, SERVI);
  noter(2 * 24 * 60, 13, SERVI);

  assert.deepEqual(lire(), { lastHour: { ...ZERO, served: 1 }, lastDay: { ...ZERO, served: 2 } });
});

test("renvoyés et remontés suivent les mêmes fenêtres que les servis", (t) => {
  const { noter, lire } = cuisine(t);
  noter(10, 21, RENVOI);
  noter(3 * 60, 22, RENVOI);
  noter(25 * 60, 23, RENVOI);
  noter(45, 31, REMONTEE);
  noter(23 * 60, 32, REMONTEE);
  noter(3 * 24 * 60, 33, REMONTEE);

  assert.deepEqual(lire(), { lastHour: { served: 0, sentBack: 1, escalated: 1 }, lastDay: { served: 0, sentBack: 2, escalated: 2 } });
});

test("les fenêtres se lisent bornes comprises : il y a une heure pile compte dans l'heure, il y a une heure et une minute non", (t) => {
  const { noter, lire } = cuisine(t);
  noter(60, 11, SERVI);
  noter(61, 12, SERVI);
  noter(24 * 60, 13, SERVI);
  noter(24 * 60 + 1, 14, SERVI);

  assert.deepEqual(lire(), { lastHour: { ...ZERO, served: 1 }, lastDay: { ...ZERO, served: 3 } });
});

test("on compte des tickets : renvoyé deux fois, ou mergé puis servi, il compte pour un", (t) => {
  const { noter, lire } = cuisine(t);
  noter(50, 21, RENVOI);
  noter(20, 21, { ...RENVOI, payload: { n: 2, findings: ["still missing"] } });
  noter(5, 11, MERGE);
  noter(5, 11, SERVI);
  // Remonté au chef, puis mergé par lui hors du rail : servi aussi.
  noter(40, 12, REMONTEE);
  noter(15, 12, { ...MERGE, payload: { pr: "https://github.com/chef/parade/pull/2", sha: "beef", by: "outside", reconciled: true } });

  assert.deepEqual(lire().lastHour, { served: 2, sentBack: 1, escalated: 1 });
});

test("un ticket que le manager a redécoupé n'attend rien du chef : il n'est pas compté remonté", (t) => {
  const { noter, lire } = cuisine(t);
  noter(5, 31, { type: "pass.escalated", payload: { reason: REDECOUPE } });
  noter(5, 32, { type: "pass.escalated", payload: { reason: "unjudged", cause: "no-gates" } });
  noter(5, 33, { type: "pass.escalated", payload: { reason: "still-red", cause: "manager-escalated" } });

  assert.deepEqual(lire().lastHour, { ...ZERO, escalated: 2 });
});

test("seuls comptent les faits du projet : ceux d'un autre projet, ou sans ticket, nulle part", (t) => {
  const { noter, lire, journal } = cuisine(t);
  noter(5, 11, SERVI);
  noter(5, 12, SERVI, "cantine");
  noter(5, 21, RENVOI, "cantine");
  noter(5, 31, REMONTEE, "cantine");
  noter(5, null, MERGE);

  assert.deepEqual(lire(), { lastHour: { ...ZERO, served: 1 }, lastDay: { ...ZERO, served: 1 } });
  assert.deepEqual(activiteDeLaCuisine(journal.base, "cantine", MAINTENANT).lastHour, { served: 1, sentBack: 1, escalated: 1 });
});

test("sans activité, six zéros — un journal vide comme un journal dont tout est plus vieux qu'un jour", (t) => {
  const vide = cuisine(t);
  assert.deepEqual(vide.lire(), { lastHour: ZERO, lastDay: ZERO });

  const ancien = cuisine(t);
  ancien.noter(2 * 24 * 60, 11, SERVI);
  ancien.noter(3 * 24 * 60, 21, RENVOI);
  assert.deepEqual(ancien.lire(), { lastHour: ZERO, lastDay: ZERO });
  // Un fait écrit après l'instant de la lecture n'y est pas encore.
  assert.deepEqual(comptesEntre(ancien.journal.base, PROJET, new Date(0), new Date(MAINTENANT.getTime() - 3 * 24 * 60 * MINUTE_MS - 1)), ZERO);
});

test("`facts` donne les six comptes du projet dans `activiteCuisine`, à l'heure de la machine — six zéros sans activité", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const maintenant = Date.now();
  // Un journal tenu comme le runtime le tient, projections comprises : `facts` les lit.
  const ecrire = (ms: number, project: string, ticket: number | null, fait: Fait) => {
    const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(maintenant - ms) });
    journal.ajouter({ project, ticket, author: "pass", ...fait } as Ajout);
    journal.fermer();
  };
  const lire = async (env: Record<string, string> = {}) => {
    const lancee = appeler(faits, [], { BRIGADE_STATE_DIR: repertoire, ...env });
    assert.equal(await lancee.fin, 0, lancee.sortie());
    return JSON.parse(lancee.sortie().split("\n")[0] ?? "").activiteCuisine;
  };
  ecrire(0, PROJET, null, { type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } });
  assert.deepEqual(await lire({ BRIGADE_PROJECT: PROJET }), { lastHour: ZERO, lastDay: ZERO });

  ecrire(30 * MINUTE_MS, PROJET, 11, SERVI);
  ecrire(5 * 60 * MINUTE_MS, PROJET, 12, SERVI);
  ecrire(2 * 24 * 60 * MINUTE_MS, PROJET, 13, SERVI);
  ecrire(10 * MINUTE_MS, PROJET, 21, RENVOI);
  ecrire(10 * MINUTE_MS, "cantine", 22, RENVOI);
  const attendu = { lastHour: { served: 1, sentBack: 1, escalated: 0 }, lastDay: { served: 2, sentBack: 1, escalated: 0 } };
  assert.deepEqual(await lire({ BRIGADE_PROJECT: PROJET }), attendu);
  // Sans BRIGADE_PROJECT, le projet est celui du dernier fait écrit au journal.
  ecrire(0, PROJET, null, { type: "runtime.ticked", payload: { intervalMs: 60_000 } });
  assert.deepEqual(await lire(), attendu);
});

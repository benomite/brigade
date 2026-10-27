// À quelle allure la cuisine d'un projet sert (#1811) : servis et ratés heure par heure sur les 24 dernières, et le
// temps ordinaire d'un ticket pris, puis en pass — relus du journal, pour l'histogramme du rail de l'app.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { cadenceDeLaCuisine, HEURES, heuresDeLaCuisine } from "../../src/activite-cuisine/cadence.ts";
import type { Ajout } from "../../src/evenements.ts";
import { principal as faits } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, appeler, repertoireTemporaire } from "../outils.ts";

const PROJET = "shop";
// 12 h 20 UTC : l'heure en cours, la dernière barre, a commencé à 12 h pile.
const MAINTENANT = new Date("2026-10-21T12:20:00.000Z");
const MINUTE_MS = 60_000;

type Fait = Pick<Ajout, "type" | "payload">;
const SERVI: Fait = { type: "ticket.served", payload: {} };
const MERGE: Fait = { type: "merge.done", payload: { pr: "https://github.com/chef/shop/pull/1", sha: "c0ffee", by: "pass", reconciled: false } };
const jugee = (verdict: "green" | "red"): Fait => ({ type: "pass.judged", payload: { run: "r", pr: null, number: null, sha: "abc", verdict, findings: [], judgeModified: false, noDiff: false } });
const sortie = (outcome: string): Fait => ({ type: "cook.exited", payload: { run: "r", outcome, code: null, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
const PRIS: Fait = { type: "ticket.taken", payload: { station: "box/claude", leaseUntil: "2026-10-21T13:00:00.000Z" } };
const EN_PASS: Fait = { type: "ticket.passing", payload: { station: "box/claude" } };
const RENDU: Fait = { type: "ticket.released", payload: { reason: "lease", station: "box/claude" } };

// Un journal où chaque fait s'écrit `minutes` avant MAINTENANT. Sans projection : seul le journal est lu.
function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  let horloge = MAINTENANT;
  const journal = ouvrirJournal(repertoire, { maintenant: () => horloge, projections: [] });
  aArreter(t, () => journal.fermer());
  const noter = (minutes: number, ticket: number | null, { type, payload }: Fait, project = PROJET) => {
    horloge = new Date(MAINTENANT.getTime() - minutes * MINUTE_MS);
    journal.ajouter({ project, ticket, author: "pass", type, payload } as Ajout);
  };
  return { journal, noter, heures: () => heuresDeLaCuisine(journal.base, PROJET, MAINTENANT), cadence: () => cadenceDeLaCuisine(journal.base, PROJET, MAINTENANT) };
}

test("vingt-quatre heures piles, la plus ancienne d'abord, l'heure en cours la dernière — à zéro sans activité, jamais absentes", (t) => {
  const { heures } = cuisine(t);
  const lues = heures();
  assert.equal(lues.length, HEURES);
  assert.deepEqual(lues[0], { at: "2026-10-20T13:00:00.000Z", served: 0, failed: 0 });
  assert.deepEqual(lues.at(-1), { at: "2026-10-21T12:00:00.000Z", served: 0, failed: 0 });
  assert.ok(lues.every(({ served, failed }) => served === 0 && failed === 0));
});

test("un servi tombe dans l'heure pile qui le contient ; plus vieux que la première barre, nulle part", (t) => {
  const { noter, heures } = cuisine(t);
  noter(10, 11, SERVI); // 12 h 10 : la barre en cours
  noter(21, 12, SERVI); // 11 h 59 : la barre d'avant
  noter(23 * 60 + 20, 13, SERVI); // 13 h 00 la veille : la première barre, bornes comprises
  noter(23 * 60 + 21, 14, SERVI); // 12 h 59 la veille : avant elle

  const lues = heures();
  assert.equal(lues[23]?.served, 1);
  assert.equal(lues[22]?.served, 1);
  assert.equal(lues[0]?.served, 1);
  assert.equal(lues.reduce((somme, { served }) => somme + served, 0), 3);
});

test("on compte des tickets servis : mergé puis servi, il compte pour un dans son heure", (t) => {
  const { noter, heures } = cuisine(t);
  noter(5, 11, MERGE);
  noter(4, 11, SERVI);
  noter(3, 12, MERGE);

  assert.equal(heures()[23]?.served, 2);
});

test("un raté : une pass revenue rouge, ou un cook fini sans suite (échoué, garde-fou, arrêt) — chacun compte une fois, une pass verte non", (t) => {
  const { noter, heures } = cuisine(t);
  noter(15, 21, jugee("red"));
  noter(10, 21, jugee("red"));
  noter(8, 22, sortie("guard"));
  noter(6, 23, jugee("green"));
  noter(5, 24, sortie("failed"));
  noter(4, 25, sortie("stop"));
  noter(70, 26, sortie("guard"));

  const lues = heures();
  assert.deepEqual(lues[23], { at: "2026-10-21T12:00:00.000Z", served: 0, failed: 5 });
  assert.equal(lues[22]?.failed, 1);
});

test("seuls comptent les faits du projet, et d'un ticket", (t) => {
  const { noter, heures } = cuisine(t);
  noter(5, 11, SERVI, "cantine");
  noter(5, 21, jugee("red"), "cantine");
  noter(5, null, MERGE);

  assert.ok(heures().every(({ served, failed }) => served === 0 && failed === 0));
});

test("le temps ordinaire pris, puis en pass : la médiane des séjours finis — nulle tant qu'il y en a moins de trois", (t) => {
  const { noter, cadence } = cuisine(t);
  // #31 pris 20 min, puis 10 min en pass, puis servi.
  noter(300, 31, PRIS);
  noter(280, 31, EN_PASS);
  noter(270, 31, SERVI);
  // #32 pris 40 min, puis rendu au rail ; repris 60 min, puis en pass 30 min, puis servi.
  noter(250, 32, PRIS);
  noter(210, 32, RENDU);
  noter(200, 32, PRIS);
  noter(140, 32, EN_PASS);
  noter(110, 32, SERVI);

  assert.deepEqual(cadence().medianSeconds, { taken: 40 * 60, pass: null });

  // #33 : son cook arrêté par un garde-fou au bout de 2 h — le ticket retourne au rail. En pass 50 min, puis renvoyé
  // à un cook qui le reprend : son séjour en pass finit à sa reprise.
  noter(100, 33, PRIS);
  noter(90, 33, sortie("ok")); // une fin qui laisse le ticket pris : la station dit la suite
  noter(80, 33, EN_PASS);
  noter(30, 33, PRIS);
  noter(29, 33, jugee("red")); // la relecture d'une livraison n'y change rien
  noter(10, 33, sortie("guard"));

  assert.deepEqual(cadence().medianSeconds, { taken: 20 * 60, pass: 30 * 60 });
});

test("un séjour en cours, ou commencé avant la fenêtre de sept jours, ne compte pas", (t) => {
  const { noter, cadence } = cuisine(t);
  noter(8 * 24 * 60, 41, PRIS);
  noter(6 * 24 * 60, 41, EN_PASS);
  noter(6 * 24 * 60 - 10, 41, SERVI);
  noter(10, 42, PRIS);
  noter(9, 43, PRIS);
  noter(8, 44, PRIS);

  assert.deepEqual(cadence().medianSeconds, { taken: null, pass: null });
});

test("`facts` donne la cadence du projet, à l'heure de la machine : vingt-quatre heures, et ses médianes", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const maintenant = Date.now();
  const ecrire = (ms: number, ticket: number | null, fait: Fait) => {
    const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(maintenant - ms) });
    journal.ajouter({ project: PROJET, ticket, author: "pass", ...fait } as Ajout);
    journal.fermer();
  };
  ecrire(0, null, { type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } });
  ecrire(0, 11, SERVI);
  const lancee = appeler(faits, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: PROJET });
  assert.equal(await lancee.fin, 0, lancee.sortie());
  const { cadence } = JSON.parse(lancee.sortie().split("\n")[0] ?? "");

  assert.equal(cadence.hours.length, HEURES);
  // Lu à l'heure de la machine : le servi est dans l'une des barres, quelle que soit l'heure pile passée entre-temps.
  assert.equal(cadence.hours.reduce((somme: number, { served }: { served: number }) => somme + served, 0), 1);
  assert.deepEqual(cadence.medianSeconds, { taken: null, pass: null });
});

// L'état d'une station, tel que le journal le raconte : son annonce, son quota,
// sa connexion, et les cooks qu'elle a lancés avec leur calibrage.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { cooksDeStation, etatStation, plafondDeCooks } from "../src/projections/stations.ts";
import { horloge, repertoireTemporaire } from "./outils.ts";

const STATION = "box/claude";
const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const ANNONCE = { station: STATION, engine: "claude", provides: ["code"], maxCooks: 1 };

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = `station:${STATION}`) =>
    journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const lancer = (run: string, ticket: number) =>
    noter(
      {
        type: "cook.launched",
        payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: STATION, model: "sonnet", effort: "medium", branch: `cook/${run}`, worktree: `worktrees/${run}` },
      },
      ticket,
      "runtime",
    );
  return { base: journal.base, noter, lancer };
}

test("une station qui ne s'est jamais annoncée est inconnue", (t) => {
  assert.equal(etatStation(cuisine(t).base, STATION), null);
});

test("une station annoncée se lit avec son moteur, ce qu'elle fournit et son plafond de cooks", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });

  assert.deepEqual(etatStation(base, STATION), {
    ...ANNONCE,
    cap: null,
    announcedAt: "2026-10-08T10:00:00.000Z",
    quotaUntil: null,
    quotaReason: null,
    disconnectedAt: null,
    disconnectedReason: null,
    saturatedAt: null,
    saturatedResource: null,
    saturatedObserved: null,
    saturatedLimit: null,
  });
});

test("le plafond de cooks est celui de l'annonce tant que le chef n'a rien réglé ; son réglage l'emporte, et zéro lève la limite", (t) => {
  const { base, noter } = cuisine(t);
  const plafond = () => plafondDeCooks(etatStation(base, STATION) ?? { maxCooks: -1, cap: null });
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 30 } });
  assert.equal(plafond(), 30);

  noter({ type: "station.capped", payload: { station: STATION, maxCooks: 4 } }, null, "chef");
  assert.equal(plafond(), 4);
  // Une annonce réécrite au redémarrage ne défait pas le réglage du chef.
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 12 } });
  assert.deepEqual([etatStation(base, STATION)?.maxCooks, plafond()], [12, 4]);

  noter({ type: "station.capped", payload: { station: STATION, maxCooks: 0 } }, null, "chef");
  assert.equal(plafond(), null);
});

test("un plafond illisible est ignoré : il reste au journal, sans effet", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  for (const maxCooks of [-1, 1.5, "trois"]) noter({ type: "station.capped", payload: { station: STATION, maxCooks: maxCooks as number } }, null, "chef");

  assert.equal(etatStation(base, STATION)?.cap, null);
});

test("une machine saturée se lit sur la station, avec ce qui manque, jusqu'à ce qu'elle respire", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  noter({ type: "station.saturated", payload: { station: STATION, resource: "cpu", observed: 16.2, limit: 15 } });

  const etat = etatStation(base, STATION);
  assert.deepEqual(
    [etat?.saturatedAt, etat?.saturatedResource, etat?.saturatedObserved, etat?.saturatedLimit],
    ["2026-10-08T10:00:01.000Z", "cpu", 16.2, 15],
  );

  noter({ type: "station.relieved", payload: { station: STATION } });
  assert.deepEqual([etatStation(base, STATION)?.saturatedAt, etatStation(base, STATION)?.saturatedResource], [null, null]);
});

test("un quota épuisé se lit sur la station, avec son heure de retour", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  noter({ type: "station.86", payload: { station: STATION, reason: "quota", until: "2026-10-08T15:00:00.000Z", window: "five_hour" } });

  const etat = etatStation(base, STATION);
  assert.deepEqual([etat?.quotaUntil, etat?.quotaReason], ["2026-10-08T15:00:00.000Z", "quota"]);
});

test("une station déconnectée le reste, annonce comprise, jusqu'au « reprendre » du chef", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: "7-a" } }, 7);
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 2 } });

  const etat = etatStation(base, STATION);
  assert.deepEqual([etat?.disconnectedAt, etat?.disconnectedReason, etat?.maxCooks], ["2026-10-08T10:00:01.000Z", "authentication_failed", 2]);

  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");
  assert.equal(etatStation(base, STATION)?.disconnectedAt, null);
});

test("chaque cook de la station se lit avec son calibrage, sa fin et ce qu'il a consommé", (t) => {
  const { base, noter, lancer } = cuisine(t);
  lancer("7-a", 7);
  noter({ type: "cook.exited", payload: { run: "7-a", outcome: "ok", code: 0, signal: null, turns: 12, tokens: 3400, durationMs: 90_000 } }, 7, "runtime");
  noter({ type: "cook.reported", payload: { run: "7-a", ending: "done", reason: null, summary: "fait", branch: "cook/7-a", pr: "https://github.com/o/r/pull/9" } }, 7);
  lancer("8-b", 8);

  assert.deepEqual(cooksDeStation(base, STATION, 10), [
    {
      run: "8-b", ticket: 8, model: "sonnet", effort: "medium", branch: "cook/8-b", worktree: "worktrees/8-b", launchedAt: "2026-10-08T10:00:03.000Z",
      endedAt: null, ending: null, turns: null, tokens: null, durationMs: null, pr: null,
    },
    {
      run: "7-a", ticket: 7, model: "sonnet", effort: "medium", branch: "cook/7-a", worktree: "worktrees/7-a", launchedAt: "2026-10-08T10:00:00.000Z",
      endedAt: "2026-10-08T10:00:01.000Z", ending: "done", turns: 12, tokens: 3400, durationMs: 90_000, pr: "https://github.com/o/r/pull/9",
    },
  ]);
});

test("sans compte-rendu de la station, la fin d'un cook est celle que les garde-fous ont notée", (t) => {
  const { base, noter, lancer } = cuisine(t);
  lancer("7-a", 7);
  noter({ type: "cook.exited", payload: { run: "7-a", outcome: "guard", code: null, signal: "SIGTERM", turns: 101, tokens: 9, durationMs: 5 } }, 7, "runtime");
  lancer("8-b", 8);
  noter({ type: "cook.interrupted", payload: { run: "8-b" } }, 8, "runtime");

  assert.deepEqual(cooksDeStation(base, STATION, 10).map((cook) => [cook.run, cook.ending]), [["8-b", "interrupted"], ["7-a", "guard"]]);
});

test("un cook lancé sans station — d'avant elle — n'appartient à aucune", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "cook.launched", payload: { run: "7-a", limits: LIMITES, stream: "runs/7-a.jsonl" } }, 7, "runtime");

  assert.deepEqual(cooksDeStation(base, STATION, 10), []);
});

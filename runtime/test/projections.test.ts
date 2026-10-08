import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { definirProjection } from "../src/projection.ts";
import { PROJECTIONS } from "../src/projections.ts";
import { sessionEnCours, sessions } from "../src/projections/sessions.ts";
import { ouvrirRail } from "../src/rail.ts";
import type { FaitGardeFous } from "../src/evenements/garde-fous.ts";
import type { FaitRuntime } from "../src/evenements/runtime.ts";
import { faitInconnu, horloge, photographier, repertoireTemporaire } from "./outils.ts";

const demarrage = (pid: number) =>
  ({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid, host: "box", node: "v26" } }) as const;

// Une histoire qui fait passer chaque projection du registre par tous ses
// états. Un domaine qui ajoute sa projection ajoute ici les faits qui la
// nourrissent : le test de rejeu la couvre alors sans autre changement.
function raconter(journal: Journal): void {
  journal.ajouter(demarrage(100));
  journal.ajouter({ project: "brigade", ticket: 7, author: "github", ...faitInconnu("ticket.arrived") });
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.stopped", payload: { signal: "SIGTERM" } });
  journal.ajouter(demarrage(200));
  journal.ajouter(demarrage(300));
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.interrupted", payload: { startedSeq: 4 } });
  raconterLeRail(journal);
  raconterLesGardeFous(journal);
}

// Six tickets, un par destin : resté en attente, pris, rendu, servi, 86, parti.
function raconterLeRail(journal: Journal): void {
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date("2026-10-08T11:00:00.000Z") });
  for (const ticket of [1, 2, 3, 4, 5, 6]) {
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-0${ticket}T00:00:00.000Z`, url: `https://exemple.test/${ticket}` },
    });
  }
  journal.ajouter({ project: "brigade", ticket: 1, author: "github", type: "ticket.changed", payload: { title: "Renommé", priority: 3 } });
  journal.ajouter({ project: "brigade", ticket: 6, author: "github", type: "ticket.left", payload: { reason: "closed" } });
  // Le ticket 1 passe son tour : les stations prennent les suivants, dans l'ordre.
  rail.quatreVingtSix(1, { motif: "station absente" });
  for (const ticket of [2, 3, 4, 5]) assert.equal(rail.prendre(`box/cook-${ticket}`)?.ticket, ticket);
  rail.rendre(1, "station revenue");
  rail.renouveler(2, "box/cook-2");
  rail.rendre(3, "returned", "box/cook-3");
  rail.envoyerEnPass(4, "box/cook-4");
  rail.servir(4);
  rail.quatreVingtSix(5, { motif: "quota", retour: new Date("2026-10-08T15:00:00.000Z"), station: "box/cook-5" });
  assert.deepEqual(
    rail.tickets().map((ticket) => [ticket.ticket, ticket.state]),
    [[1, "waiting"], [2, "taken"], [3, "waiting"], [4, "served"], [5, "86"]],
  );
}
  );

// Un cook arrêté par un plafond, un autre mort avec le runtime, le disjoncteur
// qui s'ouvre, puis le chef qui arrête et reprend.
function raconterLesGardeFous(journal: Journal): void {
  const limits = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
  const noter = (fait: FaitGardeFous, ticket: number | null = null, author = "runtime") =>
    journal.ajouter({ project: "brigade", ticket, author, ...fait });
  noter({ type: "guard.configured", payload: { limits, breakerThreshold: 1 } });
  noter({ type: "cook.launched", payload: { run: "a", limits, stream: "runs/a.jsonl" } }, 7);
  noter({ type: "guard.tripped", payload: { run: "a", reason: "turns", limit: 100, observed: 101 } }, 7);
  noter({ type: "cook.exited", payload: { run: "a", outcome: "guard", code: null, signal: "SIGTERM", turns: 101, tokens: 900, durationMs: 40 } }, 7);
  noter({ type: "breaker.opened", payload: { failures: 1, threshold: 1 } });
  noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");
  noter({ type: "cook.launched", payload: { run: "b", limits, stream: "runs/b.jsonl" } }, 8);
  noter({ type: "cook.interrupted", payload: { run: "b" } }, 8);
  noter({ type: "cook.launched", payload: { run: "c", limits, stream: "runs/c.jsonl" } }, 9);
  noter({ type: "cook.exited", payload: { run: "c", outcome: "failed", code: 1, signal: null, turns: 2, tokens: 30, durationMs: 12 } }, 9);
  noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
}

test("effacer les projections et rejouer le journal redonne le même état", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  raconter(journal);
  const avant = photographier(journal, PROJECTIONS);
  for (const [table, lignes] of Object.entries(avant)) {
    assert.notEqual(lignes.length, 0, `l'histoire ne nourrit pas ${table} : le rejeu ne prouverait rien`);
  }

  journal.reconstruire();

  assert.deepEqual(photographier(journal, PROJECTIONS), avant);
});

test("des projections perdues se retrouvent en rejouant le journal", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  raconter(journal);
  const avant = photographier(journal, PROJECTIONS);
  for (const projection of PROJECTIONS) {
    for (const table of projection.tables) journal.base.executer(`DELETE FROM ${table}`);
  }

  journal.reconstruire();

  assert.deepEqual(photographier(journal, PROJECTIONS), avant);
});

test("rejouer le journal n'y ajoute ni n'en retire aucun événement", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  raconter(journal);
  const avant = journal.tout();

  journal.reconstruire();

  assert.deepEqual(journal.tout(), avant);
});

test("un runtime démarré est la session en cours ; arrêté, il n'y en a plus", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());

  assert.equal(sessionEnCours(journal.base), null);
  journal.ajouter(demarrage(100));
  assert.deepEqual(sessionEnCours(journal.base), {
    startedSeq: 1,
    startedAt: "2026-10-08T10:00:00.000Z",
    pid: 100,
    host: "box",
  });
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.stopped", payload: { signal: "SIGTERM" } });
  assert.equal(sessionEnCours(journal.base), null);
});

test("une session interrompue garde la trace de sa fin", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  journal.ajouter(demarrage(100));
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.interrupted", payload: { startedSeq: 1 } });

  assert.equal(sessionEnCours(journal.base), null);
  assert.deepEqual(photographier(journal, [sessions])["sessions/runtime_sessions"], [
    { started_seq: 1, started_at: "2026-10-08T10:00:00.000Z", pid: 100, host: "box", ended_seq: 2, ended_at: "2026-10-08T10:00:01.000Z", ending: "interrupted" },
  ]);
});

test("une projection qui échoue annule l'événement : jamais d'événement sans son effet", (t) => {
  const fragile = definirProjection<FaitRuntime>({
    nom: "fragile",
    tables: ["fragile"],
    schema: "CREATE TABLE IF NOT EXISTS fragile (seq INTEGER PRIMARY KEY) STRICT;",
    sur: {
      "runtime.started": (base, evenement) => base.executer("INSERT INTO fragile (seq) VALUES (?)", evenement.seq),
      "runtime.stopped": () => {
        throw new Error("projection en panne");
      },
      "runtime.interrupted": () => {},
    },
  });
  const journal = ouvrirJournal(repertoireTemporaire(t), { projections: [fragile] });
  t.after(() => journal.fermer());
  journal.ajouter(demarrage(100));

  assert.throws(
    () => journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.stopped", payload: { signal: "SIGTERM" } }),
    /projection en panne/,
  );

  assert.deepEqual(journal.tout().map((e) => e.type), ["runtime.started"]);
  assert.deepEqual(photographier(journal, [fragile]), { "fragile/fragile": [{ seq: 1 }] });
});

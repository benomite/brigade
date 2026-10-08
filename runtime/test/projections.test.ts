import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { definirProjection } from "../src/projection.ts";
import { PROJECTIONS } from "../src/projections.ts";
import { sessionEnCours, sessions } from "../src/projections/sessions.ts";
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

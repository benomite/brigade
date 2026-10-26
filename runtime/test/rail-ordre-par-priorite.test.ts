// L'ordre du rail ne vient que du label `prio:` des issues : `prio:1` d'abord,
// les tickets sans priorité en dernier, et à priorité égale le plus ancien.
// Changer le label change la place du ticket ; un ticket qui en attend un autre
// ne part jamais avant lui.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { ouvrirRail } from "../src/rail.ts";
import { aArreter, repertoireTemporaire } from "./outils.ts";

const PROJET = "brigade";

type Pose = { ticket: number; priority: number | null; waitsFor?: number[] };

// Les tickets arrivent sur le rail dans l'ordre donné, chacun plus jeune que
// le précédent : le premier est le plus ancien.
function cuisine(t: TestContext, ...poses: Pose[]) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  poses.forEach(({ ticket, priority, waitsFor }, rang) => {
    const createdAt = `2026-09-${String(rang + 1).padStart(2, "0")}T00:00:00Z`;
    const card = waitsFor ? { waitsFor, zone: [], problems: [] } : null;
    journal.ajouter({ project: PROJET, ticket, author: "github", type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority, createdAt, url: `https://exemple.test/${ticket}`, card } });
  });
  const ordre = () => lireRail(journal.base).map(({ ticket }) => ticket);
  const rail = () => ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000 });
  return { journal, ordre, rail };
}

test("le rail se sert par priorité, `prio:1` d'abord, puis sans priorité ; à priorité égale, le plus ancien d'abord", (t) => {
  const { ordre, rail } = cuisine(t, { ticket: 20, priority: null }, { ticket: 21, priority: 2 }, { ticket: 22, priority: 1 }, { ticket: 23, priority: 2 }, { ticket: 24, priority: 1 });

  assert.deepEqual(ordre(), [22, 24, 21, 23, 20]);
  const station = rail();
  assert.deepEqual(["a", "b", "c", "d", "e"].map((nom) => station.prendre(nom)?.ticket), [22, 24, 21, 23, 20]);
});

test("changer le label `prio:` d'un ticket le fait changer de place : il se range par son âge dans sa nouvelle priorité", (t) => {
  const { journal, ordre } = cuisine(t, { ticket: 10, priority: 2 }, { ticket: 11, priority: 2 }, { ticket: 12, priority: 3 });

  journal.ajouter({ project: PROJET, ticket: 12, author: "github", type: "ticket.changed", payload: { title: "Ticket 12", priority: 1 } });
  assert.deepEqual(ordre(), [12, 10, 11]);

  journal.ajouter({ project: PROJET, ticket: 12, author: "github", type: "ticket.changed", payload: { title: "Ticket 12", priority: 2 } });
  assert.deepEqual(ordre(), [10, 11, 12]);

  journal.ajouter({ project: PROJET, ticket: 10, author: "github", type: "ticket.changed", payload: { title: "Ticket 10", priority: null } });
  assert.deepEqual(ordre(), [11, 12, 10]);
});

test("un ticket qui en attend un autre n'est jamais servi avant lui, même si sa priorité le met devant", (t) => {
  const { ordre, rail } = cuisine(t, { ticket: 10, priority: 3 }, { ticket: 11, priority: 1, waitsFor: [10] });
  assert.deepEqual(ordre(), [11, 10]);

  const station = rail();
  assert.equal(station.prendre("a")?.ticket, 10);
  assert.equal(station.prendre("b"), null);
  station.envoyerEnPass(10, "a");
  station.servir(10);
  assert.equal(station.prendre("b")?.ticket, 11);
});

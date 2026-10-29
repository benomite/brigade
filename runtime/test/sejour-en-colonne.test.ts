// Le séjour d'un ticket pris dans sa colonne (#1893) : il commence à la première prise et court à travers
// les relances qui suivent la fin d'un cook ; il recommence quand le ticket a quitté la colonne.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

function cuisine(t: TestContext) {
  let instant = new Date(`${JOUR_HORLOGE}T16:00:00.000Z`);
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => instant });
  t.after(() => journal.fermer());
  const noter = (heure: string, fait: Fait, ticket: number | null = 1834) => {
    instant = new Date(`${JOUR_HORLOGE}T${heure}.000Z`);
    journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  };
  const arriver = (heure: string) =>
    noter(heure, { type: "ticket.arrived", payload: { title: "Ticket 1834", priority: 1, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/1834" } });
  const prendre = (heure: string) => noter(heure, { type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T23:00:00.000Z` } });
  const finir = (heure: string, run: string, outcome: "ok" | "failed" | "guard", cause?: "stop") =>
    noter(heure, { type: "cook.exited", payload: { run, outcome, code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, ...(cause ? { cause } : {}) } });
  const carte = (heure = "18:00:00") => {
    const maintenant = new Date(`${JOUR_HORLOGE}T${heure}.000Z`);
    return faits(lireEtat(journal, maintenant), maintenant).rail.find((ticket) => ticket.ticket === 1834);
  };
  return { noter, arriver, prendre, finir, carte };
}

test("la séquence de #1834 : le séjour part de la première prise, trois essais, les deux premiers avec leur motif d'arrêt, le dernier en cours", (t) => {
  const { noter, arriver, prendre, finir, carte } = cuisine(t);
  arriver("16:30:00");
  prendre("16:34:00");
  noter("16:50:00", { type: "guard.tripped", payload: { run: "r1", reason: "turns", limit: 100, observed: 100 } });
  finir("16:51:00", "r1", "guard");
  prendre("16:52:00");
  finir("17:06:00", "r2", "failed");
  prendre("17:07:00");

  const ticket = carte();
  assert.equal(ticket?.etat, "pris");
  assert.equal(ticket?.depuis, `${JOUR_HORLOGE}T16:34:00.000Z`);
  assert.deepEqual(ticket?.essais, [
    { depuis: `${JOUR_HORLOGE}T16:34:00.000Z`, jusqua: `${JOUR_HORLOGE}T16:51:00.000Z`, arret: "turns", enCours: false },
    { depuis: `${JOUR_HORLOGE}T16:52:00.000Z`, jusqua: `${JOUR_HORLOGE}T17:06:00.000Z`, arret: "failed", enCours: false },
    { depuis: `${JOUR_HORLOGE}T17:07:00.000Z`, jusqua: null, arret: null, enCours: true },
  ]);
});

test("un ticket pris une seule fois a un seul essai, et son séjour part de cette prise", (t) => {
  const { arriver, prendre, carte } = cuisine(t);
  arriver("16:30:00");
  prendre("16:34:00");

  const ticket = carte();
  assert.equal(ticket?.depuis, `${JOUR_HORLOGE}T16:34:00.000Z`);
  assert.deepEqual(ticket?.essais, [{ depuis: `${JOUR_HORLOGE}T16:34:00.000Z`, jusqua: null, arret: null, enCours: true }]);
});

test("un ticket qui quitte la colonne puis y rentre commence un nouveau séjour", (t) => {
  const { noter, arriver, prendre, finir, carte } = cuisine(t);
  arriver("16:30:00");
  prendre("16:34:00");
  finir("16:40:00", "r1", "ok");
  noter("16:41:00", { type: "ticket.passing", payload: { station: "box/claude" } });
  noter("16:50:00", { type: "ticket.released", payload: { reason: "renvoi", station: null } });
  prendre("17:00:00");

  const ticket = carte();
  assert.equal(ticket?.depuis, `${JOUR_HORLOGE}T17:00:00.000Z`);
  assert.deepEqual(ticket?.essais, [{ depuis: `${JOUR_HORLOGE}T17:00:00.000Z`, jusqua: null, arret: null, enCours: true }]);
});

test("un cook mort avec le runtime est un essai arrêté `interrupted`, et la relance continue le séjour", (t) => {
  const { noter, arriver, prendre, carte } = cuisine(t);
  arriver("16:30:00");
  prendre("16:34:00");
  noter("16:45:00", { type: "cook.interrupted", payload: { run: "r1" } });
  prendre("16:46:00");

  const ticket = carte();
  assert.equal(ticket?.depuis, `${JOUR_HORLOGE}T16:34:00.000Z`);
  assert.equal(ticket?.essais?.[0]?.arret, "interrupted");
  assert.equal(ticket?.essais?.[1]?.enCours, true);
});

test("un ticket qui n'est pas pris n'a pas d'essais, et garde son `depuis`", (t) => {
  const { arriver, carte } = cuisine(t);
  arriver("16:30:00");

  const ticket = carte();
  assert.equal(ticket?.depuis, `${JOUR_HORLOGE}T16:30:00.000Z`);
  assert.equal("essais" in (ticket ?? {}), false);
});

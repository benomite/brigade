// Retirer un ticket du rail et changer sa priorité : les cas acceptés, les cas
// refusés, et ce que chaque geste dit de son prix.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { changerPriorite, retirerDuRail } from "../src/geste-ticket.ts";
import type { GitHub, Issue } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail, sortDuTicket, ticketDuRail } from "../src/projections/rail.ts";
import { DEPOT, repertoireTemporaire } from "./outils.ts";

const PROJET = "brigade";

const issue = (number: number, labels: string[]): Issue => ({
  number,
  title: `Ticket ${number}`,
  labels,
  state: "open",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-08T09:00:00Z",
  url: `https://github.com/${DEPOT}/issues/${number}`,
});

function cuisine(t: TestContext, ...issues: Issue[]) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const etat = new Map(issues.map((i) => [i.number, i]));
  const ecrits: string[] = [];
  const github = {
    issue: async (numero: number) => etat.get(numero) ?? null,
    async labelliser(numero: number, labels: string[]) {
      ecrits.push(`+${numero}:${labels.join(",")}`);
      const i = etat.get(numero);
      if (i) etat.set(numero, { ...i, labels: [...i.labels, ...labels] });
    },
    async delabelliser(numero: number, label: string) {
      ecrits.push(`-${numero}:${label}`);
      const i = etat.get(numero);
      if (i) etat.set(numero, { ...i, labels: i.labels.filter((l) => l !== label) });
    },
  } as unknown as GitHub;
  for (const i of issues) {
    journal.ajouter({
      project: PROJET,
      ticket: i.number,
      author: "github",
      type: "ticket.arrived",
      payload: { title: i.title, priority: null, createdAt: i.createdAt, url: i.url, model: "sonnet", effort: "medium" },
    });
  }
  const prendre = (ticket: number) => journal.ajouter({ project: PROJET, ticket, author: "runtime", type: "ticket.taken", payload: { station: "cuisine-1", leaseUntil: "2099-01-01T00:00:00Z" } });
  return { journal, github, ecrits, etat, prendre };
}

test("retirer un ticket en attente le fait disparaître du rail, et dit son prix", async (t) => {
  const { journal, github, ecrits, etat } = cuisine(t, issue(7, ["fire", "prio:2"]));
  const r = await retirerDuRail(journal, github, PROJET, 7);
  assert.equal(r.done, true);
  assert.match(r.price, /leaves the rail/);
  assert.deepEqual(ecrits, ["-7:fire"]);
  assert.ok(!etat.get(7)?.labels.includes("fire"));
  assert.deepEqual(lireRail(journal.base).map((x) => x.ticket), []);
  assert.deepEqual(sortDuTicket(journal.base, 7)?.reason, "unfired");
});

test("retirer un ticket bloqué par un ticket abandonné est accepté", async (t) => {
  const { journal, github } = cuisine(t, issue(8, ["fire"]));
  journal.ajouter({
    project: PROJET,
    ticket: 8,
    author: "github",
    type: "ticket.changed",
    payload: { title: "T", priority: null, model: "sonnet", effort: "medium", card: { waitsFor: [9], zone: [], problems: [] } },
  });
  journal.ajouter({ project: PROJET, ticket: 9, author: "github", type: "ticket.left", payload: { reason: "closed" } });
  const r = await retirerDuRail(journal, github, PROJET, 8);
  assert.equal(r.done, true);
});

test("retirer un ticket au travail ou en pass est refusé, lisiblement, sans rien toucher", async (t) => {
  const { journal, github, ecrits, prendre } = cuisine(t, issue(7, ["fire"]), issue(8, ["fire"]));
  prendre(7);
  const r = await retirerDuRail(journal, github, PROJET, 7);
  assert.equal(r.done, false);
  assert.match(r.done ? "" : r.reason, /#7 is pris: a ticket in progress is not touched/);
  assert.match(r.price, /nothing was changed/);

  prendre(8);
  journal.ajouter({ project: PROJET, ticket: 8, author: "station", type: "ticket.passed", payload: { station: "cuisine-1" } } as never);
  const pass = await retirerDuRail(journal, github, PROJET, 8);
  assert.equal(pass.done, false);
  assert.deepEqual(ecrits, []);
  assert.equal(ticketDuRail(journal.base, 7)?.state, "taken");
});

test("retirer un ticket qui n'est pas sur le rail est refusé", async (t) => {
  const { journal, github, ecrits } = cuisine(t);
  const r = await retirerDuRail(journal, github, PROJET, 99);
  assert.deepEqual(r, { done: false, reason: "#99 is not on the rail", price: "none: nothing was changed" });
  assert.deepEqual(ecrits, []);
});

test("changer la priorité met à jour le ticket, remplace le label de l'issue et dit son prix", async (t) => {
  const { journal, github, ecrits, etat } = cuisine(t, issue(7, ["fire", "prio:3", "model:sonnet"]));
  const r = await changerPriorite(journal, github, PROJET, 7, 1);
  assert.equal(r.done, true);
  assert.match(r.price, /^none:/);
  assert.equal(ticketDuRail(journal.base, 7)?.priority, 1);
  assert.deepEqual(ecrits, ["+7:prio:1", "-7:prio:3"]);
  assert.deepEqual(etat.get(7)?.labels.sort(), ["fire", "model:sonnet", "prio:1"]);
});

test("changer la priorité vaut pour un ticket au travail, et null la retire", async (t) => {
  const { journal, github, prendre } = cuisine(t, issue(7, ["fire", "prio:2"]));
  prendre(7);
  assert.equal((await changerPriorite(journal, github, PROJET, 7, 5)).done, true);
  assert.equal(ticketDuRail(journal.base, 7)?.priority, 5);
  assert.equal((await changerPriorite(journal, github, PROJET, 7, null)).done, true);
  assert.equal(ticketDuRail(journal.base, 7)?.priority, null);
});

test("une priorité invalide est refusée avec sa raison, rien n'est modifié", async (t) => {
  const { journal, github, ecrits } = cuisine(t, issue(7, ["fire", "prio:2"]));
  for (const mauvaise of [0, 10, 1.5, "1", -1, undefined, Number.NaN]) {
    const r = await changerPriorite(journal, github, PROJET, 7, mauvaise);
    assert.equal(r.done, false);
    assert.match(r.done ? "" : r.reason, /is not valid: expected a whole number from 1 to 9/);
    assert.match(r.price, /nothing was changed/);
  }
  assert.deepEqual(ecrits, []);
  assert.equal(ticketDuRail(journal.base, 7)?.priority, null);
});

test("changer la priorité d'un ticket absent du rail est refusé", async (t) => {
  const { journal, github } = cuisine(t);
  const r = await changerPriorite(journal, github, PROJET, 5, 2);
  assert.equal(r.done, false);
});

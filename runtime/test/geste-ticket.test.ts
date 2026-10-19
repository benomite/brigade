// Retirer un ticket du rail, changer sa priorité, merger la livraison qui attend
// le chef : les cas acceptés, les cas refusés, et ce que chaque geste dit de son prix.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { changerPriorite, mergeTheDelivery, retirerDuRail } from "../src/geste-ticket.ts";
import type { GitHub, Issue, Merge, PR } from "../src/github.ts";
import { openLog } from "../src/log.ts";
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

function kitchen(t: TestContext, ...issues: Issue[]) {
  const log = openLog(repertoireTemporaire(t));
  t.after(() => log.fermer());
  const etat = new Map(issues.map((i) => [i.number, i]));
  const ecrits: string[] = [];
  // Les PR de GitHub, par branche, et ce que GitHub répond à un merge.
  const prs = new Map<string, PR>();
  let reponseAuMerge: Merge = { fait: true };
  const github = {
    prDeBranche: async (branche: string) => prs.get(branche) ?? null,
    async merger(numero: number, sha: string) {
      ecrits.push(`merge ${numero}@${sha}`);
      return reponseAuMerge;
    },
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
    log.ajouter({
      project: PROJET,
      ticket: i.number,
      author: "github",
      type: "ticket.arrived",
      payload: { title: i.title, priority: null, createdAt: i.createdAt, url: i.url, model: "sonnet", effort: "medium" },
    });
  }
  const prendre = (ticket: number) => log.ajouter({ project: PROJET, ticket, author: "runtime", type: "ticket.taken", payload: { station: "cuisine-1", leaseUntil: "2099-01-01T00:00:00Z" } });
  // Le ticket jusqu'à la pass, livré sur sa branche avec sa PR, comme la pass l'écrit.
  const livrer = (ticket: number) => {
    prendre(ticket);
    const branch = `cook/${ticket}-aa`;
    log.ajouter({ project: PROJET, ticket, author: "runtime", type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITES, stream: `runs/${ticket}-aa.jsonl`, branch, worktree: `worktrees/${ticket}-aa` } });
    log.ajouter({ project: PROJET, ticket, author: "runtime", type: "cook.exited", payload: { run: `${ticket}-aa`, outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } });
    log.ajouter({ project: PROJET, ticket, author: "station:cuisine-1", type: "ticket.passing", payload: { station: "cuisine-1" } });
    log.ajouter({ project: PROJET, ticket, author: "pass", type: "pass.started", payload: { run: `${ticket}-aa`, pr: prDe(ticket), number: 100 + ticket, sha: `sha-${ticket}` } });
    prs.set(branch, { number: 100 + ticket, url: prDe(ticket), base: "v2", sha: `sha-${ticket}`, state: "open", merged: false, enRetard: false, mergeePar: null });
  };
  const arreter = (ticket: number) => log.ajouter({ project: PROJET, ticket, author: "pass", type: "pass.held", payload: { reason: "no-grant" } });
  const remonter = (ticket: number) => {
    log.ajouter({ project: PROJET, ticket, author: "pass", type: "pass.escalated", payload: { reason: "returns-exhausted" } } as never);
    log.ajouter({ project: PROJET, ticket, author: "runtime", type: "ticket.86", payload: { reason: "pass:returns-exhausted", until: null } });
  };
  const repondre = (merge: Merge) => {
    reponseAuMerge = merge;
  };
  return { journal: log, github, ecrits, etat, prendre, livrer, arreter, remonter, prs, repondre };
}

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const prDe = (ticket: number) => `https://github.com/${DEPOT}/pull/${100 + ticket}`;

test("retirer un ticket en attente le fait disparaître du rail, et dit son prix", async (t) => {
  const { journal: log, github, ecrits, etat } = kitchen(t, issue(7, ["fire", "prio:2"]));
  const r = await retirerDuRail(log, github, PROJET, 7);
  assert.equal(r.done, true);
  assert.match(r.price, /leaves the rail/);
  assert.deepEqual(ecrits, ["-7:fire"]);
  assert.ok(!etat.get(7)?.labels.includes("fire"));
  assert.deepEqual(lireRail(log.base).map((x) => x.ticket), []);
  assert.deepEqual(sortDuTicket(log.base, 7)?.reason, "unfired");
});

test("retirer un ticket bloqué par un ticket abandonné est accepté", async (t) => {
  const { journal: log, github } = kitchen(t, issue(8, ["fire"]));
  log.ajouter({
    project: PROJET,
    ticket: 8,
    author: "github",
    type: "ticket.changed",
    payload: { title: "T", priority: null, model: "sonnet", effort: "medium", card: { waitsFor: [9], zone: [], problems: [] } },
  });
  log.ajouter({ project: PROJET, ticket: 9, author: "github", type: "ticket.left", payload: { reason: "closed" } });
  const r = await retirerDuRail(log, github, PROJET, 8);
  assert.equal(r.done, true);
});

test("retirer un ticket au travail ou en pass est refusé, lisiblement, sans rien toucher", async (t) => {
  const { journal: log, github, ecrits, prendre } = kitchen(t, issue(7, ["fire"]), issue(8, ["fire"]));
  prendre(7);
  const r = await retirerDuRail(log, github, PROJET, 7);
  assert.equal(r.done, false);
  assert.match(r.done ? "" : r.reason, /#7 is taken: a ticket in progress is not touched/);
  assert.match(r.price, /nothing was changed/);

  prendre(8);
  log.ajouter({ project: PROJET, ticket: 8, author: "station", type: "ticket.passed", payload: { station: "cuisine-1" } } as never);
  const pass = await retirerDuRail(log, github, PROJET, 8);
  assert.equal(pass.done, false);
  assert.deepEqual(ecrits, []);
  assert.equal(ticketDuRail(log.base, 7)?.state, "taken");
});

test("retirer un ticket qui n'est pas sur le rail est refusé", async (t) => {
  const { journal: log, github, ecrits } = kitchen(t);
  const r = await retirerDuRail(log, github, PROJET, 99);
  assert.deepEqual(r, { done: false, reason: "#99 is not on the rail", price: "none: nothing was changed" });
  assert.deepEqual(ecrits, []);
});

test("changer la priorité met à jour le ticket, remplace le label de l'issue et dit son prix", async (t) => {
  const { journal: log, github, ecrits, etat } = kitchen(t, issue(7, ["fire", "prio:3", "model:sonnet"]));
  const r = await changerPriorite(log, github, PROJET, 7, 1);
  assert.equal(r.done, true);
  assert.match(r.price, /^none:/);
  assert.equal(ticketDuRail(log.base, 7)?.priority, 1);
  assert.deepEqual(ecrits, ["+7:prio:1", "-7:prio:3"]);
  assert.deepEqual(etat.get(7)?.labels.sort(), ["fire", "model:sonnet", "prio:1"]);
});

test("changer la priorité vaut pour un ticket au travail, et null la retire", async (t) => {
  const { journal: log, github, prendre } = kitchen(t, issue(7, ["fire", "prio:2"]));
  prendre(7);
  assert.equal((await changerPriorite(log, github, PROJET, 7, 5)).done, true);
  assert.equal(ticketDuRail(log.base, 7)?.priority, 5);
  assert.equal((await changerPriorite(log, github, PROJET, 7, null)).done, true);
  assert.equal(ticketDuRail(log.base, 7)?.priority, null);
});

test("une priorité invalide est refusée avec sa raison, rien n'est modifié", async (t) => {
  const { journal: log, github, ecrits } = kitchen(t, issue(7, ["fire", "prio:2"]));
  for (const mauvaise of [0, 10, 1.5, "1", -1, undefined, Number.NaN]) {
    const r = await changerPriorite(log, github, PROJET, 7, mauvaise);
    assert.equal(r.done, false);
    assert.match(r.done ? "" : r.reason, /is not valid: expected a whole number from 1 to 9/);
    assert.match(r.price, /nothing was changed/);
  }
  assert.deepEqual(ecrits, []);
  assert.equal(ticketDuRail(log.base, 7)?.priority, null);
});

test("changer la priorité d'un ticket absent du rail est refusé", async (t) => {
  const { journal: log, github } = kitchen(t);
  const r = await changerPriorite(log, github, PROJET, 5, 2);
  assert.equal(r.done, false);
});

test("retirer un ticket remonté (86) ou une livraison verte qui attend le chef est accepté : rien n'y est en cours", async (t) => {
  const { journal: log, github, ecrits, livrer, arreter, remonter } = kitchen(t, issue(7, ["fire"]), issue(8, ["fire"]));
  livrer(7);
  remonter(7);
  assert.equal(ticketDuRail(log.base, 7)?.state, "86");
  assert.equal((await retirerDuRail(log, github, PROJET, 7)).done, true);
  livrer(8);
  arreter(8);
  assert.equal(ticketDuRail(log.base, 8)?.state, "pass");
  assert.equal((await retirerDuRail(log, github, PROJET, 8)).done, true);
  assert.deepEqual(ecrits, ["-7:fire", "-8:fire"]);
});

test("merger la livraison qui attend le chef la merge sur GitHub, à la tête que la PR porte, et dit son prix", async (t) => {
  const { journal: log, github, ecrits, livrer, arreter, remonter } = kitchen(t, issue(7, ["fire"]), issue(8, ["fire"]));
  livrer(7);
  arreter(7);
  const r = await mergeTheDelivery(log, github, 7);
  assert.equal(r.done, true);
  assert.match(r.price, /merged into v2/);
  // Remontée rouge, avec sa PR : la file dit « merger à la main », le geste le fait.
  livrer(8);
  remonter(8);
  assert.equal((await mergeTheDelivery(log, github, 8)).done, true);
  assert.deepEqual(ecrits, ["merge 107@sha-7", "merge 108@sha-8"]);
});

test("merger est refusé sans rien toucher : pas de livraison qui attend le chef, PR fermée ou déjà mergée, refus de GitHub", async (t) => {
  const { journal: log, github, ecrits, livrer, arreter, prs, repondre } = kitchen(t, issue(7, ["fire"]), issue(8, ["fire"]));
  assert.deepEqual(await mergeTheDelivery(log, github, 7), { done: false, reason: "#7 has no delivery waiting for you to merge it", price: "none: nothing was changed" });
  // En pass, la pass la juge : ce n'est pas au chef de la merger.
  livrer(7);
  assert.equal((await mergeTheDelivery(log, github, 7)).done, false);
  arreter(7);
  prs.set("cook/7-aa", { ...prs.get("cook/7-aa")!, state: "closed" });
  assert.match((await mergeTheDelivery(log, github, 7) as { reason: string }).reason, /is closed/);
  prs.set("cook/7-aa", { ...prs.get("cook/7-aa")!, state: "closed", merged: true });
  assert.match((await mergeTheDelivery(log, github, 7) as { reason: string }).reason, /already merged/);
  assert.deepEqual(ecrits, []);
  livrer(8);
  arreter(8);
  repondre({ fait: false, motif: "HTTP 405 — Pull Request is not mergeable" });
  const refus = await mergeTheDelivery(log, github, 8);
  assert.equal(refus.done, false);
  assert.match((refus as { reason: string }).reason, /GitHub refused the merge of .*pull\/108: HTTP 405 — Pull Request is not mergeable/);
  assert.match(refus.price, /nothing was changed/);
});

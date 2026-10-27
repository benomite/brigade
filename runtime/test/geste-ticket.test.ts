// Retirer un ticket du rail, merger la livraison qui attend le chef, la renvoyer
// à un cook, dire pourquoi il l'a corrigée : les cas acceptés, les cas refusés,
// et ce que chaque geste dit de son prix.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { carnetDuProjet } from "../src/apprentissage/provisoires.ts";
import { corrigerLaLivraison, mergerLaLivraison, renvoyerLaLivraison, RENVOI_DU_CHEF, RENVOI_SANS_RAISON, retirerDuRail } from "../src/geste-ticket.ts";
import { renvoiEnAttente } from "../src/projections/pass.ts";
import type { GitHub, Issue, Merge, PR } from "../src/github.ts";
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
    journal.ajouter({
      project: PROJET,
      ticket: i.number,
      author: "github",
      type: "ticket.arrived",
      payload: { title: i.title, priority: null, createdAt: i.createdAt, url: i.url, model: "sonnet", effort: "medium" },
    });
  }
  const prendre = (ticket: number) => journal.ajouter({ project: PROJET, ticket, author: "runtime", type: "ticket.taken", payload: { station: "cuisine-1", leaseUntil: "2099-01-01T00:00:00Z" } });
  // Le ticket jusqu'à la pass, livré sur sa branche avec sa PR, comme la pass l'écrit.
  const livrer = (ticket: number) => {
    prendre(ticket);
    const branch = `cook/${ticket}-aa`;
    journal.ajouter({ project: PROJET, ticket, author: "runtime", type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITES, stream: `runs/${ticket}-aa.jsonl`, branch, worktree: `worktrees/${ticket}-aa` } });
    journal.ajouter({ project: PROJET, ticket, author: "runtime", type: "cook.exited", payload: { run: `${ticket}-aa`, outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } });
    journal.ajouter({ project: PROJET, ticket, author: "station:cuisine-1", type: "ticket.passing", payload: { station: "cuisine-1" } });
    journal.ajouter({ project: PROJET, ticket, author: "pass", type: "pass.started", payload: { run: `${ticket}-aa`, pr: prDe(ticket), number: 100 + ticket, sha: `sha-${ticket}` } });
    prs.set(branch, { number: 100 + ticket, url: prDe(ticket), base: "v2", sha: `sha-${ticket}`, state: "open", merged: false, enRetard: false, mergeePar: null });
  };
  const arreter = (ticket: number) => journal.ajouter({ project: PROJET, ticket, author: "pass", type: "pass.held", payload: { reason: "no-grant" } });
  // Une remontée que seul le chef lève — les secrets du projet manquent : une remontée technique
  // est à la cuisine, elle n'attend pas le chef (#1826).
  const remonter = (ticket: number) => {
    journal.ajouter({ project: PROJET, ticket, author: "pass", type: "pass.escalated", payload: { reason: "unjudged", cause: "secrets-unavailable" } });
    journal.ajouter({ project: PROJET, ticket, author: "runtime", type: "ticket.86", payload: { reason: "pass:unjudged", until: null } });
  };
  const repondre = (merge: Merge) => {
    reponseAuMerge = merge;
  };
  return { journal, github, ecrits, etat, prendre, livrer, arreter, remonter, prs, repondre };
}

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const prDe = (ticket: number) => `https://github.com/${DEPOT}/pull/${100 + ticket}`;

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
  assert.match(r.done ? "" : r.reason, /#7 is taken: a ticket in progress is not touched/);
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

test("retirer un ticket remonté (86) ou une livraison verte qui attend le chef est accepté : rien n'y est en cours", async (t) => {
  const { journal, github, ecrits, livrer, arreter, remonter } = cuisine(t, issue(7, ["fire"]), issue(8, ["fire"]));
  livrer(7);
  remonter(7);
  assert.equal(ticketDuRail(journal.base, 7)?.state, "86");
  assert.equal((await retirerDuRail(journal, github, PROJET, 7)).done, true);
  livrer(8);
  arreter(8);
  assert.equal(ticketDuRail(journal.base, 8)?.state, "pass");
  assert.equal((await retirerDuRail(journal, github, PROJET, 8)).done, true);
  assert.deepEqual(ecrits, ["-7:fire", "-8:fire"]);
});

test("merger la livraison qui attend le chef la merge sur GitHub, à la tête que la PR porte, et dit son prix", async (t) => {
  const { journal, github, ecrits, livrer, arreter, remonter } = cuisine(t, issue(7, ["fire"]), issue(8, ["fire"]));
  livrer(7);
  arreter(7);
  const r = await mergerLaLivraison(journal, github, 7);
  assert.equal(r.done, true);
  assert.match(r.price, /merged into v2/);
  // Remontée au chef, avec sa PR : la file dit « merger à la main », le geste le fait.
  livrer(8);
  remonter(8);
  assert.equal((await mergerLaLivraison(journal, github, 8)).done, true);
  assert.deepEqual(ecrits, ["merge 107@sha-7", "merge 108@sha-8"]);
});

test("merger est refusé sans rien toucher : pas de livraison qui attend le chef, PR fermée ou déjà mergée, refus de GitHub", async (t) => {
  const { journal, github, ecrits, livrer, arreter, prs, repondre } = cuisine(t, issue(7, ["fire"]), issue(8, ["fire"]));
  assert.deepEqual(await mergerLaLivraison(journal, github, 7), { done: false, reason: "#7 has no delivery waiting for you to merge it", price: "none: nothing was changed" });
  // En pass, la pass la juge : ce n'est pas au chef de la merger.
  livrer(7);
  assert.equal((await mergerLaLivraison(journal, github, 7)).done, false);
  arreter(7);
  prs.set("cook/7-aa", { ...prs.get("cook/7-aa")!, state: "closed" });
  assert.match((await mergerLaLivraison(journal, github, 7) as { reason: string }).reason, /is closed/);
  prs.set("cook/7-aa", { ...prs.get("cook/7-aa")!, state: "closed", merged: true });
  assert.match((await mergerLaLivraison(journal, github, 7) as { reason: string }).reason, /already merged/);
  assert.deepEqual(ecrits, []);
  livrer(8);
  arreter(8);
  repondre({ fait: false, motif: "HTTP 405 — Pull Request is not mergeable" });
  const refus = await mergerLaLivraison(journal, github, 8);
  assert.equal(refus.done, false);
  assert.match((refus as { reason: string }).reason, /GitHub refused the merge of .*pull\/108: HTTP 405 — Pull Request is not mergeable/);
  assert.match(refus.price, /nothing was changed/);
});

const candidates = (journal: ReturnType<typeof ouvrirJournal>, ticket: number) => journal.duTicket(ticket).filter((e) => e.type === "lesson.candidate").map((e) => [e.author, e.payload]);

test("renvoyer la livraison qui attend le chef la rend à un cook, sa raison en finding, et fait de la raison une leçon candidate « chef-correction »", async (t) => {
  const { journal, ecrits, livrer, arreter, remonter } = cuisine(t, issue(7, ["fire"]), issue(8, ["fire"]));
  livrer(7);
  arreter(7);
  const r = renvoyerLaLivraison(journal, PROJET, 7, "  Le test   ne prouve rien :\n il ne rougit pas sans le correctif. ");
  assert.equal(r.done, true);
  assert.match(r.price, /a cook is launched again on cook\/7-aa.*pull\/107 stays open.*Your reason becomes a candidate lesson/);
  const raison = "Le test ne prouve rien : il ne rougit pas sans le correctif.";
  // Le ticket revient en attente sur le rail, et la station reprendra sa branche, la raison en finding.
  assert.equal(ticketDuRail(journal.base, 7)?.state, "waiting");
  assert.deepEqual(journal.duTicket(7).filter((e) => e.type === "ticket.released").map((e) => [e.author, e.payload.reason]), [["chef", RENVOI_DU_CHEF]]);
  const renvoi = renvoiEnAttente(journal.base, 7);
  assert.deepEqual([renvoi?.branch, renvoi?.returns, renvoi?.findings], ["cook/7-aa", 1, [`Le chef a renvoyé cette livraison : ${raison}`]]);
  assert.deepEqual(candidates(journal, 7), [["chef", { origin: "chef-correction", text: raison }]]);
  const [lecon] = carnetDuProjet(journal.base, PROJET).lecons;
  assert.deepEqual([lecon?.texte, lecon?.statut, lecon?.origin], [raison, "provisoire", { kind: "chef-correction", ticket: 7 }]);
  // Remontée au chef : il la renvoie à un cook.
  livrer(8);
  remonter(8);
  assert.equal(renvoyerLaLivraison(journal, PROJET, 8, "Couvrir le cas d'erreur.").done, true);
  assert.equal(ticketDuRail(journal.base, 8)?.state, "waiting");
  assert.deepEqual(carnetDuProjet(journal.base, PROJET).lecons.map((l) => l.origin), [{ kind: "chef-correction", ticket: 7 }, { kind: "chef-correction", ticket: 8 }]);
  assert.deepEqual(ecrits, []);
});

test("renvoyer sans raison rend la livraison à un cook, mais ne fait naître aucune leçon", async (t) => {
  const { journal, livrer, arreter } = cuisine(t, issue(7, ["fire"]));
  livrer(7);
  arreter(7);
  const r = renvoyerLaLivraison(journal, PROJET, 7, "   ");
  assert.equal(r.done, true);
  assert.match(r.price, /No reason given: no lesson is drawn from it/);
  assert.deepEqual(renvoiEnAttente(journal.base, 7)?.findings, [RENVOI_SANS_RAISON]);
  assert.deepEqual(candidates(journal, 7), []);
  assert.deepEqual(carnetDuProjet(journal.base, PROJET).lecons, []);
});

test("renvoyer est refusé sans rien écrire : pas de livraison qui attend le chef, une livraison que la pass juge, une raison trop longue", async (t) => {
  const { journal, livrer, arreter } = cuisine(t, issue(7, ["fire"]));
  // Refusé, le geste n'écrit rien au journal.
  const refuse = (ticket: number, raison: string) => {
    const avant = journal.tout().length;
    const r = renvoyerLaLivraison(journal, PROJET, ticket, raison);
    assert.equal(journal.tout().length, avant);
    assert.equal(r.done, false);
    return (r as { reason: string }).reason;
  };
  assert.equal(refuse(7, "Une raison."), "#7 has no delivery waiting for you: only a delivery the pass holds for you — green and not merged, or escalated — is sent back");
  assert.equal(refuse(9, "Une raison."), "#9 is not on the rail");
  // En pass, la pass la juge : ce n'est pas au chef de la renvoyer.
  livrer(7);
  assert.match(refuse(7, "Une raison."), /has no delivery waiting for you/);
  arreter(7);
  assert.match(refuse(7, "mot ".repeat(120)), /the reason is 479 characters long: a lesson holds at most 400 — say it shorter/);
  assert.equal(ticketDuRail(journal.base, 7)?.state, "pass");
});

test("dire pourquoi le chef a corrigé une livraison en fait une leçon candidate « chef-correction », sans rien toucher d'autre — même servie", async (t) => {
  const { journal, ecrits, livrer, arreter } = cuisine(t, issue(7, ["fire"]));
  livrer(7);
  arreter(7);
  journal.ajouter({ project: PROJET, ticket: 7, author: "pass", type: "merge.done", payload: { pr: prDe(7), sha: "sha-7", by: "outside", reconciled: false } });
  journal.ajouter({ project: PROJET, ticket: 7, author: "pass", type: "ticket.served", payload: {} });
  const rail = () => JSON.stringify(ticketDuRail(journal.base, 7));
  const avant = rail();
  const r = corrigerLaLivraison(journal, PROJET, 7, "Une migration se rejoue : elle doit tenir deux passages.");
  assert.equal(r.done, true);
  assert.match(r.price, /candidate lesson of the project.*no cook is launched/);
  assert.equal(rail(), avant);
  assert.deepEqual(candidates(journal, 7), [["chef", { origin: "chef-correction", text: "Une migration se rejoue : elle doit tenir deux passages." }]]);
  const [lecon] = carnetDuProjet(journal.base, PROJET).lecons;
  assert.deepEqual([lecon?.texte, lecon?.origin, lecon?.entrees.map((e) => [e.genre, e.ticket])], ["Une migration se rejoue : elle doit tenir deux passages.", { kind: "chef-correction", ticket: 7 }, [["propose", 7]]]);
  assert.deepEqual(ecrits, []);
});

test("une correction sans raison, ou d'un ticket jamais livré, est refusée : aucune leçon", async (t) => {
  const { journal, livrer } = cuisine(t, issue(7, ["fire"]), issue(8, ["fire"]));
  livrer(7);
  assert.match((corrigerLaLivraison(journal, PROJET, 7, " \n ") as { reason: string }).reason, /a correction says what was wrong: give its reason/);
  assert.match((corrigerLaLivraison(journal, PROJET, 8, "Une raison.") as { reason: string }).reason, /#8 has never been delivered/);
  assert.deepEqual([...candidates(journal, 7), ...candidates(journal, 8)], []);
});

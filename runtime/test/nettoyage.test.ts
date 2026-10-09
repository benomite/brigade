// Le nettoyage des worktrees, sur un journal écrit à la main : qui est à
// retirer, ce qui est gardé et pourquoi, et ce que le chef en lit. Le dépôt et
// GitHub sont des doublures — les gestes git se vérifient dans depot.test.ts.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import type { PR } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirNettoyage } from "../src/nettoyage.ts";
import { worktreesGardes } from "../src/projections/nettoyage.ts";
import { DEPOT, horloge, repertoireTemporaire } from "./outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const STATION = "box/claude";
const pr = (numero: number) => `https://github.com/${DEPOT}/pull/${numero}`;

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (ticket: number, fait: Fait, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number) =>
    noter(ticket, { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: 1, createdAt: "2026-10-01T00:00:00Z", url: `https://exemple.test/${ticket}` } });
  // Un cook lancé dans son worktree, sur sa branche. `fini` : il a rendu la main.
  const lancer = (ticket: number, run: string, worktree = run) =>
    noter(ticket, {
      type: "cook.launched",
      payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: STATION, model: "sonnet", effort: "low", branch: `cook/${worktree}`, worktree: join("worktrees", worktree) },
    });
  const finir = (ticket: number, run: string, livree: string | null = null) => {
    noter(ticket, { type: "cook.exited", payload: { run, outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
    if (livree !== null) noter(ticket, { type: "cook.reported", payload: { run, ending: "done", reason: null, summary: null, branch: `cook/${run}`, pr: livree } });
  };
  // Un ticket arrivé, et ses cooks finis, chacun dans son worktree.
  const cuisiner = (ticket: number, ...runs: string[]) => {
    arriver(ticket);
    for (const run of runs) {
      lancer(ticket, run);
      finir(ticket, run);
    }
  };
  const servir = (ticket: number) => noter(ticket, { type: "ticket.served", payload: {} });
  const partir = (ticket: number) => noter(ticket, { type: "ticket.left", payload: { reason: "unfired" } });

  // Ce que le dépôt répond d'un worktree : ce qui y reste, une panne, ou rien — il part.
  const restes = new Map<string, string | Error>();
  const liberes: Array<[string, string]> = [];
  const prs = new Map<string, Partial<PR>>();
  const lectures: string[] = [];
  const commentaires: Array<[number, string]> = [];
  const avertissements: string[] = [];
  const pannes = { lecture: false };
  const nettoyer = ouvrirNettoyage({
    journal,
    projet: "brigade",
    repertoireEtat: repertoire,
    depot: {
      async liberer(worktree, branche) {
        liberes.push([worktree, branche]);
        const reste = restes.get(branche.slice("cook/".length)) ?? null;
        if (reste instanceof Error) throw reste;
        return reste;
      },
    },
    github: {
      async prDeBranche(branche) {
        if (pannes.lecture) throw new Error("gh api : HTTP 502");
        lectures.push(branche);
        const connue = prs.get(branche.slice("cook/".length));
        return connue ? { number: 101, url: pr(101), base: "v2", sha: "abc", state: "open", merged: false, mergeable: true, enRetard: false, ...connue } : null;
      },
      async commenter(ticket, corps) {
        commentaires.push([ticket, corps]);
      },
    },
    avertir: (message) => void avertissements.push(message),
  });
  const faits = (ticket: number) =>
    journal
      .duTicket(ticket)
      .filter((e) => e.type.startsWith("worktree."))
      .map((e) => [e.type, e.payload]);
  const chemin = (run: string) => join(repertoire, "worktrees", run);
  return { journal, noter, arriver, lancer, finir, cuisiner, servir, partir, restes, liberes, prs, lectures, commentaires, avertissements, pannes, nettoyer, faits, chemin };
}

test("un ticket servi : le worktree et la branche de chacun de ses cooks sont libérés, une fois, et le journal le dit", async (t) => {
  const { arriver, lancer, finir, servir, liberes, nettoyer, faits, chemin, lectures, avertissements } = cuisine(t);
  arriver(17);
  // Un premier cook échoue ; un second livre, puis un renvoi reprend son worktree.
  for (const [run, worktree] of [["17-aaa", "17-aaa"], ["17-bbb", "17-bbb"], ["17-ccc", "17-bbb"]] as const) {
    lancer(17, run, worktree);
    finir(17, run);
  }
  servir(17);

  await nettoyer(false);

  assert.deepEqual(liberes, [[chemin("17-aaa"), "cook/17-aaa"], [chemin("17-bbb"), "cook/17-bbb"]]);
  assert.deepEqual(faits(17), [
    ["worktree.removed", { worktree: "worktrees/17-aaa", branch: "cook/17-aaa" }],
    ["worktree.removed", { worktree: "worktrees/17-bbb", branch: "cook/17-bbb" }],
  ]);
  // Ni GitHub ni avertissement : un ticket servi n'a rien à faire dire.
  assert.deepEqual([lectures, avertissements], [[], []]);

  // Ce qui est retiré ne l'est pas deux fois.
  await nettoyer(true);
  assert.equal(liberes.length, 2);
});

test("rien n'est retiré tant que le ticket peut repartir, ni tant qu'un de ses cooks tourne encore", async (t) => {
  const { noter, cuisiner, lancer, finir, servir, partir, liberes, nettoyer, faits } = cuisine(t);
  // En attente après un cook raté, remonté au chef, et jamais arrivé sur le rail.
  cuisiner(14, "14-aaa");
  cuisiner(15, "15-aaa");
  noter(15, { type: "ticket.86", payload: { reason: "pass:returns-exhausted", until: null } });
  lancer(16, "16-aaa");
  finir(16, "16-aaa");
  // Parti du rail pendant son cook (#127), et servi pendant qu'un cook y tourne encore.
  cuisiner(17, "17-aaa");
  lancer(17, "17-bbb");
  partir(17);
  cuisiner(18, "18-aaa");
  lancer(18, "18-bbb");
  servir(18);

  await nettoyer(true);

  assert.deepEqual([liberes.length, faits(17).length, faits(18).length], [0, 0, 0]);

  // Le cook mort, le ticket se nettoie en entier.
  finir(17, "17-bbb");
  await nettoyer(false);
  assert.deepEqual(liberes.map(([, branche]) => branche), ["cook/17-aaa", "cook/17-bbb"]);
});

test("un ticket parti sans être servi garde le worktree de sa PR ouverte, le dit une fois, et le libère quand elle se ferme", async (t) => {
  const { arriver, lancer, finir, partir, journal, liberes, prs, lectures, nettoyer, faits, avertissements, commentaires } = cuisine(t);
  arriver(17);
  lancer(17, "17-aaa");
  finir(17, "17-aaa");
  lancer(17, "17-bbb");
  finir(17, "17-bbb", pr(101));
  partir(17);
  prs.set("17-bbb", { state: "open" });

  await nettoyer(true);

  // Le cook sans PR part sans lecture ; celui de la PR ouverte reste.
  assert.deepEqual(liberes.map(([, branche]) => branche), ["cook/17-aaa"]);
  assert.deepEqual(lectures, ["cook/17-bbb"]);
  const garde = { worktree: "worktrees/17-bbb", branch: "cook/17-bbb", reason: "pr-open", detail: pr(101) };
  assert.deepEqual(faits(17).at(-1), ["worktree.kept", garde]);
  assert.deepEqual(worktreesGardes(journal.base), [{ ticket: 17, ...garde, since: journal.duTicket(17).at(-1)?.at }]);
  assert.match(avertissements.join("\n"), /worktree du ticket #17 gardé \(worktrees\/17-bbb\).*PR encore ouverte/);

  // Entre deux ticks, GitHub n'est pas relu ; au tick, une fois — sans le redire.
  await nettoyer(false);
  await nettoyer(true);
  assert.deepEqual([lectures.length, faits(17).length, avertissements.length, liberes.length], [2, 2, 1, 1]);

  prs.set("17-bbb", { state: "closed" });
  await nettoyer(true);
  assert.deepEqual(faits(17).at(-1), ["worktree.removed", { worktree: "worktrees/17-bbb", branch: "cook/17-bbb" }]);
  assert.deepEqual(worktreesGardes(journal.base), []);
  // Une PR ouverte n'est pas un travail perdu : rien sur l'issue.
  assert.deepEqual(commentaires, []);
});

test("un ticket servi puis sorti du rail se nettoie sans lire GitHub, PR connue ou non", async (t) => {
  const { arriver, lancer, finir, servir, partir, liberes, lectures, nettoyer } = cuisine(t);
  arriver(17);
  lancer(17, "17-aaa");
  finir(17, "17-aaa", pr(101));
  servir(17);
  partir(17);

  await nettoyer(true);

  assert.deepEqual([liberes.length, lectures.length], [1, 0]);
});

test("à plusieurs PR ouvertes, un ticket parti n'en relit qu'une par tick, à tour de rôle", async (t) => {
  const { arriver, lancer, finir, partir, prs, lectures, nettoyer, faits } = cuisine(t);
  arriver(17);
  for (const run of ["17-aaa", "17-bbb"]) {
    lancer(17, run);
    finir(17, run, pr(101));
    prs.set(run, { state: "open" });
  }
  partir(17);

  await nettoyer(true);
  assert.deepEqual(lectures, ["cook/17-aaa"]);
  await nettoyer(true);
  await nettoyer(true);

  assert.deepEqual(lectures, ["cook/17-aaa", "cook/17-bbb", "cook/17-aaa"]);
  assert.deepEqual(faits(17).map(([type]) => type), ["worktree.kept", "worktree.kept"]);
});

test("un travail non poussé est gardé, jamais détruit : le journal, l'avertissement et un commentaire sur l'issue disent où il est", async (t) => {
  const { cuisiner, servir, journal, restes, liberes, commentaires, avertissements, nettoyer, faits, chemin } = cuisine(t);
  cuisiner(17, "17-aaa", "17-bbb", "17-ccc");
  servir(17);
  restes.set("17-aaa", "2 commits absents de l'origine");
  restes.set("17-bbb", "1 fichier modifié ou neuf, jamais commité (brouillon.txt)");

  await nettoyer(false);

  assert.deepEqual(faits(17), [
    ["worktree.kept", { worktree: "worktrees/17-aaa", branch: "cook/17-aaa", reason: "unpushed", detail: "2 commits absents de l'origine" }],
    ["worktree.kept", { worktree: "worktrees/17-bbb", branch: "cook/17-bbb", reason: "unpushed", detail: "1 fichier modifié ou neuf, jamais commité (brouillon.txt)" }],
    ["worktree.removed", { worktree: "worktrees/17-ccc", branch: "cook/17-ccc" }],
  ]);
  assert.equal(avertissements.length, 2);
  assert.match(avertissements[0] ?? "", /worktree du ticket #17 gardé \(worktrees\/17-aaa\).*travail non poussé.*2 commits absents de l'origine/);
  // Un commentaire pour le ticket, qui nomme chaque worktree gardé et dit quoi en faire.
  assert.equal(commentaires.length, 1);
  const [ticket, corps] = commentaires[0] ?? [0, ""];
  assert.equal(ticket, 17);
  assert.match(corps, /^\*\*Nettoyage — travail non poussé, gardé\.\*\*/);
  for (const attendu of [chemin("17-aaa"), "`cook/17-aaa`", "2 commits absents de l'origine", chemin("17-bbb"), "brouillon.txt", "git worktree remove --force", "git branch -D"]) {
    assert.ok(corps.includes(attendu), `le commentaire devrait dire « ${attendu} » :\n${corps}`);
  }
  assert.equal(corps.includes("17-ccc"), false);

  // Entre deux ticks il n'est pas réexaminé ; au tick, si — sans rien redire.
  await nettoyer(false);
  assert.equal(liberes.length, 3);
  await nettoyer(true);
  assert.deepEqual([liberes.length, faits(17).length, avertissements.length, commentaires.length], [5, 3, 2, 1]);

  // Le chef a poussé la branche, ou jeté le worktree : le tick suivant le constate.
  restes.clear();
  await nettoyer(true);
  assert.deepEqual(faits(17).slice(3).map(([type]) => type), ["worktree.removed", "worktree.removed"]);
  assert.deepEqual(worktreesGardes(journal.base), []);
});

test("un retrait qui échoue se dit avec ce que git en a dit, et se retente au tick", async (t) => {
  const { cuisiner, servir, journal, restes, liberes, avertissements, commentaires, nettoyer, faits } = cuisine(t);
  cuisiner(17, "17-aaa");
  cuisiner(18, "18-aaa");
  for (const ticket of [17, 18]) servir(ticket);
  restes.set("17-aaa", new Error("git worktree : fatal: verrou tenu"));

  await nettoyer(false);

  // L'échec d'un ticket n'empêche pas le suivant.
  assert.deepEqual(faits(18), [["worktree.removed", { worktree: "worktrees/18-aaa", branch: "cook/18-aaa" }]]);
  assert.deepEqual(faits(17), [["worktree.kept", { worktree: "worktrees/17-aaa", branch: "cook/17-aaa", reason: "failed", detail: "git worktree : fatal: verrou tenu" }]]);
  assert.match(avertissements.join("\n"), /worktree du ticket #17 gardé \(worktrees\/17-aaa\).*retrait en échec.*verrou tenu/);
  assert.deepEqual(worktreesGardes(journal.base).map(({ ticket, reason }) => [ticket, reason]), [[17, "failed"]]);
  assert.deepEqual(commentaires, []);

  restes.clear();
  await nettoyer(true);
  assert.equal(liberes.length, 3);
  assert.deepEqual(faits(17).at(-1), ["worktree.removed", { worktree: "worktrees/17-aaa", branch: "cook/17-aaa" }]);
});

test("GitHub injoignable : le worktree d'un ticket parti n'est ni retiré ni rangé, et c'est dit", async (t) => {
  const { arriver, lancer, finir, partir, pannes, liberes, avertissements, nettoyer, faits } = cuisine(t);
  arriver(17);
  lancer(17, "17-aaa");
  finir(17, "17-aaa", pr(101));
  partir(17);
  pannes.lecture = true;

  await nettoyer(true);

  assert.deepEqual([liberes, faits(17)], [[], []]);
  assert.match(avertissements.join("\n"), /nettoyage du ticket #17.*HTTP 502/);

  pannes.lecture = false;
  await nettoyer(true);
  assert.equal(liberes.length, 1);
});

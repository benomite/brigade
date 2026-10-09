// Le nettoyage des worktrees, sur un journal écrit à la main : ce qui se range
// à la fin d'un cook, ce que le rattrapage reprend, ce qui est gardé et ce que
// le chef en lit. Le dépôt est une doublure — les gestes git se vérifient dans
// depot.test.ts.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirNettoyage } from "../src/nettoyage.ts";
import { worktreesGardes } from "../src/projections/nettoyage.ts";
import { horloge, repertoireTemporaire } from "./outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const STATION = "box/claude";

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (ticket: number, fait: Fait, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  // Une vie du runtime commence : les cooks d'avant sont morts.
  const demarrer = () => journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "26" } });
  const arriver = (ticket: number) =>
    noter(ticket, { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: 1, createdAt: "2026-10-01T00:00:00Z", url: `https://exemple.test/${ticket}` } });
  // Un cook lancé dans son worktree, sur sa branche. `fini` : il a rendu la main.
  const lancer = (ticket: number, run: string, worktree = run) =>
    noter(ticket, {
      type: "cook.launched",
      payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: STATION, model: "sonnet", effort: "low", branch: `cook/${worktree}`, worktree: join("worktrees", worktree) },
    });
  const sortir = (ticket: number, run: string) =>
    noter(ticket, { type: "cook.exited", payload: { run, outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
  const raconter = (ticket: number, run: string, livree: string | null = null) =>
    noter(ticket, { type: "cook.reported", payload: { run, ending: "done", reason: null, summary: null, branch: `cook/${run}`, pr: livree } });
  // Le cook sort, et sa station raconte sa fin — avec la PR qu'elle a ouverte, s'il y en a une.
  const finir = (ticket: number, run: string, livree: string | null = null) => {
    sortir(ticket, run);
    raconter(ticket, run, livree);
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

  // Ce que le dépôt répond d'un worktree : le commit de ce qui y traînait, une
  // panne, ou rien — il part. Et d'une branche : vrai, elle est partie.
  const recoltes = new Map<string, string | Error>();
  const ranges: Array<[string, string]> = [];
  const pousses = new Map<string, boolean | Error>();
  const elaguees: string[] = [];
  const avertissements: string[] = [];
  const nettoyage = ouvrirNettoyage({
    journal,
    projet: "brigade",
    repertoireEtat: repertoire,
    depot: {
      async ranger(worktree, branche) {
        ranges.push([worktree, branche]);
        const recolte = recoltes.get(branche.slice("cook/".length)) ?? null;
        if (recolte instanceof Error) throw recolte;
        return recolte;
      },
      async elaguer(branche) {
        elaguees.push(branche);
        const poussee = pousses.get(branche.slice("cook/".length)) ?? true;
        if (poussee instanceof Error) throw poussee;
        return poussee;
      },
    },
    avertir: (message) => void avertissements.push(message),
  });
  const faits = (ticket: number) =>
    journal
      .duTicket(ticket)
      .filter((e) => e.type.startsWith("worktree.") || e.type.startsWith("branch."))
      .map((e) => [e.type, e.payload]);
  const chemin = (run: string) => join(repertoire, "worktrees", run);
  return { journal, noter, demarrer, arriver, lancer, sortir, raconter, finir, cuisiner, servir, partir, recoltes, ranges, pousses, elaguees, avertissements, nettoyage, faits, chemin };
}

const retire = (run: string, harvest: string | null = null) => ["worktree.removed", { worktree: `worktrees/${run}`, branch: `cook/${run}`, harvest }];

test("à la fin d'un cook, son worktree est rangé et le journal le dit, avec le commit de ce qui y traînait", async (t) => {
  const { cuisiner, recoltes, ranges, nettoyage, faits, chemin, journal, avertissements } = cuisine(t);
  cuisiner(17, "17-aaa", "17-bbb");
  recoltes.set("17-bbb", "c0ffee");

  await nettoyage.ranger(17, "worktrees/17-aaa", "cook/17-aaa");
  await nettoyage.ranger(17, "worktrees/17-bbb", "cook/17-bbb");

  assert.deepEqual(ranges, [[chemin("17-aaa"), "cook/17-aaa"], [chemin("17-bbb"), "cook/17-bbb"]]);
  assert.deepEqual(faits(17), [retire("17-aaa"), retire("17-bbb", "c0ffee")]);
  assert.deepEqual(worktreesGardes(journal.base), []);
  assert.deepEqual(avertissements, []);
});

test("un worktree qui ne se range pas est gardé et dit une fois ; le rattrapage y revient au tick, et il part dès que ça passe", async (t) => {
  const { cuisiner, recoltes, ranges, nettoyage, faits, journal, avertissements } = cuisine(t);
  cuisiner(17, "17-aaa");
  recoltes.set("17-aaa", new Error("git worktree : fatal: verrou tenu"));

  await nettoyage.ranger(17, "worktrees/17-aaa", "cook/17-aaa");

  const garde = { worktree: "worktrees/17-aaa", branch: "cook/17-aaa", reason: "failed", detail: "git worktree : fatal: verrou tenu" };
  assert.deepEqual(faits(17), [["worktree.kept", garde]]);
  assert.deepEqual(worktreesGardes(journal.base), [{ ticket: 17, ...garde, since: journal.duTicket(17).at(-1)?.at }]);
  assert.equal(avertissements.length, 1);
  assert.match(String(avertissements[0]), /worktree du ticket #17 non rangé \(worktrees\/17-aaa, branche cook\/17-aaa\) — git worktree : fatal: verrou tenu/);

  // Hors tick, ce qui a déjà résisté n'est pas réessayé ; au tick, si — sans se répéter.
  await nettoyage.rattraper(false);
  assert.equal(ranges.length, 1);
  await nettoyage.rattraper(true);
  assert.equal(ranges.length, 2);
  assert.equal(faits(17).length, 1);
  assert.equal(avertissements.length, 1);

  recoltes.delete("17-aaa");
  await nettoyage.rattraper(true);
  assert.deepEqual(faits(17).at(-1), retire("17-aaa"));
  assert.deepEqual(worktreesGardes(journal.base), []);
});

test("le rattrapage range les worktrees des cooks d'une vie précédente, quel que soit l'état de leur ticket — pas ceux de la vie en cours, que la station range", async (t) => {
  const { demarrer, arriver, lancer, finir, sortir, servir, ranges, nettoyage, faits, chemin } = cuisine(t);
  demarrer();
  // Un ticket servi, un ticket encore sur le rail dont le cook a échoué, un cook mort avec le runtime.
  arriver(17);
  lancer(17, "17-aaa");
  finir(17, "17-aaa");
  servir(17);
  arriver(18);
  lancer(18, "18-aaa");
  sortir(18, "18-aaa");
  arriver(19);
  lancer(19, "19-aaa");
  demarrer();
  arriver(20);
  lancer(20, "20-aaa");

  await nettoyage.rattraper(false);

  assert.deepEqual(ranges.map(([worktree]) => worktree), [chemin("17-aaa"), chemin("18-aaa"), chemin("19-aaa")]);
  assert.deepEqual(faits(18), [retire("18-aaa")]);
  assert.deepEqual(faits(20), []);
  // Rangés, ils ne sont plus regardés.
  await nettoyage.rattraper(true);
  assert.equal(ranges.length, 3);
});

test("un journal d'avant #164 : le worktree gardé pour un travail non poussé ou une PR ouverte est rangé comme les autres, et un worktree partagé par un renvoi ne l'est qu'une fois", async (t) => {
  const { noter, demarrer, arriver, lancer, finir, journal, ranges, nettoyage, faits } = cuisine(t);
  demarrer();
  arriver(17);
  lancer(17, "17-aaa");
  finir(17, "17-aaa");
  lancer(17, "17-bbb", "17-aaa");
  finir(17, "17-bbb");
  noter(17, { type: "worktree.kept", payload: { worktree: "worktrees/17-aaa", branch: "cook/17-aaa", reason: "unpushed", detail: "2 commits absents de l'origine" } }, "nettoyage");
  arriver(18);
  lancer(18, "18-aaa");
  finir(18, "18-aaa");
  // Retiré sous l'ancienne règle : sa branche locale est partie avec lui.
  noter(18, { type: "worktree.removed", payload: { worktree: "worktrees/18-aaa", branch: "cook/18-aaa" } }, "nettoyage");
  noter(18, { type: "ticket.left", payload: { reason: "unfired" } });
  demarrer();

  await nettoyage.rattraper(true);

  assert.equal(ranges.length, 1);
  assert.deepEqual(faits(17).at(-1), retire("17-aaa"));
  assert.deepEqual(worktreesGardes(journal.base), []);
  assert.deepEqual(faits(18).map(([type]) => type), ["worktree.removed"]);
});

test("la branche locale part une fois le ticket servi ou sorti du rail, ses worktrees rangés et tout sur l'origine — pas avant", async (t) => {
  const { cuisiner, servir, partir, elaguees, nettoyage, faits } = cuisine(t);
  cuisiner(17, "17-aaa", "17-bbb");
  cuisiner(18, "18-aaa");
  await nettoyage.ranger(17, "worktrees/17-aaa", "cook/17-aaa");

  // Sur le rail, rien ne part ; servi, seule la branche dont le worktree est rangé.
  await nettoyage.rattraper(true);
  assert.deepEqual(elaguees, []);
  servir(17);
  await nettoyage.rattraper(false);
  assert.deepEqual(elaguees, ["cook/17-aaa"]);
  assert.deepEqual(faits(17).at(-1), ["branch.removed", { branch: "cook/17-aaa" }]);

  await nettoyage.ranger(17, "worktrees/17-bbb", "cook/17-bbb");
  await nettoyage.ranger(18, "worktrees/18-aaa", "cook/18-aaa");
  partir(18);
  await nettoyage.rattraper(false);
  assert.deepEqual(elaguees, ["cook/17-aaa", "cook/17-bbb", "cook/18-aaa"]);
  // Parties, elles ne sont plus regardées.
  await nettoyage.rattraper(true);
  assert.equal(elaguees.length, 3);
});

test("une branche qui porte des commits absents de l'origine reste, sans bruit : ni fait, ni avertissement, ni worktree gardé — elle est relue au tick", async (t) => {
  const { cuisiner, partir, journal, pousses, elaguees, nettoyage, faits, avertissements } = cuisine(t);
  cuisiner(17, "17-aaa");
  await nettoyage.ranger(17, "worktrees/17-aaa", "cook/17-aaa");
  partir(17);
  pousses.set("17-aaa", false);

  await nettoyage.rattraper(false);
  await nettoyage.rattraper(false);

  assert.deepEqual(elaguees, ["cook/17-aaa"]);
  assert.deepEqual(faits(17), [retire("17-aaa")]);
  assert.deepEqual(avertissements, []);
  assert.deepEqual(worktreesGardes(journal.base), []);

  // Poussée depuis, elle part au tick suivant.
  pousses.set("17-aaa", true);
  await nettoyage.rattraper(true);
  assert.deepEqual(faits(17).at(-1), ["branch.removed", { branch: "cook/17-aaa" }]);
});

test("une branche que git refuse de retirer se dit une fois, et ne coûte pas les autres", async (t) => {
  const { cuisiner, servir, pousses, nettoyage, faits, avertissements } = cuisine(t);
  cuisiner(17, "17-aaa", "17-bbb");
  for (const run of ["17-aaa", "17-bbb"]) await nettoyage.ranger(17, `worktrees/${run}`, `cook/${run}`);
  servir(17);
  pousses.set("17-aaa", new Error("git branch : fatal: verrou tenu"));

  await nettoyage.rattraper(true);
  await nettoyage.rattraper(true);

  assert.deepEqual(avertissements, ["brigade : branche locale cook/17-aaa du ticket #17 non retirée — git branch : fatal: verrou tenu"]);
  assert.deepEqual(faits(17).at(-1), ["branch.removed", { branch: "cook/17-bbb" }]);
});

test("un ticket servi puis rouvert garde les branches de ses nouveaux cooks tant qu'il n'est pas servi à nouveau", async (t) => {
  const { cuisiner, arriver, lancer, finir, servir, partir, elaguees, nettoyage } = cuisine(t);
  cuisiner(17, "17-aaa");
  servir(17);
  partir(17);
  await nettoyage.ranger(17, "worktrees/17-aaa", "cook/17-aaa");
  await nettoyage.rattraper(true);
  assert.deepEqual(elaguees, ["cook/17-aaa"]);

  arriver(17);
  lancer(17, "17-bbb");
  finir(17, "17-bbb");
  await nettoyage.ranger(17, "worktrees/17-bbb", "cook/17-bbb");
  await nettoyage.rattraper(true);
  assert.deepEqual(elaguees, ["cook/17-aaa"]);

  servir(17);
  await nettoyage.rattraper(true);
  assert.deepEqual(elaguees, ["cook/17-aaa", "cook/17-bbb"]);
});

test("un runtime qui s'arrête ne commence plus rien", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const ranges: string[] = [];
  let arrete = false;
  const nettoyage = ouvrirNettoyage({
    journal,
    projet: "brigade",
    repertoireEtat: repertoire,
    depot: {
      async ranger(worktree) {
        ranges.push(worktree);
        arrete = true;
        return null;
      },
      elaguer: async () => true,
    },
    avertir: () => {},
    arrete: () => arrete,
  });
  for (const run of ["17-aaa", "17-bbb"]) {
    journal.ajouter({
      project: "brigade",
      ticket: 17,
      author: "runtime",
      type: "cook.launched",
      payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: STATION, model: "sonnet", effort: "low", branch: `cook/${run}`, worktree: join("worktrees", run) },
    });
  }
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "26" } });

  await nettoyage.rattraper(true);

  assert.equal(ranges.length, 1);
});

// La file de ce qui attend le chef : ce que `status` en dit, et ce qui en
// retire chaque entrée — tout vient du journal.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { JOUR_HORLOGE, jourDecale, repertoireTemporaire } from "./outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const STATION = "box/claude";
const pr = (ticket: number) => `https://exemple.test/pull/${ticket}`;

// Une cuisine dont le test tient l'horloge : chaque fait s'écrit à l'heure dite.
function cuisine(t: TestContext) {
  let instant = `${JOUR_HORLOGE}T10:00:00.000Z`;
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number, waitsFor: number[] = []) =>
    noter(
      {
        type: "ticket.arrived",
        payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor, zone: [], problems: [] } },
      },
      ticket,
      "github",
    );
  // Le ticket jusqu'à la pass : pris, cuisiné, livré avec sa PR.
  const livrer = (ticket: number) => {
    arriver(ticket);
    noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: `${jourDecale(30)}T00:00:00.000Z` } }, ticket, `station:${STATION}`);
    noter({ type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITES, stream: `runs/${ticket}-aa.jsonl`, branch: `cook/${ticket}-aa`, worktree: `worktrees/${ticket}-aa` } }, ticket);
    noter({ type: "cook.exited", payload: { run: `${ticket}-aa`, outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, ticket);
    noter({ type: "ticket.passing", payload: { station: STATION } }, ticket, `station:${STATION}`);
    noter({ type: "pass.started", payload: { run: `${ticket}-aa`, pr: pr(ticket), number: ticket, sha: `sha-${ticket}` } }, ticket, "pass");
  };
  const retenir = (ticket: number, reason: string) => noter({ type: "pass.held", payload: { reason } }, ticket, "pass");
  const remonter = (ticket: number, reason: "returns-exhausted" | "manager-escalated" | "manager-split", motif = `pass:${reason}`) => {
    noter({ type: "pass.escalated", payload: { reason } }, ticket, "pass");
    noter({ type: "ticket.86", payload: { reason: motif, until: null } }, ticket);
  };
  return {
    journal,
    noter,
    arriver,
    livrer,
    retenir,
    remonter,
    a: (heure: string) => {
      instant = heure;
    },
    // Le bloc `attend` de l'état lu à cette heure : sa ligne de tête, puis ses entrées.
    bloc: (maintenant: string) => {
      const lignes = decrireEtat(lireEtat(journal, new Date(maintenant)), new Date(maintenant));
      const debut = lignes.findIndex((ligne) => ligne.startsWith("attend"));
      return debut === -1 ? [] : lignes.slice(debut, lignes.indexOf("", debut));
    },
  };
}

test("rien n'attend le chef : le bloc n'existe pas, même avec un rail qui travaille", (t) => {
  const { arriver, livrer, noter, bloc } = cuisine(t);
  arriver(14);
  arriver(16, [14]); // Attend un ticket qui sera servi : il partira seul.
  livrer(15); // En jugement : la pass n'a rien demandé.
  noter({ type: "ticket.86", payload: { reason: "quota", until: `${JOUR_HORLOGE}T15:00:00.000Z` } }, 14); // Reviendra seul.

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), []);
});

test("le chef lit en une commande ce qui l'attend, depuis quand, et le geste attendu — le plus ancien d'abord", (t) => {
  const { a, arriver, livrer, retenir, remonter, noter, bloc } = cuisine(t);
  a(`${jourDecale(-3)}T10:00:00.000Z`);
  livrer(17);
  retenir(17, "no-grant");
  a(`${JOUR_HORLOGE}T08:00:00.000Z`);
  livrer(18);
  remonter(18, "returns-exhausted");
  arriver(21);
  arriver(19, [21]);
  a(`${JOUR_HORLOGE}T09:50:00.000Z`);
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 21, "github");
  // Juste avant l'état : la plus récente, donc la dernière.
  a(`${JOUR_HORLOGE}T09:58:00.000Z`);
  livrer(20);
  retenir(20, "judge-modified");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:00:00.000Z`), [
    "attend     4 décisions attendent le chef — la plus ancienne depuis 3 j",
    `  #17  depuis 3 j  livraison verte, non mergée faute de grant \`merge\` — à merger à la main : ${pr(17)}  Ticket 17`,
    `  #18  depuis 2 h 00  remontée par la pass (returns-exhausted) — à trancher : merger ${pr(18)} à la main, ou retirer \`fire\` — \`run pass -- 18\`  Ticket 18`,
    "  #19  depuis 10 min  BLOQUÉ : #21 abandonné (issue fermée sans avoir été servie) — à débloquer : remettre #21 sur le rail, ou le retirer de la ligne `attend` de la fiche  Ticket 19",
    `  #20  depuis 2 min  livraison verte qui touche à ses juges — à relire et merger à la main : ${pr(20)}  Ticket 20`,
  ]);
});

test("une seule décision se dit au singulier, et le bloc se lit en tête, avant le rail", (t) => {
  const { livrer, retenir, journal } = cuisine(t);
  livrer(17);
  retenir(17, "merge-refused: Required status check is expected");

  const maintenant = new Date(`${JOUR_HORLOGE}T10:04:00.000Z`);
  const lignes = decrireEtat(lireEtat(journal, maintenant), maintenant);
  const debut = lignes.findIndex((ligne) => ligne.startsWith("attend"));
  assert.deepEqual(lignes.slice(debut, debut + 3), [
    "attend     1 décision attend le chef depuis 4 min",
    `  #17  depuis 4 min  livraison verte, merge refusé par GitHub (Required status check is expected) — à merger à la main : ${pr(17)}  Ticket 17`,
    "",
  ]);
  assert.ok(debut < lignes.findIndex((ligne) => ligne.startsWith("rail")));
});

test("une remontée du manager se distingue de celle de la pass ; sans PR, il n'y a rien à merger ; un ticket redécoupé n'attend personne", (t) => {
  const { livrer, remonter, noter, arriver, bloc } = cuisine(t);
  livrer(17);
  remonter(17, "manager-escalated", "manager:escalated");
  // Sans PR : un ticket remonté avant d'avoir livré un diff.
  arriver(18);
  noter({ type: "cook.launched", payload: { run: "18-aa", limits: LIMITES, stream: "runs/18-aa.jsonl", branch: "cook/18-aa", worktree: "worktrees/18-aa" } }, 18);
  noter({ type: "cook.exited", payload: { run: "18-aa", outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, 18);
  remonter(18, "returns-exhausted");
  // Redécoupé : ses sous-tickets portent le travail.
  livrer(19);
  remonter(19, "manager-split", "manager:split");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:00:00.000Z`), [
    "attend     2 décisions attendent le chef — la plus ancienne depuis 0 s",
    `  #17  depuis 0 s  remontée par le manager — à trancher : merger ${pr(17)} à la main, ou retirer \`fire\` — \`run pass -- 17\`  Ticket 17`,
    "  #18  depuis 0 s  remontée par la pass (returns-exhausted) — à trancher : retirer `fire`, ou fermer l'issue — `run pass -- 18`  Ticket 18",
  ]);
});

test("une livraison verte quitte la file dès que la décision est prise : mergée à la main sur GitHub, ticket sorti du rail, ou cook reparti", (t) => {
  const { livrer, retenir, noter, bloc } = cuisine(t);
  const attendus = () => bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).slice(1).map((ligne) => ligne.trim().split("  ")[0]);
  for (const ticket of [17, 18, 19]) {
    livrer(ticket);
    retenir(ticket, "no-grant");
  }
  assert.deepEqual(attendus(), ["#17", "#18", "#19"]);

  // Le chef merge sur GitHub : la pass le constate.
  noter({ type: "merge.done", payload: { pr: pr(17), sha: "sha-17", by: "outside", reconciled: false, unverified: true } }, 17, "pass");
  assert.deepEqual(attendus(), ["#18", "#19"]);

  // Le chef ferme l'issue.
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 18, "github");
  assert.deepEqual(attendus(), ["#19"]);

  // Un cook repart sur le ticket, sur une livraison neuve.
  noter({ type: "ticket.released", payload: { reason: "chef", station: null } }, 19);
  noter({ type: "cook.launched", payload: { run: "19-bb", limits: LIMITES, stream: "runs/19-bb.jsonl", branch: "cook/19-bb", worktree: "worktrees/19-bb" } }, 19);
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), []);
});

test("une remontée quitte la file quand le chef merge, sort le ticket du rail, ou le rend au rail", (t) => {
  const { livrer, remonter, noter, bloc } = cuisine(t);
  const attendus = () => bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).slice(1).map((ligne) => ligne.trim().split("  ")[0]);
  for (const ticket of [17, 18, 19]) {
    livrer(ticket);
    remonter(ticket, "returns-exhausted");
  }
  assert.deepEqual(attendus(), ["#17", "#18", "#19"]);

  noter({ type: "merge.done", payload: { pr: pr(17), sha: "sha-17", by: "outside", reconciled: false, unverified: true } }, 17, "pass");
  assert.deepEqual(attendus(), ["#18", "#19"]);

  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 18, "github");
  assert.deepEqual(attendus(), ["#19"]);

  // Rendu au rail : il n'est plus 86, un cook le reprendra.
  noter({ type: "ticket.released", payload: { reason: "chef", station: null } }, 19);
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), []);
});

test("un ticket bloqué quitte la file quand sa dépendance revient sur le rail ou sort de sa fiche ; son attente se compte de l'abandon", (t) => {
  const { a, arriver, noter, bloc } = cuisine(t);
  arriver(14);
  arriver(15);
  arriver(16, [14]);
  arriver(17, [15]);
  a(`${JOUR_HORLOGE}T10:30:00.000Z`);
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 14, "github");
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 15, "github");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T11:00:00.000Z`), [
    "attend     2 décisions attendent le chef — la plus ancienne depuis 30 min",
    "  #16  depuis 30 min  BLOQUÉ : #14 abandonné (label `fire` retiré) — à débloquer : remettre #14 sur le rail, ou le retirer de la ligne `attend` de la fiche  Ticket 16",
    "  #17  depuis 30 min  BLOQUÉ : #15 abandonné (label `fire` retiré) — à débloquer : remettre #15 sur le rail, ou le retirer de la ligne `attend` de la fiche  Ticket 17",
  ]);

  // Le chef relance #14, et retire #15 de la fiche de #17.
  a(`${JOUR_HORLOGE}T10:40:00.000Z`);
  arriver(14);
  noter({ type: "ticket.changed", payload: { title: "Ticket 17", priority: null, card: { waitsFor: [], zone: [], problems: [] } } }, 17, "github");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T11:00:00.000Z`), []);
});

test("la file ne garde rien : relue d'un journal rouvert en lecture seule, elle dit la même chose", (t) => {
  const repertoire = repertoireTemporaire(t);
  const ecrit = ouvrirJournal(repertoire, { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  const noter = (fait: Fait, ticket: number, author = "runtime") => ecrit.ajouter({ project: "brigade", ticket, author, ...fait });
  noter({ type: "ticket.arrived", payload: { title: "Ticket 17", priority: null, createdAt: "2026-10-01T00:00:17Z", url: "https://exemple.test/17" } }, 17, "github");
  noter({ type: "cook.launched", payload: { run: "17-aa", limits: LIMITES, stream: "runs/17-aa.jsonl", branch: "cook/17-aa", worktree: "worktrees/17-aa" } }, 17);
  noter({ type: "pass.started", payload: { run: "17-aa", pr: pr(17), number: 17, sha: "sha-17" } }, 17, "pass");
  noter({ type: "pass.held", payload: { reason: "no-grant" } }, 17, "pass");
  const avant = ecrit.dernierSeq();
  ecrit.fermer();

  const relu = ouvrirJournal(repertoire, { lectureSeule: true });
  t.after(() => relu.fermer());
  const maintenant = new Date(`${JOUR_HORLOGE}T10:07:00.000Z`);
  const lignes = decrireEtat(lireEtat(relu, maintenant), maintenant);

  assert.ok(lignes.includes("attend     1 décision attend le chef depuis 7 min"));
  assert.equal(relu.dernierSeq(), avant);
});

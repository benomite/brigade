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
  const remonter = (ticket: number, reason: "returns-exhausted" | "no-gates" | "manager-escalated" | "manager-split", motif = `pass:${reason}`) => {
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
  livrer(22);
  retenir(22, "declaration-modified: .claude/brigade/reseau");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:00:00.000Z`), [
    "attend     5 décisions attendent le chef — la plus ancienne depuis 3 j",
    `  #17  depuis 3 j  livraison verte, non mergée faute de grant \`merge\` — à merger à la main : ${pr(17)}  Ticket 17`,
    `  #18  depuis 2 h 00  remontée par la pass (returns-exhausted) — à trancher : merger ${pr(18)} à la main, ou retirer \`fire\` — \`run pass -- 18\`  Ticket 18`,
    "  #19  depuis 10 min  BLOQUÉ : #21 abandonné (issue fermée sans avoir été servie) — à débloquer : remettre #21 sur le rail, ou le retirer de la ligne `attend` de la fiche  Ticket 19",
    `  #20  depuis 2 min  livraison verte qui touche à ses juges — à relire et merger à la main : ${pr(20)}  Ticket 20`,
    `  #22  depuis 2 min  livraison verte qui touche à ce que le projet s'ouvre (.claude/brigade/reseau) — à relire et merger à la main : ${pr(22)}  Ticket 22`,
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

test("une PR fermée sans merge ne reste pas « à merger » : la ligne dit ce qui s'est passé et le geste qui reste, puis sort avec lui", (t) => {
  const { a, livrer, retenir, remonter, noter, bloc } = cuisine(t);
  const fermer = (ticket: number) => noter({ type: "pass.pr-closed", payload: { pr: pr(ticket) } }, ticket, "pass");
  for (const ticket of [17, 18, 19, 20]) livrer(ticket);
  retenir(17, "no-grant");
  remonter(18, "returns-exhausted");
  // Redécoupé : fermer sa PR est la suite attendue, et n'attend personne.
  remonter(19, "manager-split", "manager:split");
  retenir(20, "no-grant");
  a(`${JOUR_HORLOGE}T10:03:00.000Z`);
  for (const ticket of [17, 18, 19]) fermer(ticket);

  // Constatée, la fermeture date la ligne : c'est d'elle que l'attente se compte.
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), [
    "attend     3 décisions attendent le chef — la plus ancienne depuis 5 min",
    `  #20  depuis 5 min  livraison verte, non mergée faute de grant \`merge\` — à merger à la main : ${pr(20)}  Ticket 20`,
    `  #17  depuis 2 min  PR fermée sans merge : ${pr(17)} — à trancher : retirer \`fire\`, ou fermer l'issue — \`run pass -- 17\`  Ticket 17`,
    `  #18  depuis 2 min  PR fermée sans merge : ${pr(18)} — à trancher : retirer \`fire\`, ou fermer l'issue — \`run pass -- 18\`  Ticket 18`,
  ]);

  const attendus = () => bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).slice(1).map((ligne) => ligne.trim().split("  ")[0]);
  // Le chef retire `fire` ; ou rend le ticket au rail, pour un cook neuf.
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 17, "github");
  noter({ type: "ticket.released", payload: { reason: "chef", station: null } }, 18);
  assert.deepEqual(attendus(), ["#20"]);
});

test("un ticket remonté dont la pass a ouvert la PR elle-même : le geste nomme la PR", (t) => {
  const { arriver, remonter, noter, bloc } = cuisine(t);
  arriver(17);
  noter({ type: "cook.launched", payload: { run: "17-aa", limits: LIMITES, stream: "runs/17-aa.jsonl", branch: "cook/17-aa", worktree: "worktrees/17-aa" } }, 17);
  noter({ type: "cook.reported", payload: { run: "17-aa", ending: "done", reason: null, summary: null, branch: "cook/17-aa", pr: null } }, 17, `station:${STATION}`);
  noter({ type: "pass.pr-opened", payload: { pr: pr(17), number: 17, reconciled: false } }, 17, "pass");
  remonter(17, "no-gates");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:00:00.000Z`), [
    "attend     1 décision attend le chef depuis 0 s",
    `  #17  depuis 0 s  remontée par la pass (no-gates) — à trancher : merger ${pr(17)} à la main, ou retirer \`fire\` — \`run pass -- 17\`  Ticket 17`,
  ]);
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

test("un ticket que sa station a déclaré 86 sans heure de retour attend le chef, avec son geste ; corrigé ou sorti du rail, il quitte la file", (t) => {
  const { a, arriver, noter, bloc } = cuisine(t);
  const quatreVingtSix = (ticket: number, reason: string) => noter({ type: "ticket.86", payload: { reason, until: null } }, ticket, `station:${STATION}`);
  for (const ticket of [14, 15, 16]) arriver(ticket);
  a(`${JOUR_HORLOGE}T10:10:00.000Z`);
  quatreVingtSix(14, "no-calibration");
  a(`${JOUR_HORLOGE}T10:20:00.000Z`);
  quatreVingtSix(15, "unreadable-card");
  a(`${JOUR_HORLOGE}T10:30:00.000Z`);
  quatreVingtSix(16, "refused");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T11:00:00.000Z`), [
    "attend     3 décisions attendent le chef — la plus ancienne depuis 50 min",
    "  #14  depuis 50 min  sans calibrage — à calibrer : poser `model:` et `effort:` sur l'issue, il repart seul  Ticket 14",
    "  #15  depuis 40 min  fiche illisible — à corriger : la fiche de l'issue, il repart seul  Ticket 15",
    "  #16  depuis 30 min  refusé trois fois par le modèle — à trancher : reformuler ou recalibrer, puis retirer et reposer `fire` ; ou retirer `fire`  Ticket 16",
  ]);

  // Calibré et fiche corrigée sur GitHub : la station les rend au rail. Le refusé perd son `fire`.
  noter({ type: "ticket.released", payload: { reason: "calibrated", station: null } }, 14);
  noter({ type: "ticket.released", payload: { reason: "card-readable", station: null } }, 15);
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 16, "github");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T11:00:00.000Z`), []);
});

test("ce que le manager attend du chef est dans la file, avec le geste attendu, trié avec le reste par ancienneté", (t) => {
  const { a, livrer, retenir, noter, bloc } = cuisine(t);
  a(`${JOUR_HORLOGE}T09:00:00.000Z`);
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 30, "manager");
  // Ni une question au chef, ni une décision à prendre : ceux-là n'attendent personne.
  noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 1, "manager");
  noter({ type: "manager.set-aside", payload: { reason: "untrusted-author", fired: false } }, 2, "manager");
  a(`${JOUR_HORLOGE}T09:10:00.000Z`);
  noter({ type: "manager.failed", payload: { run: "juge-31", fingerprint: "e31", reason: "réponse sans verdict" } }, 31, "manager");
  a(`${JOUR_HORLOGE}T09:20:00.000Z`);
  livrer(17);
  retenir(17, "no-grant");
  a(`${JOUR_HORLOGE}T09:30:00.000Z`);
  noter({ type: "manager.split-asked", payload: { run: "decoupe-32", fingerprint: "e32", question: "Quel périmètre ?" } }, 32, "manager");
  a(`${JOUR_HORLOGE}T09:40:00.000Z`);
  noter({ type: "manager.set-aside", payload: { reason: "decision", fired: false } }, 33, "manager");
  noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 34, "manager");
  noter({ type: "manager.split-failed", payload: { run: "decoupe-35", fingerprint: "e35", reason: "aucun objet JSON" } }, 35, "manager");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:00:00.000Z`), [
    "attend     7 décisions attendent le chef — la plus ancienne depuis 1 h 00",
    "  #30  depuis 1 h 00  écartée par le manager, elle porte `question` — à trancher : y répondre puis retirer le label, il la juge ; ou fermer l'issue",
    "  #31  depuis 50 min  jugement du manager illisible — à reprendre : modifier l'issue, il la rejuge ; ou poser `fire`, `model:` et `effort:` à la main ; ou fermer l'issue",
    `  #17  depuis 40 min  livraison verte, non mergée faute de grant \`merge\` — à merger à la main : ${pr(17)}  Ticket 17`,
    "  #32  depuis 30 min  question du manager avant de découper l'épique — à répondre : sur l'issue, il la relit et la découpe ; ou fermer l'issue",
    "  #33  depuis 20 min  écartée par le manager, elle porte `decision` — à trancher : décider puis retirer le label, il la juge ; ou fermer l'issue",
    "  #34  depuis 20 min  retenue, elle porte `blocked-on-human` — à lever : retirer le label, le manager la juge ; ou fermer l'issue",
    "  #35  depuis 20 min  découpage du manager illisible — à reprendre : modifier l'épique, il la redécoupe ; ou fermer l'issue",
  ]);
});

const JUGEE = { run: "juge-a", fingerprint: "e2", verdict: "refused", kind: "incomplete", reason: "Sans critère.", missing: "Un critère.", model: null, effort: null, calibration: null } as const;

test("rejugée ou redécoupée, l'issue que le manager attendait sort de la file", (t) => {
  const { noter, bloc } = cuisine(t);
  const file = () => bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).slice(1).map((ligne) => ligne.split("  ")[1]);
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 30, "manager");
  noter({ type: "manager.failed", payload: { run: "juge-31", fingerprint: "e31", reason: "réponse sans verdict" } }, 31, "manager");
  noter({ type: "manager.split-asked", payload: { run: "decoupe-32", fingerprint: "e32", question: "Quel périmètre ?" } }, 32, "manager");
  assert.deepEqual(file(), ["#30", "#31", "#32"]);

  // Le label retiré, l'issue modifiée : le manager les rejuge.
  noter({ type: "manager.judged", payload: JUGEE }, 30, "manager");
  noter({ type: "manager.judged", payload: JUGEE }, 31, "manager");
  assert.deepEqual(file(), ["#32"]);

  // Le chef a répondu : l'épique est découpée.
  noter({ type: "manager.split", payload: { run: "decoupe-32b", fingerprint: "e32b", reason: "Deux livrables.", order: "Le socle d'abord.", tickets: [] } }, 32, "manager");
  assert.deepEqual(file(), []);
});

test("fermée, l'issue que le manager attendait sort de la file ; rouverte, elle y revient avec son ancienneté", (t) => {
  const { a, noter, bloc } = cuisine(t);
  const file = () => bloc(`${JOUR_HORLOGE}T11:00:00.000Z`);
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 30, "manager");
  noter({ type: "manager.failed", payload: { run: "juge-31", fingerprint: "e31", reason: "réponse sans verdict" } }, 31, "manager");
  noter({ type: "manager.split-asked", payload: { run: "decoupe-32", fingerprint: "e32", question: "Quel périmètre ?" } }, 32, "manager");
  assert.equal(file().length, 4);

  a(`${JOUR_HORLOGE}T10:30:00.000Z`);
  for (const numero of [30, 31, 32]) noter({ type: "manager.closed", payload: {} }, numero, "manager");
  assert.deepEqual(file(), []);

  noter({ type: "manager.reopened", payload: {} }, 31, "manager");
  assert.deepEqual(file(), [
    "attend     1 décision attend le chef depuis 1 h 00",
    "  #31  depuis 1 h 00  jugement du manager illisible — à reprendre : modifier l'issue, il la rejuge ; ou poser `fire`, `model:` et `effort:` à la main ; ou fermer l'issue",
  ]);
});

test("une issue écartée que le chef a lancée lui-même est sur le rail : c'est le rail qui dit ce qui l'attend, une seule fois", (t) => {
  const { arriver, noter, bloc } = cuisine(t);
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: true } }, 14, "manager");
  noter({ type: "manager.set-aside", payload: { reason: "decision", fired: true } }, 15, "manager");
  arriver(14);
  arriver(15);
  noter({ type: "ticket.86", payload: { reason: "no-calibration", until: null } }, 14, `station:${STATION}`);

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), [
    "attend     1 décision attend le chef depuis 5 min",
    "  #14  depuis 5 min  sans calibrage — à calibrer : poser `model:` et `effort:` sur l'issue, il repart seul  Ticket 14",
  ]);
});

test("une épique retenue par le chef après la question du manager n'attend qu'une fois, pour sa retenue", (t) => {
  const { noter, bloc } = cuisine(t);
  noter({ type: "manager.split-asked", payload: { run: "decoupe-32", fingerprint: "e32", question: "Quel périmètre ?" } }, 32, "manager");
  noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 32, "manager");

  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`), [
    "attend     1 décision attend le chef depuis 5 min",
    "  #32  depuis 5 min  retenue, elle porte `blocked-on-human` — à lever : retirer le label, le manager la juge ; ou fermer l'issue",
  ]);
});

test("une épique à question qui cesse d'être une épique à découper sort de la file : la décision suivante sur l'issue prime", (t) => {
  const { noter, bloc } = cuisine(t);
  const file = () => bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).slice(1).map((ligne) => ligne.split("  ")[1]);
  const epique = { ...JUGEE, kind: "epic" } as const;
  // Reconnue épique par le jugement, puis question ou découpage illisible : elle attend.
  for (const numero of [32, 33, 34, 35, 36]) noter({ type: "manager.judged", payload: epique }, numero, "manager");
  for (const numero of [32, 33, 34]) noter({ type: "manager.split-asked", payload: { run: `decoupe-${numero}`, fingerprint: "e1", question: "Quel périmètre ?" } }, numero, "manager");
  for (const numero of [35, 36]) noter({ type: "manager.split-failed", payload: { run: `decoupe-${numero}`, fingerprint: "e1", reason: "aucun objet JSON" } }, numero, "manager");
  assert.deepEqual(file(), ["#32", "#33", "#34", "#35", "#36"]);

  // Le chef la découpe à la main : la liste est dans son corps.
  noter({ type: "manager.set-aside", payload: { reason: "already-split", fired: false } }, 32, "manager");
  // Label `epic` retiré, issue réécrite : rejugée, ce n'est plus une épique.
  noter({ type: "manager.judged", payload: JUGEE }, 33, "manager");
  noter({ type: "manager.judged", payload: { ...JUGEE, verdict: "fire", kind: "ticket", missing: null, model: "sonnet", effort: "low", calibration: "Mécanique." } }, 35, "manager");
  // Rejugée épique sans que le découpage ait à être refait : la question tient.
  noter({ type: "manager.judged", payload: epique }, 34, "manager");
  assert.deepEqual(file(), ["#34", "#36"]);

  // Rejugée, et le jugement ne se lit pas : c'est lui qui attend désormais.
  noter({ type: "manager.failed", payload: { run: "juge-36", fingerprint: "e3", reason: "réponse sans verdict" } }, 36, "manager");
  assert.match(bloc(`${JOUR_HORLOGE}T10:05:00.000Z`).at(-1) ?? "", /#36 .* jugement du manager illisible/);
});

test("la connexion Max absente attend le chef : l'en-tête de l'état et le bloc `attend` la disent, depuis quand, avec le geste — et elle en sort seule à la reprise", (t) => {
  const { a, noter, arriver, journal, bloc } = cuisine(t);
  const entete = (maintenant: string) => decrireEtat(lireEtat(journal, new Date(maintenant)), new Date(maintenant)).filter((ligne) => ligne.startsWith("connexion"));
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  arriver(14);
  assert.deepEqual(entete(`${JOUR_HORLOGE}T10:01:00.000Z`), []);

  a(`${JOUR_HORLOGE}T10:05:00.000Z`);
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "not-logged-in", run: null } }, null, `station:${STATION}`);

  const geste = "`claude /login` sous le compte du service, puis `run garde-fous -- reprendre`";
  assert.deepEqual(entete(`${JOUR_HORLOGE}T10:25:00.000Z`), [
    `connexion  Max ABSENTE depuis 20 min sur ${STATION} (not-logged-in) — plus aucun ticket n'est pris : ${geste}`,
  ]);
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:25:00.000Z`), [
    "attend     1 décision attend le chef depuis 20 min",
    `  ${STATION}  depuis 20 min  connexion Max absente (not-logged-in) — à rétablir : ${geste}`,
  ]);

  a(`${JOUR_HORLOGE}T10:30:00.000Z`);
  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");
  assert.deepEqual(entete(`${JOUR_HORLOGE}T10:31:00.000Z`), []);
  assert.deepEqual(bloc(`${JOUR_HORLOGE}T10:31:00.000Z`), []);
});

test("une connexion Max expirée en cours de route se dit expirée, et se range avec les autres décisions par ancienneté", (t) => {
  const { a, noter, livrer, retenir, bloc } = cuisine(t);
  a(`${JOUR_HORLOGE}T08:00:00.000Z`);
  livrer(17);
  retenir(17, "no-grant");
  a(`${JOUR_HORLOGE}T09:00:00.000Z`);
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: "17-aa" } }, 17, `station:${STATION}`);

  const lignes = bloc(`${JOUR_HORLOGE}T10:00:00.000Z`);
  assert.equal(lignes[0], "attend     2 décisions attendent le chef — la plus ancienne depuis 2 h 00");
  assert.match(lignes[1] ?? "", /^  #17  depuis 2 h 00  /);
  assert.match(lignes[2] ?? "", new RegExp(`^  ${STATION}  depuis 1 h 00  connexion Max expirée \\(authentication_failed\\) — à rétablir`));
});

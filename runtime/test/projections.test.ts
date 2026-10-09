import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { definirProjection } from "../src/projection.ts";
import { PROJECTIONS } from "../src/projections.ts";
import { cooksEnCours, mesuresDesCooksEnCours } from "../src/projections/garde-fous.ts";
import { dernierTick, derniereSession, sessionEnCours, sessions } from "../src/projections/sessions.ts";
import { ouvrirRail } from "../src/rail.ts";
import type { Fait } from "../src/evenements.ts";
import type { FaitGardeFous } from "../src/evenements/garde-fous.ts";
import type { FaitRuntime } from "../src/evenements/runtime.ts";
import { faitInconnu, horloge, photographier, repertoireTemporaire, JOUR_HORLOGE } from "./outils.ts";

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
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 60_000 } });
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.interrupted", payload: { startedSeq: 4 } });
  raconterLeRail(journal);
  raconterLesGardeFous(journal);
  raconterLaStation(journal);
  raconterLaPass(journal);
  raconterLeManager(journal);
  raconterLaSauvegarde(journal);
  raconterLeNettoyage(journal);
  raconterLaDerive(journal);
}

// Une livraison dont les gates déclarent leurs mesures, mergée ; des seuils
// déclarés puis changés ; un franchissement signalé puis levé, un autre resté.
function raconterLaDerive(journal: Journal): void {
  const noter = (fait: Fait, ticket: number | null = null) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  const limits = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
  const seuils = { tests: 500, testsSeconds: null, gatesSeconds: null, contextKb: null, repoMb: null, merges: null, growthPercent: null };
  noter({ type: "cook.launched", payload: { run: "m", limits, stream: "runs/m.jsonl", station: "box/claude", model: "opus", effort: "high" } }, 40);
  noter({ type: "cook.exited", payload: { run: "m", outcome: "ok", code: 0, signal: null, turns: 31, tokens: 9000, durationMs: 216_000 } }, 40);
  noter({ type: "pass.replayed", payload: { sha: "sha-m", base: "base-2", gates: { outcome: "green", code: 0, failures: [], tail: "", measures: { tests: 622, gates_s: 21 } }, findings: [] } }, 40);
  noter({ type: "merge.done", payload: { pr: "https://github.com/o/r/pull/40", sha: "sha-m", by: "pass", reconciled: false } }, 40);
  noter({ type: "drift.configured", payload: { limits: seuils } });
  noter({ type: "drift.configured", payload: { limits: { ...seuils, growthPercent: 30 } } });
  noter({ type: "drift.crossed", payload: { measure: "tests", observed: 622, limit: 500 } });
  noter({ type: "drift.crossed", payload: { measure: "growth:tests", observed: 54, limit: 30 } });
  noter({ type: "drift.cleared", payload: { measure: "growth:tests" } });
}

// Un worktree gardé puis retiré, un autre resté gardé, et les transcripts rangés.
function raconterLeNettoyage(journal: Journal): void {
  const noter = (fait: Fait) => journal.ajouter({ project: "brigade", ticket: 1, author: "nettoyage", ...fait });
  noter({ type: "worktree.kept", payload: { worktree: "worktrees/d", branch: "cook/d", reason: "pr-open", detail: "https://github.com/o/r/pull/9" } });
  noter({ type: "worktree.removed", payload: { worktree: "worktrees/d", branch: "cook/d" } });
  noter({ type: "worktree.kept", payload: { worktree: "worktrees/e", branch: "cook/e", reason: "unpushed", detail: "1 commit absent de l'origine" } });
  // Deux rangements de transcripts : seul le dernier compte.
  for (const removed of [0, 3]) {
    journal.ajouter({ project: "brigade", ticket: null, author: "nettoyage", type: "transcripts.tidied", payload: { removed, freedBytes: removed * 100, kept: 2, keptBytes: 200, keepMs: 604_800_000 } });
  }
}

// Deux sauvegardes réussies : seule la dernière compte.
function raconterLaSauvegarde(journal: Journal): void {
  for (const [name, lastSeq] of [["2026-10-07T03-30-00Z", 3], [`${JOUR_HORLOGE}T03-30-00Z`, 9]] as const) {
    journal.ajouter({ project: "brigade", ticket: null, author: "sauvegarde", type: "backup.completed", payload: { name, lastSeq, events: lastSeq, streams: 0 } });
  }
}

// Le manager allumé, éteint, rallumé ; une issue jugée, lancée et commentée ;
// une autre refusée, puis écartée ; un jugement illisible.
function raconterLeManager(journal: Journal): void {
  const noter = (fait: Fait, ticket: number | null = null, author = "manager") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  noter({ type: "manager.enabled", payload: {} }, null, "chef");
  noter({ type: "manager.disabled", payload: {} }, null, "chef");
  noter({ type: "manager.enabled", payload: {} }, null, "chef");
  noter({ type: "manager.judged", payload: { run: "juge-30-a", fingerprint: "e1", verdict: "fire", kind: "ticket", reason: "Un livrable.", missing: null, model: "haiku", effort: "low", calibration: "Mécanique." } }, 30);
  noter({ type: "manager.labeled", payload: { labels: ["fire", "model:haiku", "effort:low"] } }, 30);
  noter({ type: "manager.commented", payload: {} }, 30);
  noter({ type: "manager.judged", payload: { run: "juge-31-a", fingerprint: "e2", verdict: "refused", kind: "epic", reason: "Trois livrables.", missing: "La découper.", model: null, effort: null, calibration: null } }, 31);
  noter({ type: "manager.set-aside", payload: { reason: "epic", fired: true } }, 31);
  noter({ type: "manager.failed", payload: { run: "juge-32-a", fingerprint: "e3", reason: "aucun objet JSON dans la réponse" } }, 32);
  // Une issue lancée, dont le chef retire `fire`, puis qu'il rend au manager.
  noter({ type: "manager.judged", payload: { run: "juge-33-a", fingerprint: "e4", verdict: "fire", kind: "ticket", reason: "Un livrable.", missing: null, model: "haiku", effort: "low", calibration: "Mécanique." } }, 33);
  noter({ type: "manager.labeled", payload: { labels: ["fire", "model:haiku", "effort:low"] } }, 33);
  noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } }, 33);
  noter({ type: "manager.handed-back", payload: {} }, 33, "chef");
  noter({ type: "manager.withdrew", payload: { labels: ["model:haiku", "effort:low"] } }, 33);
  // Une épique questionnée puis découpée en deux tickets, dont le second est
  // créé à la reprise ; le chef en ajoute un troisième, et en ferme un.
  const prevu = (title: string, waitsFor: number[]) => ({ title, context: "", criteria: ["Un critère."], waitsFor, zone: ["docs/"], model: "haiku", effort: "low", calibration: "Doc." });
  noter({ type: "manager.split-asked", payload: { run: "decoupe-31-a", fingerprint: "e2", question: "Quel écran ?" } }, 31);
  noter({ type: "manager.split-commented", payload: {} }, 31);
  noter({ type: "manager.split", payload: { run: "decoupe-31-b", fingerprint: "e4", reason: "Deux livrables.", order: "Le socle d'abord.", tickets: [prevu("Le socle", []), prevu("La suite", [1])] } }, 31);
  noter({ type: "manager.split-creating", payload: { index: 1 } }, 31);
  noter({ type: "manager.split-created", payload: { epic: 31, index: 1, reconciled: false } }, 501);
  noter({ type: "manager.split-fired", payload: { epic: 31, index: 1 } }, 501);
  noter({ type: "manager.split-creating", payload: { index: 2 } }, 31);
  noter({ type: "manager.split-created", payload: { epic: 31, index: 2, reconciled: true } }, 502);
  noter({ type: "manager.split-fired", payload: { epic: 31, index: 2 } }, 502);
  noter({ type: "manager.split-done", payload: {} }, 31);
  noter({ type: "manager.split-commented", payload: {} }, 31);
  noter({ type: "manager.split-adopted", payload: { epic: 31, title: "Un ticket du chef" } }, 40);
  noter({ type: "manager.split-seen", payload: { epic: 31, open: false } }, 502);
  noter({ type: "manager.split-listed", payload: { digest: "abc" } }, 31);
  // Une réaction à un ticket resté rouge : une montée, posée et dite.
  noter(
    {
      type: "manager.reacted",
      payload: { verdict: 12, returns: 2, choice: "raise", reason: "Le cook cale.", proposal: null, run: "reagit-30-abc", from: { model: "haiku", effort: "low" }, to: { model: "haiku", effort: "medium" } },
    },
    30,
  );
  noter({ type: "manager.raised", payload: { added: ["effort:medium"], removed: ["effort:low"] } }, 30);
  noter({ type: "manager.reaction-commented", payload: {} }, 30);
  noter({ type: "manager.split-skipped", payload: { run: "decoupe-33-a", fingerprint: "e5", reason: "Elle liste déjà ses tickets." } }, 33);
  noter({ type: "manager.split-failed", payload: { run: "decoupe-34-a", fingerprint: "e6", reason: "aucun ticket dans le découpage" } }, 34);
}

// Le grant donné puis repris ; un ticket jugé rouge, renvoyé, puis vert et
// mergé sous grant ; un autre vert sans grant, arrêté ; un troisième remonté.
function raconterLaPass(journal: Journal): void {
  const limits = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
  const noter = (fait: Fait, ticket: number | null = null, author = "pass") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const livrer = (run: string, ticket: number, branche = run) => {
    const payload = { run, limits, stream: `runs/${run}.jsonl`, station: "box/claude", model: "sonnet", effort: "low", branch: `cook/${branche}`, worktree: `worktrees/${branche}` };
    noter({ type: "cook.launched", payload }, ticket, "runtime");
    noter({ type: "cook.reported", payload: { run, ending: "done", reason: null, summary: null, branch: `cook/${branche}`, pr: `https://github.com/o/r/pull/${ticket}` } }, ticket, "station:box/claude");
  };
  const juger = (run: string, ticket: number, verdict: "green" | "red") => {
    const pr = { run, pr: `https://github.com/o/r/pull/${ticket}`, number: ticket, sha: `sha-${run}` };
    noter({ type: "pass.started", payload: pr }, ticket);
    const gates = { outcome: verdict, code: verdict === "green" ? 0 : 1, failures: verdict === "green" ? [] : ["FAIL  tests"], tail: "" };
    const findings = verdict === "green" ? [] : ["Gates rouges."];
    return noter({ type: "pass.judged", payload: { ...pr, verdict, gates, ci: { outcome: "none", checks: [] }, findings, judgeModified: false, review: { outcome: "skipped", run: null, summary: null, findings: [] }, noDiff: false } }, ticket);
  };
  noter({ type: "grant.activated", payload: { action: "merge" } }, null, "chef");
  livrer("g", 21);
  juger("g", 21, "red");
  noter({ type: "pass.returned", payload: { n: 1, findings: ["Gates rouges."] } }, 21);
  livrer("h", 21, "g");
  const vert = juger("h", 21, "green");
  noter({ type: "grant.used", payload: { action: "merge", pr: "https://github.com/o/r/pull/21", number: 21, sha: "sha-h", base: "v2", verdict: vert?.seq ?? 0 } }, 21);
  noter({ type: "merge.failed", payload: { pr: "https://github.com/o/r/pull/21", sha: "sha-h", reason: "interrupted" } }, 21);
  noter({ type: "grant.used", payload: { action: "merge", pr: "https://github.com/o/r/pull/21", number: 21, sha: "sha-h", base: "v2", verdict: vert?.seq ?? 0 } }, 21);
  noter({ type: "merge.done", payload: { pr: "https://github.com/o/r/pull/21", sha: "sha-h", by: "pass", reconciled: false } }, 21);
  noter({ type: "grant.revoked", payload: { action: "merge" } }, null, "chef");
  livrer("i", 22);
  juger("i", 22, "green");
  noter({ type: "pass.held", payload: { reason: "no-grant" } }, 22);
  // Mergée à la main : son merge est à vérifier sur la base, et le contrôle
  // d'avant ne l'a pas vu.
  noter({ type: "base.checked", payload: { sha: "base-1", outcome: "green", gates: { outcome: "green", code: 0, failures: [], tail: "" }, tickets: [21] } }, null);
  noter({ type: "merge.done", payload: { pr: "https://github.com/o/r/pull/22", sha: "sha-i", by: "outside", reconciled: false, unverified: true } }, 22);
  // Ce merge-là reste à vérifier : la base ne se rapatrie pas.
  noter({ type: "base.check-held", payload: { reason: "git fetch : fatal: origine injoignable" } }, null);
  livrer("j", 23);
  noter({ type: "pass.escalated", payload: { reason: "no-gates" } }, 23);
  // Un ticket qui quitte le rail emporte sa pass, pas les usages du grant.
  livrer("k", 24);
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 24, "github");
}

// Une station qui s'annonce, lance un cook qui livre, bute sur le quota, perd
// sa connexion, puis que le chef fait reprendre.
function raconterLaStation(journal: Journal): void {
  const station = "box/claude";
  const limits = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
  const noter = (fait: Fait, ticket: number | null = null, author = `station:${station}`) =>
    journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const lancer = (run: string, ticket: number) =>
    noter({ type: "cook.launched", payload: { run, limits, stream: `runs/${run}.jsonl`, station, model: "sonnet", effort: "low", branch: `cook/${run}`, worktree: `worktrees/${run}` } }, ticket, "runtime");
  const sortir = (run: string, ticket: number, outcome: "ok" | "neutral") =>
    noter({ type: "cook.exited", payload: { run, outcome, code: outcome === "ok" ? 0 : 1, signal: null, turns: 4, tokens: 70, durationMs: 9 } }, ticket, "runtime");
  noter({ type: "station.announced", payload: { station, engine: "claude", provides: ["code"], maxCooks: 1 } });
  lancer("d", 1);
  sortir("d", 1, "ok");
  noter({ type: "cook.reported", payload: { run: "d", ending: "done", reason: null, summary: "fait", branch: "cook/d", pr: "https://github.com/o/r/pull/9" } }, 1);
  lancer("e", 3);
  sortir("e", 3, "neutral");
  noter({ type: "station.86", payload: { station, reason: "quota", until: `${JOUR_HORLOGE}T15:00:00.000Z`, window: "five_hour" } });
  noter({ type: "station.disconnected", payload: { station, reason: "authentication_failed", run: null } });
  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");
  lancer("f", 3);
  noter({ type: "cook.interrupted", payload: { run: "f" } }, 3, "runtime");
  noter({ type: "station.disconnected", payload: { station, reason: "authentication_failed", run: "f" } }, 3);
}

// Six tickets, un par destin : resté en attente, pris, rendu, servi, 86, parti.
function raconterLeRail(journal: Journal): void {
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T11:00:00.000Z`) });
  for (const ticket of [1, 2, 3, 4, 5, 6]) {
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-0${ticket}T00:00:00.000Z`, url: `https://exemple.test/${ticket}` },
    });
  }
  journal.ajouter({ project: "brigade", ticket: 1, author: "github", type: "ticket.changed", payload: { title: "Renommé", priority: 3 } });
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "rail.commons", payload: { paths: ["docs/runtime.md"] } });
  journal.ajouter({ project: "brigade", ticket: 6, author: "github", type: "ticket.left", payload: { reason: "closed" } });
  // Le ticket 1 passe son tour : les stations prennent les suivants, dans l'ordre.
  rail.quatreVingtSix(1, { motif: "station absente" });
  for (const ticket of [2, 3, 4, 5]) assert.equal(rail.prendre(`box/cook-${ticket}`)?.ticket, ticket);
  rail.rendre(1, "station revenue");
  rail.renouveler(2, "box/cook-2");
  rail.rendre(3, "returned", "box/cook-3");
  rail.envoyerEnPass(4, "box/cook-4");
  rail.servir(4);
  rail.quatreVingtSix(5, { motif: "quota", retour: new Date(`${JOUR_HORLOGE}T15:00:00.000Z`), station: "box/cook-5" });
  assert.deepEqual(
    rail.tickets().map((ticket) => [ticket.ticket, ticket.state]),
    [[1, "waiting"], [2, "taken"], [3, "waiting"], [4, "served"], [5, "86"]],
  );
}

// Un cook arrêté par un plafond, un autre mort avec le runtime, le disjoncteur
// qui s'ouvre, puis le chef qui arrête et reprend.
function raconterLesGardeFous(journal: Journal): void {
  const limits = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
  const noter = (fait: FaitGardeFous, ticket: number | null = null, author = "runtime") =>
    journal.ajouter({ project: "brigade", ticket, author, ...fait });
  noter({ type: "guard.configured", payload: { limits, breakerThreshold: 1 } });
  noter({ type: "cook.launched", payload: { run: "a", limits, stream: "runs/a.jsonl" } }, 7);
  noter({ type: "guard.tripped", payload: { run: "a", reason: "turns", limit: 100, observed: 101 } }, 7);
  noter({ type: "cook.exited", payload: { run: "a", outcome: "guard", code: null, signal: "SIGTERM", turns: 101, tokens: 900, durationMs: 40 } }, 7);
  noter({ type: "breaker.opened", payload: { failures: 1, threshold: 1 } });
  noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");
  noter({ type: "cook.launched", payload: { run: "b", limits, stream: "runs/b.jsonl" } }, 8);
  noter({ type: "cook.interrupted", payload: { run: "b" } }, 8);
  noter({ type: "cook.launched", payload: { run: "c", limits, stream: "runs/c.jsonl" } }, 9);
  noter({ type: "cook.progressed", payload: { run: "c", turns: 1, tokens: 10 } }, 9);
  noter({ type: "cook.exited", payload: { run: "c", outcome: "failed", code: 1, signal: null, turns: 2, tokens: 30, durationMs: 12 } }, 9);
  noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
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

test("une projection dont la table date d'une version précédente est refaite au rejeu", (t) => {
  const repertoire = repertoireTemporaire(t);
  const ancien = ouvrirJournal(repertoire, { maintenant: horloge() });
  raconter(ancien);
  const avant = photographier(ancien, PROJECTIONS);
  // Le rail d'avant le calibrage : une table du même nom, sans les colonnes d'aujourd'hui.
  ancien.base.script("DROP TABLE rail; CREATE TABLE rail (ticket INTEGER PRIMARY KEY, title TEXT) STRICT;");
  ancien.fermer();

  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
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
    startedAt: `${JOUR_HORLOGE}T10:00:00.000Z`,
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
  assert.deepEqual(derniereSession(journal.base)?.ending, "interrupted");
  assert.deepEqual(photographier(journal, [sessions])["sessions/runtime_sessions"], [
    { started_seq: 1, started_at: `${JOUR_HORLOGE}T10:00:00.000Z`, pid: 100, host: "box", ended_seq: 2, ended_at: `${JOUR_HORLOGE}T10:00:01.000Z`, ending: "interrupted" },
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
      "runtime.ticked": () => {},
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

test("seul le dernier tick est gardé, avec son heure et la cadence attendue", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const tick = () => journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 60_000 } });

  assert.equal(dernierTick(journal.base), null);
  journal.ajouter(demarrage(100));
  tick();
  tick();

  assert.deepEqual(dernierTick(journal.base), { seq: 3, at: `${JOUR_HORLOGE}T10:00:02.000Z`, intervalMs: 60_000 });
  assert.deepEqual(derniereSession(journal.base), {
    startedSeq: 1,
    startedAt: `${JOUR_HORLOGE}T10:00:00.000Z`,
    pid: 100,
    host: "box",
    endedAt: null,
    ending: null,
  });
});

test("un cook en cours porte son dernier relevé ; fini, il n'en a plus", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const limits = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
  const noter = (fait: FaitGardeFous) => journal.ajouter({ project: "brigade", ticket: 7, author: "runtime", ...fait });
  noter({ type: "cook.launched", payload: { run: "a", limits, stream: "runs/a.jsonl" } });
  noter({ type: "cook.launched", payload: { run: "b", limits, stream: "runs/b.jsonl" } });
  assert.deepEqual(mesuresDesCooksEnCours(journal.base), []);

  noter({ type: "cook.progressed", payload: { run: "a", turns: 2, tokens: 300 } });
  noter({ type: "cook.progressed", payload: { run: "a", turns: 5, tokens: 900 } });

  assert.deepEqual(mesuresDesCooksEnCours(journal.base), [{ run: "a", at: `${JOUR_HORLOGE}T10:00:03.000Z`, turns: 5, tokens: 900 }]);

  noter({ type: "cook.exited", payload: { run: "a", outcome: "ok", code: 0, signal: null, turns: 6, tokens: 950, durationMs: 40 } });

  assert.deepEqual(mesuresDesCooksEnCours(journal.base), []);
  assert.deepEqual(cooksEnCours(journal.base).map((cook) => cook.run), ["b"]);
});

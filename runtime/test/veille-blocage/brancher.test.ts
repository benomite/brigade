// La veille du blocage branchée sur le runtime d'un projet (#4213) : ce qu'elle lit du tour GitHub seul, du journal et
// de la machine, ce qu'elle rend, et où vont ses cartes.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Carte, GitHubDesCartes, Pose } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { ouvrirJournal, type Journal } from "../../src/journal.ts";
import { configMachine, type Machine } from "../../src/machine.ts";
import type { Runtime } from "../../src/runtime.ts";
import type { FaitsDuProjet } from "../../src/superviseur/declencheur.ts";
import type { SuiviDuTour } from "../../src/superviseur/tour.ts";
import { wireStallWatchdog } from "../../src/stall-watchdog/wire.ts";
import { outagesInLastSevenDays } from "../../src/stall-watchdog/watchdog.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

const STATION = "box/claude";
const PROJET = "brigade";
const NOW = new Date("2026-11-25T12:00:00.000Z");
const GO = 1024 * 1024 * 1024;
const il = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const SAINE: Machine = { charge: 4, coeurs: 8, memoireDisponible: 16 * GO, memoireTotale: 32 * GO, disqueLibre: 100 * GO };

type Options = {
  faits?: Partial<FaitsDuProjet>;
  machine?: () => Machine;
  processus?: (repertoire: string) => { pid: number; cwd: string | null }[];
  tuer?: (pid: number) => void;
  pose?: Pose;
  sauts?: string[];
  journal?: (journal: Journal) => void;
  tour?: SuiviDuTour | null;
  fichiers?: (repertoire: string) => string[];
  clone?: string;
};

const LIMITES = { durationMs: 1, tokens: 1, idleMs: 1 };
const lancer = (journal: Journal, run: string) => journal.ajouter({ project: PROJET, ticket: 5, author: "station", type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: STATION } });
const cookFini = (journal: Journal) => {
  lancer(journal, "run-5");
  journal.ajouter({ project: PROJET, ticket: 5, author: "station", type: "cook.exited", payload: { run: "run-5", outcome: "failed", code: 1, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
};
const ORPHELIN = (repertoire: string) => [{ pid: 4242, cwd: join(repertoire, "worktrees", "run-5", "app") }, { pid: 99, cwd: "/elsewhere" }];

function monter(t: TestContext, options: Options = {}) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  options.journal?.(journal);
  const faits: FaitsDuProjet = { dernierMerge: il(80), cuisinables: [{ ticket: 7, depuis: il(300) }], prises: [], mainRougeDepuis: null, ...options.faits };
  const tour = options.tour === undefined ? ({ faits: () => faits, sauts: () => options.sauts ?? [] } as unknown as SuiviDuTour) : options.tour;
  const reveils: (() => void)[] = [];
  const runtime = { projet: PROJET, journal, surReveil: (ecouter: () => void) => (reveils.push(ecouter), () => {}) } as unknown as Runtime;
  const lignes: string[] = [];
  const disque: Carte[] = [];
  const tues: number[] = [];
  const retires: string[] = [];
  const elagues: string[] = [];
  const commentaires: { numero: number; corps: string }[] = [];
  const github = {
    issue: async () => ({ labels: [] }),
    commentaires: async () => [],
    commenter: async (numero: number, corps: string) => void commentaires.push({ numero, corps }),
    labelliser: async () => {},
    delabelliser: async () => {},
  } as unknown as GitHubDesCartes;
  const rendu = wireStallWatchdog(runtime, {
    tour,
    station: STATION,
    repertoireEtat: repertoire,
    seuils: configMachine({}),
    env: { BRIGADE_WORKTREES_DIR: join(repertoire, "worktrees"), ...(options.clone === undefined ? {} : { BRIGADE_REPO_DIR: options.clone }) },
    disque: { poser: async (carte) => (disque.push(carte), options.pose ?? "posee") },
    github,
    dire: (ligne) => lignes.push(ligne),
    machine: options.machine ?? (() => SAINE),
    fichiers: { lister: (dossier) => (dossier === join(repertoire, "worktrees") ? (options.fichiers?.(repertoire) ?? []) : []), retirer: (chemin) => void retires.push(chemin), elaguer: (clone) => void elagues.push(clone) },
    processus: { lister: () => options.processus?.(repertoire) ?? [], tuer: options.tuer ?? ((pid) => void tues.push(pid)) },
    maintenant: () => NOW,
  });
  assert.equal(rendu, runtime);
  return { repertoire, lignes, disque, tues, retires, elagues, commentaires, reveiller: () => reveils.forEach((ecouter) => ecouter()), reveils };
}

test("after an hour without a merge, with a ticket waiting, the wake diagnoses the machine and says what it read", (t) => {
  const m = monter(t, { faits: { prises: [{ ticket: 12, prises: 3 }, { ticket: 13, prises: 2 }] }, sauts: ["#9 waits for #8"] });
  m.reveiller();
  assert.equal(m.lignes.length, 1);
  assert.match(m.lignes[0]!, /1 ticket\(s\) wait, and no machine cause: load 0\.50 per core, 0 cook\(s\) running, take gate: #9 waits for #8, looping tickets: #12 —/);
});

test("the hour counts from the later of the last merge and the oldest waiting ticket: 20 min after a merge, nothing", (t) => {
  const m = monter(t, { faits: { dernierMerge: il(20) } });
  m.reveiller();
  assert.deepEqual(m.lignes, []);
});

test("the hour counts from the oldest waiting ticket when no merge is known", (t) => {
  const recent = monter(t, { faits: { dernierMerge: null, cuisinables: [{ ticket: 7, depuis: il(20) }] } });
  recent.reveiller();
  const ancien = monter(t, { faits: { dernierMerge: null, cuisinables: [{ ticket: 7, depuis: il(80) }] } });
  ancien.reveiller();
  assert.deepEqual(recent.lignes, []);
  assert.equal(ancien.lignes.length, 1);
});

test("a kitchen stopped by the chef, or switched off, is not watched", (t) => {
  const arretee = monter(t, { journal: (journal) => journal.ajouter({ project: PROJET, ticket: null, author: "chef", type: "kitchen.stopped", payload: {} }) });
  arretee.reveiller();
  const eteinte = monter(t, { journal: (journal) => journal.ajouter({ project: PROJET, ticket: null, author: "chef", type: "project.switched-off", payload: {} }) });
  eteinte.reveiller();
  assert.deepEqual([arretee.lignes, eteinte.lignes], [[], []]);
});

test("without the GitHub-only round, nothing is hooked", (t) => {
  const m = monter(t, { tour: null });
  assert.equal(m.reveils.length, 0);
});

test("the orphaned processes of an exited cook are stopped for real, and the line says so", (t) => {
  const m = monter(t, { journal: cookFini, processus: ORPHELIN });
  m.reveiller();
  assert.deepEqual(m.tues, [4242]);
  assert.equal(m.lignes.length, 1);
  assert.match(m.lignes[0]!, /cause: leftovers of exited cooks: process\(es\) 4242, file\(s\) none; action: stopped and removed them/);
});

test("a repair that cannot stop a process says the repair failed", (t) => {
  const m = monter(t, { journal: cookFini, processus: ORPHELIN, tuer: () => assert.fail("EPERM") });
  m.reveiller();
  assert.match(m.lignes[0]!, /the repair failed \(could not reclaim pid 4242\)/);
});

test("a saturated machine with no cook in flight gets one card on the first waiting ticket, counted as an outage", async (t) => {
  const m = monter(t, { machine: () => ({ ...SAINE, charge: 16 }) });
  m.reveiller();
  await jusqua(() => m.lignes.length === 1);
  assert.equal(m.commentaires.length, 1);
  assert.equal(m.commentaires[0]!.numero, 7);
  assert.match(m.commentaires[0]!.corps, /the machine is saturated \(load 2\.00 per core, the limit is 1\.5\)/);
  assert.equal(outagesInLastSevenDays(m.repertoire, NOW.getTime()), 1);
});

test("the same saturated machine with a cook of this station in flight gets no card", (t) => {
  const m = monter(t, { machine: () => ({ ...SAINE, charge: 16 }), journal: (journal) => lancer(journal, "run-6") });
  m.reveiller();
  assert.match(m.lignes[0]!, /no machine cause: load 2\.00 per core, 1 cook\(s\) running/);
  assert.deepEqual(m.commentaires, []);
});

test("a full disk gets its card on the disk issue; a card already there is no new outage", async (t) => {
  const pleine = monter(t, { machine: () => ({ ...SAINE, disqueLibre: GO }) });
  pleine.reveiller();
  await jusqua(() => pleine.lignes.length === 1);
  assert.equal(pleine.disque.length, 1);
  assert.match(pleine.disque[0]!.texte, /the disk of this station is full/);
  assert.equal(pleine.disque[0]!.sorte, "blocked");
  assert.deepEqual(pleine.commentaires, []);
  assert.equal(outagesInLastSevenDays(pleine.repertoire, NOW.getTime()), 1);
  const deja = monter(t, { machine: () => ({ ...SAINE, disqueLibre: GO }), pose: "deja" });
  deja.reveiller();
  await jusqua(() => deja.lignes.length === 1);
  assert.equal(outagesInLastSevenDays(deja.repertoire, NOW.getTime()), 0);
});

test("a saturated machine whose waiting ticket left the rail meanwhile says the card was not posted", async (t) => {
  const faits: FaitsDuProjet = { dernierMerge: il(80), cuisinables: [{ ticket: 7, depuis: il(300) }], prises: [], mainRougeDepuis: null };
  let lus = 0;
  const tour = { faits: () => (lus++ < 3 ? faits : { ...faits, cuisinables: [] }), sauts: () => [] } as unknown as SuiviDuTour;
  const m = monter(t, { machine: () => ({ ...SAINE, charge: 16 }), tour });
  m.reveiller();
  await jusqua(() => m.lignes.length === 1);
  assert.match(m.lignes[0]!, /the TODO card could not be posted \(no ticket waits any more to carry the card\)/);
});

test("a wake whose round cannot be read says the watchdog did not check", (t) => {
  const tour = { faits: () => assert.fail("round unreadable"), sauts: () => [] } as unknown as SuiviDuTour;
  const m = monter(t, { tour });
  m.reveiller();
  assert.match(m.lignes[0]!, /watchdog on brigade — not checked \(round unreadable\)/);
});

test("the leftover worktree of an exited cook is removed for real, and the clone forgets it", (t) => {
  const m = monter(t, { journal: cookFini, fichiers: () => ["run-5", "run-9"], clone: "/srv/clone" });
  m.reveiller();
  assert.deepEqual(m.retires, [join(m.repertoire, "worktrees", "run-5")]);
  assert.deepEqual(m.elagues, ["/srv/clone"]);
  assert.match(m.lignes[0]!, /process\(es\) none, file\(s\) .*run-5; action: stopped and removed them/);
});

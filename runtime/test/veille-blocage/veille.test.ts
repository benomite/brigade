// La veille du blocage (#4213) au-delà des tests d'acceptation : ce qu'elle fait quand une lecture manque, les causes
// une à une, et la mémoire des causes dites au chef.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createWatchdog, recordMachineOutage, outagesInLastSevenDays, type WatchdogCard, type MachineFacts } from "../../src/stall-watchdog/watchdog.ts";
import { jusqua } from "../outils.ts";

const HEURE = 3_600_000;
const NOW = 1_000_000_000_000;
const SAINS: MachineFacts = { charge: 0.5, cooks: 1, portes: [], boucles: [], restes: { processus: [], fichiers: [] }, disquePlein: false };

type Monte = {
  faits?: () => MachineFacts;
  dernierMerge?: number | null;
  reparer?: () => void;
  creerCarte?: (carte: WatchdogCard) => void | boolean | Promise<void | boolean>;
  racine?: string;
};

function monter(opts: Monte = {}) {
  const t = { now: NOW };
  const racine = opts.racine ?? mkdtempSync(join(tmpdir(), "veille-blocage-"));
  const cartes: WatchdogCard[] = [];
  const reparations: unknown[] = [];
  const lignes: string[] = [];
  let faits = opts.faits ?? (() => SAINS);
  const veille = createWatchdog({
    racine,
    maintenant: () => t.now,
    dernierMerge: () => (opts.dernierMerge === undefined ? NOW - 61 * 60_000 : opts.dernierMerge),
    attendent: () => 2,
    faits: () => faits(),
    reparer: (r) => {
      reparations.push(r);
      opts.reparer?.();
    },
    creerCarte: (c) => {
      cartes.push(c);
      return opts.creerCarte?.(c);
    },
    ecrire: (l) => lignes.push(l),
  });
  return { t, racine, cartes, reparations, lignes, veille, poser: (f: MachineFacts) => (faits = () => f) };
}

test("with no merge known, the watchdog does nothing", () => {
  const m = monter({ dernierMerge: null });
  m.veille.verifier();
  assert.deepEqual([m.cartes, m.reparations, m.lignes], [[], [], []]);
});

test("with no machine cause, it says so once, with the facts it read", () => {
  const m = monter({ faits: () => ({ ...SAINS, portes: ["#7 waits for #6"], boucles: [12] }) });
  m.veille.verifier();
  m.t.now += 60_000;
  m.veille.verifier();
  assert.equal(m.lignes.length, 1);
  assert.match(m.lignes[0]!, /nothing merged for 60 min or more while 2 ticket\(s\) wait, and no machine cause: load 0\.50 per core, 1 cook\(s\) running/);
  assert.match(m.lignes[0]!, /#7 waits for #6/);
  assert.match(m.lignes[0]!, /looping tickets: #12/);
  assert.deepEqual([m.cartes, m.reparations], [[], []]);
});

test("leftover files alone are repaired too, and the line names them", () => {
  const m = monter({ faits: () => ({ ...SAINS, restes: { processus: [], fichiers: ["/etat/worktrees/run-1"] } }) });
  m.veille.verifier();
  assert.deepEqual(m.reparations, [{ sorte: "restes", processus: [], fichiers: ["/etat/worktrees/run-1"] }]);
  assert.equal(m.lignes.length, 1);
  assert.match(m.lignes[0]!, /process\(es\) none, file\(s\) \/etat\/worktrees\/run-1; action: stopped and removed them/);
});

test("the repair line names the leftover processes", () => {
  const m = monter({ faits: () => ({ ...SAINS, restes: { processus: [4242], fichiers: [] } }) });
  m.veille.verifier();
  assert.match(m.lignes[0]!, /process\(es\) 4242, file\(s\) none/);
});

test("a repair that fails says so, and posts no card", () => {
  const m = monter({ faits: () => ({ ...SAINS, restes: { processus: [4242], fichiers: [] } }), reparer: () => assert.fail("EPERM") });
  m.veille.verifier();
  assert.equal(m.lignes.length, 1);
  assert.match(m.lignes[0]!, /the repair failed \(EPERM\)/);
  assert.deepEqual(m.cartes, []);
});

test("facts that cannot be read are said once, and nothing is repaired nor posted", () => {
  const m = monter({ faits: () => assert.fail("statfs failed") });
  m.veille.verifier();
  m.veille.verifier();
  assert.equal(m.lignes.length, 1);
  assert.match(m.lignes[0]!, /machine facts could not be read \(statfs failed\)/);
  assert.deepEqual([m.cartes, m.reparations], [[], []]);
});

test("a saturated machine with no cook running is a human cause; with a cook running, or under the limit, it is not", () => {
  const sature = monter({ faits: () => ({ ...SAINS, charge: 2, cooks: 0 }) });
  sature.veille.verifier();
  assert.equal(sature.cartes.length, 1);
  assert.equal(sature.cartes[0]!.cause, "cpu");
  assert.match(sature.cartes[0]!.texte, /the machine is saturated \(load 2\.00 per core, the limit is 1\.5\) and no cook of the kitchen runs/);
  assert.match(sature.cartes[0]!.texte, /Nothing has merged for 61 min while 2 ticket\(s\) wait/);
  const avecCook = monter({ faits: () => ({ ...SAINS, charge: 2, cooks: 1 }) });
  avecCook.veille.verifier();
  const sous = monter({ faits: () => ({ ...SAINS, charge: 1.4, cooks: 0 }) });
  sous.veille.verifier();
  assert.deepEqual([avecCook.cartes, sous.cartes], [[], []]);
});

test("the disk card tells the chef to free the disk; the line counts the outages of the week", () => {
  const m = monter({ faits: () => ({ ...SAINS, disquePlein: true }) });
  m.veille.verifier();
  assert.equal(m.cartes[0]!.cause, "disk");
  assert.match(m.cartes[0]!.texte, /the disk of this station is full\. The kitchen cannot free it by itself/);
  assert.equal(m.lignes.length, 1);
  assert.match(m.lignes[0]!, /cause: disk, which needs a human; action: one TODO card for the chef \(1 machine outage\(s\) reached the chef in the last 7 days\)/);
});

test("a cause that goes and comes back gets a new card; a cause still there does not, and says nothing more", () => {
  const m = monter({ faits: () => ({ ...SAINS, disquePlein: true }) });
  m.veille.verifier();
  m.veille.verifier();
  assert.equal(m.cartes.length, 1);
  assert.equal(m.lignes.length, 1);
  m.poser(SAINS);
  m.veille.verifier();
  m.poser({ ...SAINS, disquePlein: true });
  m.veille.verifier();
  assert.equal(m.cartes.length, 2);
  assert.equal(outagesInLastSevenDays(m.racine, NOW), 2);
});

test("the causes told to the chef outlive the process: a new watchdog on the same directory posts no second card", () => {
  const a = monter({ faits: () => ({ ...SAINS, disquePlein: true }) });
  a.veille.verifier();
  const b = monter({ racine: a.racine, faits: () => ({ ...SAINS, disquePlein: true, charge: 2, cooks: 0 }) });
  b.veille.verifier();
  assert.deepEqual(b.cartes.map(({ cause }) => cause), ["cpu"]);
});

test("a card that was already there opens the cause, but is no new outage", () => {
  const m = monter({ faits: () => ({ ...SAINS, disquePlein: true }), creerCarte: () => false });
  m.veille.verifier();
  m.veille.verifier();
  assert.equal(m.cartes.length, 1);
  assert.equal(outagesInLastSevenDays(m.racine, NOW), 0);
  assert.match(m.lignes[0]!, /the chef already had a card for disk; none is added/);
});

test("a card posted asynchronously is posted once while it is pending, and counted once it is posted", async () => {
  let poser = (_: boolean) => {};
  const m = monter({ faits: () => ({ ...SAINS, disquePlein: true }), creerCarte: () => new Promise<boolean>((resoudre) => (poser = resoudre)) });
  m.veille.verifier();
  m.veille.verifier();
  assert.equal(m.cartes.length, 1);
  poser(true);
  await jusqua(() => m.lignes.length === 1);
  assert.equal(outagesInLastSevenDays(m.racine, NOW), 1);
  m.veille.verifier();
  assert.equal(m.cartes.length, 1);
});

test("a card that cannot be posted is said, and tried again next time", async () => {
  let essais = 0;
  const m = monter({ faits: () => ({ ...SAINS, disquePlein: true }), creerCarte: () => (essais++ === 0 ? Promise.reject(new Error("GitHub is down")) : true) });
  m.veille.verifier();
  await jusqua(() => m.lignes.length === 1);
  assert.match(m.lignes[0]!, /the TODO card could not be posted \(GitHub is down\), tried again next time/);
  m.veille.verifier();
  assert.equal(m.cartes.length, 2);
  assert.equal(outagesInLastSevenDays(m.racine, NOW), 1);
});

test("a card whose posting throws at once is said too", () => {
  const m = monter({ faits: () => ({ ...SAINS, disquePlein: true }), creerCarte: () => assert.fail("no client") });
  m.veille.verifier();
  assert.match(m.lignes[0]!, /the TODO card could not be posted \(no client\)/);
  assert.equal(outagesInLastSevenDays(m.racine, NOW), 0);
});

test("an unreadable memory posts no card, is never overwritten, and says so", () => {
  for (const contenu of ["{not json", JSON.stringify({ open: [] }), JSON.stringify({ outages: [] })]) {
    const m = monter({ faits: () => ({ ...SAINS, disquePlein: true }) });
    writeFileSync(join(m.racine, "stall-watchdog.json"), contenu);
    m.veille.verifier();
    assert.deepEqual(m.cartes, []);
    assert.match(m.lignes[0]!, /stall-watchdog\.json could not be read/);
    assert.equal(readFileSync(join(m.racine, "stall-watchdog.json"), "utf8"), contenu);
  }
});

test("a card posted while the memory breaks is said as posted but not noted", () => {
  const m = monter({ faits: () => ({ ...SAINS, disquePlein: true }), creerCarte: () => writeFileSync(join(m.racine, "stall-watchdog.json"), "{not json") });
  m.veille.verifier();
  assert.equal(m.cartes.length, 1);
  assert.match(m.lignes[0]!, /the card for disk is posted, but it was not noted/);
});

test("an outage noted by the disk guard counts in the week", () => {
  const racine = mkdtempSync(join(tmpdir(), "veille-blocage-"));
  recordMachineOutage(racine, "disk", NOW - 2 * 24 * HEURE);
  assert.equal(outagesInLastSevenDays(racine, NOW), 1);
});

// Une cuisine oisive alors que des cartes sont sur le rail : une panne (#1862).
// `status` la dit par sa ligne `fault`, avec la durée de l'oisiveté ; `facts` la
// porte dans `cuisineOisive`. Hors des quatre conditions, ni l'une ni l'autre.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { lireLesFaits } from "../src/faits.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { principal as status } from "../src/status.ts";
import { appeler, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const MINUTE_MS = 60_000;
const DEBUT = Date.parse(`${JOUR_HORLOGE}T10:00:00.000Z`);
const PLAFONDS = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const FAUTE = /^fault {6}IDLE KITCHEN/m;

// Un journal dont l'horloge se règle à la minute près : `a(m)` pose l'instant
// des faits suivants à 10:00 + m minutes.
function cuisine(t: TestContext, debut = DEBUT) {
  const repertoire = repertoireTemporaire(t);
  let instant = debut;
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(instant) });
  let ouvert = true;
  const fermer = () => {
    if (ouvert) journal.fermer();
    ouvert = false;
  };
  t.after(fermer);
  const a = (minutes: number) => void (instant = debut + minutes * MINUTE_MS);
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number, waitsFor: number[] = []) =>
    noter(
      {
        type: "ticket.arrived",
        payload: { title: `Ticket ${ticket}`, priority: 1, createdAt: "2026-10-01T00:00:00Z", url: `https://exemple.test/${ticket}`, card: { waitsFor, zone: [], problems: [] } },
      },
      ticket,
      "github",
    );
  const lancer = (run: string, ticket: number) => noter({ type: "cook.launched", payload: { run, limits: PLAFONDS, stream: `runs/${run}.jsonl` } }, ticket);
  const finir = (run: string, ticket: number) =>
    noter({ type: "cook.exited", payload: { run, outcome: "ok", code: 0, signal: null, turns: 1, tokens: 10, durationMs: MINUTE_MS } }, ticket);
  // Ce que `status` écrit et ce que `facts` porte, à 10:00 + m minutes.
  const lire = (minutes: number) => {
    const maintenant = new Date(debut + minutes * MINUTE_MS);
    const etat = lireEtat(journal, maintenant);
    return { texte: decrireEtat(etat, maintenant).join("\n"), panne: faits(etat, maintenant).cuisineOisive };
  };
  return { repertoire, fermer, a, noter, arriver, lancer, finir, lire };
}

// Le runtime en marche depuis 10:00, #7 sur le rail, et un cook fini à 10:02.
function apresUnCook(t: TestContext, debut = DEBUT) {
  const c = cuisine(t, debut);
  c.noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  c.arriver(7);
  c.a(1);
  c.lancer("r1", 7);
  c.a(2);
  c.finir("r1", 7);
  return c;
}

test("30 min sans cook, une carte sur le rail : `status` écrit la ligne `fault` avec la durée, et `facts` porte la panne", (t) => {
  const { lire } = apresUnCook(t);

  const { texte, panne } = lire(32);
  assert.match(texte, /^fault {6}IDLE KITCHEN for 30 min — no cook has run, with 1 card on the rail: #7$/m);
  assert.deepEqual(panne, { depuis: `${JOUR_HORLOGE}T10:02:00.000Z`, cartes: [7] });
  // Au-dessus de tout le reste, sous l'urgence et `nothing cooks`, qui ne sont pas là.
  assert.equal(texte.split("\n")[0], "fault      IDLE KITCHEN for 30 min — no cook has run, with 1 card on the rail: #7");

  const tard = lire(2 + 130);
  assert.match(tard.texte, /^fault {6}IDLE KITCHEN for 2 h 10 — /m);
});

test("29 min sans cook : ni ligne `fault`, ni panne dans `facts`", (t) => {
  const { lire } = apresUnCook(t);

  const { texte, panne } = lire(31);
  assert.doesNotMatch(texte, FAUTE);
  assert.equal(panne, null);
});

test("le projet éteint par le chef — interrupteur coupé, « stop », runtime arrêté, toutes ses stations arrêtées — n'est pas en panne", async (t) => {
  await t.test("interrupteur coupé", (t) => {
    const { a, noter, lire } = apresUnCook(t);
    a(3);
    noter({ type: "project.switched-off", payload: {} }, null, "chef");
    assert.doesNotMatch(lire(60).texte, FAUTE);
    assert.equal(lire(60).panne, null);
  });
  await t.test("« stop » du chef", (t) => {
    const { a, noter, lire } = apresUnCook(t);
    a(3);
    noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
    assert.equal(lire(60).panne, null);
  });
  await t.test("runtime arrêté", (t) => {
    const { a, noter, lire } = apresUnCook(t);
    a(3);
    noter({ type: "runtime.stopped", payload: { signal: "SIGTERM" } });
    assert.equal(lire(60).panne, null);
  });
  await t.test("toutes ses stations arrêtées", (t) => {
    const { a, noter, lire } = apresUnCook(t);
    noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["code"], maxCooks: 2 } });
    a(3);
    noter({ type: "station.stopped", payload: { station: "box/claude" } }, null, "chef");
    assert.equal(lire(60).panne, null);
  });
  await t.test("rallumé, le compte repart de l'allumage", (t) => {
    const { a, noter, lire } = apresUnCook(t);
    a(3);
    noter({ type: "project.switched-off", payload: {} }, null, "chef");
    a(50);
    noter({ type: "project.switched-on", payload: {} }, null, "chef");
    assert.equal(lire(79).panne, null);
    assert.deepEqual(lire(80).panne, { depuis: `${JOUR_HORLOGE}T10:50:00.000Z`, cartes: [7] });
  });
});

test("toutes les cartes attendent une capacité ou un tiers — WAITING, mises de côté faute de station, ou n'attendant qu'elles — : pas de panne ; une carte de plus qui pourrait cuire, si", (t) => {
  const c = cuisine(t);
  c.noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  c.arriver(7);
  c.noter({ type: "ticket.waiting", payload: { what: "the client's answer", who: "the client", followUp: "2026-12-01T00:00:00.000Z" } }, 7, "chef");
  c.arriver(8);
  c.noter({ type: "ticket.86", payload: { reason: "no-station: chrome-connecté", until: null } }, 8, "station:box/claude");
  c.arriver(9);
  c.noter({ type: "ticket.86", payload: { reason: "station-absent: mac/claude", until: null } }, 9, "station:box/claude");
  // #10 attend #8 et #9, #11 attend #10 : de proche en proche, ils attendent une capacité.
  c.arriver(10, [8, 9]);
  c.arriver(11, [10]);

  const avant = c.lire(60);
  assert.doesNotMatch(avant.texte, FAUTE);
  assert.equal(avant.panne, null);

  // #12 attend #7 et un ticket mis de côté pour une autre raison : c'est la cuisine qu'il attend.
  c.arriver(13);
  c.noter({ type: "ticket.86", payload: { reason: "the kitchen took it up and has nothing left to try", until: null } }, 13, "pass");
  c.arriver(12, [7, 13]);
  const apres = c.lire(60);
  assert.deepEqual(apres.panne, { depuis: `${JOUR_HORLOGE}T10:00:00.000Z`, cartes: [12, 13] });
  // #12 attend : la ligne nomme la racine de chacune de ses attentes (#1902).
  assert.match(apres.texte, /^fault {6}IDLE KITCHEN for 1 h 00 — no cook has run, with 2 cards on the rail: #12, #13 — wait chains: #12 → #7 \(WAITING\) · #12 → #13 \(86\)$/m);
});

test("des cartes qui s'attendent de proche en proche : la ligne `fault` nomme la racine de leur chaîne, et où elle en est (#1902)", (t) => {
  const c = cuisine(t);
  c.noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  // Le cas du 29 octobre : #43 hors du rail, `fire` retiré ; #44 et #45 l'attendent, #46 et #47 attendent #44 et #45.
  c.arriver(43);
  c.arriver(44, [43]);
  c.arriver(45, [43]);
  c.arriver(46, [44, 45]);
  c.arriver(47, [46]);
  c.noter({ type: "ticket.left", payload: { reason: "unfired" } }, 43, "github");
  // #50 attend #49, jamais entré sur le rail ; #48 n'attend personne.
  c.arriver(48);
  c.arriver(50, [49]);

  const { texte, panne } = c.lire(30);
  // La forme de `facts` ne change pas.
  assert.deepEqual(panne, { depuis: `${JOUR_HORLOGE}T10:00:00.000Z`, cartes: [44, 45, 46, 47, 48, 50] });
  assert.match(
    texte,
    /^fault {6}IDLE KITCHEN for 30 min — no cook has run, with 6 cards on the rail: #44, #45, #46, #47, #48, #50 — wait chains: #44, #45, #46, #47 → #43 \(off the rail, issue still open: label `fire` removed\) · #50 → #49 \(not on the rail\)$/m,
  );
});

test("un rail vide n'est pas en panne, même sans cook depuis des heures", (t) => {
  const c = cuisine(t);
  c.noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });

  const { texte, panne } = c.lire(300);
  assert.doesNotMatch(texte, FAUTE);
  assert.equal(panne, null);
});

test("un cook qui tourne, ou une carte au travail ou en pass : pas de panne", async (t) => {
  await t.test("un cook en cours depuis 40 min", (t) => {
    const { a, lancer, lire } = apresUnCook(t);
    a(3);
    lancer("r2", 7);
    const { texte, panne } = lire(43);
    assert.doesNotMatch(texte, FAUTE);
    assert.equal(panne, null);
  });
  await t.test("une carte en pass, l'autre en attente", (t) => {
    const { a, noter, arriver, lire } = apresUnCook(t);
    arriver(8);
    a(3);
    noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T23:00:00.000Z` } }, 8, "station:box/claude");
    noter({ type: "ticket.passing", payload: { station: "box/claude" } }, 8, "station:box/claude");
    assert.equal(lire(60).panne, null);
  });
});

test("la ligne `fault` et le champ `cuisineOisive` se lisent par les commandes elles-mêmes, `status` et `facts`", async (t) => {
  // Le journal écrit il y a 40 min : le cook a fini il y a 38 min, à l'horloge de la box.
  const debut = Date.now() - 40 * MINUTE_MS;
  const { repertoire, fermer } = apresUnCook(t, debut);
  fermer();

  const lu = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await lu.fin, 0);
  assert.match(lu.sortie(), /^fault {6}IDLE KITCHEN for 3[89] min — no cook has run, with 1 card on the rail: #7$/m);

  const forme = lireLesFaits({ BRIGADE_STATE_DIR: repertoire });
  assert.deepEqual(forme.cuisineOisive, { depuis: new Date(debut + 2 * MINUTE_MS).toISOString(), cartes: [7] });
});

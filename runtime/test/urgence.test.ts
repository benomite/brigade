// L'urgence : plus rien ne cuit, et c'est le chef que toute la cuisine attend.
// Ce que l'état en expose — à `status`, aux faits —, ce qui la distingue d'une
// attente qui ne retient qu'une partie du rail, et ce qui la lève.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { JOUR_HORLOGE, jourDecale, repertoireTemporaire } from "./outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const STATION = "box/claude";
const pr = (ticket: number) => `https://exemple.test/pull/${ticket}`;
const heure = (h: string) => `${JOUR_HORLOGE}T${h}.000Z`;

// Une cuisine dont le test tient l'horloge : chaque fait s'écrit à l'heure dite.
function cuisine(t: TestContext) {
  let instant = heure("08:00:00");
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const a = (h: string) => {
    instant = heure(h);
  };
  const arriver = (ticket: number, zone: string[], waitsFor: number[] = []) =>
    noter(
      {
        type: "ticket.arrived",
        payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor, zone, problems: [] } },
      },
      ticket,
      "github",
    );
  // Le ticket déjà sur le rail, pris, cuisiné, livré avec sa PR.
  const cuisiner = (ticket: number) => {
    noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: `${jourDecale(30)}T00:00:00.000Z` } }, ticket, `station:${STATION}`);
    noter({ type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITES, stream: `runs/${ticket}-aa.jsonl`, branch: `cook/${ticket}-aa`, worktree: `worktrees/${ticket}-aa` } }, ticket);
    noter({ type: "cook.exited", payload: { run: `${ticket}-aa`, outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, ticket);
    noter({ type: "ticket.passing", payload: { station: STATION } }, ticket, `station:${STATION}`);
    noter({ type: "pass.started", payload: { run: `${ticket}-aa`, pr: pr(ticket), number: ticket, sha: `sha-${ticket}` } }, ticket, "pass");
  };
  // Verte, et laissée au chef : à merger à la main.
  const retenir = (ticket: number, reason = "review-required") => noter({ type: "pass.held", payload: { reason } } as never, ticket, "pass");
  // Le chef la merge à la main, et la pass le constate.
  const merger = (ticket: number) => {
    noter({ type: "merge.done", payload: { pr: pr(ticket), sha: `sha-${ticket}`, by: "outside", reconciled: false } }, ticket, "pass");
    noter({ type: "ticket.served", payload: {} }, ticket);
  };
  const lire = (h: string) => {
    const maintenant = new Date(heure(h));
    const etat = lireEtat(journal, maintenant);
    return { etat, faits: faits(etat, maintenant, "benomite/brigade"), texte: decrireEtat(etat, maintenant) };
  };
  noter({ type: "runtime.started", payload: { pid: 1, host: "box" } } as Fait);
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  return { noter, a, arriver, cuisiner, retenir, merger, lire };
}

test("une livraison à merger à la main qui tient toutes les zones : l'urgence porte la cause, la décision, son geste et le début de l'arrêt total — et `status` le dit en première ligne", (t) => {
  const { a, arriver, cuisiner, retenir, lire } = cuisine(t);
  arriver(535, ["runtime", "app"]);
  arriver(536, ["runtime/src"]);
  arriver(537, ["app/src"]);
  cuisiner(535); // le cook finit à 08:00:00
  a("08:30:00");
  retenir(535);

  const { faits: lus, texte } = lire("10:00:00");
  assert.deepEqual(lus.urgence, {
    decision: "#535",
    ticket: 535,
    cause: "merge",
    geste: `livraison verte qui touche à ses juges — à relire et merger à la main : ${pr(535)}`,
    url: "https://exemple.test/535",
    depuis: heure("08:30:00"),
    retenus: [536, 537],
    autres: [],
  });
  assert.equal(
    texte[0],
    `urgence    TOUTE LA CUISINE ATTEND LE CHEF depuis 1 h 30 — 2 tickets à l'arrêt, retenus par #535 : livraison verte qui touche à ses juges — à relire et merger à la main : ${pr(535)}`,
  );
  // La décision reste aussi une ligne du bloc `attend`.
  assert.ok(texte.some((ligne) => ligne.startsWith("  #535  depuis 1 h 30  livraison verte qui touche à ses juges")));

  // D'un calcul à l'autre, tant que rien ne change, le début ne bouge pas.
  assert.equal(lire("13:45:00").faits.urgence?.depuis, heure("08:30:00"));
});

test("l'arrêt total part du dernier mouvement de la cuisine quand il suit la décision : un cook fini après elle", (t) => {
  const { a, arriver, cuisiner, retenir, noter, lire } = cuisine(t);
  arriver(535, ["runtime"]);
  arriver(540, ["app"]);
  arriver(541, ["runtime/src"]);
  cuisiner(535);
  a("08:10:00");
  retenir(535);
  // #540 ne touche pas la zone de #535 : il cuit encore, la cuisine bouge.
  noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: `${jourDecale(30)}T00:00:00.000Z` } }, 540, `station:${STATION}`);
  noter({ type: "cook.launched", payload: { run: "540-aa", limits: LIMITES, stream: "runs/540-aa.jsonl" } }, 540);
  assert.equal(lire("09:00:00").faits.urgence, null);

  // Son cook finit, il est rendu au rail et sa livraison remonte au chef :
  // plus rien ne bouge depuis la fin de ce cook.
  a("09:20:00");
  noter({ type: "cook.exited", payload: { run: "540-aa", outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, 540);
  noter({ type: "ticket.passing", payload: { station: STATION } }, 540, `station:${STATION}`);
  noter({ type: "pass.started", payload: { run: "540-aa", pr: pr(540), number: 540, sha: "sha-540" } }, 540, "pass");
  a("09:25:00");
  retenir(540, "no-grant");

  const urgence = lire("10:00:00").faits.urgence;
  assert.equal(urgence?.decision, "#535");
  assert.deepEqual(urgence?.retenus, [541]);
  assert.equal(urgence?.depuis, heure("09:25:00"));
  assert.deepEqual(lire("11:00:00").faits.urgence?.depuis, heure("09:25:00"));
});

test("une session Max expirée sur la seule station : toute la cuisine attend la reconnexion du chef — levée à la reprise, l'urgence qui revient repart de sa nouvelle expiration", (t) => {
  const { a, arriver, noter, lire } = cuisine(t);
  arriver(14, ["runtime"]);
  arriver(15, ["app"]);
  assert.equal(lire("08:05:00").faits.urgence, null);

  a("09:00:00");
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: null } }, null, `station:${STATION}`);
  const geste = "`claude /login` sous le compte du service, puis `brigade <projet> guardrails resume`";
  assert.deepEqual(lire("10:00:00").faits.urgence, {
    decision: STATION,
    ticket: null,
    cause: "connexion",
    geste: `connexion Max expirée (authentication_failed) — à rétablir : ${geste}`,
    url: null,
    depuis: heure("09:00:00"),
    retenus: [14, 15],
    autres: [],
  });
  assert.match(lire("10:00:00").texte[0] ?? "", /^urgence {4}TOUTE LA CUISINE ATTEND LE CHEF depuis 1 h 00 — 2 tickets à l'arrêt, retenus par box\/claude : connexion Max expirée/);

  // Le chef se reconnecte et fait reprendre : l'urgence est levée.
  a("10:30:00");
  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");
  assert.equal(lire("10:31:00").faits.urgence, null);
  assert.ok(!lire("10:31:00").texte.some((ligne) => ligne.startsWith("urgence")));

  // Elle revient : son début est celui de la nouvelle expiration.
  a("12:00:00");
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: null } }, null, `station:${STATION}`);
  assert.equal(lire("12:30:00").faits.urgence?.depuis, heure("12:00:00"));
});

test("une décision qui ne retient qu'une partie du rail n'est pas une urgence : un ticket peut encore cuire, la décision reste une ligne de la file", (t) => {
  const { a, arriver, cuisiner, retenir, lire } = cuisine(t);
  arriver(535, ["runtime"]);
  arriver(536, ["runtime/src"]);
  arriver(540, ["app"]);
  cuisiner(535);
  a("08:30:00");
  retenir(535);

  const { faits: lus, texte } = lire("10:00:00");
  assert.equal(lus.urgence, null);
  assert.ok(!texte.some((ligne) => ligne.startsWith("urgence")));
  assert.deepEqual(lus.attend.map(({ ticket }) => ticket), [535]);
  assert.equal(lus.compteurs.attend, 1);
});

test("rien qui attend d'être cuisiné, rien qui retient : la décision seule sur le rail n'arrête aucune cuisine", (t) => {
  const { a, arriver, cuisiner, retenir, lire } = cuisine(t);
  arriver(535, ["runtime"]);
  cuisiner(535);
  a("08:30:00");
  retenir(535);
  assert.equal(lire("10:00:00").faits.urgence, null);
});

test("un ticket retenu par un autre, lui-même retenu par la décision du chef, est à l'arrêt à cause d'elle", (t) => {
  const { a, arriver, cuisiner, retenir, lire } = cuisine(t);
  arriver(535, ["runtime"]);
  arriver(536, ["runtime/src"]);
  // #537 attend #536, qui ne partira pas avant que #535 ait libéré sa zone.
  arriver(537, ["docs"], [536]);
  cuisiner(535);
  a("08:30:00");
  retenir(535);
  const urgence = lire("10:00:00").faits.urgence;
  assert.equal(urgence?.decision, "#535");
  assert.deepEqual(urgence?.retenus, [536, 537]);
});

test("deux décisions qui, à elles deux, retiennent tout : l'urgence nomme celle qui retient le plus, et l'autre aussi", (t) => {
  const { a, arriver, cuisiner, retenir, lire } = cuisine(t);
  arriver(535, ["runtime"]);
  arriver(540, ["app"]);
  arriver(536, ["runtime/src"]);
  arriver(541, ["app/src"]);
  arriver(542, ["app/test"]);
  cuisiner(535);
  cuisiner(540);
  a("08:30:00");
  retenir(535);
  a("08:40:00");
  retenir(540, "no-grant");

  const { faits: lus, texte } = lire("10:00:00");
  assert.equal(lus.urgence?.decision, "#540");
  assert.equal(lus.urgence?.cause, "merge");
  assert.deepEqual(lus.urgence?.retenus, [536, 541, 542]);
  assert.equal(lus.urgence?.depuis, heure("08:40:00"));
  assert.deepEqual(
    lus.urgence?.autres.map(({ decision, ticket, cause }) => ({ decision, ticket, cause })),
    [{ decision: "#535", ticket: 535, cause: "merge" }],
  );
  assert.match(texte[0] ?? "", /retenus par #540 : .* — aussi : #535$/);
});

test("le chef merge à la main : l'urgence est levée, la cuisine repart — et celle qui revient part de la nouvelle décision, pas de l'ancienne", (t) => {
  const { a, arriver, cuisiner, retenir, merger, lire } = cuisine(t);
  arriver(535, ["runtime"]);
  arriver(536, ["runtime/src"]);
  arriver(537, ["runtime/src/etat.ts"]);
  cuisiner(535);
  a("08:30:00");
  retenir(535);
  assert.equal(lire("09:00:00").faits.urgence?.depuis, heure("08:30:00"));

  a("09:30:00");
  merger(535);
  assert.equal(lire("09:31:00").faits.urgence, null);

  // #536 part, cuit, et sa livraison attend à son tour le chef : #537 est à
  // l'arrêt derrière elle.
  a("10:00:00");
  cuisiner(536);
  assert.equal(lire("10:00:30").faits.urgence, null);
  a("10:45:00");
  retenir(536);
  const urgence = lire("11:00:00").faits.urgence;
  assert.equal(urgence?.decision, "#536");
  assert.deepEqual(urgence?.retenus, [537]);
  assert.equal(urgence?.depuis, heure("10:45:00"));
});

test("le « stop » du chef retient la cuisine lui-même : pas d'urgence tant qu'il dure", (t) => {
  const { a, arriver, cuisiner, retenir, noter, lire } = cuisine(t);
  arriver(535, ["runtime"]);
  arriver(536, ["runtime/src"]);
  cuisiner(535);
  a("08:30:00");
  retenir(535);
  noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
  assert.equal(lire("10:00:00").faits.urgence, null);
});

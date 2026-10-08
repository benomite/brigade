import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { ticketDuRail } from "../src/projections/rail.ts";
import { GesteRefuse, ouvrirRail } from "../src/rail.ts";
import { lancer, repertoireTemporaire } from "./outils.ts";

const PRENEUR = join(import.meta.dirname, "aides/prend-tickets.ts");
const BAIL_MS = 600_000;

// Une horloge que le test avance à la main : le rail ne lit l'heure que là.
function montre(depart = "2026-10-08T10:00:00.000Z") {
  let instant = Date.parse(depart);
  return { maintenant: () => new Date(instant), avancer: (ms: number) => void (instant += ms) };
}

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const heure = montre();
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: BAIL_MS, maintenant: heure.maintenant });
  return { repertoire, journal, rail, heure };
}

function poser(journal: Journal, ticket: number, priority: number | null = null, createdAt = `2026-10-01T00:00:${String(ticket).padStart(2, "0")}.000Z`) {
  journal.ajouter({
    project: "brigade",
    ticket,
    author: "github",
    type: "ticket.arrived",
    payload: { title: `Ticket ${ticket}`, priority, createdAt, url: `https://github.com/benomite/brigade/issues/${ticket}` },
  });
}

const etats = (rail: { tickets(): { ticket: number; state: string }[] }) => rail.tickets().map((t) => [t.ticket, t.state]);
const types = (journal: Journal, ticket: number) => journal.duTicket(ticket).map((e) => e.type);

test("un ticket arrivé est en attente sur le rail, avec ce que GitHub en dit", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14, 1);

  const [ticket] = rail.tickets();
  assert.deepEqual(
    { ...ticket, since: null },
    {
      ticket: 14,
      title: "Ticket 14",
      priority: 1,
      createdAt: "2026-10-01T00:00:14.000Z",
      url: "https://github.com/benomite/brigade/issues/14",
      state: "waiting",
      since: null,
      station: null,
      leaseUntil: null,
      reason: null,
      until: null,
    },
  );
});

test("le rail se lit dans l'ordre de service : priorité, puis ancienneté, les sans-priorité en dernier", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1, null, "2026-09-01T00:00:00.000Z");
  poser(journal, 2, 2, "2026-09-03T00:00:00.000Z");
  poser(journal, 3, 1, "2026-09-05T00:00:00.000Z");
  poser(journal, 4, 2, "2026-09-02T00:00:00.000Z");
  poser(journal, 5, 1, "2026-09-04T00:00:00.000Z");

  assert.deepEqual(rail.tickets().map((ticket) => ticket.ticket), [5, 3, 4, 2, 1]);
  assert.deepEqual(["a", "b", "c", "d", "e"].map((station) => rail.prendre(station)?.ticket), [5, 3, 4, 2, 1]);
});

test("un ticket qui change garde son état ; un ticket qui part disparaît, quel que soit son état", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 7);
  poser(journal, 8);
  rail.prendre("box/claude");
  journal.ajouter({ project: "brigade", ticket: 7, author: "github", type: "ticket.changed", payload: { title: "Nouveau titre", priority: 3 } });

  assert.deepEqual(
    rail.tickets().map((ticket) => [ticket.ticket, ticket.title, ticket.priority, ticket.state]),
    [[7, "Nouveau titre", 3, "taken"], [8, "Ticket 8", null, "waiting"]],
  );

  journal.ajouter({ project: "brigade", ticket: 7, author: "github", type: "ticket.left", payload: { reason: "unfired" } });

  assert.deepEqual(etats(rail), [[8, "waiting"]]);
});

test("un ticket pris porte sa station, l'heure de la prise et l'échéance de son bail", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);

  const pris = rail.prendre("box/claude-opus");

  const [evenement] = journal.duTicket(14).slice(-1);
  assert.deepEqual([evenement?.type, evenement?.author, evenement?.payload], [
    "ticket.taken",
    "station:box/claude-opus",
    { station: "box/claude-opus", leaseUntil: "2026-10-08T10:10:00.000Z" },
  ]);
  assert.deepEqual(pris, ticketDuRail(journal.base, 14));
  assert.deepEqual(
    [pris?.state, pris?.station, pris?.since, pris?.leaseUntil],
    ["taken", "box/claude-opus", evenement?.at, "2026-10-08T10:10:00.000Z"],
  );
});

test("un ticket pris ne se prête pas à une autre station", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);

  assert.equal(rail.prendre("box/claude-opus")?.ticket, 14);
  assert.equal(rail.prendre("mac/claude-sonnet"), null);

  assert.equal(ticketDuRail(journal.base, 14)?.station, "box/claude-opus");
  assert.deepEqual(types(journal, 14), ["ticket.arrived", "ticket.taken"]);
});

test("sur un rail vide, ou pour une station sans nom, il n'y a rien à prendre", (t) => {
  const { journal, rail } = cuisine(t);

  assert.equal(rail.prendre("box/claude-opus"), null);
  poser(journal, 14);
  assert.throws(() => rail.prendre(""), GesteRefuse);
  assert.deepEqual(etats(rail), [[14, "waiting"]]);
});

test("deux stations qui se jettent en même temps sur le rail ne prennent jamais le même ticket", async (t) => {
  const { repertoire, journal } = cuisine(t);
  const tickets = Array.from({ length: 12 }, (_, i) => i + 1);
  for (const ticket of tickets) poser(journal, ticket);

  const stations = ["box/a", "box/b"].map((station) => lancer(t, PRENEUR, [repertoire, station]));
  await Promise.all(stations.map((station) => station.attendre("prêt")));
  writeFileSync(join(repertoire, "feu"), "");
  const prises = await Promise.all(
    stations.map(async (station) => {
      assert.equal(await station.fin, 0, station.sortie());
      return JSON.parse(/pris (.*)/.exec(station.sortie())?.[1] ?? "null") as number[];
    }),
  );

  assert.deepEqual(prises.flat().sort((a, b) => a - b), tickets);
  for (const ticket of tickets) assert.deepEqual(types(journal, ticket), ["ticket.arrived", "ticket.taken"]);
});

test("deux stations sur un seul ticket : une seule l'obtient", async (t) => {
  const { repertoire, journal } = cuisine(t);
  poser(journal, 14);

  const stations = ["box/a", "box/b"].map((station) => lancer(t, PRENEUR, [repertoire, station]));
  await Promise.all(stations.map((station) => station.attendre("prêt")));
  writeFileSync(join(repertoire, "feu"), "");
  await Promise.all(stations.map((station) => station.fin));

  assert.deepEqual(stations.map((station) => /pris (.*)/.exec(station.sortie())?.[1]).sort(), ["[14]", "[]"]);
  assert.deepEqual(types(journal, 14), ["ticket.arrived", "ticket.taken"]);
});

test("une station qui renouvelle son bail garde son ticket au-delà du délai", (t) => {
  const { journal, rail, heure } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");

  heure.avancer(BAIL_MS - 1000);
  rail.renouveler(14, "box/claude");
  heure.avancer(BAIL_MS - 1000);

  assert.equal(rail.relever(), 0);
  assert.equal(ticketDuRail(journal.base, 14)?.leaseUntil, "2026-10-08T10:19:59.000Z");
  assert.equal(rail.prendre("mac/claude"), null);
});

test("une station morte : passé le délai, son ticket revient en attente, avec la trace au journal", (t) => {
  const { journal, rail, heure } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");

  heure.avancer(BAIL_MS - 1);
  assert.equal(rail.relever(), 0);
  heure.avancer(1);
  assert.equal(rail.relever(), 1);

  assert.deepEqual(etats(rail), [[14, "waiting"]]);
  const [trace] = journal.duTicket(14).slice(-1);
  assert.deepEqual([trace?.type, trace?.author, trace?.payload], [
    "ticket.released",
    "runtime",
    { reason: "lease-expired", station: "box/claude" },
  ]);
  assert.equal(rail.relever(), 0);
});

test("un ticket dont le bail est échu se reprend sans attendre le tick", (t) => {
  const { journal, rail, heure } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");
  heure.avancer(BAIL_MS);

  assert.equal(rail.prendre("mac/claude")?.station, "mac/claude");
  assert.deepEqual(types(journal, 14), ["ticket.arrived", "ticket.taken", "ticket.released", "ticket.taken"]);
});

test("la station qui a perdu son ticket ne peut plus rien en faire", (t) => {
  const { journal, rail, heure } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");
  heure.avancer(BAIL_MS);
  rail.prendre("mac/claude");
  const avant = journal.tout().length;

  assert.throws(() => rail.renouveler(14, "box/claude"), GesteRefuse);
  assert.throws(() => rail.envoyerEnPass(14, "box/claude"), GesteRefuse);
  assert.throws(() => rail.rendre(14, "returned", "box/claude"), GesteRefuse);
  assert.throws(() => rail.quatreVingtSix(14, { motif: "quota", station: "box/claude" }), /n'est pas tenu par box\/claude mais par mac\/claude/);
  assert.equal(journal.tout().length, avant);
});

test("un ticket rendu par sa station revient en attente", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");

  rail.rendre(14, "returned", "box/claude");

  assert.deepEqual(etats(rail), [[14, "waiting"]]);
  const [trace] = journal.duTicket(14).slice(-1);
  assert.deepEqual([trace?.author, trace?.payload], ["station:box/claude", { reason: "returned", station: "box/claude" }]);
});

test("le ticket avance de pris à en pass puis servi, et un ticket servi ne se reprend pas", (t) => {
  const { journal, rail, heure } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");

  rail.envoyerEnPass(14, "box/claude");
  assert.deepEqual([ticketDuRail(journal.base, 14)?.state, ticketDuRail(journal.base, 14)?.leaseUntil], ["pass", null]);
  rail.servir(14);
  heure.avancer(10 * BAIL_MS);

  assert.equal(rail.relever(), 0);
  assert.equal(rail.prendre("mac/claude"), null);
  assert.deepEqual([ticketDuRail(journal.base, 14)?.state, ticketDuRail(journal.base, 14)?.station], ["served", "box/claude"]);
});

test("un ticket en pass que la pass renvoie revient en attente", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");
  rail.envoyerEnPass(14, "box/claude");

  rail.rendre(14, "pass-red");

  assert.deepEqual(etats(rail), [[14, "waiting"]]);
});

test("les gestes hors de propos sont refusés et n'écrivent rien", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);
  const avant = journal.tout().length;

  assert.throws(() => rail.servir(14), /le ticket 14 est en attente — attendu : en pass/);
  assert.throws(() => rail.envoyerEnPass(14, "box/claude"), GesteRefuse);
  assert.throws(() => rail.renouveler(14, "box/claude"), GesteRefuse);
  assert.throws(() => rail.rendre(14, "returned"), GesteRefuse);
  assert.throws(() => rail.servir(99), /le ticket 99 n'est pas sur le rail/);
  assert.equal(journal.tout().length, avant);
});

test("un ticket en 86 ne se prend pas ; il revient seul en attente à l'heure connue", (t) => {
  const { journal, rail, heure } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");

  rail.quatreVingtSix(14, { motif: "quota", retour: new Date("2026-10-08T12:00:00.000Z"), station: "box/claude" });

  const ticket = ticketDuRail(journal.base, 14);
  assert.deepEqual([ticket?.state, ticket?.reason, ticket?.until, ticket?.station], ["86", "quota", "2026-10-08T12:00:00.000Z", null]);
  assert.equal(rail.prendre("mac/claude"), null);

  heure.avancer(2 * 3600_000);

  assert.equal(rail.prendre("mac/claude")?.ticket, 14);
  assert.deepEqual(journal.duTicket(14).map((e) => [e.type, e.author]).slice(-3), [
    ["ticket.86", "station:box/claude"],
    ["ticket.released", "runtime"],
    ["ticket.taken", "station:mac/claude"],
  ]);
});

test("un 86 sans heure de retour reste 86 jusqu'à ce qu'on le rende", (t) => {
  const { journal, rail, heure } = cuisine(t);
  poser(journal, 14);
  rail.quatreVingtSix(14, { motif: "station absente" });
  heure.avancer(100 * BAIL_MS);

  assert.equal(rail.relever(), 0);
  assert.equal(rail.prendre("box/claude"), null);

  rail.rendre(14, "station revenue");

  assert.deepEqual(etats(rail), [[14, "waiting"]]);
});

test("un fait du rail illisible reste au journal sans toucher au rail, et n'empêche pas de le rejouer", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);
  const illisibles = [
    { ticket: 15, type: "ticket.arrived", payload: {} },
    { ticket: null, type: "ticket.left", payload: { reason: "closed" } },
    { ticket: 14, type: "ticket.taken", payload: { station: "box/claude" } },
    { ticket: 14, type: "ticket.86", payload: { reason: "quota" } },
  ];
  for (const fait of illisibles) journal.ajouter({ project: "brigade", author: "inconnu", ...fait } as never);

  journal.reconstruire();

  assert.equal(journal.tout().length, 5);
  assert.deepEqual(etats(rail), [[14, "waiting"]]);
});

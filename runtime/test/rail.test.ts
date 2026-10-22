import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { REDECOUPE } from "../src/events/rail.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { communsDuRail, ticketDuRail } from "../src/projections/rail.ts";
import { direRetenue, etatLu, GesteRefuse, ouvrirRail, retenue } from "../src/rail.ts";
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
      model: null,
      effort: null,
      card: null,
      awaits: [],
      held: [],
      frozenBy: [],
      station: null,
      leaseUntil: null,
      progressedAt: null,
      reason: null,
      until: null,
      waitingFor: null,
      resumedBecause: null,
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

test("un ticket pris porte la date de son dernier progrès : la prise, puis chaque renouvellement", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);

  const pris = rail.prendre("box/claude");
  assert.equal(pris?.progressedAt, pris?.since);

  rail.renouveler(14, "box/claude");
  const [renouvele] = journal.duTicket(14).slice(-1);
  // Le relevé d'un cook dit ce qu'il consomme, pas qu'il avance.
  journal.ajouter({ project: "brigade", ticket: 14, author: "runtime", type: "cook.progressed", payload: { run: "14-aa", turns: 3, tokens: 900 } });

  const tenu = ticketDuRail(journal.base, 14);
  assert.deepEqual([renouvele?.type, tenu?.progressedAt, tenu?.since], ["ticket.renewed", renouvele?.at, pris?.since]);
});

test("un ticket qui n'est plus pris ne porte plus de date de progrès", (t) => {
  const { journal, rail } = cuisine(t);
  for (const ticket of [14, 15, 16]) poser(journal, ticket);
  for (let i = 0; i < 3; i++) rail.prendre("box/claude");

  rail.rendre(14, "abandon", "box/claude");
  rail.envoyerEnPass(15, "box/claude");
  rail.quatreVingtSix(16, { motif: "quota", station: "box/claude" });

  assert.deepEqual(rail.tickets().map((ticket) => ticket.progressedAt), [null, null, null]);
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

test("un bail échu ne rend pas un ticket dont le cook tourne encore : c'est sa station qui l'arrête et récolte", (t) => {
  const { journal, rail, heure } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");
  const plafonds = { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 };
  journal.ajouter({ project: "brigade", ticket: 14, author: "runtime", type: "cook.launched", payload: { run: "14-abc", limits: plafonds, stream: "runs/14-abc.jsonl" } });

  heure.avancer(BAIL_MS);

  assert.equal(rail.relever(), 0);
  assert.equal(rail.prendre("mac/claude"), null);
  assert.deepEqual(etats(rail), [[14, "taken"]]);
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

test("rendre un ticket ou le déclarer 86 sans motif est refusé, et n'écrit rien", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);
  poser(journal, 15);
  rail.prendre("box/claude");
  const avant = journal.tout().length;

  assert.throws(() => rail.rendre(14, "", "box/claude"), GesteRefuse);
  assert.throws(() => rail.rendre(14, ""), /sans motif/);
  assert.throws(() => rail.quatreVingtSix(14, { motif: "", station: "box/claude" }), GesteRefuse);
  assert.throws(() => rail.quatreVingtSix(15, { motif: "" }), GesteRefuse);

  assert.equal(journal.tout().length, avant);
  assert.deepEqual(etats(rail), [[14, "taken"], [15, "waiting"]]);
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

test("un ticket en pass que le runtime remonte au chef passe 86, sans heure de retour ; une station ne le peut pas", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");
  rail.envoyerEnPass(14, "box/claude");

  assert.throws(() => rail.quatreVingtSix(14, { motif: "quota", station: "box/claude" }), GesteRefuse);
  rail.quatreVingtSix(14, { motif: "pass:returns-exhausted" });

  const ticket = ticketDuRail(journal.base, 14);
  assert.deepEqual([ticket?.state, ticket?.reason, ticket?.until], ["86", "pass:returns-exhausted", null]);
  assert.equal(journal.duTicket(14).at(-1)?.author, "runtime");
});

test("un fait du rail illisible reste au journal sans toucher au rail, et n'empêche pas de le rejouer", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);
  const illisibles = [
    { ticket: 15, type: "ticket.arrived", payload: {} },
    { ticket: null, type: "ticket.left", payload: { reason: "closed" } },
    { ticket: 14, type: "ticket.taken", payload: { station: "box/claude" } },
    { ticket: 14, type: "ticket.86", payload: { reason: "quota" } },
    { ticket: 14, type: "ticket.changed", payload: { title: "Renommé", priority: null, card: { waitsFor: ["#15"], zone: [], problems: [] } } },
    { ticket: 14, type: "ticket.changed", payload: { title: "Renommé", priority: null, card: "attend : #15" } },
  ];
  for (const fait of illisibles) journal.ajouter({ project: "brigade", author: "inconnu", ...fait } as never);

  journal.reconstruire();

  assert.equal(journal.tout().length, 7);
  assert.deepEqual(etats(rail), [[14, "waiting"]]);
  assert.equal(rail.tickets()[0]?.title, "Ticket 14");
});

test("la fiche d'un ticket suit ses faits, et se retrouve au rejeu ; un fait d'avant la fiche n'en porte pas", (t) => {
  const { journal, rail } = cuisine(t);
  const card = { waitsFor: [12, 13], zone: ["runtime/src/rail.ts"], problems: ["clé inconnue « budget » — connues : attend, zone"] };
  const noter = (fait: object) => journal.ajouter({ project: "brigade", ticket: 14, author: "github", ...fait } as never);
  noter({ type: "ticket.arrived", payload: { title: "Ticket 14", priority: null, createdAt: "2026-10-01T00:00:14.000Z", url: "https://exemple.test/14", card } });
  assert.deepEqual(rail.tickets()[0]?.card, card);

  journal.reconstruire();
  assert.deepEqual(rail.tickets()[0]?.card, card);

  noter({ type: "ticket.changed", payload: { title: "Ticket 14", priority: null, card: { ...card, problems: [] } } });
  assert.deepEqual(rail.tickets()[0]?.card?.problems, []);
  noter({ type: "ticket.changed", payload: { title: "Ticket 14", priority: null } });
  assert.equal(rail.tickets()[0]?.card, null);
});

// Le raccord avec les garde-fous : la fin d'un cook, lue dans leurs faits.
function cuisiner(journal: Journal, ticket: number, fin: { outcome: string } | "interrupted") {
  const noter = (fait: object) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait } as never);
  if (fin === "interrupted") noter({ type: "cook.interrupted", payload: { run: "r" } });
  else noter({ type: "cook.exited", payload: { run: "r", outcome: fin.outcome, code: 1, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
}

for (const fin of [{ outcome: "failed" }, { outcome: "guard" }, { outcome: "stop" }, "interrupted"] as const) {
  const nom = fin === "interrupted" ? "meurt avec le runtime" : `finit en « ${fin.outcome} »`;
  test(`un ticket pris dont le cook ${nom} revient en attente`, (t) => {
    const { journal, rail } = cuisine(t);
    poser(journal, 14);
    rail.prendre("box/claude");

    cuisiner(journal, 14, fin);

    assert.deepEqual(etats(rail), [[14, "waiting"]]);
    assert.equal(ticketDuRail(journal.base, 14)?.station, null);
  });
}

for (const outcome of ["ok", "neutral"]) {
  test(`un cook qui finit en « ${outcome} » laisse le ticket à sa station : c'est elle qui dit la suite`, (t) => {
    const { journal, rail } = cuisine(t);
    poser(journal, 14);
    rail.prendre("box/claude");

    cuisiner(journal, 14, { outcome });

    assert.deepEqual(etats(rail), [[14, "taken"]]);
  });
}

test("la fin d'un cook ne ramène pas en attente un ticket qui n'est plus pris", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");
  rail.envoyerEnPass(14, "box/claude");

  cuisiner(journal, 14, { outcome: "failed" });

  assert.deepEqual(etats(rail), [[14, "pass"]]);
});

// Les dépendances : un ticket dont la fiche dit « attend : #A » n'est prêté
// qu'une fois #A servi.
function poserAvecFiche(journal: Journal, ticket: number, waitsFor: number[], problems: string[] = []) {
  journal.ajouter({
    project: "brigade",
    ticket,
    author: "github",
    type: "ticket.arrived",
    payload: {
      title: `Ticket ${ticket}`,
      priority: null,
      createdAt: `2026-10-01T00:00:${String(ticket).padStart(2, "0")}.000Z`,
      url: `https://github.com/benomite/brigade/issues/${ticket}`,
      card: { waitsFor, zone: [], problems },
    },
  });
}

const partir = (journal: Journal, ticket: number, reason: "closed" | "unfired" | "gone") =>
  journal.ajouter({ project: "brigade", ticket, author: "github", type: "ticket.left", payload: { reason } });

const servir = (rail: ReturnType<typeof ouvrirRail>, ticket: number) => {
  assert.equal(rail.prendre("box/claude")?.ticket, ticket);
  rail.envoyerEnPass(ticket, "box/claude");
  rail.servir(ticket);
};

const attendus = (journal: Journal, ticket: number) => ticketDuRail(journal.base, ticket)?.awaits.map((attendu) => [attendu.ticket, attendu.left?.reason ?? null]);

test("un ticket qui en attend un autre n'est pas prêté avant que celui-ci soit servi, même s'il passe devant dans l'ordre", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [15]);
  poser(journal, 15);

  assert.deepEqual(attendus(journal, 14), [[15, null]]);
  assert.equal(rail.prendre("box/claude")?.ticket, 15);
  assert.equal(rail.prendre("box/autre"), null);

  rail.envoyerEnPass(15, "box/claude");
  assert.equal(rail.prendre("box/autre"), null);

  rail.servir(15);
  assert.deepEqual(attendus(journal, 14), []);
  assert.equal(rail.prendre("box/autre")?.ticket, 14);
});

test("un ticket qui en attend plusieurs ne part qu'une fois tous servis", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [15, 16]);
  poser(journal, 15);
  poser(journal, 16);

  servir(rail, 15);
  assert.deepEqual(attendus(journal, 14), [[16, null]]);
  servir(rail, 16);
  assert.equal(rail.prendre("box/claude")?.ticket, 14);
});

test("un ticket attendu qui n'est pas sur le rail se laisse attendre : rien ne dit qu'il a été servi", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [99]);

  assert.deepEqual(attendus(journal, 14), [[99, null]]);
  assert.equal(rail.prendre("box/claude"), null);
});

test("servi reste servi : le ticket attendu a quitté le rail, son issue fermée par la pass, et l'attente est levée", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 15);
  servir(rail, 15);
  partir(journal, 15, "closed");
  poserAvecFiche(journal, 14, [15]);

  assert.deepEqual(attendus(journal, 14), []);
  assert.equal(rail.prendre("box/claude")?.ticket, 14);
});

test("un ticket remonté au chef (86) puis mergé par lui est servi : le merge est au journal, qui l'attendait part", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 15);
  poserAvecFiche(journal, 14, [15]);
  assert.equal(rail.prendre("box/claude")?.ticket, 15);
  rail.envoyerEnPass(15, "box/claude");
  rail.quatreVingtSix(15, { motif: "pass:returns-exhausted" });
  // Le chef merge la PR lui-même : la pass le constate, sans pouvoir servir un 86.
  journal.ajouter({ project: "brigade", ticket: 15, author: "runtime", type: "merge.done", payload: { pr: "https://exemple.test/pr/1", sha: null, by: "outside", reconciled: false } });
  assert.throws(() => rail.servir(15), GesteRefuse);
  partir(journal, 15, "closed");

  assert.deepEqual(attendus(journal, 14), []);
  assert.equal(rail.prendre("box/claude")?.ticket, 14);
  journal.reconstruire();
  assert.deepEqual(attendus(journal, 14), []);
});

test("un ticket attendu qui quitte le rail sans avoir été servi est abandonné : celui qui l'attendait est bloqué, avec le motif", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [15, 16, 17]);
  for (const ticket of [15, 16, 17]) poser(journal, ticket);
  partir(journal, 15, "closed");
  partir(journal, 16, "unfired");

  assert.deepEqual(attendus(journal, 14), [[15, "closed"], [16, "unfired"], [17, null]]);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), "bloque");
  assert.equal(retenue(ticketDuRail(journal.base, 17)!), null);
  servir(rail, 17);
  assert.equal(rail.prendre("box/claude"), null);
});

test("un ticket abandonné qui revient sur le rail n'est plus abandonné : celui qui l'attend l'attend de nouveau, puis part", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [15]);
  poser(journal, 15);
  partir(journal, 15, "unfired");
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), "bloque");

  poser(journal, 15);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), "attend");
  servir(rail, 15);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), null);
  assert.equal(rail.prendre("box/claude")?.ticket, 14);
});

test("un ticket bloqué n'est rendu ni par le relevé des baux ni par celui des 86", (t) => {
  const { journal, rail, heure } = cuisine(t);
  poserAvecFiche(journal, 14, [15]);
  poser(journal, 15);
  partir(journal, 15, "closed");

  heure.avancer(10 * BAIL_MS);
  assert.equal(rail.relever(), 0);
  assert.equal(rail.prendre("box/claude"), null);
  assert.deepEqual(types(journal, 14), ["ticket.arrived"]);
});

test("une fiche illisible ne retient pas son ticket : il part se faire refuser, au lieu d'attendre en silence", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [15], ["attend : cycle de dépendances — #14 → #15 → #14"]);
  poserAvecFiche(journal, 15, [14], ["attend : cycle de dépendances — #14 → #15 → #14"]);

  assert.equal(rail.prendre("box/claude")?.ticket, 14);
});

test("les dépendances survivent au redémarrage : rejoué du journal, le rail attend et bloque les mêmes tickets", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [15, 16, 17]);
  for (const ticket of [15, 16, 17]) poser(journal, ticket);
  servir(rail, 15);
  partir(journal, 15, "closed");
  partir(journal, 16, "gone");
  const avant = rail.tickets();

  journal.reconstruire();

  assert.deepEqual(rail.tickets(), avant);
  assert.deepEqual(attendus(journal, 14), [[16, "gone"], [17, null]]);
});

test("ce qui retient un ticket se dit en clair : ce qu'il attend, ou ce qui le bloque", (t) => {
  const { journal } = cuisine(t);
  poserAvecFiche(journal, 14, [15, 16]);
  poserAvecFiche(journal, 20, [15, 16, 17]);
  for (const ticket of [15, 16, 17]) poser(journal, ticket);

  assert.equal(direRetenue(ticketDuRail(journal.base, 14)!), "attend #15, #16");
  assert.equal(etatLu(ticketDuRail(journal.base, 14)!), "en attente");
  assert.equal(direRetenue(ticketDuRail(journal.base, 15)!), null);

  partir(journal, 15, "closed");
  partir(journal, 17, "unfired");
  assert.equal(etatLu(ticketDuRail(journal.base, 20)!), "BLOQUÉ");
  assert.equal(
    direRetenue(ticketDuRail(journal.base, 20)!),
    "#15 abandonné (issue fermée sans avoir été servie), #17 abandonné (label `fire` retiré) · attend aussi #16",
  );
});

// --- Les zones : deux tickets concurrents ne possèdent pas le même fichier.

function poserAvecZone(journal: Journal, ticket: number, zone: string[], waitsFor: number[] = [], problems: string[] = []) {
  journal.ajouter({
    project: "brigade",
    ticket,
    author: "github",
    type: "ticket.arrived",
    payload: {
      title: `Ticket ${ticket}`,
      priority: null,
      createdAt: `2026-10-01T00:00:${String(ticket).padStart(2, "0")}.000Z`,
      url: `https://exemple.test/${ticket}`,
      card: { waitsFor, zone, problems },
    },
  });
}

const tenu = (journal: Journal, ticket: number) => ticketDuRail(journal.base, ticket)?.held;

test("un ticket dont la zone recouvre celle d'un ticket parti en cuisine est retenu jusqu'à son service", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecZone(journal, 1, ["runtime/src"]);
  poserAvecZone(journal, 2, ["runtime/src/rail.ts", "docs/a.md"]);
  poserAvecZone(journal, 3, ["runtime/test"]);

  // Tant qu'aucun n'est parti, rien ne retient personne : l'ordre de service décide.
  assert.deepEqual(tenu(journal, 2), []);
  assert.equal(rail.prendre("a")?.ticket, 1);
  assert.deepEqual(tenu(journal, 2), [{ ticket: 1, path: "runtime/src/rail.ts" }]);
  assert.equal(retenue(ticketDuRail(journal.base, 2)!), "zone");
  assert.equal(direRetenue(ticketDuRail(journal.base, 2)!), "zone tenue par #1 (runtime/src/rail.ts)");
  assert.equal(etatLu(ticketDuRail(journal.base, 2)!), "en attente");
  // Le ticket d'une zone disjointe part, lui.
  assert.equal(rail.prendre("b")?.ticket, 3);
  assert.equal(rail.prendre("c"), null);

  // En pass, la livraison de #1 n'est pas encore sur la base : #2 reste retenu.
  rail.envoyerEnPass(1, "a");
  assert.equal(rail.prendre("c"), null);
  rail.servir(1);
  assert.deepEqual(tenu(journal, 2), []);
  assert.equal(rail.prendre("c")?.ticket, 2);
});

test("la retenue de zone tombe quand le premier est 86, revient en attente ou quitte le rail", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecZone(journal, 1, ["runtime/src/rail.ts"]);
  poserAvecZone(journal, 2, ["runtime/src/rail.ts"]);
  rail.prendre("a");
  assert.equal(tenu(journal, 2)?.length, 1);
  rail.quatreVingtSix(1, { motif: "quota", station: "a" });
  assert.deepEqual(tenu(journal, 2), []);
  rail.rendre(1, "86-over");
  assert.deepEqual(tenu(journal, 2), []);

  rail.prendre("a");
  assert.equal(tenu(journal, 2)?.length, 1);
  journal.ajouter({ project: "brigade", ticket: 1, author: "github", type: "ticket.left", payload: { reason: "closed" } });
  assert.deepEqual(tenu(journal, 2), []);
  assert.equal(rail.prendre("b")?.ticket, 2);
});

test("un ticket rendu par la pass tient sa zone tant que sa livraison est ouverte : celui qui passerait devant lui est retenu", (t) => {
  const { journal, rail } = cuisine(t);
  // #1 passe devant #2 dans l'ordre de service.
  poserAvecZone(journal, 1, ["runtime/src/rail.ts"]);
  poserAvecZone(journal, 2, ["runtime/src"]);
  assert.equal(rail.prendre("a")?.ticket, 1);
  rail.rendre(1, "cook-failed", "a");
  // Un cook qui échoue ne laisse aucune livraison : la zone est libre.
  assert.deepEqual([tenu(journal, 1), tenu(journal, 2)], [[], []]);
  poserAvecZone(journal, 3, ["docs"]);
  poser(journal, 4);
  journal.ajouter({ project: "brigade", ticket: 2, author: "github", type: "ticket.changed", payload: { title: "Ticket 2", priority: 1, card: { waitsFor: [], zone: ["runtime/src"], problems: [] } } });
  assert.equal(rail.prendre("a")?.ticket, 2);
  rail.envoyerEnPass(2, "a");
  // La pass est rouge : #2 revient en attente, avec sa branche, son worktree et sa PR.
  rail.rendre(2, "pass-red");
  journal.ajouter({ project: "brigade", ticket: 2, author: "github", type: "ticket.changed", payload: { title: "Ticket 2", priority: null, card: { waitsFor: [], zone: ["runtime/src"], problems: [] } } });

  assert.deepEqual(rail.tickets().map((ticket) => ticket.ticket).slice(0, 2), [1, 2]);
  assert.deepEqual(tenu(journal, 1), [{ ticket: 2, path: "runtime/src/rail.ts" }]);
  assert.deepEqual(tenu(journal, 2), []);
  // #3 et #4, disjoints, partent ; #1 non. Le renvoi de #2 part, et tient toujours sa zone.
  assert.deepEqual(["b", "c", "d", "e"].map((station) => rail.prendre(station)?.ticket ?? null), [2, 3, 4, null]);
  rail.envoyerEnPass(2, "b");
  rail.servir(2);
  assert.equal(rail.prendre("e")?.ticket, 1);
});

test("deux tickets rendus par la pass sur la même zone ne se retiennent pas l'un l'autre : le premier repris tient l'autre", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecZone(journal, 1, ["a.ts"]);
  poserAvecZone(journal, 2, ["b.ts"]);
  assert.deepEqual([rail.prendre("a")?.ticket, rail.prendre("b")?.ticket], [1, 2]);
  for (const [ticket, station] of [[1, "a"], [2, "b"]] as const) {
    rail.envoyerEnPass(ticket, station);
    rail.rendre(ticket, "pass-red");
  }
  // Le chef élargit la zone de #2 sur celle de #1 : les deux livraisons sont ouvertes.
  journal.ajouter({ project: "brigade", ticket: 2, author: "github", type: "ticket.changed", payload: { title: "Ticket 2", priority: null, card: { waitsFor: [], zone: ["a.ts", "b.ts"], problems: [] } } });

  assert.deepEqual([tenu(journal, 1), tenu(journal, 2)], [[], []]);
  assert.equal(rail.prendre("a")?.ticket, 1);
  assert.deepEqual(tenu(journal, 2), [{ ticket: 1, path: "a.ts" }]);
});

test("un ticket servi, rouvert et relancé tient de nouveau sa zone", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecZone(journal, 1, ["a.ts"]);
  rail.prendre("a");
  rail.envoyerEnPass(1, "a");
  journal.ajouter({ project: "brigade", ticket: 1, author: "pass", type: "merge.done", payload: { pr: "https://exemple.test/pull/1", sha: "abc", by: "pass", reconciled: false } });
  rail.servir(1);
  journal.ajouter({ project: "brigade", ticket: 1, author: "github", type: "ticket.left", payload: { reason: "closed" } });
  // Rouvert : il revient sur le rail, et repart.
  poserAvecZone(journal, 1, ["a.ts"]);
  poserAvecZone(journal, 2, ["a.ts"]);
  assert.equal(rail.prendre("a")?.ticket, 1);
  assert.deepEqual(tenu(journal, 2), [{ ticket: 1, path: "a.ts" }]);
  rail.envoyerEnPass(1, "a");
  assert.equal(tenu(journal, 2)?.length, 1);
  // Mergé une seconde fois, il la lâche de nouveau — et la reprend s'il est repris sans avoir quitté le rail.
  rail.quatreVingtSix(1, { motif: "review-red" });
  journal.ajouter({ project: "brigade", ticket: 1, author: "chef", type: "merge.done", payload: { pr: "https://exemple.test/pull/2", sha: "def", by: "outside", reconciled: false } });
  assert.deepEqual(tenu(journal, 2), []);
  rail.rendre(1, "le chef le relance");
  assert.equal(rail.prendre("a")?.ticket, 1);
  assert.equal(tenu(journal, 2)?.length, 1);
});

test("un ticket remonté au chef puis mergé par lui reste 86 ; relancé, il ne tient plus sa zone : sa livraison est sur la base", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecZone(journal, 1, ["runtime/src/rail.ts"]);
  poserAvecZone(journal, 2, ["runtime/src/rail.ts"]);
  rail.prendre("a");
  rail.envoyerEnPass(1, "a");
  rail.quatreVingtSix(1, { motif: "review-red" });

  journal.ajouter({ project: "brigade", ticket: 1, author: "chef", type: "merge.done", payload: { pr: "https://exemple.test/pull/1", sha: "abc", by: "outside", reconciled: false } });
  assert.equal(ticketDuRail(journal.base, 1)?.state, "86");
  assert.deepEqual(tenu(journal, 2), []);
  // Rendu au rail, il n'a plus de livraison ouverte : il ne retient pas #2.
  rail.rendre(1, "le chef le relance");
  assert.deepEqual(tenu(journal, 2), []);
  assert.equal(rail.prendre("b")?.ticket, 1);
  assert.equal(rail.prendre("c"), null);
});

test("la zone ne retient pas ce qu'une dépendance retient déjà, ni derrière une fiche illisible, ni un ticket sans zone", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecZone(journal, 1, ["runtime/src"]);
  poserAvecZone(journal, 2, ["runtime/src/rail.ts"], [1]);
  poserAvecZone(journal, 3, []);
  poserAvecFiche(journal, 4, []);
  rail.prendre("a");
  // #2 attend #1 : c'est dit une fois, par la dépendance.
  assert.deepEqual(tenu(journal, 2), []);
  assert.equal(direRetenue(ticketDuRail(journal.base, 2)!), "attend #1");
  assert.deepEqual([tenu(journal, 3), tenu(journal, 4)], [[], []]);

  // Une fiche illisible ne dit pas de zone à laquelle se fier : son ticket, 86, ne tient rien.
  poserAvecZone(journal, 5, ["docs"], [], ["clé inconnue « budget »"]);
  poserAvecZone(journal, 6, ["docs/a.md"]);
  assert.equal(rail.prendre("b")?.ticket, 3);
  assert.equal(rail.prendre("c")?.ticket, 4);
  assert.equal(rail.prendre("d")?.ticket, 5);
  rail.quatreVingtSix(5, { motif: "unreadable-card", station: "d" });
  assert.deepEqual(tenu(journal, 6), []);
});

test("un ticket retenu par une dépendance et par une zone dit les deux", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecZone(journal, 1, ["docs"]);
  poserAvecZone(journal, 2, ["runtime"]);
  poserAvecZone(journal, 3, ["docs/a.md"], [2]);
  rail.prendre("a");
  assert.equal(retenue(ticketDuRail(journal.base, 3)!), "attend");
  assert.equal(direRetenue(ticketDuRail(journal.base, 3)!), "attend #2 · zone tenue par #1 (docs/a.md)");
});

test("les chemins communs du projet n'appartiennent à personne : ils ne retiennent rien, et se relisent du journal", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecZone(journal, 1, ["runtime/src/a.ts", "docs/runtime.md"]);
  poserAvecZone(journal, 2, ["runtime/src/b.ts", "docs/runtime.md"]);
  rail.prendre("a");
  assert.equal(tenu(journal, 2)?.length, 1);

  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "rail.commons", payload: { paths: ["docs/runtime.md"] } });
  assert.deepEqual(communsDuRail(journal.base), ["docs/runtime.md"]);
  assert.deepEqual(tenu(journal, 2), []);
  journal.reconstruire();
  assert.deepEqual(tenu(journal, 2), []);

  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "rail.commons", payload: { paths: [] } });
  assert.deepEqual(communsDuRail(journal.base), []);
  assert.equal(tenu(journal, 2)?.length, 1);
  // Un fait illisible reste sans effet.
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "rail.commons", payload: { paths: "docs" } as never });
  assert.deepEqual(communsDuRail(journal.base), []);
});

test("un ticket que le manager a redécoupé ne tient plus de zone : ses sous-tickets, qui la recouvrent, partent", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecZone(journal, 1, ["runtime/src"]);
  assert.equal(rail.prendre("a")?.ticket, 1);
  rail.envoyerEnPass(1, "a");
  // Sa PR reste ouverte, mais ce sont ses sous-tickets qui portent le travail.
  poserAvecZone(journal, 2, ["runtime/src/rail.ts"]);
  assert.equal(tenu(journal, 2)?.length, 1);
  rail.quatreVingtSix(1, { motif: REDECOUPE });
  poserAvecZone(journal, 3, ["runtime/src/pass.ts"]);

  assert.deepEqual(tenu(journal, 2), []);
  assert.deepEqual(tenu(journal, 3), []);
  assert.equal(rail.prendre("b")?.ticket, 2);
  assert.equal(rail.prendre("c")?.ticket, 3);
});

test("une station peut écarter des tickets de sa prise : elle reçoit le suivant, et rien s'il n'en reste pas", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14, 1);
  poser(journal, 15, 2);

  assert.equal(rail.prendre("box/claude", new Map([[14, []]]))?.ticket, 15);
  assert.equal(rail.prendre("box/claude", new Map([[14, []]])), null);
  assert.deepEqual(etats(rail), [[14, "waiting"], [15, "taken"]]);
});

test("deux prises de suite : la zone du premier est tenue avant que le second soit choisi", (t) => {
  const { journal, rail } = cuisine(t);
  const fiche = (zone: string[]) => ({ waitsFor: [], zone, problems: [] });
  const arriver = (ticket: number, zone: string[]) =>
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: `Ticket ${ticket}`, priority: 1, createdAt: `2026-10-01T00:00:${ticket}.000Z`, url: `https://exemple.test/${ticket}`, card: fiche(zone) },
    });
  arriver(14, ["runtime/src"]);
  arriver(15, ["runtime/src/rail.ts"]);
  arriver(16, ["docs"]);

  assert.deepEqual([rail.prendre("box/claude")?.ticket, rail.prendre("box/claude")?.ticket, rail.prendre("box/claude")], [14, 16, null]);
  assert.equal(direRetenue(rail.tickets()[1]!), "zone tenue par #14 (runtime/src/rail.ts)");
});

test("la zone d'un ticket encore en cuisine reste tenue, même s'il a quitté le rail : un ticket qui la recouvre n'est pas prêté", (t) => {
  const { journal, rail } = cuisine(t);
  const arriver = (ticket: number, zone: string[]) =>
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: `Ticket ${ticket}`, priority: 1, createdAt: `2026-10-01T00:00:${ticket}.000Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone, problems: [] } },
    });
  arriver(15, ["runtime/src/rail.ts"]);
  arriver(16, ["docs"]);

  // Le ticket 14 n'est plus sur le rail ; son cook écrit encore dans runtime/src.
  assert.equal(rail.prendre("box/claude", new Map([[14, ["runtime/src"]]]))?.ticket, 16);
  assert.equal(rail.prendre("box/claude", new Map([[14, ["runtime/src"]]])), null);
  assert.equal(rail.prendre("box/claude", new Map())?.ticket, 15);
});

test("le rail dit combien de tickets une station pourrait prendre, sans en prendre aucun", (t) => {
  const { journal, rail } = cuisine(t);
  assert.equal(rail.servables(), 0);
  for (const ticket of [14, 15, 16]) poser(journal, ticket);
  const avant = journal.dernierSeq();

  assert.equal(rail.servables(), 3);
  // Un ticket encore en cuisine n'est pas à prendre, même rendu au rail.
  assert.equal(rail.servables(new Map([[15, []]])), 2);
  assert.equal(journal.dernierSeq(), avant);

  rail.prendre("box/claude");
  assert.equal(rail.servables(), 2);
});

// Un ticket et sa fiche : ce qu'il demande à sa station.
function poserAvec(journal: Journal, ticket: number, requires: string[], priority: number | null = null) {
  journal.ajouter({
    project: "brigade",
    ticket,
    author: "github",
    type: "ticket.arrived",
    payload: {
      title: `Ticket ${ticket}`,
      priority,
      createdAt: `2026-10-01T00:00:${String(ticket).padStart(2, "0")}.000Z`,
      url: `https://github.com/benomite/brigade/issues/${ticket}`,
      card: { waitsFor: [], zone: [], problems: [], ...(requires.length === 0 ? {} : { requires }) },
    },
  });
}

const CLAUDE = { station: "box/claude", fournit: ["code", "raisonnement"] };
const PLAYWRIGHT = { station: "box/playwright", fournit: ["navigateur-headless"] };

test("devant plusieurs stations, le premier ticket dans l'ordre de service va à la première qui fournit ce qu'il demande", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvec(journal, 1, ["navigateur-headless"], 1);
  poserAvec(journal, 2, []);
  poserAvec(journal, 3, ["code"]);

  // #1 est le premier à servir : il ne va pas à `box/claude`, pourtant nommée d'abord.
  assert.deepEqual([rail.prendre([CLAUDE, PLAYWRIGHT])?.ticket, ticketDuRail(journal.base, 1)?.station], [1, "box/playwright"]);
  // Qui ne demande rien va à la première, quoi qu'elle fournisse.
  assert.deepEqual([rail.prendre([PLAYWRIGHT, CLAUDE])?.ticket, ticketDuRail(journal.base, 2)?.station], [2, "box/playwright"]);
  assert.deepEqual([rail.prendre([PLAYWRIGHT, CLAUDE])?.ticket, ticketDuRail(journal.base, 3)?.station], [3, "box/claude"]);
  assert.equal(rail.prendre([CLAUDE, PLAYWRIGHT]), null);
});

test("une station qui ne prend pas les tickets ordinaires ne se voit prêter que ceux qui demandent une de ses capacités : l'ordinaire va à une autre, ou attend", (t) => {
  const { journal, rail } = cuisine(t);
  const MAC = { station: "mac/claude", fournit: ["chrome-connecté"], ordinaires: false };
  poserAvec(journal, 1, [], 1);
  poserAvec(journal, 2, ["chrome-connecté"]);
  poserAvec(journal, 3, []);

  assert.equal(rail.servables(undefined, [MAC]), 1);
  // #1, le premier à servir, ne demande rien : il passe la station qui ne prend pas les ordinaires.
  assert.deepEqual([rail.prendre([MAC, CLAUDE])?.ticket, ticketDuRail(journal.base, 1)?.station], [1, "box/claude"]);
  assert.deepEqual([rail.prendre([MAC, CLAUDE])?.ticket, ticketDuRail(journal.base, 2)?.station], [2, "mac/claude"]);
  assert.equal(rail.prendre([MAC]), null);
  assert.equal(etats(rail).find(([ticket]) => ticket === 3)?.[1], "waiting");
  // La même, qui les prend : l'ordinaire lui revient.
  assert.deepEqual([rail.prendre([{ ...MAC, ordinaires: true }])?.ticket, ticketDuRail(journal.base, 3)?.station], [3, "mac/claude"]);
});

test("une station ne se voit pas prêter le ticket qui demande ce qu'elle ne fournit pas : il attend, et ne compte pas parmi ce qu'elle pourrait prendre", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvec(journal, 1, ["navigateur-headless"], 1);
  poserAvec(journal, 2, ["code", "navigateur-headless"], 1);
  poserAvec(journal, 3, []);

  assert.equal(rail.servables(), 3);
  assert.equal(rail.servables(undefined, [CLAUDE]), 1);
  assert.equal(rail.servables(undefined, [PLAYWRIGHT]), 2);
  assert.equal(rail.servables(undefined, [CLAUDE, PLAYWRIGHT]), 2);
  assert.equal(rail.servables(undefined, []), 0);
  // Le ticket de plus haute priorité ne retient pas celui qu'elle peut cuisiner.
  assert.equal(rail.prendre([CLAUDE])?.ticket, 3);
  assert.equal(rail.prendre([CLAUDE]), null);
  assert.equal(rail.prendre([]), null);
  assert.deepEqual(etats(rail), [
    [1, "waiting"],
    [2, "waiting"],
    [3, "taken"],
  ]);
  assert.throws(() => rail.prendre([{ station: "", fournit: [] }]), GesteRefuse);
});

test("un simple nom de station ne dit pas ce qu'elle fournit : le rail ne regarde pas les capacités, comme avant", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvec(journal, 1, ["chrome-connecté"]);

  assert.equal(rail.prendre("box/claude")?.ticket, 1);
});

test("un ticket 86 faute de station qui fournisse ce qu'il demande ne tient pas sa zone, même avec une livraison ouverte", (t) => {
  const { journal, rail } = cuisine(t);
  const arriver = (ticket: number, zone: string[]) =>
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:0${ticket}.000Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone, problems: [], requires: ["chrome-connecté"] } },
    });
  arriver(1, ["runtime/src"]);
  arriver(2, ["runtime/src/rail.ts"]);
  rail.quatreVingtSix(1, { motif: "no-station: chrome-connecté" });

  assert.deepEqual(ticketDuRail(journal.base, 2)?.held, []);

  // Livré puis rendu par la pass, puis écarté : sa branche et sa PR existent.
  rail.rendre(1, "test");
  rail.prendre("box/claude");
  rail.envoyerEnPass(1, "box/claude");
  rail.rendre(1, "pass:returned");
  rail.quatreVingtSix(1, { motif: "no-station: chrome-connecté" });

  assert.deepEqual(ticketDuRail(journal.base, 2)?.held, []);
});

test("une fiche d'avant les capacités se relit telle quelle ; un fait dont les capacités ne se lisent pas reste sans effet", (t) => {
  const { journal, rail } = cuisine(t);
  const arriver = (ticket: number, card: unknown) =>
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:0${ticket}.000Z`, url: `https://exemple.test/${ticket}`, card },
    } as never);
  arriver(1, { waitsFor: [], zone: ["docs/"], problems: [] });
  arriver(2, { waitsFor: [], zone: [], problems: [], requires: ["gpu"] });
  arriver(3, { waitsFor: [], zone: [], problems: [], requires: "gpu" });
  arriver(4, { waitsFor: [], zone: [], problems: [], requires: [] });

  assert.deepEqual(rail.tickets().map(({ ticket, card }) => [ticket, card]), [
    [1, { waitsFor: [], zone: ["docs/"], problems: [] }],
    [2, { waitsFor: [], zone: [], problems: [], requires: ["gpu"] }],
    // Aucune capacité demandée : la fiche se garde comme celle qui n'a pas la ligne.
    [4, { waitsFor: [], zone: [], problems: [] }],
  ]);
});

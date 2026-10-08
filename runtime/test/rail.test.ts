import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
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
      station: null,
      leaseUntil: null,
      progressedAt: null,
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

test("la retenue de zone tombe quand le premier revient en attente ou quitte le rail, et un 86 tient sa zone", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecZone(journal, 1, ["runtime/src/rail.ts"]);
  poserAvecZone(journal, 2, ["runtime/src/rail.ts"]);
  rail.prendre("a");
  rail.quatreVingtSix(1, { motif: "quota", station: "a" });
  assert.deepEqual(tenu(journal, 2), [{ ticket: 1, path: "runtime/src/rail.ts" }]);
  rail.rendre(1, "86-over");
  assert.deepEqual(tenu(journal, 2), []);

  rail.prendre("a");
  assert.equal(tenu(journal, 2)?.length, 1);
  journal.ajouter({ project: "brigade", ticket: 1, author: "github", type: "ticket.left", payload: { reason: "closed" } });
  assert.deepEqual(tenu(journal, 2), []);
  assert.equal(rail.prendre("b")?.ticket, 2);
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

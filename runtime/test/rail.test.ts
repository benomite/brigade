// Le rail du journal tel que `status` et le manager le relisent : la projection
// (src/projections/rail.ts) et les mots du rail (src/rail.ts : etatLu,
// retenue, direRetenue…). Plus rien ne prête un ticket sous bail — la station
// GitHub seul prend les tickets sur GitHub (#2061) — : la fixture
// rail-du-journal pose l'historique que les journaux d'avant portent, et ces
// tests éprouvent ce qui s'en lit.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { REDECOUPE } from "../src/events/rail.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { communsDuRail, lireRail, ticketDuRail } from "../src/projections/rail.ts";
import { cestArrive, mettreEnAttente } from "../src/attente.ts";
import { direAttenteDUnWaiting, direAttentesLevees, direAttentesLeveesEn, direRetenue, direRetenueEn, etatLu, etatLuEn, retenue } from "../src/rail.ts";
import { ouvrirRail, type Rail } from "./aides/rail-du-journal.ts";
import { repertoireTemporaire } from "./outils.ts";

const BAIL_MS = 600_000;

// Une horloge que le test avance à la main : la fixture ne lit l'heure que là.
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
    payload: { title: `Ticket ${ticket}`, priority, createdAt, url: `https://github.com/acme/brigade/issues/${ticket}` },
  });
}

const etats = (journal: Journal) => lireRail(journal.base).map((t) => [t.ticket, t.state]);
const types = (journal: Journal, ticket: number) => journal.duTicket(ticket).map((e) => e.type);

test("un ticket arrivé est en attente sur le rail, avec ce que GitHub en dit", (t) => {
  const { journal } = cuisine(t);
  poser(journal, 14, 1);

  const [ticket] = lireRail(journal.base);
  assert.deepEqual(
    { ...ticket, since: null },
    {
      ticket: 14,
      title: "Ticket 14",
      priority: 1,
      createdAt: "2026-10-01T00:00:14.000Z",
      url: "https://github.com/acme/brigade/issues/14",
      state: "waiting",
      since: null,
      model: null,
      effort: null,
      card: null,
      awaits: [],
      dropped: [],
      held: [],
      outOfZone: [],
      frozenBy: [],
      waitingOn: [],
      station: null,
      leaseUntil: null,
      progressedAt: null,
      reason: null,
      until: null,
      waitingFor: null,
    },
  );
});

test("le rail se lit dans l'ordre de service : priorité, puis ancienneté, les sans-priorité en dernier", (t) => {
  const { journal } = cuisine(t);
  poser(journal, 1, null, "2026-09-01T00:00:00.000Z");
  poser(journal, 2, 2, "2026-09-03T00:00:00.000Z");
  poser(journal, 3, 1, "2026-09-05T00:00:00.000Z");
  poser(journal, 4, 2, "2026-09-02T00:00:00.000Z");
  poser(journal, 5, 1, "2026-09-04T00:00:00.000Z");

  assert.deepEqual(lireRail(journal.base).map((ticket) => ticket.ticket), [5, 3, 4, 2, 1]);
});

test("un ticket qui change garde son état ; un ticket qui part disparaît, quel que soit son état", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 7);
  poser(journal, 8);
  rail.prendre("box/claude");
  journal.ajouter({ project: "brigade", ticket: 7, author: "github", type: "ticket.changed", payload: { title: "Nouveau titre", priority: 3 } });

  assert.deepEqual(
    lireRail(journal.base).map((ticket) => [ticket.ticket, ticket.title, ticket.priority, ticket.state]),
    [[7, "Nouveau titre", 3, "taken"], [8, "Ticket 8", null, "waiting"]],
  );

  journal.ajouter({ project: "brigade", ticket: 7, author: "github", type: "ticket.left", payload: { reason: "unfired" } });

  assert.deepEqual(etats(journal), [[8, "waiting"]]);
});

test("un ticket pris se lit avec sa station, l'heure de la prise et l'échéance de son bail", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude-opus");

  const [prise] = journal.duTicket(14).slice(-1);
  const pris = ticketDuRail(journal.base, 14);
  assert.deepEqual(
    [pris?.state, pris?.station, pris?.since, pris?.leaseUntil],
    ["taken", "box/claude-opus", prise?.at, "2026-10-08T10:10:00.000Z"],
  );
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

  assert.deepEqual(lireRail(journal.base).map((ticket) => ticket.progressedAt), [null, null, null]);
});

test("un fait du rail illisible reste au journal sans toucher au rail, et n'empêche pas de le rejouer", (t) => {
  const { journal } = cuisine(t);
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
  assert.deepEqual(etats(journal), [[14, "waiting"]]);
  assert.equal(lireRail(journal.base)[0]?.title, "Ticket 14");
});

test("la fiche d'un ticket suit ses faits, et se retrouve au rejeu ; un fait d'avant la fiche n'en porte pas", (t) => {
  const { journal } = cuisine(t);
  const card = { waitsFor: [12, 13], zone: ["runtime/src/rail.ts"], problems: ["clé inconnue « budget » — connues : attend, zone"] };
  const noter = (fait: object) => journal.ajouter({ project: "brigade", ticket: 14, author: "github", ...fait } as never);
  noter({ type: "ticket.arrived", payload: { title: "Ticket 14", priority: null, createdAt: "2026-10-01T00:00:14.000Z", url: "https://exemple.test/14", card } });
  assert.deepEqual(lireRail(journal.base)[0]?.card, card);

  journal.reconstruire();
  assert.deepEqual(lireRail(journal.base)[0]?.card, card);

  noter({ type: "ticket.changed", payload: { title: "Ticket 14", priority: null, card: { ...card, problems: [] } } });
  assert.deepEqual(lireRail(journal.base)[0]?.card?.problems, []);
  noter({ type: "ticket.changed", payload: { title: "Ticket 14", priority: null } });
  assert.equal(lireRail(journal.base)[0]?.card, null);
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

    assert.deepEqual(etats(journal), [[14, "waiting"]]);
    assert.equal(ticketDuRail(journal.base, 14)?.station, null);
  });
}

for (const outcome of ["ok", "neutral"]) {
  test(`un cook qui finit en « ${outcome} » laisse le ticket à sa station : c'est elle qui dit la suite`, (t) => {
    const { journal, rail } = cuisine(t);
    poser(journal, 14);
    rail.prendre("box/claude");

    cuisiner(journal, 14, { outcome });

    assert.deepEqual(etats(journal), [[14, "taken"]]);
  });
}

test("la fin d'un cook ne ramène pas en attente un ticket qui n'est plus pris", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 14);
  rail.prendre("box/claude");
  rail.envoyerEnPass(14, "box/claude");

  cuisiner(journal, 14, { outcome: "failed" });

  assert.deepEqual(etats(journal), [[14, "pass"]]);
});

// Les dépendances : un ticket dont la fiche dit « attend : #A » l'attend
// jusqu'à ce que #A soit servi.
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
      url: `https://github.com/acme/brigade/issues/${ticket}`,
      card: { waitsFor, zone: [], problems },
    },
  });
}

const partir = (journal: Journal, ticket: number, reason: "closed" | "unfired" | "gone") =>
  journal.ajouter({ project: "brigade", ticket, author: "github", type: "ticket.left", payload: { reason } });

// Prend le ticket, l'envoie en pass et le sert : l'historique d'un ticket servi.
const servir = (rail: Rail, ticket: number) => {
  assert.equal(rail.prendre("box/claude", undefined, ticket)?.ticket, ticket);
  rail.envoyerEnPass(ticket, "box/claude");
  rail.servir(ticket);
};

const attendus = (journal: Journal, ticket: number) => ticketDuRail(journal.base, ticket)?.awaits.map((attendu) => [attendu.ticket, attendu.left?.reason ?? null]);
// Ceux que la cuisine n'attend plus : fermés sans avoir été servis, ou disparus (#1834).
const leves = (journal: Journal, ticket: number) => ticketDuRail(journal.base, ticket)?.dropped.map((leve) => [leve.ticket, leve.reason]);

test("un ticket qui en attend un autre l'attend jusqu'à ce que celui-ci soit servi, même s'il passe devant dans l'ordre", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [15]);
  poser(journal, 15);

  assert.deepEqual(attendus(journal, 14), [[15, null]]);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), "attend");
  rail.prendre("box/claude", undefined, 15);
  rail.envoyerEnPass(15, "box/claude");
  assert.deepEqual(attendus(journal, 14), [[15, null]]);

  rail.servir(15);
  assert.deepEqual(attendus(journal, 14), []);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), null);
});

test("un ticket qui en attend plusieurs ne part qu'une fois tous servis", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [15, 16]);
  poser(journal, 15);
  poser(journal, 16);

  servir(rail, 15);
  assert.deepEqual(attendus(journal, 14), [[16, null]]);
  servir(rail, 16);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), null);
});

test("un ticket attendu qui n'est pas sur le rail se laisse attendre : rien ne dit qu'il a été servi", (t) => {
  const { journal } = cuisine(t);
  poserAvecFiche(journal, 14, [99]);

  assert.deepEqual(attendus(journal, 14), [[99, null]]);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), "attend");
});

test("servi reste servi : le ticket attendu a quitté le rail, son issue fermée par la pass, et l'attente est levée", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 15);
  servir(rail, 15);
  partir(journal, 15, "closed");
  poserAvecFiche(journal, 14, [15]);

  assert.deepEqual(attendus(journal, 14), []);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), null);
});

test("un ticket remonté au chef (86) puis mergé par lui est servi : le merge est au journal, qui l'attendait part", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 15);
  poserAvecFiche(journal, 14, [15]);
  assert.equal(rail.prendre("box/claude")?.ticket, 15);
  rail.envoyerEnPass(15, "box/claude");
  rail.quatreVingtSix(15, { motif: "pass:returns-exhausted" });
  // Le chef merge la PR lui-même : le merge est au journal, le ticket reste 86.
  journal.ajouter({ project: "brigade", ticket: 15, author: "runtime", type: "merge.done", payload: { pr: "https://exemple.test/pr/1", sha: null, by: "outside", reconciled: false } });
  partir(journal, 15, "closed");

  assert.deepEqual(attendus(journal, 14), []);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), null);
  journal.reconstruire();
  assert.deepEqual(attendus(journal, 14), []);
});

test("un ticket attendu qui quitte le rail sans avoir été servi : fermé, il n'est plus attendu ; l'issue ouverte, il l'est toujours, sur le rail (#1834)", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [15, 16, 17]);
  for (const ticket of [15, 16, 17]) poser(journal, ticket);
  partir(journal, 15, "closed");
  partir(journal, 16, "unfired");

  assert.deepEqual(attendus(journal, 14), [[16, "unfired"], [17, null]]);
  assert.deepEqual(leves(journal, 14), [[15, "closed"]]);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), "attend");
  assert.equal(retenue(ticketDuRail(journal.base, 17)!), null);
  servir(rail, 17);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), "attend");

  // #16 fermée à son tour : plus rien ne retient #14.
  partir(journal, 16, "closed");
  assert.deepEqual([attendus(journal, 14), leves(journal, 14)], [[], [[15, "closed"], [16, "closed"]]]);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), null);
});

test("un ticket attendu qui revient sur le rail : celui qui l'attend l'attend toujours, puis part", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [15]);
  poser(journal, 15);
  partir(journal, 15, "unfired");
  assert.deepEqual(attendus(journal, 14), [[15, "unfired"]]);

  poser(journal, 15);
  assert.deepEqual(attendus(journal, 14), [[15, null]]);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), "attend");
  servir(rail, 15);
  assert.equal(retenue(ticketDuRail(journal.base, 14)!), null);
});

test("les dépendances survivent au redémarrage : rejoué du journal, le rail attend et bloque les mêmes tickets", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 14, [15, 16, 17]);
  for (const ticket of [15, 16, 17]) poser(journal, ticket);
  servir(rail, 15);
  partir(journal, 15, "closed");
  partir(journal, 16, "gone");
  const avant = lireRail(journal.base);

  journal.reconstruire();

  assert.deepEqual(lireRail(journal.base), avant);
  assert.deepEqual(attendus(journal, 14), [[17, null]]);
  assert.deepEqual(leves(journal, 14), [[16, "gone"]]);
});

test("ce qui retient un ticket se dit en clair : ce qu'il attend, même hors du rail ; et l'attente que la cuisine a levée", (t) => {
  const { journal } = cuisine(t);
  poserAvecFiche(journal, 14, [15, 16]);
  poserAvecFiche(journal, 20, [15, 16, 17]);
  for (const ticket of [15, 16, 17]) poser(journal, ticket);

  assert.equal(direRetenue(ticketDuRail(journal.base, 14)!), "attend #15, #16");
  assert.equal(etatLu(ticketDuRail(journal.base, 14)!), "en attente");
  assert.equal(direRetenue(ticketDuRail(journal.base, 15)!), null);

  partir(journal, 15, "closed");
  partir(journal, 17, "unfired");
  assert.equal(etatLu(ticketDuRail(journal.base, 20)!), "en attente");
  assert.equal(direRetenue(ticketDuRail(journal.base, 20)!), "attend #16, #17 (hors du rail, issue ouverte : label `fire` retiré)");
  assert.equal(direAttentesLevees(ticketDuRail(journal.base, 20)!), "#15 a été fermé sans avoir été servi : il n'est plus attendu");
  assert.equal(direAttentesLeveesEn(ticketDuRail(journal.base, 20)!), "#15 was closed without being served: no longer awaited");
});

test("un ticket qu'aucune station ne peut cuisiner se lit en WAITING, pas sur le rail ; un autre 86, ou le même rendu, garde son état (#1925)", (t) => {
  const { journal, rail, heure } = cuisine(t);
  for (const ticket of [14, 15, 16]) poser(journal, ticket);
  rail.quatreVingtSix(14, { motif: "no-station: macos" });
  rail.quatreVingtSix(15, { motif: "quota", retour: new Date(heure.maintenant().getTime() + BAIL_MS) });
  rail.quatreVingtSix(16, { motif: "unreadable-card" });

  const lus = () => [14, 15, 16].map((ticket) => [etatLu(ticketDuRail(journal.base, ticket)!), etatLuEn(ticketDuRail(journal.base, ticket)!)]);
  assert.deepEqual(lus(), [
    ["WAITING", "WAITING"],
    ["86", "86"],
    ["86", "86"],
  ]);

  // Rendu au rail, il n'attend plus rien.
  rail.rendre(14, "capabilities-reread");
  assert.deepEqual(lus()[0], ["en attente", "queued"]);
});

// Un ticket du rail n'attend que des tickets du rail (#1926) : aucun ticket qui
// s'y lit — en attente ou bloqué — n'en attend un en WAITING.
const aucunSurLeRailNAttendUnWaiting = (journal: Journal) => {
  const rail = new Map(lireRail(journal.base).map((ticket) => [ticket.ticket, ticket]));
  for (const ticket of rail.values()) {
    if (etatLu(ticket) === "WAITING") continue;
    const enWaiting = ticket.awaits.filter((attendu) => rail.get(attendu.ticket) !== undefined && etatLu(rail.get(attendu.ticket)!) === "WAITING");
    assert.deepEqual(enWaiting, [], `#${ticket.ticket} (${etatLu(ticket)}) attend un ticket en WAITING`);
  }
};

test("un ticket qui attend, de proche en proche, un ticket en WAITING y est aussi, et nomme celui qu'il attend ; celui qui n'attend que des tickets du rail y reste (#1926)", (t) => {
  const { journal, rail } = cuisine(t);
  // #14 attend #15, qui attend #16, qu'aucune station ne peut cuisiner. #17 attend #18, sur le rail.
  poserAvecFiche(journal, 14, [15]);
  poserAvecFiche(journal, 15, [16]);
  poser(journal, 16);
  poserAvecFiche(journal, 17, [18]);
  poser(journal, 18);
  rail.quatreVingtSix(16, { motif: "no-station: macos" });

  const lus = () => [14, 15, 16, 17, 18].map((ticket) => etatLu(ticketDuRail(journal.base, ticket)!));
  assert.deepEqual(lus(), ["WAITING", "WAITING", "WAITING", "en attente", "en attente"]);
  assert.deepEqual([14, 15, 16].map((ticket) => etatLuEn(ticketDuRail(journal.base, ticket)!)), ["WAITING", "WAITING", "WAITING"]);
  assert.deepEqual(ticketDuRail(journal.base, 15)?.waitingOn, [{ ticket: 16, roots: [] }]);
  assert.deepEqual(ticketDuRail(journal.base, 14)?.waitingOn, [{ ticket: 15, roots: [16] }]);
  assert.deepEqual(ticketDuRail(journal.base, 17)?.waitingOn, []);
  // Sa raison nomme le ticket en WAITING qu'il attend, et celui qui, au bout de la chaîne, y est de lui-même.
  assert.equal(direRetenueEn(ticketDuRail(journal.base, 15)!), "waits for #16 (WAITING)");
  assert.equal(direRetenueEn(ticketDuRail(journal.base, 14)!), "waits for #15 (WAITING, behind #16)");
  assert.equal(direRetenue(ticketDuRail(journal.base, 14)!), "attend #15 (WAITING, derrière #16)");
  assert.equal(direAttenteDUnWaiting(ticketDuRail(journal.base, 14)!), "attend : #15 (WAITING, derrière #16) — il revient seul sur le rail dès qu'il n'attend plus aucun ticket en WAITING");
  assert.equal(direAttenteDUnWaiting(ticketDuRail(journal.base, 17)!), null);
  assert.equal(direRetenueEn(ticketDuRail(journal.base, 17)!), "awaiting #18");
  aucunSurLeRailNAttendUnWaiting(journal);
  // Rien d'écrit au journal pour eux : la règle se lit du rail.
  assert.deepEqual(types(journal, 14), ["ticket.arrived"]);
  assert.deepEqual(types(journal, 15), ["ticket.arrived"]);

  // #16 revient sur le rail : ceux qui l'attendaient y reviennent avec lui.
  rail.rendre(16, "capabilities-reread");
  assert.deepEqual(lus(), ["en attente", "en attente", "en attente", "en attente", "en attente"]);
  assert.deepEqual(ticketDuRail(journal.base, 14)?.waitingOn, []);
  assert.equal(direRetenueEn(ticketDuRail(journal.base, 14)!), "awaiting #15");
  aucunSurLeRailNAttendUnWaiting(journal);
});

test("un ticket qui attend deux tickets en WAITING n'en revient que quand aucun ne l'y tient plus — un tiers comme une station (#1926)", (t) => {
  const { journal, rail, heure } = cuisine(t);
  poserAvecFiche(journal, 20, [21, 22, 23]);
  for (const ticket of [21, 22, 23]) poser(journal, ticket);
  rail.quatreVingtSix(21, { motif: "no-station: macos" });
  mettreEnAttente(journal, "brigade", 22, { quoi: "sa signature", qui: "le client" }, heure.maintenant());

  const vingt = () => ticketDuRail(journal.base, 20)!;
  assert.equal(etatLu(vingt()), "WAITING");
  // Les deux qui l'y tiennent sont nommés ; #23, sur le rail, reste attendu.
  assert.equal(direRetenueEn(vingt()), "waits for #21 (WAITING), #22 (WAITING) · awaiting #23");
  aucunSurLeRailNAttendUnWaiting(journal);

  // #21 revient : #22 le tient encore en WAITING, et lui seul est nommé.
  rail.rendre(21, "capabilities-reread");
  assert.equal(etatLu(vingt()), "WAITING");
  assert.equal(direRetenueEn(vingt()), "waits for #22 (WAITING) · awaiting #21, #23");
  aucunSurLeRailNAttendUnWaiting(journal);

  // Ce qu'attendait #22 est arrivé : plus rien ne le tient, il revient sur le rail.
  cestArrive(journal, "brigade", 22);
  assert.equal(etatLu(vingt()), "en attente");
  assert.deepEqual(vingt().waitingOn, []);
  assert.equal(direRetenueEn(vingt()), "awaiting #21, #22, #23");
  aucunSurLeRailNAttendUnWaiting(journal);
});

test("un cycle de tickets en attente sans ticket en WAITING n'entre pas en WAITING ; avec un, toute la boucle y entre (#1926)", (t) => {
  const { journal, rail } = cuisine(t);
  poserAvecFiche(journal, 30, [31]);
  poserAvecFiche(journal, 31, [30, 32]);
  poser(journal, 32);
  assert.deepEqual([30, 31].map((ticket) => etatLu(ticketDuRail(journal.base, ticket)!)), ["en attente", "en attente"]);

  rail.quatreVingtSix(32, { motif: "no-station: macos" });
  assert.deepEqual([30, 31].map((ticket) => etatLu(ticketDuRail(journal.base, ticket)!)), ["WAITING", "WAITING"]);
  assert.deepEqual(ticketDuRail(journal.base, 30)?.waitingOn, [{ ticket: 31, roots: [32] }]);
  assert.deepEqual(ticketDuRail(journal.base, 31)?.waitingOn, [{ ticket: 30, roots: [32] }, { ticket: 32, roots: [] }]);
  aucunSurLeRailNAttendUnWaiting(journal);
});

// --- Les zones : un ticket parti en cuisine tient sa zone, et le rail dit
// qui la tient à ceux qui la recouvrent.

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

  // Tant qu'aucun n'est parti, rien ne retient personne.
  assert.deepEqual(tenu(journal, 2), []);
  assert.equal(rail.prendre("a")?.ticket, 1);
  assert.deepEqual(tenu(journal, 2), [{ ticket: 1, path: "runtime/src/rail.ts" }]);
  assert.equal(retenue(ticketDuRail(journal.base, 2)!), "zone");
  assert.equal(direRetenue(ticketDuRail(journal.base, 2)!), "zone tenue par #1 (runtime/src/rail.ts)");
  assert.equal(etatLu(ticketDuRail(journal.base, 2)!), "en attente");
  // Le ticket d'une zone disjointe n'est pas retenu, lui.
  assert.deepEqual(tenu(journal, 3), []);

  // En pass, la livraison de #1 n'est pas encore sur la base : #2 reste retenu.
  rail.envoyerEnPass(1, "a");
  assert.equal(retenue(ticketDuRail(journal.base, 2)!), "zone");
  rail.servir(1);
  assert.deepEqual(tenu(journal, 2), []);
  assert.equal(retenue(ticketDuRail(journal.base, 2)!), null);
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
  rail.prendre("a", undefined, 2);
  rail.envoyerEnPass(2, "a");
  // La pass est rouge : #2 revient en attente, avec sa branche, son worktree et sa PR.
  rail.rendre(2, "pass-red");

  assert.deepEqual(lireRail(journal.base).map((ticket) => ticket.ticket), [1, 2]);
  assert.deepEqual(tenu(journal, 1), [{ ticket: 2, path: "runtime/src/rail.ts" }]);
  assert.deepEqual(tenu(journal, 2), []);
  // Le renvoi de #2 part, tient toujours sa zone ; servi, il la lâche.
  rail.prendre("b", undefined, 2);
  assert.equal(tenu(journal, 1)?.length, 1);
  rail.envoyerEnPass(2, "b");
  rail.servir(2);
  assert.deepEqual(tenu(journal, 1), []);
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
  rail.prendre("d", undefined, 5);
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

test("un ticket que le manager a redécoupé ne tient plus de zone : ses sous-tickets, qui la recouvrent, ne sont pas retenus", (t) => {
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
  const { journal } = cuisine(t);
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

  assert.deepEqual(lireRail(journal.base).map(({ ticket, card }) => [ticket, card]), [
    [1, { waitsFor: [], zone: ["docs/"], problems: [] }],
    [2, { waitsFor: [], zone: [], problems: [], requires: ["gpu"] }],
    // Aucune capacité demandée : la fiche se garde comme celle qui n'a pas la ligne.
    [4, { waitsFor: [], zone: [], problems: [] }],
  ]);
});

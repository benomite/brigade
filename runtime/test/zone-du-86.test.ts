// Un ticket remonté au chef, ou mis 86, attend un geste ou une heure, pas un
// cook : il rend sa zone, et les tickets qui attendaient dessus partent. Remis
// sur le rail, il la reprend sous la règle ordinaire — et attend si un autre
// l'a prise entre-temps (#1368). Le soir du 21/10, un ticket remonté a tenu sa
// zone 6 h 24 et arrêté 35 tickets.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { ENCORE_ROUGE, NON_JUGEE } from "../src/events/pass.ts";
import { FIN_DE_86 } from "../src/events/rail.ts";
import { MARQUEUR } from "../src/fiche.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { ticketDuRail } from "../src/projections/rail.ts";
import { direRetenue, ouvrirRail, type Rail } from "../src/rail.ts";
import { REMONTE } from "../src/reaction.ts";
import { BAIL_MS, cuisine as cuisineComplete, issue } from "./aides/cuisine.ts";
import { aArreter, jusqua, repertoireTemporaire } from "./outils.ts";

const MAINTENANT = "2026-10-21T22:00:00.000Z";

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  // Fermé avant que son répertoire ne soit retiré : Windows refuse sinon de le supprimer.
  aArreter(t, () => journal.fermer());
  let instant = Date.parse(MAINTENANT);
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: BAIL_MS, maintenant: () => new Date(instant) });
  return { journal, rail, avancer: (ms: number) => void (instant += ms), maintenant: () => new Date(instant) };
}

// Dans l'ordre où le test les pose : c'est l'ordre de service.
function poser(journal: Journal, ticket: number, zone: string[]) {
  journal.ajouter({
    project: "brigade",
    ticket,
    author: "github",
    type: "ticket.arrived",
    payload: {
      title: `Ticket ${ticket}`,
      priority: null,
      createdAt: new Date(Date.parse("2026-10-01T00:00:00.000Z") + journal.dernierSeq() * 1000).toISOString(),
      url: `https://github.com/acme/brigade/issues/${ticket}`,
      card: { waitsFor: [], zone, problems: [] },
    },
  });
}

// Le ticket cuit, puis part en pass avec sa livraison : sa branche et sa PR existent.
function livrer(rail: Rail, ticket: number, station = "box/claude") {
  assert.equal(rail.prendre(station)?.ticket, ticket);
  rail.envoyerEnPass(ticket, station);
}

const tenu = (journal: Journal, ticket: number) => ticketDuRail(journal.base, ticket)?.held;
const ligne = (journal: Journal, ticket: number, maintenant: Date) =>
  decrireEtat(lireEtat(journal, maintenant), maintenant).find((l) => l.startsWith(`  #${ticket}  `)) ?? "";

// Les remontées au chef telles que la pass et le manager les écrivent sur le rail.
const REMONTEES = [REMONTE, `pass:${ENCORE_ROUGE}`, `pass:${NON_JUGEE}`];

test("un ticket remonté au chef rend sa zone : le ticket qui attendait dessus part", (t) => {
  for (const motif of REMONTEES) {
    const { journal, rail } = cuisine(t);
    poser(journal, 1339, ["runtime/src"]);
    poser(journal, 1340, ["runtime/src/rail.ts"]);
    livrer(rail, 1339);
    assert.deepEqual(tenu(journal, 1340), [{ ticket: 1339, path: "runtime/src/rail.ts" }], motif);
    assert.equal(rail.prendre("box/claude"), null, motif);

    rail.quatreVingtSix(1339, { motif });

    assert.equal(ticketDuRail(journal.base, 1339)?.state, "86", motif);
    assert.deepEqual(tenu(journal, 1340), [], motif);
    assert.equal(rail.prendre("box/claude")?.ticket, 1340, motif);
  }
});

test("un ticket mis 86 rend sa zone, qu'il ait livré ou non, qu'il ait une heure de retour ou non", (t) => {
  const cas: { nom: string; mettre: (rail: Rail) => void }[] = [
    // Sa station le dit 86 en cuisine : le quota, avec une heure de retour.
    { nom: "quota", mettre: (rail) => (rail.prendre("box/claude"), rail.quatreVingtSix(1, { motif: "quota", retour: new Date("2026-10-22T03:00:00.000Z"), station: "box/claude" })) },
    // Le modèle refuse le ticket, encore et encore : il remonte, sans livraison.
    { nom: "refus", mettre: (rail) => (rail.prendre("box/claude"), rail.quatreVingtSix(1, { motif: "refused", station: "box/claude" })) },
    // Mis de côté avant toute cuisson.
    { nom: "en attente", mettre: (rail) => rail.quatreVingtSix(1, { motif: "no-calibration" }) },
    // Livré, puis mis de côté en pass.
    { nom: "en pass", mettre: (rail) => (livrer(rail, 1), rail.quatreVingtSix(1, { motif: "review-red" })) },
  ];
  for (const { nom, mettre } of cas) {
    const { journal, rail } = cuisine(t);
    poser(journal, 1, ["runtime/src"]);
    poser(journal, 2, ["runtime/src/rail.ts"]);
    mettre(rail);

    assert.equal(ticketDuRail(journal.base, 1)?.state, "86", nom);
    assert.deepEqual(tenu(journal, 2), [], nom);
    assert.equal(rail.prendre("box/claude")?.ticket, 2, nom);
  }
});

test("un ticket en WAITING rend sa zone, même avec une livraison ouverte", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1, ["runtime/src"]);
  poser(journal, 2, ["runtime/src/rail.ts"]);
  livrer(rail, 1);
  rail.quatreVingtSix(1, { motif: REMONTE });
  journal.ajouter({ project: "brigade", ticket: 1, author: "chef", type: "ticket.waiting", payload: { what: "la réponse d'Anthropic", who: "Anthropic", followUp: "2026-10-28T09:00:00.000Z" } });

  assert.notEqual(ticketDuRail(journal.base, 1)?.waitingFor, null);
  assert.deepEqual(tenu(journal, 2), []);
  assert.equal(rail.prendre("box/claude")?.ticket, 2);
});

test("relancé par le chef pendant que sa zone est prise, le ticket remonté attend : il ne cuit pas à côté", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1, ["runtime/src"]);
  poser(journal, 2, ["runtime/src/rail.ts"]);
  livrer(rail, 1);
  rail.quatreVingtSix(1, { motif: REMONTE });
  assert.equal(rail.prendre("box/claude")?.ticket, 2);

  // Le chef tranche : #1 repart, sur sa livraison ouverte. #2 tient la zone.
  rail.rendre(1, "chef");
  assert.equal(ticketDuRail(journal.base, 1)?.state, "waiting");
  assert.deepEqual(tenu(journal, 1), [{ ticket: 2, path: "runtime/src/rail.ts" }]);
  assert.equal(direRetenue(ticketDuRail(journal.base, 1)!), "zone tenue par #2 (runtime/src/rail.ts)");
  assert.equal(rail.servables(), 0);
  assert.equal(rail.prendre("box/claude"), null);

  // En pass, la livraison de #2 n'est pas sur la base : #1 attend encore.
  rail.envoyerEnPass(2, "box/claude");
  assert.equal(rail.prendre("box/claude"), null);
  rail.servir(2);
  assert.deepEqual(tenu(journal, 1), []);
  assert.equal(rail.prendre("box/claude")?.ticket, 1);
});

test("revenu seul de son 86 à l'heure dite, pendant que sa zone est prise, le ticket attend aussi", (t) => {
  const { journal, rail, avancer } = cuisine(t);
  poser(journal, 1, ["runtime/src"]);
  poser(journal, 2, ["runtime/src/rail.ts"]);
  assert.equal(rail.prendre("box/claude")?.ticket, 1);
  rail.quatreVingtSix(1, { motif: "quota", retour: new Date(Date.parse(MAINTENANT) + 60_000), station: "box/claude" });
  assert.equal(rail.prendre("box/claude")?.ticket, 2);

  avancer(60_000);
  assert.equal(rail.relever(), 1);
  assert.deepEqual(journal.duTicket(1).at(-1)?.payload, { reason: FIN_DE_86, station: null });
  assert.equal(ticketDuRail(journal.base, 1)?.state, "waiting");
  assert.deepEqual(tenu(journal, 1), [{ ticket: 2, path: "runtime/src/rail.ts" }]);
  assert.equal(rail.prendre("box/claude"), null);
});

test("relancé sur sa livraison ouverte, le ticket remonté reprend sa zone : un ticket qui la recouvre et n'est pas parti l'attend", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1, ["runtime/src"]);
  livrer(rail, 1);
  rail.quatreVingtSix(1, { motif: `pass:${ENCORE_ROUGE}` });
  poser(journal, 3, ["runtime/src/pass.ts"]);
  assert.deepEqual(tenu(journal, 3), []);

  rail.rendre(1, "chef");
  assert.deepEqual(tenu(journal, 3), [{ ticket: 1, path: "runtime/src/pass.ts" }]);
  assert.deepEqual(tenu(journal, 1), []);
  assert.equal(rail.prendre("box/claude")?.ticket, 1);
  assert.equal(rail.prendre("box/claude"), null);
});

test("la file ne montre plus le ticket remonté ou 86 comme tenant sa zone", (t) => {
  const { journal, rail, maintenant } = cuisine(t);
  poser(journal, 1, ["runtime/src"]);
  poser(journal, 2, ["runtime/src/rail.ts"]);
  poser(journal, 3, ["docs"]);
  poser(journal, 4, ["docs/runtime"]);
  livrer(rail, 1);
  assert.equal(rail.prendre("box/claude")?.ticket, 3);
  assert.match(ligne(journal, 2, maintenant()), /zone held by #1 \(runtime\/src\/rail\.ts\)/);
  assert.match(ligne(journal, 4, maintenant()), /zone held by #3 \(docs\/runtime\)/);

  rail.quatreVingtSix(1, { motif: REMONTE });
  rail.quatreVingtSix(3, { motif: "quota", retour: new Date("2026-10-22T03:00:00.000Z"), station: "box/claude" });

  for (const ticket of [2, 4]) {
    assert.equal(direRetenue(ticketDuRail(journal.base, ticket)!), null, `#${ticket}`);
    assert.doesNotMatch(ligne(journal, ticket, maintenant()), /zone held|blocked by/, `#${ticket}`);
  }
});

describe("dans une cuisine complète", () => {
  test("la station lance le cook du ticket qui attendait la zone d'un ticket remonté ; relancé, le remonté ne cuit pas à côté", async (t) => {
    // Deux cooks de front : seule la zone retient le second ticket.
    const { repertoire, gh, journal, etat, lancements, dernier } = cuisineComplete(t, { cooks: 2, scenario: "muet", suite: ["livre"] });
    gh.ficher(14, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : runtime/src`);
    gh.ficher(15, "2026-10-08T09:00:00Z", `${MARQUEUR}\n- zone : runtime/src/rail.ts`);
    for (const numero of [14, 15]) gh.poser(issue(numero));
    await jusqua(() => etat(14) === "pass");
    assert.equal(etat(15), "waiting");
    assert.deepEqual(ticketDuRail(journal.base, 15)?.held, [{ ticket: 14, path: "runtime/src/rail.ts" }]);
    assert.equal(lancements().length, 1);

    // La pass remonte #14 au chef, depuis sa propre connexion au journal.
    const dehors = ouvrirJournal(repertoire);
    aArreter(t, () => dehors.fermer());
    const railDehors = ouvrirRail(dehors, { projet: "brigade", dureeBailMs: BAIL_MS });
    dehors.ajouter({ project: "brigade", ticket: 14, author: "pass", type: "pass.escalated", payload: { reason: ENCORE_ROUGE, cause: "returns-exhausted" } });
    railDehors.quatreVingtSix(14, { motif: `pass:${ENCORE_ROUGE}` });

    await jusqua(() => lancements().length === 2);
    assert.equal(etat(15), "taken");
    assert.equal(dernier("cook.launched", 15) !== undefined, true);

    // Le chef relance #14 : #15 cuit sur la zone, #14 attend son tour.
    railDehors.rendre(14, "chef");
    await jusqua(() => etat(14) === "waiting");
    await new Promise((resoudre) => setTimeout(resoudre, 80));
    assert.equal(etat(14), "waiting");
    assert.deepEqual(ticketDuRail(journal.base, 14)?.held, [{ ticket: 15, path: "runtime/src/rail.ts" }]);
    assert.equal(lancements().length, 2);
  });
});

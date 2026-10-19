// Un ticket que la pass n'a pas pu juger (86 sans heure de retour) gèle ce qui
// l'attend, par `attend` ou par sa zone : l'état le dit « bloqué par », en
// nommant le ticket gelé. La décision d'ordonnancement, elle, ne change pas.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { openLog, type Log } from "../src/log.ts";
import { ticketDuRail } from "../src/projections/rail.ts";
import { etatLu, ouvrirRail, type Rail } from "../src/rail.ts";
import { repertoireTemporaire } from "./outils.ts";

const MAINTENANT = "2026-10-12T12:00:00.000Z";

function kitchen(t: TestContext) {
  const log = openLog(repertoireTemporaire(t));
  t.after(() => log.fermer());
  const rail = ouvrirRail(log, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(MAINTENANT) });
  return { journal: log, rail };
}

function poser(log: Log, ticket: number, waitsFor: number[], zone: string[]) {
  log.ajouter({
    project: "brigade",
    ticket,
    author: "github",
    type: "ticket.arrived",
    payload: {
      title: `Ticket ${ticket}`,
      priority: null,
      // Dans l'ordre où le test les pose : c'est l'ordre de service.
      createdAt: new Date(Date.parse("2026-10-01T00:00:00.000Z") + log.dernierSeq() * 1000).toISOString(),
      url: `https://github.com/benomite/brigade/issues/${ticket}`,
      card: { waitsFor, zone, problems: [] },
    },
  });
}

// Le ticket part en cuisine puis en pass, où la pass le dit 86.
function envoyerEnPass(rail: Rail, ticket: number) {
  assert.equal(rail.prendre("box/claude")?.ticket, ticket);
  rail.envoyerEnPass(ticket, "box/claude");
}

const geler = (rail: Rail, ticket: number) => {
  envoyerEnPass(rail, ticket);
  rail.quatreVingtSix(ticket, { motif: "pass:unjudged" });
};

const lu = (log: Log, ticket: number) => etatLu(ticketDuRail(log.base, ticket)!);
const ligne = (log: Log, ticket: number) => decrireEtat(lireEtat(log, new Date(MAINTENANT)), new Date(MAINTENANT)).find((l) => l.startsWith(`  #${ticket}  `)) ?? "";

test("un ticket qui attend un ticket gelé se lit bloqué par lui, dans l'état", (t) => {
  const { journal: log, rail } = kitchen(t);
  poser(log, 10, [], ["runtime/src/a.ts"]);
  poser(log, 11, [10], ["docs"]);
  geler(rail, 10);

  assert.equal(lu(log, 11), "BLOQUÉ");
  assert.match(ligne(log, 11), /BLOCKED.*blocked by #10 \(86 with no return time, not judged by the pass\)/);
  assert.doesNotMatch(ligne(log, 11), /awaiting #10/);
  assert.deepEqual(ticketDuRail(log.base, 11)?.frozenBy, [10]);
  // La décision d'ordonnancement est la même : il ne part pas.
  assert.equal(rail.prendre("box/claude"), null);
});

test("un ticket qui n'attend que la zone d'un ticket gelé se lit bloqué par lui", (t) => {
  const { journal: log, rail } = kitchen(t);
  poser(log, 10, [], ["runtime/src"]);
  poser(log, 12, [], ["runtime/src/rail.ts"]);
  geler(rail, 10);

  assert.equal(lu(log, 12), "BLOQUÉ");
  assert.match(ligne(log, 12), /blocked by #10 \(86 with no return time, not judged by the pass — zone held: runtime\/src/);
  assert.equal(rail.prendre("box/claude"), null);
});

test("un ticket qui attend un ticket en cours, ou gelé avec une heure de retour, garde la lecture « en attente »", (t) => {
  const { journal: log, rail } = kitchen(t);
  poser(log, 10, [], ["a"]);
  poser(log, 11, [10], ["b"]);
  poser(log, 20, [], ["c"]);
  poser(log, 21, [20], ["d"]);
  poser(log, 30, [], ["e"]);
  poser(log, 31, [], ["e/f"]);
  // 10 est pris, 20 est 86 avec une heure de retour, 30 est 86 d'une autre cause sans retour.
  assert.equal(rail.prendre("box/claude")?.ticket, 10);
  assert.equal(rail.prendre("box/claude")?.ticket, 20);
  rail.quatreVingtSix(20, { motif: "pass:unjudged", retour: new Date("2026-10-12T18:00:00.000Z") });

  for (const ticket of [11, 21]) {
    assert.equal(lu(log, ticket), "en attente");
    assert.deepEqual(ticketDuRail(log.base, ticket)?.frozenBy, []);
  }
  assert.match(ligne(log, 11), /awaiting #10/);
  assert.match(ligne(log, 21), /awaiting #20/);
  assert.doesNotMatch(ligne(log, 11) + ligne(log, 21), /blocked by/);

  assert.equal(rail.prendre("box/claude")?.ticket, 30);
  rail.quatreVingtSix(30, { motif: "pass:encore-rouge", station: "box/claude" });
  assert.equal(lu(log, 31), "en attente");
  assert.match(ligne(log, 31), /zone held by #30/);
});

test("le ticket gelé tranché, ceux qui l'attendaient reviennent à la lecture normale", (t) => {
  for (const sort of ["rendu", "retire", "merge"] as const) {
    const { journal: log, rail } = kitchen(t);
    poser(log, 10, [], ["runtime/src"]);
    poser(log, 11, [10], ["docs"]);
    poser(log, 12, [], ["runtime/src/rail.ts"]);
    geler(rail, 10);
    assert.deepEqual([lu(log, 11), lu(log, 12)], ["BLOQUÉ", "BLOQUÉ"]);

    if (sort === "rendu") rail.rendre(10, "chef-a-tranche");
    if (sort === "retire") log.ajouter({ project: "brigade", ticket: 10, author: "github", type: "ticket.left", payload: { reason: "unfired" } });
    if (sort === "merge") log.ajouter({ project: "brigade", ticket: 10, author: "runtime", type: "merge.done", payload: { pr: "https://exemple.test/pr/1", sha: null, by: "outside", reconciled: false } });

    for (const ticket of [11, 12]) assert.deepEqual(ticketDuRail(log.base, ticket)?.frozenBy, [], `${sort} : #${ticket}`);
    assert.doesNotMatch(ligne(log, 11) + ligne(log, 12), /blocked by/, sort);
    // Rendu, 10 est de nouveau à prendre : ceux qui l'attendent attendent un ticket ordinaire.
    if (sort === "rendu") assert.equal(lu(log, 11), "en attente");
  }
});

test("le cas de l'épique : un ticket gelé, quatre tickets qui l'attendent, un par zone — les cinq se lisent bloqués par lui", (t) => {
  const { journal: log, rail } = kitchen(t);
  poser(log, 405, [], ["runtime/src", "runtime/test"]);
  poser(log, 406, [405], ["docs"]);
  poser(log, 407, [405], ["app/src"]);
  poser(log, 408, [405], ["scripts"]);
  poser(log, 400, [], ["runtime/src/etat.ts"]);
  geler(rail, 405);

  const lignes = [406, 407, 408, 400].map((ticket) => ligne(log, ticket));
  for (const texte of lignes) assert.match(texte, /BLOCKED.*blocked by #405 /);
  assert.deepEqual(
    [406, 407, 408, 400].map((ticket) => ticketDuRail(log.base, ticket)?.frozenBy),
    [[405], [405], [405], [405]],
  );
  // Le ticket gelé lui-même est 86, sans heure de retour, dans l'état.
  assert.match(ligne(log, 405), /86/);
});

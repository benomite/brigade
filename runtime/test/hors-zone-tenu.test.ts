// Un ticket dont la livraison écrit hors de sa zone peut heurter, sans bruit,
// un ticket qui possède ce qu'il a écrit (#1367). La file le montre, chemins
// en cause, et ce qu'il a écrit dehors, il le tient comme sa zone : le ticket
// qui attend dessus ne part pas avant que l'écart soit réglé — la fiche
// élargie, une livraison qui ne l'écrit plus, ou la livraison sur la base.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { lireRail, ticketDuRail } from "../src/projections/rail.ts";
import { direRetenueEn, ouvrirRail, type Rail } from "../src/rail.ts";
import { principal as lancerRail } from "../src/montrer-rail.ts";
import { BAIL_MS } from "./aides/cuisine.ts";
import { aArreter, repertoireTemporaire } from "./outils.ts";

const MAINTENANT = "2026-10-23T10:00:00.000Z";
const STATION = "box/claude";

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  // Fermé avant que son répertoire ne soit retiré : Windows refuse sinon de le supprimer.
  aArreter(t, () => journal.fermer());
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: BAIL_MS, maintenant: () => new Date(MAINTENANT) });
  return { repertoire, journal, rail };
}

// Dans l'ordre où le test les pose : c'est l'ordre de service.
function poser(journal: Journal, ticket: number, zone: string[], type: "ticket.arrived" | "ticket.changed" = "ticket.arrived") {
  const card = { waitsFor: [], zone, problems: [] };
  journal.ajouter({
    project: "brigade",
    ticket,
    author: "github",
    ...(type === "ticket.arrived"
      ? {
          type,
          payload: {
            title: `Ticket ${ticket}`,
            priority: null,
            createdAt: new Date(Date.parse("2026-10-01T00:00:00.000Z") + ticket * 1000).toISOString(),
            url: `https://github.com/benomite/brigade/issues/${ticket}`,
            card,
          },
        }
      : { type, payload: { title: `Ticket ${ticket}`, priority: null, card } }),
  });
}

// Le ticket cuit et part en pass ; sa station confronte la livraison à sa
// zone et dit, comme elle le fait, ce qu'elle écrit dehors.
function livrer(journal: Journal, rail: Rail, ticket: number, zone: string[], dehors: string[]) {
  if (ticketDuRail(journal.base, ticket)?.state !== "taken") assert.equal(rail.prendre(STATION)?.ticket, ticket);
  rail.envoyerEnPass(ticket, STATION);
  if (dehors.length === 0) return;
  journal.ajouter({
    project: "brigade",
    ticket,
    author: `station:${STATION}`,
    type: "cook.out-of-zone",
    payload: { run: `run-${ticket}-${journal.dernierSeq()}`, zone, files: dehors.map((path) => ({ path, owners: [] })), cardChanged: false },
  });
}

const ticket = (journal: Journal, numero: number) => ticketDuRail(journal.base, numero);
const ligne = (journal: Journal, numero: number) => {
  const maintenant = new Date(MAINTENANT);
  return decrireEtat(lireEtat(journal, maintenant), maintenant).find((l) => l.startsWith(`  #${numero}  `)) ?? "";
};

test("un ticket de zone runtime/src/rail/ qui change runtime/src/gates/x.ts est marqué hors zone, le chemin dit", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1401, ["runtime/src/rail/"]);
  livrer(journal, rail, 1401, ["runtime/src/rail/"], ["runtime/src/gates/x.ts"]);

  assert.deepEqual(ticket(journal, 1401)?.outOfZone, ["runtime/src/gates/x.ts"]);
  assert.match(ligne(journal, 1401), /^ {2}#1401 {2}in pass .* — OUT OF ZONE: wrote runtime\/src\/gates\/x\.ts {2}Ticket 1401$/);
});

test("la commande rail montre aussi l'écart et ses chemins", async (t) => {
  const { repertoire, journal, rail } = cuisine(t);
  poser(journal, 1401, ["runtime/src/rail/"]);
  livrer(journal, rail, 1401, ["runtime/src/rail/"], ["runtime/src/gates/x.ts", "runtime/src/gates/y.ts"]);
  poser(journal, 1402, ["runtime/src/gates/"]);

  const dit: string[] = [];
  await lancerRail({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: (texte: string) => void dit.push(texte), redire: (texte: string) => void dit.push(texte) });
  assert.match(dit.join("\n"), /#1401 {2}in pass .* — OUT OF ZONE: wrote runtime\/src\/gates\/x\.ts, runtime\/src\/gates\/y\.ts {2}Ticket 1401/);
  assert.match(dit.join("\n"), /#1402 {2}queued {2}- {2}waits on #1401 \(written outside its zone\) — since /);
});

test("au-delà de cinq chemins, la file dit combien il en reste", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1401, ["runtime/src/rail/"]);
  livrer(journal, rail, 1401, ["runtime/src/rail/"], ["a", "b", "c", "d", "e", "f", "g"].map((nom) => `docs/${nom}.md`));

  assert.match(ligne(journal, 1401), /OUT OF ZONE: wrote docs\/a\.md, docs\/b\.md, docs\/c\.md, docs\/d\.md, docs\/e\.md and 2 more {2}Ticket 1401$/);
});

test("le ticket en attente sur ce qu'un autre a écrit hors de sa zone ne part pas ; la fiche élargie, l'écart est réglé et sa zone le retient pour de bon", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1401, ["runtime/src/rail/"]);
  livrer(journal, rail, 1401, ["runtime/src/rail/"], ["runtime/src/gates/x.ts"]);
  poser(journal, 1402, ["runtime/src/gates/"]);

  assert.deepEqual(ticket(journal, 1402)?.held, [{ ticket: 1401, path: "runtime/src/gates/x.ts", outside: true }]);
  assert.equal(direRetenueEn(ticket(journal, 1402)!), "zone held by #1401 (runtime/src/gates/x.ts, written outside its zone)");
  assert.equal(rail.prendre(STATION), null);
  assert.equal(rail.servables(), 0);

  // Le chef règle l'écart : la fiche de #1401 nomme ce qu'il a écrit. Les deux
  // zones se recouvrent alors pour de bon, et #1402 attend désormais sa zone.
  poser(journal, 1401, ["runtime/src/rail/", "runtime/src/gates/x.ts"], "ticket.changed");
  assert.deepEqual(ticket(journal, 1401)?.outOfZone, []);
  assert.deepEqual(ticket(journal, 1402)?.held, [{ ticket: 1401, path: "runtime/src/gates/x.ts" }]);
  assert.doesNotMatch(ligne(journal, 1401), /OUT OF ZONE/);
  assert.equal(rail.prendre(STATION), null);
});

test("une nouvelle livraison qui n'écrit plus hors de la zone règle l'écart : le ticket qui attendait part", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1401, ["runtime/src/rail/"]);
  livrer(journal, rail, 1401, ["runtime/src/rail/"], ["runtime/src/gates/x.ts"]);
  poser(journal, 1402, ["runtime/src/gates/"]);
  assert.equal(rail.prendre(STATION), null);

  // La pass le rend, livraison ouverte ; il est repris et corrigé : il tient encore l'écart.
  rail.rendre(1401, "pass:red");
  assert.equal(rail.prendre(STATION)?.ticket, 1401);
  assert.deepEqual(ticket(journal, 1402)?.held, [{ ticket: 1401, path: "runtime/src/gates/x.ts", outside: true }]);
  livrer(journal, rail, 1401, ["runtime/src/rail/"], []);

  assert.deepEqual(ticket(journal, 1401)?.outOfZone, []);
  assert.doesNotMatch(ligne(journal, 1401), /OUT OF ZONE/);
  assert.equal(rail.prendre(STATION)?.ticket, 1402);
});

test("une livraison mergée règle l'écart : ce qu'elle a écrit est sur la base", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1401, ["runtime/src/rail/"]);
  livrer(journal, rail, 1401, ["runtime/src/rail/"], ["runtime/src/gates/x.ts"]);
  poser(journal, 1402, ["runtime/src/gates/x.ts"]);
  assert.equal(rail.prendre(STATION), null);

  journal.ajouter({ project: "brigade", ticket: 1401, author: "pass", type: "merge.done", payload: { pr: "https://github.com/benomite/brigade/pull/9", sha: "abc", by: "pass", reconciled: false } });

  assert.deepEqual(ticket(journal, 1401)?.outOfZone, []);
  assert.equal(rail.prendre(STATION)?.ticket, 1402);
});

test("un ticket dont la livraison tient dans sa zone n'est jamais marqué, et ne retient que sa zone", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1401, ["runtime/src/rail/"]);
  livrer(journal, rail, 1401, ["runtime/src/rail/"], []);
  poser(journal, 1402, ["runtime/src/gates/"]);

  assert.deepEqual(ticket(journal, 1401)?.outOfZone, []);
  assert.doesNotMatch(ligne(journal, 1401), /OUT OF ZONE/);
  assert.equal(lireRail(journal.base).some((autre) => autre.outOfZone.length > 0), false);
  assert.equal(rail.prendre(STATION)?.ticket, 1402);
});

test("un chemin devenu commun après la livraison n'est plus un écart", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1401, ["runtime/src/rail/"]);
  livrer(journal, rail, 1401, ["runtime/src/rail/"], ["runtime/package.json"]);
  assert.deepEqual(ticket(journal, 1401)?.outOfZone, ["runtime/package.json"]);

  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "rail.commons", payload: { paths: ["runtime/package.json"] } });

  assert.deepEqual(ticket(journal, 1401)?.outOfZone, []);
  assert.doesNotMatch(ligne(journal, 1401), /OUT OF ZONE/);
});

test("rejouer le journal rend le même écart", (t) => {
  const { journal, rail } = cuisine(t);
  poser(journal, 1401, ["runtime/src/rail/"]);
  livrer(journal, rail, 1401, ["runtime/src/rail/"], ["runtime/src/gates/x.ts"]);
  poser(journal, 1402, ["runtime/src/gates/"]);
  const avant = lireRail(journal.base);

  journal.reconstruire();

  assert.deepEqual(lireRail(journal.base), avant);
});

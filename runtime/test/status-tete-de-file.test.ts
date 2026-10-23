// `status` donne la file dans l'ordre où le rail la sert, ordre manuel compris,
// et dit pourquoi le ticket en tête ne part pas : la zone tenue (et par qui) ou
// la machine saturée. Les mêmes mots sont dans les faits que l'app lit.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirRail } from "../src/rail.ts";
import { aArreter, horloge, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const LU_LE = new Date(`${JOUR_HORLOGE}T10:05:00.000Z`);

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  aArreter(t, () => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number, zone: string[] = []) =>
    noter(
      {
        type: "ticket.arrived",
        payload: { title: `Ticket ${ticket}`, priority: 2, createdAt: `2026-10-01T00:00:${String(ticket).padStart(2, "0")}Z`, url: `https://github.com/acme/brigade/issues/${ticket}`, card: { waitsFor: [], zone, problems: [] } },
      },
      ticket,
      "github",
    );
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["code"], maxCooks: 3, cores: 8 } });
  return { journal, noter, arriver };
}

const lire = (journal: ReturnType<typeof ouvrirJournal>) => lireEtat(journal, LU_LE);
const lignesDuRail = (journal: ReturnType<typeof ouvrirJournal>) => decrireEtat(lire(journal), LU_LE).filter((ligne) => /^ {2}#\d+ {2}queued/.test(ligne));

test("après `rail move`, `status` liste la file dans l'ordre où le rail la sert, et les faits de l'app aussi", (t) => {
  const { journal, noter, arriver } = cuisine(t);
  arriver(10);
  arriver(11);
  arriver(12);
  noter({ type: "ticket.moved", payload: { priority: 2, order: [12, 10, 11] } }, 12, "chef");

  const sert = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000 }).tickets().map(({ ticket }) => ticket);
  const etat = lire(journal);

  assert.deepEqual(sert, [12, 10, 11]);
  assert.deepEqual(lignesDuRail(journal).map((ligne) => Number(/#(\d+)/.exec(ligne)?.[1])), sert);
  assert.deepEqual(faits(etat, LU_LE).rail.map(({ ticket }) => ticket), sert);
});

test("le ticket en tête dont la zone est tenue nomme le ticket qui la tient ; les autres n'ont pas de raison", (t) => {
  const { journal, arriver } = cuisine(t);
  arriver(20, ["runtime/src"]);
  arriver(21, ["runtime/src"]);
  arriver(22, ["app"]);
  ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000 }).prendre("box/claude"); // 20 part et tient la zone
  const etat = lire(journal);

  const rail = faits(etat, LU_LE).rail;

  assert.equal(rail.find(({ ticket }) => ticket === 21)?.raison, "zone held by #20 (runtime/src)");
  assert.deepEqual(rail.filter(({ ticket }) => ticket !== 21).map(({ raison }) => raison), [null, null]);
  assert.match(lignesDuRail(journal)[0] ?? "", /zone held by #20 \(runtime\/src\)/);
});

test("le ticket en tête qui attend une machine saturée le dit ; celui qui part n'a pas de raison", (t) => {
  const { journal, noter, arriver } = cuisine(t);
  arriver(30);
  arriver(31);
  assert.deepEqual(faits(lire(journal), LU_LE).rail.map(({ raison }) => raison), [null, null]);

  noter({ type: "station.saturated", payload: { station: "box/claude", resource: "cpu", observed: 16.2, limit: 15 } });

  assert.deepEqual(faits(lire(journal), LU_LE).rail.map(({ raison }) => raison), ["machine saturated", null]);
  assert.match(lignesDuRail(journal)[0] ?? "", /^ {2}#30 {2}queued {2}prio:2 {2}machine saturated — since /);
  assert.doesNotMatch(lignesDuRail(journal)[1] ?? "", /saturated/);
});

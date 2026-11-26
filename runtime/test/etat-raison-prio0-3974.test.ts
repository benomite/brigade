// #3974 : sur une machine saturée, seule la tête de la file le dit ; un autre `prio:0` qui attend ne le dit pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { faits, lireEtat } from "../src/etat.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirRail } from "./aides/rail-du-journal.ts";
import { aArreter, horloge, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const LU_LE = new Date(`${JOUR_HORLOGE}T10:05:00.000Z`);

test("machine saturée : la tête de file le dit, un prio:0 retenu dit derrière quoi, un prio:0 libre derrière la tête ne dit rien", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  aArreter(t, () => journal.fermer());
  const noter = (fait: object, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait } as never);
  const arriver = (ticket: number, zone = `runtime/src/f${ticket}.ts`, priority = 0) =>
    noter(
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority, createdAt: `2026-10-01T00:00:${String(ticket).padStart(2, "0")}Z`, url: `https://github.com/acme/brigade/issues/${ticket}`, card: { waitsFor: [], zone: [zone], problems: [] } } },
      ticket,
      "github",
    );
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["code"], maxCooks: 3, cores: 8 } });
  noter({ type: "station.saturated", payload: { station: "box/claude", resource: "cpu", observed: 16.2, limit: 15 } });
  arriver(39, "runtime/src/f41.ts", 2);
  ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000 }).prendre("box/claude"); // #39 part et tient la zone de #41
  arriver(40);
  arriver(41);
  arriver(42);

  const rail = faits(lireEtat(journal, LU_LE), LU_LE).rail;

  assert.equal(rail.find(({ ticket }) => ticket === 40)?.raison, null, "a saturated machine is no reason: nothing is held for it");
  assert.match(rail.find(({ ticket }) => ticket === 41)?.raison ?? "", /#39/, "held non-head prio:0 names its holder");
  assert.equal(rail.find(({ ticket }) => ticket === 42)?.raison, null, "a free non-head prio:0 is not said saturated");
});

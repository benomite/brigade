// #3974, critère 3 : la file dit, pour chaque ticket `prio:0` qui attend, derrière quoi il attend.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decrireEtat, faits, lireEtat } from "../../src/etat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirRail } from "../aides/rail-du-journal.ts";
import { aArreter, horloge, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const LU_LE = new Date(`${JOUR_HORLOGE}T10:05:00.000Z`);

test("each waiting prio:0 ticket names what it waits behind, not only the head of the queue", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  aArreter(t, () => journal.fermer());
  const noter = (fait: Parameters<typeof journal.ajouter>[0] extends infer P ? Omit<Extract<P, object>, "project" | "ticket" | "author"> : never, ticket: number | null = null, author = "runtime") =>
    journal.ajouter({ project: "brigade", ticket, author, ...fait } as never);
  const arriver = (ticket: number, zone: string[], priority: number) =>
    noter(
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority, createdAt: `2026-10-01T00:00:${String(ticket).padStart(2, "0")}Z`, url: `https://github.com/acme/brigade/issues/${ticket}`, card: { waitsFor: [], zone, problems: [] } } } as never,
      ticket,
      "github",
    );
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } } as never);
  noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["code"], maxCooks: 3, cores: 8 } } as never);
  arriver(20, ["runtime/src"], 2);
  ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000 }).prendre("box/claude"); // #20 part et tient la zone
  arriver(21, ["runtime/src"], 0);
  arriver(22, ["runtime/src/a.ts"], 0);

  const etat = lireEtat(journal, LU_LE);
  const rail = faits(etat, LU_LE).rail;

  assert.match(rail.find(({ ticket }) => ticket === 21)?.raison ?? "", /#20/);
  assert.match(rail.find(({ ticket }) => ticket === 22)?.raison ?? "", /#20/, "the second prio:0 ticket says it too");
  const ligne = decrireEtat(etat, LU_LE).find((l) => /^ {2}#22 {2}queued/.test(l)) ?? "";
  assert.match(ligne, /zone held by #20/);
});

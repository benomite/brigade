// Un ticket servi se dessine autrement qu'un ticket ouvert.
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagrammeDEpique, type TicketDiagramme } from "../../src/diagramme-epique.ts";

const ticket = (numero: number, state: string): TicketDiagramme => ({ ticket: numero, title: `Ticket ${numero}`, state, zone: ["runtime/src/x.ts"], changes: "x calls y" });

test("un ticket servi est stylé autrement qu'un ticket ouvert", () => {
  const relations = [{ from: 1, to: 2, label: "calls" }];
  const servi = diagrammeDEpique([ticket(1, "served"), ticket(2, "TODO")], relations);
  const tousOuverts = diagrammeDEpique([ticket(1, "TODO"), ticket(2, "TODO")], relations);
  assert.notEqual(servi, tousOuverts);
  // Marquer un ticket servi ne change rien à l'autre : seul son style bouge.
  const lignesStyle = (texte: string) => texte.split("\n").filter((ligne) => /style|class/.test(ligne));
  assert.notDeepEqual(lignesStyle(servi), lignesStyle(tousOuverts));
  // Un ticket en cuisson n'est pas servi non plus.
  const encuisson = diagrammeDEpique([ticket(1, "cooking"), ticket(2, "TODO")], relations);
  assert.notEqual(encuisson, servi);
});

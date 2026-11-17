// Le diagramme d'une épique : ses tickets et ce que chacun change, en flowchart Mermaid.
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagrammeDEpique, type TicketDiagramme } from "../../src/diagramme-epique.ts";

const tickets: TicketDiagramme[] = [
  { ticket: 11, title: "Le rail compte", state: "served", zone: ["runtime/src/rail.ts"], changes: "rail calls pass" },
  { ticket: 12, title: "La pass lit le compte", state: "cooking", zone: ["runtime/src/pass.ts"], changes: "pass reads count" },
  { ticket: 13, title: "La doc dit le compte", state: "TODO", zone: ["docs/runtime.md"], changes: "doc follows pass" },
];
const relations = [
  { from: 11, to: 12, label: "calls" },
  { from: 12, to: 13, label: "leads to" },
];

test("un épique de 3 tickets : un bloc ```mermaid, un nœud par ticket, une arête par relation", () => {
  const sortie = diagrammeDEpique(tickets, relations);
  assert.ok(sortie.startsWith("```mermaid"));
  assert.ok(sortie.trimEnd().endsWith("```"));
  for (const { ticket } of tickets) assert.match(sortie, new RegExp(`#${ticket}`));
  assert.match(sortie, /flowchart/);
  assert.equal(sortie.split("\n").filter((ligne) => /-->|-\.->|==>/.test(ligne)).length, relations.length);
  const noeuds = sortie.split("\n").filter((ligne) => /^\s*\w+[\[\(\{>]/.test(ligne) && !/-->|-\.->|==>/.test(ligne));
  assert.equal(noeuds.length, tickets.length);
});

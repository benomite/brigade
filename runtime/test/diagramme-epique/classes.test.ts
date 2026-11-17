// Chaque état a sa classe dans le diagramme, et une relation dont un bout
// n'est pas un ticket du diagramme ne fait pas d'arête.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avecDiagramme, diagrammeDEpique, DEBUT_DIAGRAMME, FIN_DIAGRAMME, type TicketDiagramme } from "../../src/diagramme-epique.ts";

const ticket = (numero: number, state: string): TicketDiagramme => ({ ticket: numero, title: `Ticket ${numero}`, state, zone: [], changes: "" });
const classes = (sortie: string) => sortie.split("\n").filter((ligne) => /^\s*class /.test(ligne)).map((ligne) => ligne.trim()).sort();

test("chaque ticket porte la classe de son état", () => {
  const sortie = diagrammeDEpique([ticket(1, "served"), ticket(2, "cooking"), ticket(3, "dropped"), ticket(4, "TODO"), ticket(5, "open"), ticket(6, " Served ")], []);
  assert.deepEqual(classes(sortie), ["class t1,t6 served", "class t2 cooking", "class t3 dropped", "class t4,t5 open"]);
  for (const c of ["served", "cooking", "dropped", "open"]) assert.equal(sortie.split("\n").filter((ligne) => ligne.trim().startsWith(`classDef ${c} `)).length, 1);
});

test("une relation vers ou depuis un ticket absent ne fait pas d'arête", () => {
  const sortie = diagrammeDEpique([ticket(1, "open"), ticket(2, "open")], [
    { from: 1, to: 2, label: "then" },
    { from: 1, to: 7, label: "then" },
    { from: 7, to: 2, label: "then" },
  ]);
  assert.deepEqual(sortie.split("\n").filter((ligne) => ligne.includes("-->")).map((ligne) => ligne.trim()), ['t1 -->|"then"| t2']);
});

test("un marqueur de début sans fin est remplacé par le bloc entier, une seule fois", () => {
  const corps = `Le texte du chef.\n\n${DEBUT_DIAGRAMME}\n\nLa suite du chef.`;
  const pose = avecDiagramme(corps, "```mermaid\nflowchart TD\n```");
  assert.equal(pose, `Le texte du chef.\n\n${DEBUT_DIAGRAMME}\n\`\`\`mermaid\nflowchart TD\n\`\`\`\n${FIN_DIAGRAMME}\n\nLa suite du chef.`);
  const rafraichi = avecDiagramme(pose, "```mermaid\nflowchart LR\n```");
  assert.equal(rafraichi.split(DEBUT_DIAGRAMME).length, 2);
  assert.equal(rafraichi, pose.replace("flowchart TD", "flowchart LR"));
});

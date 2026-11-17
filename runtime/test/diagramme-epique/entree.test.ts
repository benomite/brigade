// Ce que le diagramme d'une épique lit de son découpage : chaque ticket de la
// liste, la zone et la première phrase du contexte de son rang, et une arête
// de chaque ticket attendu vers celui qui l'attend.
import assert from "node:assert/strict";
import { test } from "node:test";
import { entreeDuDiagramme } from "../../src/diagramme-epique.ts";
import type { TicketPrevu } from "../../src/events/manager.ts";

const prevu = (title: string, context: string, zone: string[], waitsFor: number[] = []): TicketPrevu => ({ title, context, criteria: [], waitsFor, zone });
const ligne = (ticket: number, state = "open") => ({ ticket, title: `Ticket ${ticket}`, state, served: state === "served" });

test("chaque ticket prend la zone et la première phrase du contexte de son rang, et chaque attente fait une arête", () => {
  const prevus = [
    prevu("Le rail", "Le rail compte. Puis il trie.", ["runtime/src/rail.ts"]),
    prevu("La pass", "La pass lit le compte !  Elle le montre.", ["runtime/src/pass.ts"], [1]),
    prevu("La doc", "La doc suit", ["docs/runtime.md"], [1, 2]),
  ];
  // Les rangs naissent dans le désordre ; #9 a été ajouté par le chef, sans rang.
  const nes = [{ ticket: 9, index: null }, { ticket: 503, index: 3 }, { ticket: 501, index: 1 }, { ticket: 502, index: 2 }];
  const { tickets, relations } = entreeDuDiagramme([ligne(501, "served"), ligne(502), ligne(503), ligne(9)], prevus, nes);
  assert.deepEqual(tickets, [
    { ticket: 501, title: "Ticket 501", state: "served", zone: ["runtime/src/rail.ts"], changes: "Le rail compte." },
    { ticket: 502, title: "Ticket 502", state: "open", zone: ["runtime/src/pass.ts"], changes: "La pass lit le compte !" },
    { ticket: 503, title: "Ticket 503", state: "open", zone: ["docs/runtime.md"], changes: "La doc suit" },
    { ticket: 9, title: "Ticket 9", state: "open", zone: [], changes: "" },
  ]);
  assert.deepEqual(relations, [
    { from: 501, to: 502, label: "then" },
    { from: 501, to: 503, label: "then" },
    { from: 502, to: 503, label: "then" },
  ]);
});

test("un rang qui n'a pas fait naître de ticket n'a ni nœud enrichi ni arête", () => {
  const prevus = [prevu("Le rail", "Le rail compte.", ["a.ts"]), prevu("La pass", "La pass lit.", ["b.ts"], [1]), prevu("La doc", "La doc suit.", ["c.ts"], [2])];
  // Le rang 2 n'est pas né.
  const { tickets, relations } = entreeDuDiagramme([ligne(501), ligne(503)], prevus, [{ ticket: 501, index: 1 }, { ticket: 503, index: 3 }]);
  assert.deepEqual(tickets.map((t) => [t.ticket, t.zone, t.changes]), [[501, ["a.ts"], "Le rail compte."], [503, ["c.ts"], "La doc suit."]]);
  assert.deepEqual(relations, []);
});

test("un contexte long est coupé à 120 caractères, un contexte de 120 reste entier", () => {
  const long = "a".repeat(200);
  const juste = "b".repeat(120);
  const nes = [{ ticket: 1, index: 1 }, { ticket: 2, index: 2 }];
  const { tickets } = entreeDuDiagramme([ligne(1), ligne(2)], [prevu("x", long, []), prevu("y", juste, [])], nes);
  assert.equal(tickets[0]?.changes, `${"a".repeat(119)}…`);
  assert.equal(tickets[1]?.changes, juste);
});

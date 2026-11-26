// Test d'acceptation gelé (#4276), critère 4. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/cook-humain/liste.ts` exporte `listeDesCooksHumains(tickets)` -> `Array<{ ticket: number; assignee: string }>`,
// d'après des tickets `{ number, state: "open" | "closed", labels: string[], assignees: string[] }`, dans l'ordre des numéros.
import assert from "node:assert/strict";
import { test } from "node:test";
import { listeDesCooksHumains } from "../../src/cook-humain/liste.ts";

test("the list shows every open ticket marked for a human with its assignee, and a ticket leaves it when it closes or loses the mark", () => {
  const tickets = [
    { number: 12, state: "open" as const, labels: ["human-cook"], assignees: ["bob"] },
    { number: 10, state: "open" as const, labels: ["fire", "human-cook"], assignees: ["alice"] },
    { number: 11, state: "closed" as const, labels: ["human-cook"], assignees: ["alice"] },
    { number: 13, state: "open" as const, labels: ["fire"], assignees: ["alice"] },
  ];
  assert.deepEqual(listeDesCooksHumains(tickets), [
    { ticket: 10, assignee: "alice" },
    { ticket: 12, assignee: "bob" },
  ]);
});

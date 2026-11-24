// Test d'acceptation gelé (#4138), critère 4. Contrat : voir 1-rejected-entries.test.ts
// (`ouvrirRecurrences({ entrees, maintenant, github })` de `runtime/src/recurrences/recurrences.ts`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirRecurrences } from "../../src/recurrences/recurrences.ts";

type Ticket = { numero: number; etat: "open" | "closed"; titre: string; corps: string; etiquettes: string[] };
function faux() {
  const tickets: Ticket[] = [];
  const github = {
    async listerTickets() { return tickets.map((t) => ({ ...t })); },
    async ouvrirTicket(t: { titre: string; corps: string; etiquettes: string[] }) {
      const numero = tickets.length + 1;
      tickets.push({ numero, etat: "open", titre: t.titre, corps: t.corps, etiquettes: t.etiquettes });
      return numero;
    },
  };
  return { tickets, github };
}

test("a new period opens a new issue even if the previous occurrence is still open or closed", async () => {
  const { tickets, github } = faux();
  const entrees = [{ name: "Closer", frequency: "daily", priority: "prio:3" }];
  await ouvrirRecurrences({ entrees, maintenant: new Date("2026-11-24T08:00:00Z"), github });
  await ouvrirRecurrences({ entrees, maintenant: new Date("2026-11-25T08:00:00Z"), github });
  assert.equal(tickets.length, 2, "la veille est encore ouverte");
  tickets[0].etat = "closed";
  await ouvrirRecurrences({ entrees, maintenant: new Date("2026-11-26T08:00:00Z"), github });
  assert.equal(tickets.length, 3, "l'avant-veille est fermée");
  assert.notEqual(tickets[0].corps, tickets[1].corps);
});

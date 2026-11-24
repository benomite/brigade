// Test d'acceptation gelé (#4138), critère 5. Contrat : voir 1-rejected-entries.test.ts
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

test("removing an entry means no new issue on the next run, and the issues already opened are left untouched", async () => {
  const { tickets, github } = faux();
  const a = { name: "Closer", frequency: "daily", priority: "prio:3" };
  const b = { name: "Clôture", frequency: "monthly", priority: "prio:1" };
  await ouvrirRecurrences({ entrees: [a, b], maintenant: new Date("2026-11-24T08:00:00Z"), github });
  assert.equal(tickets.length, 2);
  const avant = JSON.stringify(tickets);
  await ouvrirRecurrences({ entrees: [b], maintenant: new Date("2026-11-25T08:00:00Z"), github });
  assert.equal(tickets.length, 2, "rien pour l'entrée retirée");
  assert.equal(JSON.stringify(tickets), avant, "les tickets déjà ouverts sont intacts");
});

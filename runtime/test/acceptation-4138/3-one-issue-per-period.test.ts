// Test d'acceptation gelé (#4138), critère 3. Contrat : voir 1-rejected-entries.test.ts
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

test("each issue carries a hidden marker, and running the loop twice or more in the same period opens exactly one issue, even if it was closed", async () => {
  const { tickets, github } = faux();
  const entrees = [{ name: "Épisode", frequency: "weekly", priority: "prio:2" }];
  await ouvrirRecurrences({ entrees, maintenant: new Date("2026-11-24T08:00:00Z"), github });
  assert.equal(tickets.length, 1);
  assert.match(tickets[0].corps, /<!--[^]*?Épisode[^]*?-->/, "un marqueur caché nomme la récurrence");
  assert.match(tickets[0].corps, /<!--[^]*?2026[^]*?-->/, "le marqueur porte la période");
  await ouvrirRecurrences({ entrees, maintenant: new Date("2026-11-24T18:00:00Z"), github });
  assert.equal(tickets.length, 1);
  tickets[0].etat = "closed";
  await ouvrirRecurrences({ entrees, maintenant: new Date("2026-11-26T09:00:00Z"), github });
  assert.equal(tickets.length, 1, "un ticket fermé compte aussi");
});

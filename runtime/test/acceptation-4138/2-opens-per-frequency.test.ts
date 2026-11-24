// Test d'acceptation gelé (#4138), critère 2. Contrat : voir 1-rejected-entries.test.ts
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

test("with a fixed clock, a daily, a weekly and a monthly entry each open one issue titled with the name and carrying the priority label", async () => {
  const { tickets, github } = faux();
  const entrees = [
    { name: "Closer", frequency: "daily", priority: "prio:3" },
    { name: "Episode", frequency: "weekly", priority: "prio:2" },
    { name: "Clôture", frequency: "monthly", priority: "prio:1" },
  ];
  await ouvrirRecurrences({ entrees, maintenant: new Date("2026-11-24T08:00:00Z"), github });
  assert.equal(tickets.length, 3);
  for (const e of entrees) {
    const t = tickets.filter((x) => x.titre === e.name);
    assert.equal(t.length, 1, e.name);
    assert.ok(t[0].etiquettes.includes(e.priority), e.name);
  }
});

// Test d'acceptation gelé (#4138), critère 1. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/recurrences/recurrences.ts` exporte `ouvrirRecurrences({ entrees, maintenant, github })` -> `{ ouverts: number[], erreurs: { entree: string, champ: string, message: string }[] }`.
// `entrees` : `{ name, frequency, priority }[]` (frequency: daily | weekly | monthly ; priority: "prio:N"). `maintenant` : la date de l'horloge fixe.
// `github` : `{ listerTickets(): Promise<{ numero, etat: "open" | "closed", titre, corps, etiquettes }[]>` (tous états),
// `ouvrirTicket({ titre, corps, etiquettes }): Promise<number> }`. Le marqueur caché est un commentaire HTML dans le corps (id de récurrence + période).
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

test("an entry with a missing field or an unknown frequency is rejected naming the entry and the field, and the other entries are still processed", async () => {
  const { tickets, github } = faux();
  const entrees = [
    { name: "Sans fréquence", priority: "prio:2" },
    { name: "Fréquence folle", frequency: "yearly", priority: "prio:2" },
    { name: "Sans priorité", frequency: "daily" },
    { name: "Bonne entrée", frequency: "daily", priority: "prio:1" },
  ] as never;
  const res = await ouvrirRecurrences({ entrees, maintenant: new Date("2026-11-24T08:00:00Z"), github });
  assert.equal(res.erreurs.length, 3);
  const attendu: [string, string][] = [["Sans fréquence", "frequency"], ["Fréquence folle", "frequency"], ["Sans priorité", "priority"]];
  for (const [nom, champ] of attendu) {
    const e = res.erreurs.find((x) => x.entree === nom);
    assert.ok(e, `erreur pour ${nom}`);
    assert.equal(e.champ, champ);
    assert.ok(e.message.includes(nom) && e.message.includes(champ), e.message);
  }
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].titre, "Bonne entrée");
});

// La réparation des limbes (#4215) sur ses doublures : le jugement du manager tel qu'il l'écrit, une réponse du chef,
// un verdict qui remplace le précédent, et ce qui échoue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reparerLesLimbes, type TicketDesLimbes } from "../../src/limbo/reparer.ts";

const M = "<!-- brigade:manager -->";
// Le refus d'une issue de décision, tel que le manager l'écrit (manager.ts, `dire`).
const REFUS_DECISION = [
  M,
  "**Manager — not a workable ticket: a decision issue.** Nothing is set, no cook will start.",
  "",
  "It waits on the client: a Brevo account and the DNS records.",
  "",
  "**Not yours to answer: it waits on the client.** The manager parks this issue for you (`chef-todo`).",
  "",
  "Which mail provider sends the newsletter?",
  "- [wait] Wait for the client",
  "- [resume] Create a Brevo account and send the DNS records",
  "- [resume] Keep the current mail provider",
  "",
  "**Recommended:** Wait for the client — the answer is theirs to give, not yours",
  "",
  "_Judged by the manager._",
].join("\n");
const SUR_LE_RAIL = `${M}\n**Manager — ticket put on the rail.** Set: \`model:opus\`, \`effort:medium\`.`;
const ATTENTE = `${M}\nJudgment: on hold\nReason: waits for the client DNS records\n`;

function faux(tickets: TicketDesLimbes[], casse: { commenter?: boolean } = {}) {
  const cartes: { numero: number; question: string; choix: string[] }[] = [];
  const ecrits: string[] = [];
  const github = {
    async listerTickets() {
      return structuredClone(tickets);
    },
    async ajouterEtiquette(n: number, nom: string) {
      ecrits.push(`+${nom} #${n}`);
      tickets.find((t) => t.numero === n)?.etiquettes.push(nom);
    },
    async retirerEtiquette(n: number, nom: string) {
      ecrits.push(`-${nom} #${n}`);
      const t = tickets.find((x) => x.numero === n);
      if (t) t.etiquettes = t.etiquettes.filter((e) => e !== nom);
    },
    async commenter(n: number, corps: string) {
      if (casse.commenter) throw new Error("GitHub answered 502");
      tickets.find((t) => t.numero === n)?.commentaires.push({ corps });
    },
  };
  const cartesApi = { lister: async () => cartes.map((c) => ({ ...c })), poser: async (c: (typeof cartes)[number]) => void cartes.push(c) };
  return { tickets, cartes, ecrits, github, cartesApi };
}

test("the #221 case as the manager writes it: its card comes back with its question and answers, and the action is said on the ticket", async () => {
  const f = faux([{ numero: 221, etat: "open", etiquettes: ["fire"], commentaires: [{ corps: REFUS_DECISION }] }]);
  await reparerLesLimbes({ github: f.github, cartes: f.cartesApi });
  assert.deepEqual(f.cartes, [{ numero: 221, question: "Which mail provider sends the newsletter?", choix: ["Wait for the client", "Create a Brevo account and send the DNS records", "Keep the current mail provider"] }]);
  const dit = f.tickets[0]?.commentaires.at(-1)?.corps ?? "";
  assert.match(dit, /^<!-- brigade:limbo -->/);
  assert.match(dit, /Keep the current mail provider/);
});

test("a decision the chef already answered, or a later verdict of the manager, is not put back in TODO", async () => {
  const f = faux([
    { numero: 1, etat: "open", etiquettes: ["fire"], commentaires: [{ corps: REFUS_DECISION }, { corps: "<!-- brigade:reponse gesture=resume -->\nKeep the current mail provider" }] },
    { numero: 2, etat: "open", etiquettes: ["fire"], commentaires: [{ corps: REFUS_DECISION }, { corps: SUR_LE_RAIL }] },
  ]);
  await reparerLesLimbes({ github: f.github, cartes: f.cartesApi });
  assert.deepEqual([f.cartes, f.ecrits, f.tickets.map((t) => t.commentaires.length)], [[], [], [2, 2]]);
});

test("a closed ticket, a parked one, and an on-hold judgment without `fire` are left as they are", async () => {
  const f = faux([
    { numero: 1, etat: "closed", etiquettes: ["fire"], commentaires: [{ corps: ATTENTE }] },
    { numero: 2, etat: "open", etiquettes: ["fire", "parked"], commentaires: [{ corps: REFUS_DECISION }] },
    { numero: 3, etat: "open", etiquettes: [], commentaires: [{ corps: ATTENTE }] },
  ]);
  await reparerLesLimbes({ github: f.github, cartes: f.cartesApi });
  assert.deepEqual([f.cartes, f.ecrits], [[], []]);
});

test("a hold whose comment does not post takes its label back off, names the ticket, and does not hold back the others", async () => {
  const f = faux(
    [
      { numero: 1, etat: "open", etiquettes: ["fire"], commentaires: [{ corps: ATTENTE }] },
      { numero: 2, etat: "open", etiquettes: ["fire"], commentaires: [{ corps: REFUS_DECISION }] },
    ],
    { commenter: true },
  );
  await assert.rejects(reparerLesLimbes({ github: f.github, cartes: f.cartesApi }), /#1: GitHub answered 502/);
  assert.deepEqual(f.tickets[0]?.etiquettes, ["fire"]);
  assert.deepEqual(f.ecrits, ["+waiting #1", "-waiting #1"]);
  assert.deepEqual(f.cartes.map((c) => c.numero), [2]);
});

test("an unreadable list of tickets or of cards repairs nothing and says so", async () => {
  const f = faux([{ numero: 1, etat: "open", etiquettes: ["fire"], commentaires: [{ corps: ATTENTE }] }]);
  await assert.rejects(reparerLesLimbes({ github: { ...f.github, listerTickets: async () => Promise.reject(new Error("rate limited")) }, cartes: f.cartesApi }), /rate limited/);
  await assert.rejects(reparerLesLimbes({ github: f.github, cartes: { ...f.cartesApi, lister: async () => Promise.reject(new Error("cards unreadable")) } }), /cards unreadable/);
  assert.deepEqual(f.ecrits, []);
});

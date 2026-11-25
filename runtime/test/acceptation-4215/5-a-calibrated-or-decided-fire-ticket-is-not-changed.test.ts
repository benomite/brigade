// Test d'acceptation gelé (#4215), critère 5 : un `fire` calibré, ou avec une décision ouverte, n'est pas touché.
// Contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/limbo/reparer.ts` exporte `reparerLesLimbes({ github, cartes })` -> `Promise<void>`.
// `github` : `{ listerTickets(): Promise<{ numero, etat: "open" | "closed", etiquettes: string[], commentaires: { corps: string }[] }[]>,
//   ajouterEtiquette(numero, nom), retirerEtiquette(numero, nom), commenter(numero, corps) }`.
// `cartes` : `{ lister(): Promise<{ numero: number, question: string, choix: string[] }[]>, poser({ numero, question, choix }): Promise<void> }` (les cartes TODO ouvertes).
// Un jugement du manager est un commentaire qui commence par `<!-- brigade:manager -->`, puis `Judgment: decision` et des lignes `- <réponse>` sous `Answers:`,
// ou `Judgment: on hold` et `Reason: <texte>`. Une décision ouverte = label `decision` ou carte TODO ; une mise en attente = label `waiting`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reparerLesLimbes } from "../../src/limbo/reparer.ts";

type Ticket = { numero: number; etat: "open" | "closed"; etiquettes: string[]; commentaires: { corps: string }[] };
const M = "<!-- brigade:manager -->";
const JUGE_DECISION = `${M}\nJudgment: decision\nAnswers:\n- Create a Brevo account and send the DNS records\n- Keep the current mail provider\n`;
const JUGE_ATTENTE = `${M}\nJudgment: on hold\nReason: waits for the client DNS records\n`;
function faux(tickets: Ticket[]) {
  const cartes: { numero: number; question: string; choix: string[] }[] = [];
  const github = {
    async listerTickets() { return tickets.map((t) => ({ ...t, etiquettes: [...t.etiquettes], commentaires: [...t.commentaires] })); },
    async ajouterEtiquette(n: number, nom: string) { const t = tickets.find((x) => x.numero === n)!; if (!t.etiquettes.includes(nom)) t.etiquettes.push(nom); },
    async retirerEtiquette(n: number, nom: string) { const t = tickets.find((x) => x.numero === n)!; t.etiquettes = t.etiquettes.filter((e) => e !== nom); },
    async commenter(n: number, corps: string) { tickets.find((x) => x.numero === n)!.commentaires.push({ corps }); },
  };
  const cartesApi = {
    async lister() { return cartes.map((c) => ({ ...c })); },
    async poser(c: { numero: number; question: string; choix: string[] }) { cartes.push(c); },
  };
  return { tickets, cartes, github, cartesApi };
}
const CALIBRAGE = ["model:opus", "effort:medium"];
const sansCalibrage = (t: Ticket) => !t.etiquettes.some((e) => e.startsWith("model:")) || !t.etiquettes.some((e) => e.startsWith("effort:"));


test("a `fire` ticket with a calibration, or with an open decision, keeps its labels and comments, and gets no card", async () => {
  const f = faux([
    { numero: 10, etat: "open", etiquettes: ["fire", ...CALIBRAGE], commentaires: [{ corps: JUGE_ATTENTE }] },
    { numero: 11, etat: "open", etiquettes: ["fire", "decision"], commentaires: [{ corps: JUGE_ATTENTE }] },
  ]);
  const avant = JSON.stringify(f.tickets);
  await reparerLesLimbes({ github: f.github, cartes: f.cartesApi });
  assert.equal(JSON.stringify(f.tickets), avant);
  assert.equal((await f.cartesApi.lister()).filter((c) => c.numero === 10).length, 0);
});

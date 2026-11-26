// Test d'acceptation gelé (#4215), critère 3 : après la réparation, aucun `fire` n'a ni calibrage, ni décision ouverte, ni attente.
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


test("after the repair step, every `fire` ticket has a calibration, an open decision or a hold", async () => {
  const f = faux([
    { numero: 1, etat: "open", etiquettes: ["fire"], commentaires: [{ corps: JUGE_DECISION }] },
    { numero: 2, etat: "open", etiquettes: ["fire"], commentaires: [{ corps: JUGE_ATTENTE }] },
    { numero: 3, etat: "open", etiquettes: ["fire", ...CALIBRAGE], commentaires: [] },
    { numero: 4, etat: "open", etiquettes: ["fire", "decision"], commentaires: [{ corps: JUGE_DECISION }] },
  ]);
  await reparerLesLimbes({ github: f.github, cartes: f.cartesApi });
  const cartes = await f.cartesApi.lister();
  for (const t of f.tickets.filter((x) => x.etiquettes.includes("fire"))) {
    const ouverte = t.etiquettes.includes("decision") || cartes.some((c) => c.numero === t.numero);
    const attente = t.etiquettes.includes("waiting");
    assert.ok(!sansCalibrage(t) || ouverte || attente, `#${t.numero} is left in limbo`);
  }
});

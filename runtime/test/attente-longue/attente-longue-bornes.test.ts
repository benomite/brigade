// #3764 : les bornes du suivi des attentes longues — l'heure exacte, et une revue déjà dite pour une autre attente.
import assert from "node:assert/strict";
import { test } from "node:test";
import { suiviDesAttentesLongues } from "../../src/attente-longue/attente-longue.ts";
import { CHEF_TODO } from "../../src/github-etat/etats.ts";

const A = 10;
const B = 20;
const C = 30;
const HEURE = 60 * 60_000;

function suivi(commentaires: string[] = []) {
  let maintenant = 0;
  const revues: number[] = [];
  const s = suiviDesAttentesLongues({
    github: { commentaires: async () => commentaires.map((body) => ({ body })), corpsDuTicket: async () => `Depends on #${A}.`, commenter: async (_n, corps) => void commentaires.push(corps), labelliser: async () => {} },
    station: "box",
    label: CHEF_TODO,
    revoir: async (_ticket, { depuisMs }) => (revues.push(depuisMs), { revue: { issue: "garde", commentaire: "Kept." } }),
    maintenant: () => maintenant,
    avertir: () => {},
  });
  const tour = async (ms: number, attendus = [A]) => {
    maintenant = ms;
    s.tour([B]);
    s.tenu({ number: B, title: "B" }, attendus);
    await s.calme();
  };
  return { tour, revues, commentaires };
}

test("a wait held exactly an hour is not reviewed yet; one millisecond more and it is, once", async () => {
  const s = suivi();
  await s.tour(0);
  await s.tour(59 * 60_000);
  await s.tour(HEURE);
  assert.deepEqual(s.revues, []);
  assert.deepEqual(s.commentaires, []);
  await s.tour(HEURE + 1);
  await s.tour(HEURE + 2);
  assert.deepEqual(s.revues, [HEURE + 1]);
  assert.equal(s.commentaires.length, 1);
});

test("the hour is counted from the first turn that saw the ticket held, not from the station's clock origin", async () => {
  const s = suivi();
  await s.tour(10 * HEURE);
  await s.tour(11 * HEURE);
  assert.deepEqual(s.revues, []);
  await s.tour(11 * HEURE + 1);
  assert.deepEqual(s.revues, [HEURE + 1]);
});

test("a review already written for another wait does not count: the manager reviews this one at the hour", async () => {
  const s = suivi([`<!-- brigade:attente-longue garde #${C} -->`]);
  await s.tour(0);
  await s.tour(HEURE + 1);
  assert.deepEqual(s.revues, [HEURE + 1]);
  assert.match(s.commentaires.at(-1) ?? "", /<!-- brigade:attente-longue garde #10 -->$/);
});

test("a review already written for this wait is not done again", async () => {
  const s = suivi([`<!-- brigade:attente-longue garde #${A} -->`]);
  await s.tour(0);
  await s.tour(HEURE + 1);
  assert.deepEqual(s.revues, []);
  assert.equal(s.commentaires.length, 1);
});

test("a ticket no longer held for a turn starts its hour over", async () => {
  const s = suivi();
  await s.tour(0);
  await s.tour(HEURE - 1, []);
  await s.tour(HEURE + 1);
  await s.tour(2 * HEURE);
  assert.deepEqual(s.revues, []);
  await s.tour(2 * HEURE + 2);
  assert.deepEqual(s.revues, [HEURE + 1]);
});

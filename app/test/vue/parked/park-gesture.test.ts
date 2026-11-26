// Le geste de park et d'unpark (ticket 4281) devant un faux pont : park pose l'attente, unpark renvoie en cuisine, pour
// le projet qu'on lui donne ; ce que le pont rend — rien, un refus, un fait, un terminal, une erreur — est dit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parkGesture } from "../../../src/vue/parked/park-gesture.js";

const viaUnPont = (rendu: unknown) => {
  const calls: unknown[][] = [];
  const suites = { lues: 0 };
  const geste = parkGesture(
    async (...a) => {
      calls.push(a);
      if (rendu instanceof Error) throw rendu;
      return rendu;
    },
    { lire: () => void (suites.lues += 1) },
  );
  return { geste, calls, suites };
};
const NO_KITCHEN = "nothing sent: this app does not play the kitchen's gestures for this project";
const UNREAD = "nothing sent: the app did not say what happened";
const cible = (project: string) => ({ project, ticket: 7, step: "Cooks" });

test("park sets the wait from the form, unpark sends the ticket back to the kitchen, for any project", async () => {
  for (const project of ["parade", "atelier"]) {
    const { geste, calls } = viaUnPont({ fait: "done" });
    await geste(cible(project), { action: "park", who: "Camille", what: "the keys", until: "2026-12-01" });
    await geste(cible(project), { action: "unpark" });
    assert.deepEqual(calls, [
      [project, "attente-poser", 7, { quoi: "the keys", qui: "Camille", relance: "2026-12-01" }],
      [project, "attente-arrivee", 7],
    ]);
  }
});

test("what the bridge renders is said: nothing, a refusal, a fact (the kitchen read again), an unread shape, an error", async () => {
  for (const rien of [undefined, null]) assert.deepEqual(await viaUnPont(rien).geste(cible("parade"), { action: "unpark" }), { refus: NO_KITCHEN, detail: "" });
  assert.deepEqual(await viaUnPont({ refus: "no" }).geste(cible("parade"), { action: "unpark" }), { refus: "no", detail: "" });
  assert.deepEqual(await viaUnPont({ refus: "no", detail: "why" }).geste(cible("parade"), { action: "unpark" }), { refus: "no", detail: "why" });
  const fait = viaUnPont({ fait: "posted" });
  assert.deepEqual(await fait.geste(cible("parade"), { action: "unpark" }), { fait: "posted" });
  assert.equal(fait.suites.lues, 1);
  // Ni fait ni refus — une forme que le pont ne rend plus (un terminal du second, avant le ticket 4262) : rien n'est dit parti.
  const autre = viaUnPont({ id: 3, projet: "parade", genre: "second" });
  assert.deepEqual(await autre.geste(cible("parade"), { action: "unpark" }), { refus: UNREAD, detail: "" });
  assert.equal(autre.suites.lues, 0);
  assert.deepEqual(await viaUnPont("odd").geste(cible("parade"), { action: "unpark" }), { refus: UNREAD, detail: "odd" });
  assert.deepEqual(await viaUnPont(new Error("bridge down")).geste(cible("parade"), { action: "unpark" }), { refus: "nothing sent: bridge down", detail: "" });
});

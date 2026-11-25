// Le geste de park et d'unpark (ticket 4281) devant un faux pont : park pose l'attente, unpark renvoie en cuisine, pour
// le projet qu'on lui donne ; ce que le pont rend — rien, un refus, un fait, un terminal, une erreur — est dit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parkGesture } from "../../../src/vue/parked/park-gesture.js";

const viaUnPont = (rendu: unknown) => {
  const calls: unknown[][] = [];
  const suites = { lues: 0, gardes: [] as unknown[][] };
  const geste = parkGesture(
    async (...a) => {
      calls.push(a);
      if (rendu instanceof Error) throw rendu;
      return rendu;
    },
    { lire: () => void (suites.lues += 1), garder: (...a) => void suites.gardes.push(a) },
  );
  return { geste, calls, suites };
};
const NO_KITCHEN = "nothing sent: this app does not play the kitchen's gestures for this project";
const SENT_TO_SECOND = "sent: its command runs in the second";
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

test("what the bridge renders is said: nothing, a refusal, a fact (the kitchen read again), a terminal (kept), an error", async () => {
  for (const rien of [undefined, null]) assert.deepEqual(await viaUnPont(rien).geste(cible("parade"), { action: "unpark" }), { refus: NO_KITCHEN, detail: "" });
  assert.deepEqual(await viaUnPont({ refus: "no" }).geste(cible("parade"), { action: "unpark" }), { refus: "no", detail: "" });
  assert.deepEqual(await viaUnPont({ refus: "no", detail: "why" }).geste(cible("parade"), { action: "unpark" }), { refus: "no", detail: "why" });
  const fait = viaUnPont({ fait: "posted" });
  assert.deepEqual(await fait.geste(cible("parade"), { action: "unpark" }), { fait: "posted" });
  assert.deepEqual([fait.suites.lues, fait.suites.gardes.length], [1, 0]);
  const terminal = { id: 3, projet: "parade", genre: "second" };
  const second = viaUnPont(terminal);
  assert.deepEqual(await second.geste(cible("parade"), { action: "unpark" }), { fait: SENT_TO_SECOND });
  assert.deepEqual([second.suites.lues, second.suites.gardes], [0, [["parade", terminal]]]);
  assert.deepEqual(await viaUnPont(new Error("bridge down")).geste(cible("parade"), { action: "unpark" }), { refus: "nothing sent: bridge down", detail: "" });
});

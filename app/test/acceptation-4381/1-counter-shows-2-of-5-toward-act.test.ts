// Ticket 4381 (épique 4378) : le fil d'un agent montre le compteur vers le prochain geste, sur un faux `facts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdTheTeam } from "../../src/vue/autonomy/team.js";
import { source, type Agent } from "../../src/vue/autonomy/source.js";
import { Fake, repos } from "../helpers/false-vue.ts";
import { TEAM } from "../autonomy/team-fixture.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

// Le fil de l'agent, ouvert d'un clic sur son badge, tel que l'équipe lue le rend.
async function thread(agent: Record<string, unknown>) {
  const readOne = [{ ...structuredClone(TEAM[0]), gestures: [], pending: [], ...agent }] as Agent[];
  Object.assign(source, { lire: async () => readOne });
  const frame = new Fake("section");
  const team = holdTheTeam(doc, frame);
  team.lire("parade");
  team.montrer("parade");
  await repos();
  (frame.dessous("button").find((pose) => pose.dataset.agent === readOne[0]?.agent) ?? assert.fail("pas de badge")).click();
  return (frame.dessous("section")[0] ?? assert.fail("pas de fil")).textContent;
}

test("an agent at propose with progress 2 of 5 toward act: the thread shows `2 of 5 toward act`", async () => {
  const text = await thread({ autonomy: "propose", progress: { toward: "act", done: 2, of: 5 }, pinned: false });
  assert.ok(text.includes("2 of 5 toward act"), text);
});

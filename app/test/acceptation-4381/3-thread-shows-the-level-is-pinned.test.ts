// Ticket 4381 (épique 4378) : le fil d'un agent montre le compteur vers le prochain geste, sur un faux `facts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdLTeam } from "../../src/vue/autonomy/team.js";
import { source, type Agent } from "../../src/vue/autonomy/source.js";
import { Faux, repos } from "../aides/fausse-vue.ts";
import { TEAM } from "../autonomy/team-fixture.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

// Le fil de l'agent, ouvert d'un clic sur son badge, tel que l'équipe lue le rend.
async function fil(agent: Record<string, unknown>) {
  const lu = [{ ...structuredClone(TEAM[0]), gestures: [], pending: [], ...agent }] as Agent[];
  Object.assign(source, { lire: async () => lu });
  const cadre = new Faux("section");
  const team = holdLTeam(doc, cadre);
  team.lire("parade");
  team.montrer("parade");
  await repos();
  (cadre.dessous("button").find((pose) => pose.dataset.agent === lu[0]?.agent) ?? assert.fail("pas de badge")).click();
  return (cadre.dessous("section")[0] ?? assert.fail("pas de fil")).textContent;
}

test("a pinned agent: the thread shows that the level is pinned", async () => {
  const texte = await fil({ autonomy: "propose", progress: { toward: "act", done: 2, of: 5 }, pinned: true });
  assert.match(texte, /pinned/i);
});

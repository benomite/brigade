// Ticket 4381 (épique 4378) : le fil d'un agent montre le compteur vers le prochain geste, sur un faux `facts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { tenirLEquipe } from "../../src/vue/autonomie/equipe.js";
import { source, type Agent } from "../../src/vue/autonomie/source.js";
import { Faux, repos } from "../aides/fausse-vue.ts";
import { EQUIPE } from "../autonomie/equipe-fixture.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

// Le fil de l'agent, ouvert d'un clic sur son badge, tel que l'équipe lue le rend.
async function fil(agent: Record<string, unknown>) {
  const lu = [{ ...structuredClone(EQUIPE[0]), gestures: [], pending: [], ...agent }] as Agent[];
  Object.assign(source, { lire: async () => lu });
  const cadre = new Faux("section");
  const equipe = tenirLEquipe(doc, cadre);
  equipe.lire("parade");
  equipe.montrer("parade");
  await repos();
  (cadre.dessous("button").find((pose) => pose.dataset.agent === lu[0]?.agent) ?? assert.fail("pas de badge")).click();
  return (cadre.dessous("section")[0] ?? assert.fail("pas de fil")).textContent;
}

test("an agent at act with progress null: the thread shows — for the counter", async () => {
  const texte = await fil({ autonomy: "act", progress: null, pinned: false });
  assert.ok(texte.includes("—"), texte);
});

// Test d'acceptation gelé (#4065). Critère 2 : le premier écran, pendant la lecture des stations, dit à quelqu'un qui n'a
// aucune station ce que l'app fait (elle cherche les stations liées à son compte GitHub) et ce qui vient s'il n'y en a pas
// (il peut continuer à l'étape suivante pour choisir ou installer une station).
import assert from "node:assert/strict";
import { test } from "node:test";
import { setFirstLaunch, type ActionsOfFirst } from "../../src/vue/first-launch.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const nothing = () => undefined;
const actions = { ouvrir: nothing, seConnecter: nothing, changerDeCompte: nothing, relireLeCompte: nothing, relire: nothing, ouvrirLaPage: nothing, ajouterUnProjet: nothing } as ActionsOfFirst;

test("the first screen, while it reads, says what it does and what comes next with no station", () => {
  const screen = setFirstLaunch(doc, { poste: "this computer" }, actions) as Fake;
  const head = (screen.dessous("h3")[0] ?? assert.fail("no sentence at the head of the first screen")).textContent;
  assert.ok(!head.includes("you have paired"), `still the old wording: ${head}`);
  assert.match(head, /GitHub/, "says where it looks");
  assert.match(head, /station/i, "says what it looks for");
  assert.match(head, /(no station|none|don't have|do not have|haven't|have not)/i, "says the case of someone with no station");
  assert.match(head, /(next step|next|then|go on|continue)/i, "says what comes next");
  assert.match(head, /(choose|set up|add)/i, "says what they can do then");
});

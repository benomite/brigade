// Test d'acceptation gelé (#4065). Critère 2 : le premier écran, pendant la lecture des stations, dit à quelqu'un qui n'a
// aucune station ce que l'app fait (elle cherche les stations liées à son compte GitHub) et ce qui vient s'il n'y en a pas
// (il peut continuer à l'étape suivante pour choisir ou installer une station).
import assert from "node:assert/strict";
import { test } from "node:test";
import { poserPremierLancement, type GestesDuPremier } from "../../src/vue/premier-lancement.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const rien = () => undefined;
const gestes = { ouvrir: rien, seConnecter: rien, changerDeCompte: rien, relireLeCompte: rien, relire: rien, ouvrirLaPage: rien, ajouterUnProjet: rien } as GestesDuPremier;

test("the first screen, while it reads, says what it does and what comes next with no station", () => {
  const ecran = poserPremierLancement(doc, { poste: "this computer" }, gestes) as Faux;
  const tete = (ecran.dessous("h3")[0] ?? assert.fail("no sentence at the head of the first screen")).textContent;
  assert.ok(!tete.includes("you have paired"), `still the old wording: ${tete}`);
  assert.match(tete, /GitHub/, "says where it looks");
  assert.match(tete, /station/i, "says what it looks for");
  assert.match(tete, /(no station|none|don't have|do not have|haven't|have not)/i, "says the case of someone with no station");
  assert.match(tete, /(next step|next|then|go on|continue)/i, "says what comes next");
  assert.match(tete, /(choose|set up|add)/i, "says what they can do then");
});

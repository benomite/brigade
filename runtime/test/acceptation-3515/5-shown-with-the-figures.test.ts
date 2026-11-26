// #3515, critère 5 : les deux comptes s'affichent au même endroit que les autres chiffres de la cuisine — le bloc des
// chiffres d'autonomie de l'app —, nommés « escaped bugs » et « reverts », avec les tickets et les shas qui les font.
// Test d'acceptation : la vue de l'app devant un faux document, sur le calcul du runtime de l'échantillon commité.
import assert from "node:assert/strict";
import { test } from "node:test";
import { nommerLesProjets } from "../../../app/src/vue/autonomie/autonomie-github.ts";
import { Faux, repos } from "../../../app/test/aides/fausse-vue.ts";
import { chiffresDAutonomie } from "../../src/autonomie/chiffres/chiffres.ts";
import { ECHANTILLON, MAINTENANT } from "./echantillon.ts";

// The view is plain JavaScript with no declaration: its one call is typed here.
type Bloc = { poser: () => unknown };
const VUE = "../../../app/src/vue/autonomie/chiffres.js";
const { tenirLesChiffresDAutonomie } = (await import(VUE)) as { tenirLesChiffresDAutonomie: (doc: unknown, options: { lire: (jours: number) => Promise<unknown>; ouvrir: () => void }) => Bloc };
const doc = { createElement: (balise: string) => new Faux(balise) };

test("the autonomy block shows 'escaped bugs' and 'reverts' next to its figures, each with its tickets and shas", async () => {
  const lire = (jours: number) => Promise.resolve({ jours, chiffres: nommerLesProjets(chiffresDAutonomie([ECHANTILLON], jours, MAINTENANT), () => "parade"), manquants: [], partiels: [] });
  const bloc = tenirLesChiffresDAutonomie(doc, { lire, ouvrir: () => undefined }).poser() as Faux;
  await repos();
  const cadres = bloc.dessous("div").filter(({ className }) => className.split(" ").includes("figure"));
  const textes = (nom: string) => cadres.find(({ textContent }) => textContent.startsWith(nom))?.dessous("p").map(({ textContent }) => textContent);
  assert.ok(textes("lead time"), "the autonomy figures are not in the block");
  assert.deepEqual(textes("escaped bugs"), ["3", "#101 (bug #201) · #102, #103 (bug #203) · #104 (bug #207)"]);
  assert.deepEqual(textes("reverts"), ["2", "aaaaaaa (#101) · eeeeeee (#103)"]);
});

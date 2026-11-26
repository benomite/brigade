// Contrat (#4216) : app/src/vue/bandeau-panne/bandeau-panne.js exporte `monterLeBandeau(doc, hote, reparer)` → { maj(statut) } ;
//   statut = { state: "fault" | "idle"; cause: string; action: { kind: "done"; text } | { kind: "button"; label; id } | null } ;
//   `reparer(id)` est l appel existant au runtime. `maj` pose le bandeau dans `hote`. Le style de panne : classe `panne`
//   ou icone `icone-panne` ; le style neutre n en porte aucun.
import assert from "node:assert/strict";
import { test } from "node:test";
import { monterLeBandeau } from "../../src/vue/bandeau-panne/bandeau-panne.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise), createElementNS: (_e: string, balise: string) => new Faux(balise) };
const monter = (statut: unknown) => {
  const hote = new Faux("div");
  const appels: string[] = [];
  monterLeBandeau(doc, hote, (id: string) => { appels.push(id); }).maj(statut);
  return { hote, appels, tout: [hote, ...hote.descendants()] };
};

test("fault with a button action: the cause sentence, exactly one button, a click repairs with its id", () => {
  const { hote, appels, tout } = monter({ state: "fault", cause: "main is red since 09:15", action: { kind: "button", label: "Fix main", id: "fix-main" } });
  assert.match(hote.textContent, /main is red since 09:15/);
  const boutons = tout.filter(({ balise }) => balise === "button");
  assert.equal(boutons.length, 1);
  assert.match(boutons[0]?.textContent ?? "", /Fix main/);
  boutons[0]?.click();
  assert.deepEqual(appels, ["fix-main"]);
});

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

test("fault with a done action: the cause sentence and what the system did, no button", () => {
  const { hote, tout } = monter({ state: "fault", cause: "main is red since 09:15", action: { kind: "done", text: "The kitchen reverted commit abc123" } });
  assert.match(hote.textContent, /main is red since 09:15/);
  assert.match(hote.textContent, /The kitchen reverted commit abc123/);
  assert.equal(tout.filter(({ balise }) => balise === "button").length, 0);
});

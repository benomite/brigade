// Contrat (#4216) : app/src/vue/banner-outage/banner-outage.js exporte `monterLeBandeau(doc, hote, reparer)` → { maj(statut) } ;
//   statut = { state: "fault" | "idle"; cause: string; action: { kind: "done"; text } | { kind: "button"; label; id } | null } ;
//   `reparer(id)` est l appel existant au runtime. `maj` pose le bandeau dans `hote`. Le style de panne : classe `panne`
//   ou icone `icone-panne` ; le style neutre n en porte aucun.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mountTheBanner } from "../../src/vue/banner-outage/banner-outage.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise), createElementNS: (_e: string, balise: string) => new Fake(balise) };
const mount = (status: unknown) => {
  const host = new Fake("div");
  const calls: string[] = [];
  mountTheBanner(doc, host, (id: string) => { calls.push(id); }).maj(status);
  return { hote: host, appels: calls, tout: [host, ...host.descendants()] };
};

test("fault with a button action: the cause sentence, exactly one button, a click repairs with its id", () => {
  const { hote: host, appels: calls, tout: all } = mount({ state: "fault", cause: "main is red since 09:15", action: { kind: "button", label: "Fix main", id: "fix-main" } });
  assert.match(host.textContent, /main is red since 09:15/);
  const buttons = all.filter(({ balise }) => balise === "button");
  assert.equal(buttons.length, 1);
  assert.match(buttons[0]?.textContent ?? "", /Fix main/);
  buttons[0]?.click();
  assert.deepEqual(calls, ["fix-main"]);
});

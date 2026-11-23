// #4023 : le bloc des post-mortems de la section du projet : le compte, puis chaque post-mortem avec ses cinq champs, le plus
// récent d'abord ; rien lu, ou rien à dire, se dit. Les faits d'une box le portent jusqu'au tableau.
import assert from "node:assert/strict";
import { test } from "node:test";
import { postMortemsLus } from "../../src/faits.ts";
import { vueDesPostMortems } from "../../src/projets/post-mortems.ts";
import { poserBlocPostMortems } from "../../src/vue/projet/bandeau-sante/PostMortems.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const pm = (cause: string, vuEnPremier: string, fin: string, corrige: string | null = "restart", ticket: string | null = "#9") => ({ cause, duree: "45 min", vuEnPremier, corrige, ticket, fin });

test("the block says the count, then each post-mortem with its five fields, newest first; what nothing said reads 'not recorded'", () => {
  const vue = vueDesPostMortems([pm("old", "system", "2026-11-20T10:00:00.000Z"), pm("new", "chef", "2026-11-22T10:00:00.000Z", null, null)], new Date("2026-11-23T12:00:00.000Z"));
  const bloc = poserBlocPostMortems(doc, vue);
  assert.match(bloc.textContent, /Seen first by the chef, last 7 days: 1/);
  const [premiere, seconde] = bloc.dessous("li").map((li: Faux) => li.textContent);
  assert.match(premiere, /Cause: new.*Duration: 45 min.*Seen first by: chef.*Fixed by: not recorded.*Fix ticket: not recorded/);
  assert.match(seconde, /Cause: old.*Seen first by: system.*Fixed by: restart.*Fix ticket: #9/);
});

test("without post-mortems the block says so, and a box that did not give them is not read as zero outages", () => {
  const vide = poserBlocPostMortems(doc, vueDesPostMortems([], new Date()));
  assert.match(vide.textContent, /: 0/);
  assert.match(vide.textContent, /No outage over 30 minutes/);
  const pasLus = poserBlocPostMortems(doc, undefined);
  assert.match(pasLus.textContent, /were not read/);
  assert.doesNotMatch(pasLus.textContent, /last 7 days/);
});

test("the facts read a list of post-mortems, and drop an entry that is not one", () => {
  const bon = pm("c", "chef", "2026-11-22T10:00:00.000Z");
  assert.deepEqual(postMortemsLus([bon, { ...bon, fin: "never" }, { ...bon, cause: "" }, null, 3]), [bon]);
  assert.equal(postMortemsLus("nope"), undefined);
});

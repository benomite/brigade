// #4023 : le bloc des post-mortems de la section du projet : le compte, puis chaque post-mortem avec ses cinq champs, le plus
// récent d'abord ; rien lu, ou rien à dire, se dit. Les faits d'une box le portent jusqu'au tableau.
import assert from "node:assert/strict";
import { test } from "node:test";
import { comprendre, postMortemsLus, tableau, type Facts } from "../../src/facts.ts";
import { vueDesPostMortems } from "../../src/projects/post-mortems.ts";
import { poserBlocPostMortems } from "../../src/vue/project/banner-sante/PostMortems.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const pm = (cause: string, vuEnFirst: string, fin: string, corrige: string | null = "restart", ticket: string | null = "#9") => ({ cause, duree: "45 min", vuEnPremier: vuEnFirst, corrige, ticket, fin });

test("the block says the count, then each post-mortem with its five fields, newest first; what nothing said reads 'not recorded'", () => {
  const vue = vueDesPostMortems([pm("old", "system", "2026-11-20T10:00:00.000Z"), pm("new", "chef", "2026-11-22T10:00:00.000Z", null, null)], new Date("2026-11-23T12:00:00.000Z"));
  const bloc = poserBlocPostMortems(doc, vue);
  assert.match(bloc.textContent, /Seen first by the chef, last 7 days: 1/);
  const [first, seconde] = bloc.dessous("li").map((li: Faux) => li.textContent);
  assert.match(first, /Cause: new.*Duration: 45 min.*Seen first by: chef.*Fixed by: not recorded.*Fix ticket: not recorded/);
  assert.match(seconde, /Cause: old.*Seen first by: system.*Fixed by: restart.*Fix ticket: #9/);
});

test("without post-mortems the block says so, and a box that did not give them is not read as zero outages", () => {
  const empty = poserBlocPostMortems(doc, vueDesPostMortems([], new Date()));
  assert.match(empty.textContent, /: 0/);
  assert.match(empty.textContent, /No outage over 30 minutes/);
  const pasLus = poserBlocPostMortems(doc, undefined);
  assert.match(pasLus.textContent, /were not read/);
  assert.doesNotMatch(pasLus.textContent, /last 7 days/);
});

test("the facts read a list of post-mortems, and drop an entry that is not one", () => {
  const slip = pm("c", "chef", "2026-11-22T10:00:00.000Z");
  assert.deepEqual(postMortemsLus([slip, { ...slip, fin: "never" }, { ...slip, cause: "" }, null, 3]), [slip]);
  assert.equal(postMortemsLus("nope"), undefined);
});

test("a post-mortem whose fix and ticket are null is kept, not dropped", () => {
  const nul = pm("c", "system", "2026-11-22T10:00:00.000Z", null, null);
  assert.deepEqual(postMortemsLus([nul]), [nul]);
});

test("the blocks's rows carry their class names, the title none", () => {
  const bloc = poserBlocPostMortems(doc, vueDesPostMortems([pm("c", "chef", "2026-11-22T10:00:00.000Z")], new Date("2026-11-23T12:00:00.000Z")));
  const [rangee] = bloc.dessous("li");
  assert.equal(rangee.dessous("div").map((d: Faux) => d.className).join(","), "cause,duree,vu-en-premier,corrige,ticket");
  assert.equal(bloc.dessous("h3")[0].className, "");
});

const FACTS_MINIMAUX = { etat: "ouverte", lu: "2026-11-23T12:00:00.000Z", dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], livres: [] };

test("the facts text reaches the board: post-mortems read and counted, and none when the box gives none", () => {
  const slip = pm("c", "chef", "2026-11-22T10:00:00.000Z");
  const lus = comprendre(JSON.stringify({ ...FACTS_MINIMAUX, postMortems: [slip] }));
  assert.ok(!("informe" in lus));
  assert.deepEqual((lus as Facts).postMortems, [slip]);
  assert.equal(tableau(lus as Facts).postMortems?.vusParLeChef, 1);
  const sans = comprendre(JSON.stringify(FACTS_MINIMAUX));
  assert.ok(!("informe" in sans));
  assert.equal("postMortems" in (sans as Facts), false);
  assert.equal("postMortems" in tableau(sans as Facts), false);
});

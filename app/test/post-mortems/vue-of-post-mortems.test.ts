// #4023 : le bloc des post-mortems de la section du projet : le compte, puis chaque post-mortem avec ses cinq champs, le plus
// récent d'abord ; rien lu, ou rien à dire, se dit. Les faits d'une box le portent jusqu'au tableau.
import assert from "node:assert/strict";
import { test } from "node:test";
import { understand, postMortemsRead, board, type Facts } from "../../src/facts.ts";
import { vueOfPostMortems } from "../../src/projects/post-mortems.ts";
import { setBlockPostMortems } from "../../src/vue/project/banner-health/PostMortems.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const pm = (cause: string, seenInFirst: string, end: string, corrige: string | null = "restart", ticket: string | null = "#9") => ({ cause, duree: "45 min", vuEnPremier: seenInFirst, corrige, ticket, fin: end });

test("the block says the count, then each post-mortem with its five fields, newest first; what nothing said reads 'not recorded'", () => {
  const vue = vueOfPostMortems([pm("old", "system", "2026-11-20T10:00:00.000Z"), pm("new", "chef", "2026-11-22T10:00:00.000Z", null, null)], new Date("2026-11-23T12:00:00.000Z"));
  const block = setBlockPostMortems(doc, vue);
  assert.match(block.textContent, /Seen first by the chef, last 7 days: 1/);
  const [first, second] = block.dessous("li").map((li: Fake) => li.textContent);
  assert.match(first, /Cause: new.*Duration: 45 min.*Seen first by: chef.*Fixed by: not recorded.*Fix ticket: not recorded/);
  assert.match(second, /Cause: old.*Seen first by: system.*Fixed by: restart.*Fix ticket: #9/);
});

test("without post-mortems the block says so, and a box that did not give them is not read as zero outages", () => {
  const empty = setBlockPostMortems(doc, vueOfPostMortems([], new Date()));
  assert.match(empty.textContent, /: 0/);
  assert.match(empty.textContent, /No outage over 30 minutes/);
  const notRead = setBlockPostMortems(doc, undefined);
  assert.match(notRead.textContent, /were not read/);
  assert.doesNotMatch(notRead.textContent, /last 7 days/);
});

test("the facts read a list of post-mortems, and drop an entry that is not one", () => {
  const slip = pm("c", "chef", "2026-11-22T10:00:00.000Z");
  assert.deepEqual(postMortemsRead([slip, { ...slip, fin: "never" }, { ...slip, cause: "" }, null, 3]), [slip]);
  assert.equal(postMortemsRead("nope"), undefined);
});

test("a post-mortem whose fix and ticket are null is kept, not dropped", () => {
  const none = pm("c", "system", "2026-11-22T10:00:00.000Z", null, null);
  assert.deepEqual(postMortemsRead([none]), [none]);
});

test("the blocks's rows carry their class names, the title none", () => {
  const block = setBlockPostMortems(doc, vueOfPostMortems([pm("c", "chef", "2026-11-22T10:00:00.000Z")], new Date("2026-11-23T12:00:00.000Z")));
  const [row] = block.dessous("li");
  assert.equal(row.dessous("div").map((d: Fake) => d.className).join(","), "cause,duree,vu-en-premier,corrige,ticket");
  assert.equal(block.dessous("h3")[0].className, "");
});

const FACTS_MINIMAL = { etat: "ouverte", lu: "2026-11-23T12:00:00.000Z", dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], livres: [] };

test("the facts text reaches the board: post-mortems read and counted, and none when the box gives none", () => {
  const slip = pm("c", "chef", "2026-11-22T10:00:00.000Z");
  const readOnes = understand(JSON.stringify({ ...FACTS_MINIMAL, postMortems: [slip] }));
  assert.ok(!("informe" in readOnes));
  assert.deepEqual((readOnes as Facts).postMortems, [slip]);
  assert.equal(board(readOnes as Facts).postMortems?.vusParLeChef, 1);
  const without = understand(JSON.stringify(FACTS_MINIMAL));
  assert.ok(!("informe" in without));
  assert.equal("postMortems" in (without as Facts), false);
  assert.equal("postMortems" in board(without as Facts), false);
});

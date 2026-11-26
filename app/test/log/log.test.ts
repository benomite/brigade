// Le journal du jour et le digest de la veille (ticket 4274) : ce que `facts` en donne, lu champ pour champ (log/fils.ts),
// le tri du jour (projects/log-du-day.ts), ce que le tableau en porte, et ce que le bloc de la vue (vue/log/) en
// pose devant un faux document — une lecture qui ne se lit pas se dit, rien n'est inventé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { comprendre, tableau, type Facts } from "../../src/facts.ts";
import { digestLu, filsLus } from "../../src/log/fils.ts";
import { logDuDay } from "../../src/projects/log-du-day.ts";
import { dayDe, poserLaCardDuDigest as cardDuDigest, poserLeLog as leLog, holdLaCardDuMatin } from "../../src/vue/log/log.js";
import { holdNotifications } from "../../src/notification.ts";
import { Faux, FauxStockage } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
// Les blocs, posés devant le faux document : des éléments du faux.
const poserLaCardDuDigest = (...args: Parameters<typeof cardDuDigest>) => cardDuDigest(...args) as Faux;
const poserLeLog = (...args: Parameters<typeof leLog>) => leLog(...args) as Faux;
const action = (at: string, line: string, kind: string, outcome = "o", reason = "r") => ({ at, line, reason, outcome, kind });
const LU = "2026-11-25T15:00:00.000Z";
const BRUT = { etat: "ouverte", lu: LU, dernierTick: LU, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [] };
const empty = { delivered: [], broke: [], fixedBySelf: [], notFixed: [], mistakes: [], nonRanges: 0, illisibles: 0 };

test("the threads of `facts`: absent says nothing, another shape is unreadable, a gesture of another shape is counted", () => {
  assert.equal(filsLus(undefined), undefined);
  assert.equal(filsLus(null), undefined);
  for (const autre of ["x", [], { cook: "x" }]) assert.deepEqual(filsLus(autre), { illisible: "the agents' threads are not readable" });
  const slip = action(LU, "merged", "delivered");
  assert.deepEqual(filsLus({ cook: [slip, { ...slip, at: "not a date" }, { ...slip, reason: 3 }, null], pass: [] }), { fils: { cook: [slip], pass: [] }, illisibles: 3 });
});

test("the digest of `facts`: absent says nothing, not a text is unreadable, its lines keep their order without the blank ones", () => {
  assert.equal(digestLu(undefined), undefined);
  assert.equal(digestLu(null), undefined);
  assert.deepEqual(digestLu(["a"]), { illisible: "yesterday's digest is not readable" });
  assert.deepEqual(digestLu(" a \n\n b\n"), { vuesParLeChef: "outages seen first by the chef: not said by the digest", lignes: ["a", "b"] });
  assert.deepEqual(digestLu("merged #1\n2 Outages Seen First By The Chef\nmain red"), { vuesParLeChef: "2 Outages Seen First By The Chef", lignes: ["merged #1", "main red"] });
  assert.deepEqual(digestLu("1 outage seen first by the chef"), { vuesParLeChef: "1 outage seen first by the chef", lignes: [] });
});

test("the logbook of the day is the UTC day of the reading, in time order, each entry with its agent; an unknown kind is counted, not sorted", () => {
  const log = logDuDay(
    {
      supervisor: [action("2026-11-25T10:00:00.000Z", "second", "broke"), action("2026-11-25T00:00:00.000Z", "first", "broke"), action("2026-11-24T23:59:59.000Z", "yesterday", "broke")],
      closer: [action("2026-11-25T11:00:00.000Z", "odd", "toString"), action("2026-11-25T11:00:00.000Z", "odd2", "weird")],
    },
    new Date(LU),
  );
  assert.deepEqual(log.broke.map(({ agent, line }) => `${agent}:${line}`), ["supervisor:first", "supervisor:second"]);
  assert.equal(log.nonRanges, 2);
  assert.equal(JSON.stringify(log).includes("odd"), false);
});

test("the board carries the logbook drawn from the threads at the reading, the count of unreadable gestures, and the digest", () => {
  const lu = (extra: object) => comprendre(JSON.stringify({ ...BRUT, ...extra })) as Facts;
  const plein = tableau(lu({ fils: { cook: [action(LU, "merged", "delivered"), { at: LU }] }, digest: "0 outages seen first by the chef" }));
  assert.deepEqual(plein.journal, { ...empty, delivered: [{ agent: "cook", at: LU, line: "merged", reason: "r", outcome: "o" }], illisibles: 1 });
  assert.deepEqual(plein.digest, { vuesParLeChef: "0 outages seen first by the chef", lignes: [] });
  assert.deepEqual(tableau(lu({ fils: [] })).journal, { illisible: "the agents' threads are not readable" });
  const sans = tableau(lu({}));
  assert.equal("journal" in sans || "digest" in sans, false);
});

test("the digest card shows the outages seen first by the chef before any other line, or says the digest does not say them", () => {
  const lines = (card: Faux) => card.dessous("li").map(({ textContent }) => textContent);
  const card = (texte: string) => poserLaCardDuDigest(doc, digestLu(texte) ?? assert.fail("no digest"));
  assert.deepEqual(lines(card("merged #1\n2 outages seen first by the chef\nmain red")), ["2 outages seen first by the chef", "merged #1", "main red"]);
  assert.deepEqual(lines(card("merged #1")), ["outages seen first by the chef: not said by the digest", "merged #1"]);
  assert.deepEqual(card("merged #1\n2 outages seen first by the chef").dessous("li").map(({ className }) => className), ["vues-par-le-chef", ""]);
  const illisible = poserLaCardDuDigest(doc, { illisible: "yesterday's digest is not readable" });
  assert.match(illisible.textContent, /yesterday's digest is not readable/);
  assert.deepEqual(lines(illisible), []);
});

test("the logbook shows its four groups, an empty one says so, the system's mistakes under not fixed, and what it could not read", () => {
  const entree = (line: string) => ({ agent: "supervisor", at: "2026-11-25T10:05:00.000Z", line, reason: "red for 10 min", outcome: "green" });
  const sansError = poserLeLog(doc, { ...empty, fixedBySelf: [entree("reran main")] });
  assert.deepEqual(sansError.dessous("h4").map(({ textContent }) => textContent), ["Delivered", "Broke", "Fixed by the system", "Not fixed"]);
  assert.equal(sansError.dessous("p").filter(({ textContent }) => textContent === "nothing").length, 3);
  const [line] = sansError.dessous("li");
  assert.equal(line?.textContent, "10:05 UTC · supervisor · reran main — green");
  assert.equal(line?.title, "red for 10 min");
  assert.equal(sansError.dessous("h5").length, 0);
  assert.doesNotMatch(sansError.textContent, /not readable|does not know/);
  const avecError = poserLeLog(doc, { ...empty, mistakes: [entree("released #3911 by mistake")], illisibles: 2, nonRanges: 1 });
  const nonRepare = avecError.dessous("section").find(({ dataset }) => dataset.groupe === "notFixed") ?? assert.fail("no not-fixed group");
  assert.match(nonRepare.textContent, /The system's own mistakes.*released #3911 by mistake/);
  assert.match(avecError.textContent, /2 gestures of the threads not readable/);
  assert.match(avecError.textContent, /1 gesture of the day of a kind the logbook does not know/);
  assert.match(poserLeLog(doc, { illisible: "the agents' threads are not readable" }).textContent, /the agents' threads are not readable/);
});

test("the digest card shows at the first opening of the day, stays for that opening, not at another opening that day, and again the next day", () => {
  const stockage = new FauxStockage();
  const matin = holdLaCardDuMatin(stockage);
  assert.equal(matin.aMontrer("parade", "2026-11-25"), true);
  assert.equal(matin.aMontrer("parade", "2026-11-25"), true, "the same opening keeps it");
  const rouverte = holdLaCardDuMatin(stockage);
  assert.equal(rouverte.aMontrer("parade", "2026-11-25"), false);
  assert.equal(rouverte.aMontrer("cantine", "2026-11-25"), true, "each project has its own morning");
  assert.equal(holdLaCardDuMatin(stockage).aMontrer("parade", "2026-11-26"), true);
  assert.equal(dayDe(new Date(2026, 0, 5, 8)), "2026-01-05");
});

test("a storage that cannot be read or written never hides the digest card", () => {
  const casse = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(holdLaCardDuMatin(casse).aMontrer("parade", "2026-11-25"), true);
  assert.equal(holdLaCardDuMatin(undefined).aMontrer("parade", "2026-11-25"), true);
  const pasDuJson = new FauxStockage();
  pasDuJson.setItem("brigade.digest-vu", "[\"parade\"]");
  assert.equal(holdLaCardDuMatin(pasDuJson).aMontrer("parade", "2026-11-25"), true);
  pasDuJson.setItem("brigade.digest-vu", "{");
  assert.equal(holdLaCardDuMatin(pasDuJson).aMontrer("parade", "2026-11-25"), true);
});

test("facts read with threads that broke, failures not fixed and a digest of outages ask for no notification", () => {
  const fils = { supervisor: [action(LU, "main went red", "broke"), action(LU, "zone cycle stuck", "unfixed"), action(LU, "released #3911 by mistake", "mistake")] };
  const facts = comprendre(JSON.stringify({ ...BRUT, fils, digest: "3 outages seen first by the chef" })) as Facts;
  assert.ok(facts.fils !== undefined && facts.digest !== undefined, "the threads and the digest are read");
  const montrees: unknown[] = [];
  const notifications = holdNotifications({ montrer: (montree) => montrees.push(montree), ouvrir: () => {}, memoire: { lire: () => ({}), ecrire: () => {} } });
  assert.equal(notifications.recevoir("parade", facts), undefined);
  assert.equal(notifications.recevoir("parade", { ...facts, lu: new Date(Date.parse(LU) + 60_000).toISOString() }), undefined);
  assert.deepEqual(montrees, []);
});

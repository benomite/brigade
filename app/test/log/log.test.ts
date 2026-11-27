// Le journal du jour et le digest de la veille (ticket 4274) : ce que `facts` en donne, lu champ pour champ (log/threads.ts),
// le tri du jour (projects/log-of-day.ts), ce que le tableau en porte, et ce que le bloc de la vue (vue/log/) en
// pose devant un faux document — une lecture qui ne se lit pas se dit, rien n'est inventé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { understand, board, type Facts } from "../../src/facts.ts";
import { digestRead, threadsRead } from "../../src/log/threads.ts";
import { logOfDay } from "../../src/projects/log-of-day.ts";
import { dayOf, setTheCardOfDigest as cardOfDigest, setTheLog as theLog, holdTheCardOfMorning } from "../../src/vue/log/log.js";
import { holdNotifications } from "../../src/notification.ts";
import { Fake, FakeStorage } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
// Les blocs, posés devant le faux document : des éléments du faux.
const setTheCardOfDigest = (...args: Parameters<typeof cardOfDigest>) => cardOfDigest(...args) as Fake;
const setTheLog = (...args: Parameters<typeof theLog>) => theLog(...args) as Fake;
const action = (at: string, line: string, kind: string, outcome = "o", reason = "r") => ({ at, line, reason, outcome, kind });
const READ = "2026-11-25T15:00:00.000Z";
const RAW = { etat: "ouverte", lu: READ, dernierTick: READ, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [] };
const empty = { delivered: [], broke: [], fixedBySelf: [], notFixed: [], mistakes: [], nonRanges: 0, illisibles: 0 };

test("the threads of `facts`: absent says nothing, another shape is unreadable, a gesture of another shape is counted", () => {
  assert.equal(threadsRead(undefined), undefined);
  assert.equal(threadsRead(null), undefined);
  for (const other of ["x", [], { cook: "x" }]) assert.deepEqual(threadsRead(other), { illisible: "the agents' threads are not readable" });
  const slip = action(READ, "merged", "delivered");
  assert.deepEqual(threadsRead({ cook: [slip, { ...slip, at: "not a date" }, { ...slip, reason: 3 }, null], pass: [] }), { fils: { cook: [slip], pass: [] }, illisibles: 3 });
});

test("the digest of `facts`: absent says nothing, not a text is unreadable, its lines keep their order without the blank ones", () => {
  assert.equal(digestRead(undefined), undefined);
  assert.equal(digestRead(null), undefined);
  assert.deepEqual(digestRead(["a"]), { illisible: "yesterday's digest is not readable" });
  assert.deepEqual(digestRead(" a \n\n b\n"), { vuesParLeChef: "outages seen first by the chef: not said by the digest", lignes: ["a", "b"] });
  assert.deepEqual(digestRead("merged #1\n2 Outages Seen First By The Chef\nmain red"), { vuesParLeChef: "2 Outages Seen First By The Chef", lignes: ["merged #1", "main red"] });
  assert.deepEqual(digestRead("1 outage seen first by the chef"), { vuesParLeChef: "1 outage seen first by the chef", lignes: [] });
});

test("the logbook of the day is the UTC day of the reading, in time order, each entry with its agent; an unknown kind is counted, not sorted", () => {
  const log = logOfDay(
    {
      supervisor: [action("2026-11-25T10:00:00.000Z", "second", "broke"), action("2026-11-25T00:00:00.000Z", "first", "broke"), action("2026-11-24T23:59:59.000Z", "yesterday", "broke")],
      closer: [action("2026-11-25T11:00:00.000Z", "odd", "toString"), action("2026-11-25T11:00:00.000Z", "odd2", "weird")],
    },
    new Date(READ),
  );
  assert.deepEqual(log.broke.map(({ agent, line }) => `${agent}:${line}`), ["supervisor:first", "supervisor:second"]);
  assert.equal(log.nonRanges, 2);
  assert.equal(JSON.stringify(log).includes("odd"), false);
});

test("the board carries the logbook drawn from the threads at the reading, the count of unreadable gestures, and the digest", () => {
  const readOne = (extra: object) => understand(JSON.stringify({ ...RAW, ...extra })) as Facts;
  const full = board(readOne({ fils: { cook: [action(READ, "merged", "delivered"), { at: READ }] }, digest: "0 outages seen first by the chef" }));
  assert.deepEqual(full.journal, { ...empty, delivered: [{ agent: "cook", at: READ, line: "merged", reason: "r", outcome: "o" }], illisibles: 1 });
  assert.deepEqual(full.digest, { vuesParLeChef: "0 outages seen first by the chef", lignes: [] });
  assert.deepEqual(board(readOne({ fils: [] })).journal, { illisible: "the agents' threads are not readable" });
  const without = board(readOne({}));
  assert.equal("journal" in without || "digest" in without, false);
});

test("the digest card shows the outages seen first by the chef before any other line, or says the digest does not say them", () => {
  const lines = (card: Fake) => card.dessous("li").map(({ textContent }) => textContent);
  const card = (text: string) => setTheCardOfDigest(doc, digestRead(text) ?? assert.fail("no digest"));
  assert.deepEqual(lines(card("merged #1\n2 outages seen first by the chef\nmain red")), ["2 outages seen first by the chef", "merged #1", "main red"]);
  assert.deepEqual(lines(card("merged #1")), ["outages seen first by the chef: not said by the digest", "merged #1"]);
  assert.deepEqual(card("merged #1\n2 outages seen first by the chef").dessous("li").map(({ className }) => className), ["vues-par-le-chef", ""]);
  const unreadable = setTheCardOfDigest(doc, { illisible: "yesterday's digest is not readable" });
  assert.match(unreadable.textContent, /yesterday's digest is not readable/);
  assert.deepEqual(lines(unreadable), []);
});

test("the logbook shows its four groups, an empty one says so, the system's mistakes under not fixed, and what it could not read", () => {
  const entry = (line: string) => ({ agent: "supervisor", at: "2026-11-25T10:05:00.000Z", line, reason: "red for 10 min", outcome: "green" });
  const withoutError = setTheLog(doc, { ...empty, fixedBySelf: [entry("reran main")] });
  assert.deepEqual(withoutError.dessous("h4").map(({ textContent }) => textContent), ["Delivered", "Broke", "Fixed by the system", "Not fixed"]);
  assert.equal(withoutError.dessous("p").filter(({ textContent }) => textContent === "nothing").length, 3);
  const [line] = withoutError.dessous("li");
  assert.equal(line?.textContent, "10:05 UTC · supervisor · reran main — green");
  assert.equal(line?.title, "red for 10 min");
  assert.equal(withoutError.dessous("h5").length, 0);
  assert.doesNotMatch(withoutError.textContent, /not readable|does not know/);
  const withError = setTheLog(doc, { ...empty, mistakes: [entry("released #3911 by mistake")], illisibles: 2, nonRanges: 1 });
  const notRepaired = withError.dessous("section").find(({ dataset }) => dataset.groupe === "notFixed") ?? assert.fail("no not-fixed group");
  assert.match(notRepaired.textContent, /The system's own mistakes.*released #3911 by mistake/);
  assert.match(withError.textContent, /2 gestures of the threads not readable/);
  assert.match(withError.textContent, /1 gesture of the day of a kind the logbook does not know/);
  assert.match(setTheLog(doc, { illisible: "the agents' threads are not readable" }).textContent, /the agents' threads are not readable/);
});

test("the digest card shows at the first opening of the day, stays for that opening, not at another opening that day, and again the next day", () => {
  const storage = new FakeStorage();
  const morning = holdTheCardOfMorning(storage);
  assert.equal(morning.aMontrer("parade", "2026-11-25"), true);
  assert.equal(morning.aMontrer("parade", "2026-11-25"), true, "the same opening keeps it");
  const reopened = holdTheCardOfMorning(storage);
  assert.equal(reopened.aMontrer("parade", "2026-11-25"), false);
  assert.equal(reopened.aMontrer("cantine", "2026-11-25"), true, "each project has its own morning");
  assert.equal(holdTheCardOfMorning(storage).aMontrer("parade", "2026-11-26"), true);
  assert.equal(dayOf(new Date(2026, 0, 5, 8)), "2026-01-05");
});

test("a storage that cannot be read or written never hides the digest card", () => {
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(holdTheCardOfMorning(broken).aMontrer("parade", "2026-11-25"), true);
  assert.equal(holdTheCardOfMorning(undefined).aMontrer("parade", "2026-11-25"), true);
  const notOfJson = new FakeStorage();
  notOfJson.setItem("brigade.digest-vu", "[\"parade\"]");
  assert.equal(holdTheCardOfMorning(notOfJson).aMontrer("parade", "2026-11-25"), true);
  notOfJson.setItem("brigade.digest-vu", "{");
  assert.equal(holdTheCardOfMorning(notOfJson).aMontrer("parade", "2026-11-25"), true);
});

test("facts read with threads that broke, failures not fixed and a digest of outages ask for no notification", () => {
  const threads = { supervisor: [action(READ, "main went red", "broke"), action(READ, "zone cycle stuck", "unfixed"), action(READ, "released #3911 by mistake", "mistake")] };
  const facts = understand(JSON.stringify({ ...RAW, fils: threads, digest: "3 outages seen first by the chef" })) as Facts;
  assert.ok(facts.fils !== undefined && facts.digest !== undefined, "the threads and the digest are read");
  const shown: unknown[] = [];
  const notifications = holdNotifications({ montrer: (shownOne) => shown.push(shownOne), ouvrir: () => {}, memoire: { lire: () => ({}), ecrire: () => {} } });
  assert.equal(notifications.recevoir("parade", facts), undefined);
  assert.equal(notifications.recevoir("parade", { ...facts, lu: new Date(Date.parse(READ) + 60_000).toISOString() }), undefined);
  assert.deepEqual(shown, []);
});

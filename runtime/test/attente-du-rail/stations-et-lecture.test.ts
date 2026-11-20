// Ce que la file du rail garde du rail bloqué que le superviseur a remplacé (#3914) : qui sert le projet parmi les
// stations du compte, une durée en mots courts, et la lecture des issues `fire` de GitHub, page par page.
import assert from "node:assert/strict";
import { test } from "node:test";
import { feuPoseLe, lesFeux } from "../../src/attente-du-rail/lecture.ts";
import { avecLesStationsQuiCuisent, dureeCourte, servantesDe, type StationDuCompte } from "../../src/attente-du-rail/stations.ts";

const MAINTENANT = Date.parse("2026-11-20T12:00:00Z");
const station = (name: string, selection: readonly string[] | null, vueIlYaMs = 0): StationDuCompte => ({ name, lastSeen: new Date(MAINTENANT - vueIlYaMs).toISOString(), stoppedAt: null, refreshMs: 60_000, selection });

test("the stations that serve a project: those whose selection names it, whatever its case, and the live ones that publish none", () => {
  const lues = [station("box", ["Acme/Shop"]), station("mac", ["acme/other"]), station("libre", null), station("muette", null, 3_600_000)];
  assert.deepEqual(servantesDe(lues, "acme/shop", MAINTENANT).map(({ name }) => name), ["box", "libre"]);
});

test("a station that cooks a ticket of the project serves it, whatever its selection says", () => {
  const lues = [station("box", null), station("mac", ["ACME/SHOP"]), station("pc", ["acme/other"])];
  assert.deepEqual(avecLesStationsQuiCuisent(lues, "acme/shop", ["box/claude", "mac/claude"]).map(({ name, selection }) => [name, selection]), [
    ["box", ["acme/shop"]],
    ["mac", ["ACME/SHOP"]],
    ["pc", ["acme/other"]],
  ]);
});

test("a duration in short words: minutes, then hours, then days", () => {
  assert.equal(dureeCourte(-5), "0 min");
  assert.equal(dureeCourte(59 * 60_000), "59 min");
  assert.equal(dureeCourte(60 * 60_000), "1 h");
  assert.equal(dureeCourte(47 * 3_600_000), "47 h");
  assert.equal(dureeCourte(48 * 3_600_000), "2 d");
});

test("the `fire` issues are read page by page, until a page is not full; an answer that is not a list fails the reading", async () => {
  const chemins: string[] = [];
  const pleine = Array.from({ length: 100 }, (_, rang) => ({ number: rang + 1 }));
  const lues = await lesFeux("acme/shop", async (chemin) => (chemins.push(chemin), chemin.endsWith("page=1") ? pleine : [{ number: 101 }, "not an issue", null, [1]]));
  assert.equal(lues.length, 101);
  assert.deepEqual(chemins, ["/repos/acme/shop/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1", "/repos/acme/shop/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=2"]);
  let pages = 0;
  assert.equal((await lesFeux("acme/shop", async () => ((pages += 1), pleine))).length, 1000, "ten pages at most");
  assert.equal(pages, 10);
  await assert.rejects(lesFeux("acme/shop", async () => ({ message: "Not Found" })), /did not answer the list of `fire` issues with a list/);
});

test("when `fire` was put on an issue: its last labelling, read from its events — none when they do not say", () => {
  const evenements = [
    { event: "labeled", label: { name: "fire" }, created_at: "2026-11-20T09:00:00Z" },
    { event: "labeled", label: { name: "model:opus" }, created_at: "2026-11-20T10:00:00Z" },
    { event: "unlabeled", label: { name: "fire" }, created_at: "2026-11-20T10:30:00Z" },
    { event: "labeled", label: { name: "fire" }, created_at: "2026-11-20T11:00:00Z" },
    { event: "labeled", label: { name: "fire" }, created_at: "not a date" },
    { event: "labeled", label: null, created_at: "2026-11-20T11:30:00Z" },
    { event: "labeled", label: { name: "fire" }, created_at: 7 },
  ];
  assert.equal(feuPoseLe(evenements), "2026-11-20T11:00:00Z");
  assert.equal(feuPoseLe([]), null);
});

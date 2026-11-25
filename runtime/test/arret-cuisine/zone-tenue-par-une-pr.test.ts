// #4244 : la cause `zone-held` de `arretDeLaCuisine`, et ce qu'elle ne change pas (main rouge d'abord, zone gelée, inconnue).
import assert from "node:assert/strict";
import { test } from "node:test";
import { arretDeLaCuisine } from "../../src/arret-cuisine/arret-cuisine.ts";

const SANS_CARTE = { queued: 2, taken: 0, inPass: 0, since: "2026-11-20T10:00:00.000Z" };
const tenu = (ticket: number, pr: number) => ({ ticket, reason: "zone-held", pr, zone: "app/src" });

test("every skip is zone-held: the cause names the PR that blocks the most tickets, the lowest on a tie", () => {
  assert.deepEqual(arretDeLaCuisine({ ...SANS_CARTE, skipped: [tenu(1, 9), tenu(2, 5), tenu(3, 9)] })?.cause, { kind: "zone-held", pr: 9, zone: "app/src" });
  assert.deepEqual(arretDeLaCuisine({ ...SANS_CARTE, skipped: [tenu(1, 9), tenu(2, 5)] })?.cause, { kind: "zone-held", pr: 5, zone: "app/src" });
});

// brigade:guard
test("main red comes before a held zone", () => {
  assert.deepEqual(arretDeLaCuisine({ ...SANS_CARTE, mainRed: { since: "2026-11-20T09:00:00.000Z" }, skipped: [tenu(1, 9)] })?.cause, { kind: "main-red" });
});

// brigade:guard
test("a skip with no code or no PR invents no cause: frozen-zone when a ticket is frozen, else unknown", () => {
  const frozen = { ticket: 7, zone: "app/src", since: "2026-11-20T08:00:00.000Z" };
  assert.deepEqual(arretDeLaCuisine({ ...SANS_CARTE, frozen, skipped: [tenu(1, 9), { ticket: 2, reason: "other" }] })?.cause, { kind: "frozen-zone", ticket: 7, zone: "app/src" });
  assert.deepEqual(arretDeLaCuisine({ ...SANS_CARTE, skipped: [{ ticket: 1, reason: "zone-held" }] })?.cause, { kind: "unknown" });
});

test("the zone carried is the one the named PR holds, not another PR's", () => {
  const skipped = [
    { ticket: 1, reason: "zone-held", pr: 9, zone: "runtime/src" },
    { ticket: 2, reason: "zone-held", pr: 5, zone: "app/src" },
    { ticket: 3, reason: "zone-held", pr: 9, zone: "runtime/src" },
  ];
  assert.deepEqual(arretDeLaCuisine({ ...SANS_CARTE, skipped })?.cause, { kind: "zone-held", pr: 9, zone: "runtime/src" });
  assert.deepEqual(arretDeLaCuisine({ ...SANS_CARTE, skipped: skipped.slice(0, 2) })?.cause, { kind: "zone-held", pr: 5, zone: "app/src" });
});

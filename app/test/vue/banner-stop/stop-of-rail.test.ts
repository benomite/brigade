// #3924 : la cuisine arrêtée, au bandeau en tête du rail : ce que `stopOfRail` en tire, la sortie `facts` relue
// (`stopKitchenRead`), puis le bandeau monté.
import assert from "node:assert/strict";
import { test } from "node:test";
import { stopKitchenRead, stopOfRail, zoneHeldOf } from "../../../src/vue/banner-stop/stop-of-rail.ts";
import { mountTheBanner } from "../../../src/vue/banner-stop/banner-stop.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const CARD = (zone: string) => ({ id: 2, body: `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`, author_association: "OWNER", created_at: "2026-11-20T07:00:00Z" });

test("without a known cause, the stop runs from the oldest queued ticket's entry, or from the last service when it is later", () => {
  const file = [{ ticket: 21, etat: "queued" as const, entreLe: null, depend: [] }, { ticket: 22, etat: "queued" as const, entreLe: null, depend: [] }];
  const tickets = [
    { ticket: 21, creeLe: "2026-11-20T06:00:00Z", entreLe: "2026-11-20T09:10:00Z" },
    { ticket: 22, creeLe: "2026-11-20T08:00:00Z", entreLe: null },
    { ticket: 40, creeLe: "2026-11-20T03:00:00Z" },
  ];
  assert.equal(stopOfRail(file, tickets, [], null).arretCuisine?.since, "2026-11-20T08:00:00Z");
  assert.equal(stopOfRail(file, tickets, [{ livre: "2026-11-20T10:20:00Z" }, { livre: "2026-11-20T07:00:00Z" }], null).arretCuisine?.since, "2026-11-20T10:20:00Z");
  // Rien de lisible : l'arrêt se dit, sans heure inventée.
  const withoutHour = stopOfRail(file, [{ ticket: 21, creeLe: "" }], [], null).arretCuisine;
  assert.deepEqual(withoutHour, { cause: { kind: "unknown" }, since: "", statut: "cause unknown" });
  const host = new Fake("div");
  mountTheBanner(doc, host).maj(withoutHour);
  assert.equal(host.textContent, "STOPPEDThe kitchen is stopped: cause unknown.");
});

test("the zone a set-aside ticket holds: from its fiche, held by its open PR, since its setting aside or else its PR", () => {
  const comments = [CARD("app/src/vue")];
  assert.equal(zoneHeldOf(comments, null, "2026-11-20T08:30:00Z"), undefined);
  assert.deepEqual(zoneHeldOf(comments, { le: "2026-11-20T08:05:00Z" }, null), { zone: ["app/src/vue"], depuis: "2026-11-20T08:05:00Z" });
  assert.equal(zoneHeldOf(comments, { le: "" }, null), undefined);
});

test("`arretCuisine` read back from `facts`: nothing malformed sets it, and an unknown kind of cause still says the kitchen is stopped", () => {
  const since = "2026-11-20T08:30:00Z";
  for (const raw of [undefined, null, "stopped", [], { since }, { cause: null, since }, { cause: [], since }, { cause: { kind: "main-red" }, since: 3 }]) assert.deepEqual(stopKitchenRead(raw), {}, JSON.stringify(raw));
  assert.deepEqual(stopKitchenRead({ cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue" }, since }), { arretCuisine: { cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue" }, since, statut: "frozen ticket #30 holds the file zone app/src/vue" } });
  assert.deepEqual(stopKitchenRead({ cause: { kind: "frozen-zone", ticket: "30", zone: "app/src/vue" }, since }), { arretCuisine: { cause: { kind: "unknown" }, since, statut: "cause unknown" } });
  assert.deepEqual(stopKitchenRead({ cause: { kind: "main-red" }, since }), { arretCuisine: { cause: { kind: "main-red" }, since, statut: "main is red" } });
  assert.deepEqual(stopKitchenRead({ cause: { kind: "out-of-gas" }, since }), { arretCuisine: { cause: { kind: "unknown" }, since, statut: "cause unknown" } });
});


test("a held zone survives the read-back of the facts and reaches the banner (#4244)", () => {
  const since = "2026-11-20T08:30:00Z";
  const cause = { kind: "zone-held", pr: 4077, zone: "app/src/vue" };
  const { arretCuisine: stopKitchen } = stopKitchenRead({ cause, since });
  assert.deepEqual(stopKitchen, { cause, since, statut: "zone held by PR 4077" });
  const host = new Fake("div");
  mountTheBanner(doc, host).maj(stopKitchen);
  assert.match(host.textContent, /zone held by PR 4077/);
  assert.deepEqual(stopKitchenRead({ cause: { kind: "zone-held", pr: "4077", zone: "app/src/vue" }, since }), { arretCuisine: { cause: { kind: "unknown" }, since, statut: "cause unknown" } });
});

test("an unknown kind never keeps a text the facts carry: the status is the runtime's 'cause unknown' (#4244)", () => {
  const since = "2026-11-20T08:30:00Z";
  assert.equal(stopKitchenRead({ cause: { kind: "out-of-gas" }, since, statut: "zone held by PR 1" }).arretCuisine?.statut, "cause unknown");
});

test("a banner without a status says each cause in its own words (#4244)", () => {
  const since = "2026-11-20T08:30:00Z";
  const said = (cause: unknown) => {
    const host = new Fake("div");
    mountTheBanner(doc, host).maj({ cause, since } as never);
    return host.textContent;
  };
  assert.match(said({ kind: "main-red" }), /main is red/);
  assert.match(said({ kind: "unknown" }), /the cause is unknown/);
  assert.doesNotMatch(said({ kind: "unknown" }), /main is red/);
});

test("a ticket parked by its failures (ticket 4260) whose open PR holds its zone freezes the kitchen like a set-aside one; without a held zone, it does not", () => {
  const file = [{ ticket: 21, etat: "queued" as const, entreLe: "2026-11-20T09:00:00Z", depend: [] }];
  const inFile = { ticket: 21, creeLe: "2026-11-20T06:00:00Z", entreLe: "2026-11-20T09:00:00Z" };
  const zoneHeld = { zone: ["app/src/vue", "app/src/facts.ts"], depuis: "2026-11-20T08:30:00Z" };
  assert.deepEqual(stopOfRail(file, [inFile, { ticket: 30, creeLe: "2026-11-20T06:00:00Z", parqueParEchecs: { zoneTenue: zoneHeld } }], [], null).arretCuisine, { cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue, app/src/facts.ts" }, since: "2026-11-20T08:30:00Z", statut: "frozen ticket #30 holds the file zone app/src/vue, app/src/facts.ts" });
  assert.deepEqual(stopOfRail(file, [inFile, { ticket: 30, creeLe: "2026-11-20T06:00:00Z", parqueParEchecs: {} }], [], null).arretCuisine, { cause: { kind: "unknown" }, since: "2026-11-20T09:00:00Z", statut: "cause unknown" });
});

test("a ticket parked by its failures (ticket 4260) whose open PR holds a queued ticket's zone stops the kitchen on that PR (#4244)", () => {
  const file = [{ ticket: 21, etat: "queued" as const, entreLe: "2026-11-20T09:00:00Z", depend: [] }];
  const inFile = { ticket: 21, creeLe: "2026-11-20T06:00:00Z", entreLe: "2026-11-20T09:00:00Z", zone: ["app/src/vue/x.ts"] };
  const zoneHeld = { zone: ["app/src/vue"], depuis: "2026-11-20T08:30:00Z", pr: 130 };
  assert.deepEqual(stopOfRail(file, [inFile, { ticket: 30, creeLe: "2026-11-20T06:00:00Z", parqueParEchecs: { zoneTenue: zoneHeld } }], [], null).arretCuisine, { cause: { kind: "zone-held", pr: 130, zone: "app/src/vue" }, since: "2026-11-20T08:30:00Z", statut: "zone held by PR 130" });
});

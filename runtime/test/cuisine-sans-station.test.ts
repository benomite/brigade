// Quand plus rien ne se cuisine et que des tickets attendent une capacité
// qu'aucune station ne fournit, le bloc `awaiting` le dit sur une ligne ; dès
// qu'un ticket se cuisine encore, il ne dit rien de plus.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cuisineSansStation, decrireAttentes, direCuisineSansStationEn } from "../src/attend.ts";
import { direMiseDeCote } from "../src/mise-de-cote.ts";
import type { TicketRail } from "../src/projections/rail.ts";

const ticket = (numero: number, partiel: Partial<TicketRail>): TicketRail => ({ ticket: numero, state: "waiting", awaits: [], reason: null, until: null, ...partiel }) as TicketRail;
const MIS = [
  ticket(1548, { state: "86", reason: "no-station: macos" }),
  ticket(1550, { state: "86", reason: "no-station: enregistrement-ecran" }),
  ticket(1551, { awaits: [{ ticket: 1548, left: null }] as TicketRail["awaits"] }),
];

test("rien ne se cuisine et des tickets attendent une capacité : la ligne nomme la capacité, les tickets et le geste", () => {
  const sans = cuisineSansStation(MIS);
  assert.deepEqual(sans, { capacites: ["macos", "enregistrement-ecran"], tickets: [1548, 1550, 1551] });
  const ligne = direCuisineSansStationEn(sans!);
  for (const dit of ["`macos`", "`enregistrement-ecran`", "#1548, #1550, #1551", "declare a station", "lower or close"]) assert.ok(ligne.includes(dit), dit);
  const bloc = decrireAttentes([], () => "1 min", null, null, null, sans);
  assert.deepEqual(bloc, ["awaiting   nothing awaits the chef", `  ${ligne}`, "end awaiting", ""]);
});

test("un ticket qui se cuisine encore : aucun avertissement", () => {
  assert.equal(cuisineSansStation([...MIS, ticket(7, {})]), null);
  assert.equal(cuisineSansStation([...MIS, ticket(7, { state: "taken" })]), null);
  assert.deepEqual(decrireAttentes([], () => "1 min", null, null, null, null), ["awaiting   nothing awaits the chef", "end awaiting", ""]);
});

test("pas de ticket mis de côté faute de station : pas d'avertissement", () => {
  assert.equal(cuisineSansStation([]), null);
  assert.equal(cuisineSansStation([ticket(9, { state: "86", reason: "quota" })]), null);
});

test("la carte mise de côté dit qu'elle attend un humain", () => {
  assert.match(direMiseDeCote("no-station: macos"), /^attend : un humain — aucune station ne fournit macos/);
});
